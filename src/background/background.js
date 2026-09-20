import { createBridge, detectBrowser } from "./bridge.js";

createBridge({
  chrome,
  version: chrome.runtime.getManifest().version,
  browser: detectBrowser(navigator),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
}).start();
