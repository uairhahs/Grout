// Grout's link to MosaicShell: keeps a native messaging port open, reports what tabs play, and passes
// the Host's rating commands to the right tab. It is a factory over `chrome` and timers so it can be tested
// without a browser.

export const HOST_NAME = "com.mosaicshell.grout";
export const PROTOCOL_VERSION = 1;

const KEEPALIVE_ALARM = "grout-keepalive";
const PING_MS = 20_000;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const COMMANDS = new Set(["like", "dislike", "clear"]);

export function detectBrowser(nav) {
  const brands = nav.userAgentData?.brands ?? [];
  if (brands.some((b) => b.brand === "Microsoft Edge")) return "edge";
  return /\bEdg\//.test(nav.userAgent ?? "") ? "edge" : "chrome";
}

const isHttps = (origin) => typeof origin === "string" && origin.startsWith("https://");
const text = (value) => (typeof value === "string" ? value : "");

export function createBridge({
  chrome,
  version,
  browser,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
}) {
  /** tabId -> what that tab last said it plays. Held even while there is no connection. */
  const sessions = new Map();
  /** tabId -> the last report sent on the current port, so an unchanged report is not sent twice. */
  const lastSent = new Map();
  let port = null;
  let retryTimer = null;
  let pingTimer = null;
  let attempt = 0;

  function post(message) {
    try {
      port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  function buildSession(tabId, { tab, origin, snapshot }) {
    const session = {
      type: "session",
      tabId,
      windowId: tab.windowId,
      origin,
      title: text(snapshot.title),
      artist: text(snapshot.artist),
      album: text(snapshot.album),
      artwork: Array.isArray(snapshot.artwork) ? snapshot.artwork : [],
      playbackState: snapshot.playbackState,
      audible: tab.audible === true,
    };
    if (snapshot.rating) session.rating = snapshot.rating;
    if (Array.isArray(snapshot.capabilities) && snapshot.capabilities.length > 0) {
      session.capabilities = snapshot.capabilities;
    }
    return session;
  }

  function flush(tabId) {
    const entry = sessions.get(tabId);
    if (!entry || !port) return;
    const message = buildSession(tabId, entry);
    const json = JSON.stringify(message);
    if (lastSent.get(tabId) === json) return;
    if (post(message)) lastSent.set(tabId, json);
  }

  function flushAll() {
    for (const tabId of sessions.keys()) flush(tabId);
  }

  function remove(tabId) {
    if (!sessions.delete(tabId)) return;
    if (lastSent.delete(tabId) && port) post({ type: "removed", tabId });
  }

  function upsert(tab, origin, snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      remove(tab.id);
      return;
    }
    sessions.set(tab.id, {
      tab: { id: tab.id, windowId: tab.windowId, audible: tab.audible === true },
      origin,
      snapshot,
    });
    flush(tab.id);
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    const delay = Math.min(FIRST_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
    attempt += 1;
    retryTimer = setTimeout(connect, delay);
  }

  function onDisconnect(closed) {
    // Reading lastError marks it as handled; otherwise the browser logs an unchecked runtime error.
    void chrome.runtime.lastError;
    if (port !== closed) return;
    port = null;
    lastSent.clear();
    clearInterval(pingTimer);
    pingTimer = null;
    scheduleReconnect();
  }

  function sendCommand(message) {
    if (
      !Number.isInteger(message.tabId) ||
      !sessions.has(message.tabId) ||
      !COMMANDS.has(message.action)
    )
      return;
    chrome.tabs
      .sendMessage(message.tabId, { kind: "command", action: message.action })
      .catch(() => {});
  }

  function onHostMessage(message) {
    // Any answer means the Host is really there, so the next disconnect starts the retry gaps again.
    attempt = 0;
    if (!message || typeof message !== "object") return;
    if (message.type === "resync") {
      lastSent.clear();
      flushAll();
    } else if (message.type === "command") {
      sendCommand(message);
    }
  }

  function connect() {
    if (port) return;
    let opened;
    try {
      opened = chrome.runtime.connectNative(HOST_NAME);
    } catch {
      scheduleReconnect();
      return;
    }
    port = opened;
    opened.onMessage.addListener(onHostMessage);
    opened.onDisconnect.addListener(() => onDisconnect(opened));
    post({ type: "hello", protocol: PROTOCOL_VERSION, extensionVersion: version, browser });
    pingTimer = setInterval(() => post({ type: "ping" }), PING_MS);
    flushAll();
  }

  function onContentMessage(message, sender) {
    if (message?.kind !== "media") return;
    const tab = sender?.tab;
    if (!tab || !Number.isInteger(tab.id) || !isHttps(sender.origin)) return;
    upsert(tab, sender.origin, message.snapshot);
  }

  function onTabUpdated(tabId, changeInfo) {
    // A tab that starts loading a new page has left its media. The new page may have no content script (a blank
    // tab, an http page), so nothing there could say so; if it does play media its script reports it again.
    if (changeInfo?.status === "loading") {
      remove(tabId);
      return;
    }

    const entry = sessions.get(tabId);
    if (!entry || typeof changeInfo?.audible !== "boolean") return;
    entry.tab.audible = changeInfo.audible;
    flush(tabId);
  }

  /** After the worker restarts it knows nothing; ask every tab what it is playing. */
  async function recover() {
    let tabs;
    try {
      tabs = await chrome.tabs.query({});
    } catch {
      return;
    }
    await Promise.all(
      tabs.map(async (tab) => {
        let reply;
        try {
          reply = await chrome.tabs.sendMessage(tab.id, { kind: "snapshot" });
        } catch {
          return; // No content script in that tab.
        }
        if (reply?.snapshot && isHttps(reply.origin)) upsert(tab, reply.origin, reply.snapshot);
      }),
    );
  }

  async function start() {
    // Listeners are registered before anything is awaited, as a service worker must.
    chrome.runtime.onMessage.addListener(onContentMessage);
    chrome.tabs.onRemoved.addListener(remove);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === KEEPALIVE_ALARM) connect();
    });
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
    connect();
    await recover();
  }

  return { start };
}
