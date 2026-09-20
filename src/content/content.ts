// Runs in the extension's isolated world on the four sites Grout supports. It asks the page's own world (page.js)
// what is playing about once a second, checks what comes back, tells the service worker only when that changed, and
// passes the Host's like and dislike requests on to the page. It reads nothing itself from the page.
import type { Rating, WireSnapshot } from "../wire.ts";
import { ratingFor, toSnapshot } from "./snapshot.ts";

const CHANNEL = 1;
const POLL_MS = 1000;
const COMMAND_RECHECK_MS = 300;
const REPLY_TIMEOUT_MS = 1500;

declare global {
  // eslint-disable-next-line no-var
  var __groutContent: boolean | undefined;
}

/** One request to the page's world and its reply, or null if the page does not answer in time. */
function ask(func: "read" | "rate", arg?: Rating): Promise<unknown> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const finish = (value: unknown) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== window || data?.grout !== CHANNEL || data.kind !== "response" || data.id !== id) return;
      finish(data.value ?? null);
    };
    const timer = setTimeout(() => finish(null), REPLY_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    window.postMessage({ grout: CHANNEL, kind: "request", id, func, arg }, location.origin);
  });
}

async function readSnapshot(): Promise<WireSnapshot | null> {
  return toSnapshot(await ask("read"));
}

if (!globalThis.__groutContent) {
  globalThis.__groutContent = true;

  let last: string | undefined;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const snapshot = await readSnapshot();
      const json = JSON.stringify(snapshot);
      if (json === last) return;
      try {
        // If the worker could not take it, send it again next time rather than lose it.
        await chrome.runtime.sendMessage({ kind: "media", snapshot });
        last = json;
      } catch {
        // The extension was reloaded or removed underneath this page, or its worker is not up yet.
        if (!chrome.runtime?.id) stop();
      }
    } finally {
      busy = false;
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.kind === "snapshot") {
      readSnapshot()
        .then((snapshot) => sendResponse({ origin: location.origin, snapshot }))
        .catch(() => sendResponse({ origin: location.origin, snapshot: null }));
      return true;
    }
    if (message?.kind === "command") {
      const rating = ratingFor(message.action);
      if (rating !== null) {
        void ask("rate", rating).then(() => setTimeout(tick, COMMAND_RECHECK_MS));
      }
    }
    return false;
  });

  void tick();
  timer = setInterval(tick, POLL_MS);
}
