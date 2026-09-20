import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBridge, detectBrowser } from "../src/background/bridge.js";
import { makeTimers } from "./helpers/fake-timers.mjs";

const HOST = "com.mosaicshell.grout";

/** The `chrome` the service worker sees, with everything it can be told recorded for the test. */
function makeEnv({ tabs = [], connectThrows = false, replies = {} } = {}) {
  const timers = makeTimers();
  const env = {
    timers,
    ports: [],
    connectCalls: [],
    tabMessages: [],
    alarms: [],
    listeners: { message: [], removed: [], updated: [], alarm: [] },
    lastError: undefined,
    lastErrorReads: 0,
  };

  const event = (list) => ({ addListener: (fn) => list.push(fn) });

  env.chrome = {
    runtime: {
      get lastError() {
        env.lastErrorReads++;
        return env.lastError;
      },
      connectNative(name) {
        env.connectCalls.push(name);
        if (connectThrows) throw new Error("Specified native messaging host not found.");
        const onMessageListeners = [];
        const onDisconnectListeners = [];
        const port = {
          sent: [],
          postMessage: (m) => port.sent.push(m),
          onMessage: event(onMessageListeners),
          onDisconnect: event(onDisconnectListeners),
          emit: (m) => onMessageListeners.forEach((l) => l(m)),
          disconnect: () => onDisconnectListeners.forEach((l) => l(port)),
        };
        env.ports.push(port);
        return port;
      },
      onMessage: event(env.listeners.message),
    },
    tabs: {
      onRemoved: event(env.listeners.removed),
      onUpdated: event(env.listeners.updated),
      query: async () => tabs,
      sendMessage: async (tabId, message) => {
        env.tabMessages.push({ tabId, message });
        if (message.kind === "snapshot") {
          if (!(tabId in replies))
            throw new Error("Could not establish connection. Receiving end does not exist.");
          return replies[tabId];
        }
        return undefined;
      },
    },
    alarms: {
      create: (name, info) => env.alarms.push({ name, info }),
      onAlarm: event(env.listeners.alarm),
    },
  };

  env.bridge = createBridge({
    chrome: env.chrome,
    version: "0.1.0",
    browser: "edge",
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });

  env.port = () => env.ports.at(-1);
  env.fromTab = (
    message,
    tab = { id: 7, windowId: 3, audible: true },
    origin = "https://music.youtube.com",
  ) => env.listeners.message.forEach((l) => l(message, { tab, origin }, () => {}));
  env.sessions = (port = env.port()) => port.sent.filter((m) => m.type === "session");
  return env;
}

const snapshot = (over = {}) => ({
  title: "Humid",
  artist: "Moody Good",
  album: "",
  artwork: [{ src: "https://i.ytimg.com/vi/x/sddefault.jpg", sizes: "320x180" }],
  playbackState: "playing",
  ...over,
});

const media = (s) => ({ kind: "media", snapshot: s });

async function started(options) {
  const env = makeEnv(options);
  await env.bridge.start();
  return env;
}

describe("connecting", () => {
  it("opens the native host and says hello with the protocol, its version and the browser", async () => {
    const env = await started();

    assert.deepEqual(env.connectCalls, [HOST]);
    assert.deepEqual(env.port().sent, [
      { type: "hello", protocol: 1, extensionVersion: "0.1.0", browser: "edge" },
    ]);
  });

  it("asks the browser to wake the worker regularly, so a sleeping worker reconnects", async () => {
    const env = await started();

    assert.deepEqual(env.alarms, [{ name: "grout-keepalive", info: { periodInMinutes: 0.5 } }]);
  });

  it("keeps trying, with growing gaps, when the host is not installed", async () => {
    const env = await started({ connectThrows: true });
    assert.equal(env.connectCalls.length, 1);

    await env.timers.advance(1000);
    assert.equal(env.connectCalls.length, 2);
    await env.timers.advance(2000);
    assert.equal(env.connectCalls.length, 3);
    await env.timers.advance(4000);
    assert.equal(env.connectCalls.length, 4);
  });

  it("caps the gap between attempts", async () => {
    const env = await started({ connectThrows: true });
    await env.timers.advance(10 * 60_000);
    const calls = env.connectCalls.length;

    await env.timers.advance(60_000);

    assert.ok(
      env.connectCalls.length - calls >= 2 && env.connectCalls.length - calls <= 3,
      "about one attempt every 30 s",
    );
  });

  it("reconnects after the port closes, and says hello again", async () => {
    const env = await started();
    env.port().disconnect();
    assert.equal(env.ports.length, 1);

    await env.timers.advance(1000);

    assert.equal(env.ports.length, 2);
    assert.equal(env.port().sent[0].type, "hello");
  });

  it("reads the disconnect reason so the browser does not log an unchecked error", async () => {
    const env = await started();
    env.lastError = { message: "Native host has exited." };

    env.port().disconnect();

    assert.ok(env.lastErrorReads > 0);
  });

  it("starts the backoff again once the host has answered", async () => {
    const env = await started();
    env.port().disconnect();
    await env.timers.advance(1000);
    env.port().disconnect();
    await env.timers.advance(2000);
    env.port().emit({ type: "resync" });
    env.port().disconnect();

    await env.timers.advance(1000);

    assert.equal(env.ports.length, 4, "the gap is back to one second");
  });

  it("pings while connected and stops when the port closes", async () => {
    const env = await started();
    await env.timers.advance(20_000);
    assert.equal(env.port().sent.filter((m) => m.type === "ping").length, 1);

    const port = env.port();
    port.disconnect();
    await env.timers.advance(20_000);
    assert.equal(port.sent.filter((m) => m.type === "ping").length, 1);
  });

  it("reconnects on the keepalive alarm when it has no port", async () => {
    const env = await started({ connectThrows: true });
    const calls = env.connectCalls.length;

    env.listeners.alarm.forEach((l) => l({ name: "grout-keepalive" }));

    assert.equal(env.connectCalls.length, calls + 1);
  });

  it("does not open a second port when the alarm fires while connected", async () => {
    const env = await started();

    env.listeners.alarm.forEach((l) => l({ name: "grout-keepalive" }));

    assert.equal(env.ports.length, 1);
  });
});

