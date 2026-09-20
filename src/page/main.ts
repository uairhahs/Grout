// Runs in the page's own world and answers the content script over window messages: what the page is playing, and a
// request to end up with a rating. It does nothing else and reads nothing on a page Grout does not support.
import { readPage } from "./reader.ts";
import { hasRating, isSupported } from "./sites.ts";
import { rate } from "./youtube-music.ts";

const CHANNEL = 1;
const RATINGS = new Set(["liked", "disliked", "none"]);

declare global {
  // eslint-disable-next-line no-var
  var __groutPage: boolean | undefined;
}

function answer(func: unknown, arg: unknown): unknown {
  if (!isSupported(location)) return null;
  try {
    if (func === "read") return readPage({ navigator, document }, hasRating(location));
    if (func === "rate" && typeof arg === "string" && RATINGS.has(arg) && hasRating(location)) return rate(document, arg as "liked" | "disliked" | "none");
  } catch {
    // The page's own objects threw; there is nothing to report this time.
  }
  return null;
}

if (!globalThis.__groutPage) {
  globalThis.__groutPage = true;

  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    // Only the content script of this same page, over the channel this file defines.
    if (event.source !== window || event.origin !== location.origin) return;
    if (data?.grout !== CHANNEL || data.kind !== "request" || typeof data.id !== "string") return;

    window.postMessage({ grout: CHANNEL, kind: "response", id: data.id, value: answer(data.func, data.arg) }, location.origin);
  });
}
