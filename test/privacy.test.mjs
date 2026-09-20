import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const manifest = JSON.parse(read("extension", "manifest.json"));
const privacy = read("PRIVACY.md");

// PRIVACY.md is what a user is told, so it must stay true of what the extension does.
describe("the privacy policy", () => {
  it("mentions every permission the manifest asks for, so a new one cannot ship unexplained", () => {
    for (const permission of manifest.permissions) {
      assert.ok(privacy.includes(`\`${permission}\``), `PRIVACY.md does not mention ${permission}`);
    }
  });

  it("names the sites the content scripts run on and describes the manifest host-access boundary", () => {
    for (const site of ["YouTube Music", "YouTube", "Spotify", "SoundCloud"]) assert.ok(privacy.includes(site), `PRIVACY.md does not name ${site}`);
    assert.equal(manifest.host_permissions, undefined);
    assert.match(privacy, /no separate `host_permissions` entry/);
    assert.match(privacy, /host access under browser-store terminology/);
  });

  it("states the keepalive interval the code really uses", () => {
    const bridge = read("src", "background", "bridge.js");
    const minutes = Number(/periodInMinutes:\s*([\d.]+)/.exec(bridge)?.[1]);
    assert.equal(minutes * 60, 30);
    assert.match(privacy, /every 30 seconds/);
  });

  it("says the extension keeps nothing and makes no network requests only while the built code does neither", () => {
    for (const file of ["background", "content", "page", "popup"]) {
      const code = fs.readFileSync(path.join(root, "dist", `${file}.js`), "utf8");
      assert.doesNotMatch(code, /chrome\.storage|localStorage|sessionStorage|indexedDB|document\.cookie|chrome\.cookies|chrome\.history|\bfetch\s*\(|XMLHttpRequest|WebSocket/, `${file}.js`);
    }
  });
});