describe("reporting what tabs play", () => {
  it("reports a tab's media with where it is and whether it is audible", async () => {
    const env = await started();

    env.fromTab(media(snapshot({ rating: "liked", capabilities: ["rating", "dislike"] })));

    assert.deepEqual(env.sessions(), [
      {
        type: "session",
        tabId: 7,
        windowId: 3,
        origin: "https://music.youtube.com",
        title: "Humid",
        artist: "Moody Good",
        album: "",
        artwork: [{ src: "https://i.ytimg.com/vi/x/sddefault.jpg", sizes: "320x180" }],
        playbackState: "playing",
        audible: true,
        rating: "liked",
        capabilities: ["rating", "dislike"],
      },
    ]);
  });

  it("leaves rating and capabilities out for a site that has none", async () => {
    const env = await started();

    env.fromTab(media(snapshot()));

    const [session] = env.sessions();
    assert.equal("rating" in session, false);
    assert.equal("capabilities" in session, false);
  });

  it("does not repeat a report that has not changed", async () => {
    const env = await started();

    env.fromTab(media(snapshot()));
    env.fromTab(media(snapshot()));

    assert.equal(env.sessions().length, 1);
  });

  it("sends a report again when the track changes", async () => {
    const env = await started();

    env.fromTab(media(snapshot()));
    env.fromTab(media(snapshot({ title: "Next" })));

    assert.deepEqual(
      env.sessions().map((s) => s.title),
      ["Humid", "Next"],
    );
  });

  it("says nothing to the host for a tab that never had media", async () => {
    const env = await started();

    env.fromTab(media(null));

    assert.deepEqual(
      env.port().sent.map((m) => m.type),
      ["hello"],
    );
  });

  it("says the tab is gone when its page stops publishing media", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.fromTab(media(null));

    assert.deepEqual(env.port().sent.at(-1), { type: "removed", tabId: 7 });
  });

  it("says the tab is gone when it is closed", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.listeners.removed.forEach((l) => l(7));

    assert.deepEqual(env.port().sent.at(-1), { type: "removed", tabId: 7 });
  });

  it("says nothing when a tab without media is closed", async () => {
    const env = await started();

    env.listeners.removed.forEach((l) => l(99));

    assert.deepEqual(
      env.port().sent.map((m) => m.type),
      ["hello"],
    );
  });

  it("reports when the tab becomes audible or silent", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.listeners.updated.forEach((l) => l(7, { audible: false }, {}));

    assert.deepEqual(
      env.sessions().map((s) => s.audible),
      [true, false],
    );
  });

  it("ignores tab updates that change nothing it reports", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.listeners.updated.forEach((l) => l(7, { title: "Another title" }, {}));
    env.listeners.updated.forEach((l) => l(7, { status: "complete" }, {}));
    env.listeners.updated.forEach((l) => l(42, { audible: true }, {}));

    assert.deepEqual(
      env.port().sent.map((m) => m.type),
      ["hello", "session"],
    );
  });

  it("drops a tab's session when the tab starts loading another page, which may have no content script to say so", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.listeners.updated.forEach((l) => l(7, { status: "loading" }, {}));

    assert.deepEqual(env.port().sent.at(-1), { type: "removed", tabId: 7 });
  });

  it("reports the tab again when the page it loaded has media", async () => {
    const env = await started();
    env.fromTab(media(snapshot({ title: "First" })));
    env.listeners.updated.forEach((l) => l(7, { status: "loading" }, {}));

    env.fromTab(media(snapshot({ title: "Second" })));

    assert.deepEqual(
      env.sessions().map((s) => s.title),
      ["First", "Second"],
    );
  });

  it("does nothing when a tab that never had media starts loading", async () => {
    const env = await started();

    env.listeners.updated.forEach((l) => l(7, { status: "loading" }, {}));

    assert.deepEqual(
      env.port().sent.map((m) => m.type),
      ["hello"],
    );
  });

  it("keeps two tabs apart", async () => {
    const env = await started();

    env.fromTab(media(snapshot({ title: "A" })), { id: 1, windowId: 1, audible: true });
    env.fromTab(media(snapshot({ title: "B" })), { id: 2, windowId: 1, audible: false });
    env.listeners.removed.forEach((l) => l(1));

    assert.deepEqual(
      env.sessions().map((s) => `${s.tabId}:${s.title}`),
      ["1:A", "2:B"],
    );
    assert.deepEqual(env.port().sent.at(-1), { type: "removed", tabId: 1 });
  });

  it("ignores a message that did not come from a web page tab", async () => {
    const env = await started();

    env.listeners.message.forEach((l) => l(media(snapshot()), {}, () => {}));
    env.fromTab(
      media(snapshot()),
      { id: 7, windowId: 3, audible: true },
      "http://insecure.example",
    );
    env.fromTab(media(snapshot()), { id: 7, windowId: 3, audible: true }, "chrome-extension://abc");
    env.fromTab({ kind: "other" });
    env.fromTab(undefined);

    assert.equal(env.sessions().length, 0);
  });

  it("holds what tabs report while there is no connection and sends it once connected", async () => {
    const env = await started({ connectThrows: true });
    env.fromTab(media(snapshot()));
    assert.equal(env.ports.length, 0);

    env.chrome.runtime.connectNative = (name) => {
      env.connectCalls.push(name);
      const port = {
        sent: [],
        postMessage: (m) => port.sent.push(m),
        onMessage: { addListener() {} },
        onDisconnect: { addListener() {} },
      };
      env.ports.push(port);
      return port;
    };
    await env.timers.advance(1000);

    assert.deepEqual(
      env.port().sent.map((m) => m.type),
      ["hello", "session"],
    );
  });
});

