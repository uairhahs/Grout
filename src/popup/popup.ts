// The toolbar popup: asks the service worker how the link to MosaicShell is doing and shows it. It keeps asking while
// it is open, so a MosaicShell that starts a moment later turns the popup green without reopening it.
import { describeStatus } from "./view.ts";

const REFRESH_MS = 1000;

/** Text only, never markup: what a page calls its track is the page's to choose. */
function setText(id: string, text: string) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

async function refresh() {
  let status: unknown;
  try {
    status = await chrome.runtime.sendMessage({ kind: "status" });
  } catch {
    status = undefined; // the worker is not up yet
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const view = describeStatus(status, tab?.id);

  document.body.dataset.tone = view.tone;
  setText("heading", view.heading);
  setText("body", view.body);
  setText("extension-id", view.extensionId ?? chrome.runtime.id);

  const track = document.getElementById("track");
  if (track) track.hidden = view.track === undefined;
  if (view.track) {
    setText("track-title", view.track.title || "Untitled");
    setText("track-artist", view.track.artist);
    setText("track-state", view.track.playing ? "Playing" : "Paused");
  }
}

void refresh();
setInterval(refresh, REFRESH_MS);