describe("the host", () => {
  it("asks for everything again after a resync", async () => {
    const env = await started();
    env.fromTab(media(snapshot()), { id: 1, windowId: 1, audible: true });
    env.fromTab(media(snapshot({ title: "B" })), { id: 2, windowId: 1, audible: true });
    const before = env.sessions().length;

    env.port().emit({ type: "resync" });

    assert.equal(env.sessions().length, before + 2);
  });

  it("sends a like, dislike or clear to the tab it is for", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    for (const action of ["like", "dislike", "clear"]) {
      env.port().emit({ type: "command", tabId: 7, action });
    }

    assert.deepEqual(
      env.tabMessages.filter((m) => m.message.kind === "command"),
      ["like", "dislike", "clear"].map((action) => ({
        tabId: 7,
        message: { kind: "command", action },
      })),
    );
  });

  it("ignores commands it should not obey", async () => {
    const env = await started();
    env.fromTab(media(snapshot()));

    env.port().emit({ type: "command", tabId: 7, action: "delete-everything" });
    env.port().emit({ type: "command", tabId: 8, action: "like" });
    env.port().emit({ type: "command", tabId: "7", action: "like" });
    env.port().emit({ type: "command", action: "like" });
    env.port().emit({ type: "unknown" });
    env.port().emit(null);
    env.port().emit("like");

    assert.deepEqual(
      env.tabMessages.filter((m) => m.message.kind === "command"),
      [],
    );
  });
});

describe("catching up after the worker restarts", () => {
  it("asks each tab what it is playing and reports the ones that answer", async () => {
    const env = await started({
      tabs: [
        { id: 4, windowId: 1, audible: true },
        { id: 5, windowId: 1, audible: false },
        { id: 6, windowId: 2, audible: false },
      ],
      replies: {
        4: {
          origin: "https://music.youtube.com",
          snapshot: snapshot({ title: "Already playing" }),
        },
        6: { origin: "https://www.youtube.com", snapshot: null },
      },
    });

    assert.deepEqual(
      env.sessions().map((s) => `${s.tabId}:${s.title}:${s.audible}`),
      ["4:Already playing:true"],
    );
  });

  it("survives a tab that cannot be asked", async () => {
    const env = await started({ tabs: [{ id: 1, windowId: 1, audible: false }], replies: {} });

    assert.deepEqual(env.sessions(), []);
  });

  it("does not report an answer from a page that is not https", async () => {
    const env = await started({
      tabs: [{ id: 1, windowId: 1, audible: true }],
      replies: { 1: { origin: "http://insecure.example", snapshot: snapshot() } },
    });

    assert.deepEqual(env.sessions(), []);
  });
});

describe("browser detection", () => {
  it("recognises Edge from its brand list", () => {
    assert.equal(
      detectBrowser({
        userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Microsoft Edge" }] },
        userAgent: "",
      }),
      "edge",
    );
  });

  it("recognises Edge from the user agent when there is no brand list", () => {
    assert.equal(
      detectBrowser({ userAgent: "Mozilla/5.0 Chrome/153.0 Safari/537.36 Edg/153.0" }),
      "edge",
    );
  });

  it("calls everything else Chrome", () => {
    assert.equal(
      detectBrowser({
        userAgentData: { brands: [{ brand: "Google Chrome" }] },
        userAgent: "Chrome/153",
      }),
      "chrome",
    );
    assert.equal(detectBrowser({ userAgent: "" }), "chrome");
  });
});
