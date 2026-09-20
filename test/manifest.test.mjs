import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { idFromKey } from "../scripts/extension-id.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

function* files(dir, extensions) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "test", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, extensions);
    else if (extensions.test(entry.name)) yield full;
  }
}

const SITES = ["https://music.youtube.com/*", "https://www.youtube.com/*", "https://open.spotify.com/*", "https://soundcloud.com/*"];

describe("manifest", () => {
  it("is Manifest V3 with a module service worker", () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, "background.js");
    assert.equal(manifest.background.type, "module");
  });

  it("has a fixed key, so the unpacked extension has the ID that MosaicShell's native host manifest allows", () => {
    // MosaicShell lists this ID in NativeHostRegistration.AllowedExtensionIds; change both together.
    assert.equal(idFromKey(manifest.key), "aaffcapodpfecchmelidkkhgiaamijpe");
  });

  it("fits what the browser stores accept: a name up to 75 characters and a description up to 132", () => {
    assert.ok(manifest.name.length <= 75, `the name is ${manifest.name.length} characters`);
    assert.ok(manifest.description.length <= 132, `the description is ${manifest.description.length} characters; the Chrome Web Store refuses more than 132`);
    assert.ok(manifest.short_name === undefined || manifest.short_name.length <= 12);
  });

  it("asks for as little as it can: the native host and a keepalive alarm, nothing else", () => {
    assert.deepEqual([...manifest.permissions].sort(), ["alarms", "nativeMessaging"]);
    assert.equal(manifest.host_permissions, undefined, "no host permissions: it cannot read pages or tab addresses itself");
    assert.equal(manifest.optional_permissions, undefined);
  });

  it("runs on exactly the four supported sites, over https, and in no other frames", () => {
    assert.equal(manifest.content_scripts.length, 2);
    for (const script of manifest.content_scripts) {
      assert.deepEqual([...script.matches].sort(), [...SITES].sort());
      assert.notEqual(script.all_frames, true);
      assert.equal(script.exclude_matches, undefined);
    }
  });

  it("puts the site adapters in the page's own world and the messaging script in the isolated one", () => {
    const [page, content] = manifest.content_scripts;
    assert.deepEqual(page.js, ["page.js"]);
    assert.equal(page.world, "MAIN", "another extension can starve the isolated world's view of the Media Session");
    assert.deepEqual(content.js, ["content.js"]);
    assert.notEqual(content.world, "MAIN", "the script that can reach the extension must not share the page's world");
  });

  it("exposes nothing to web pages", () => {
    assert.equal(manifest.web_accessible_resources, undefined);
  });

  it("names every file it refers to, and the build produces them", () => {
    const dist = path.join(root, "dist");
    const referenced = [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap((s) => s.js)];
    for (const file of referenced) assert.ok(fs.existsSync(path.join(dist, file)), `${file} (run npm run build)`);
    assert.ok(fs.existsSync(path.join(dist, "manifest.json")));
  });
});

describe("the toolbar popup", () => {
  const dist = path.join(root, "dist");
  const html = () => fs.readFileSync(path.join(dist, manifest.action.default_popup), "utf8");

  it("is declared, so clicking the icon shows something, and needs no permission of its own", () => {
    assert.equal(manifest.action.default_popup, "popup.html");
    assert.equal(manifest.action.default_title, "Grout");
    assert.deepEqual([...manifest.permissions].sort(), ["alarms", "nativeMessaging"]);
  });

  it("loads only files from the package: no remote script, style, font or image, and no inline script", () => {
    const page = html();
    assert.doesNotMatch(page, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i, "a remote resource");
    assert.doesNotMatch(page, /<script(?![^>]*\ssrc=)[^>]*>/i, "an inline script, which the extension policy forbids");
    for (const [, reference] of page.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(dist, reference)), `${reference} is missing from the package`);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(dist, "popup.css"), "utf8"), /url\(\s*["']?(?:https?:)?\/\//i, "a remote resource in the stylesheet");
  });

  it("puts what it is told on the page as text, never as markup", () => {
    const script = fs.readFileSync(path.join(root, "src", "popup", "popup.ts"), "utf8");
    assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, "a track title is the page's to choose");
    assert.match(script, /textContent/);
  });
});

/** Width and height from a PNG's header. */
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("branding", () => {
  const branding = path.join(root, "assets", "branding");

  it("declares the four icon sizes a browser asks for, and each file is a PNG of exactly that size", () => {
    assert.deepEqual(Object.keys(manifest.icons).sort((a, b) => a - b), ["16", "32", "48", "128"]);
    for (const [size, file] of Object.entries(manifest.icons)) {
      const full = path.join(root, "extension", file);
      assert.ok(fs.existsSync(full), file);
      assert.deepEqual(pngSize(full), { width: Number(size), height: Number(size) }, file);
      assert.ok(fs.existsSync(path.join(root, "dist", file)), `${file} (run npm run build)`);
    }
  });

  it("uses MosaicShell's own artwork for the sizes the brand has, byte for byte", () => {
    for (const [icon, original] of [["icon-16.png", "micro-16.png"], ["icon-32.png", "compact-32.png"], ["icon-128.png", "compact-128.png"]]) {
      assert.ok(fs.readFileSync(path.join(root, "extension", "icons", icon)).equals(fs.readFileSync(path.join(branding, original))), icon);
    }
  });

  it("keeps the palette in one place: the notes list exactly the colours the palette file defines", () => {
    const { colors } = JSON.parse(fs.readFileSync(path.join(branding, "palette.json"), "utf8"));
    assert.equal(Object.keys(colors).length, 7);
    const notes = fs.readFileSync(path.join(root, "docs", "branding.md"), "utf8");
    for (const [name, hex] of Object.entries(colors)) {
      assert.match(hex, /^#[0-9A-F]{6}$/, name);
      assert.ok(notes.includes("`" + hex + "`"), `docs/branding.md is missing ${name} ${hex}`);
    }
    const listed = notes.match(/`#[0-9A-Fa-f]{6}`/g) ?? [];
    assert.equal(listed.length, Object.keys(colors).length, "docs/branding.md lists a colour that palette.json does not define");
  });
});

describe("what ships", () => {
  const shipped = () => [...files(root, /\.(ts|js|mjs|json|md)$/)].filter((f) => path.basename(f) !== "package-lock.json");

  it("carries no name from any project it might once have been copied from, except in the license's notice section", () => {
    const old = /web ?now ?playing|(^|[^a-z])wnp([^a-z]|$)|keifufu|tjhrulz/i;
    const dist = ["page.js", "content.js", "background.js"].map((f) => path.join(root, "dist", f));
    const offenders = [...shipped(), ...dist]
      .filter((file) => fs.existsSync(file) && old.test(fs.readFileSync(file, "utf8")))
      .map((f) => path.relative(root, f));
    assert.deepEqual(offenders, []);
  });

  // The GNU text says changing it is not allowed, so it must stay exactly the published file: this is its SHA-256.
  const GNU_GPL_3_SHA256 = "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986";

  it("is licensed GPL-3.0-or-later: the GNU text stays unmodified at the top, and the package says the same", () => {
    const license = fs.readFileSync(path.join(root, "LICENSE"));
    const gnuText = license.subarray(0, 35149);
    assert.equal(crypto.createHash("sha256").update(gnuText).digest("hex"), GNU_GPL_3_SHA256);
    assert.match(gnuText.toString("utf8"), /^\s*GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.license, "GPL-3.0-or-later");
  });

  it("credits the author of the MIT-licensed work below the GNU text, with its copyright and permission notice unchanged", () => {
    const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
    const notice = fs.readFileSync(path.join(root, "test", "fixtures", "mit-notice.txt"), "utf8").trim();
    const bottom = license.slice(35149);
    assert.match(bottom, /COPYRIGHT AND THIRD-PARTY NOTICES/);
    assert.match(bottom, /Copyright \(c\) 2026 S Uddin/);
    assert.ok(bottom.includes(notice), "the MIT copyright block must be preserved verbatim");
    assert.match(notice, /^Copyright 2024 keifufu/);
  });

  it("names the author in the license and nowhere else, and never names the project or its predecessor's author", () => {
    const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
    assert.equal((license.match(/keifufu/g) ?? []).length, 2, "once in the credit line and once in the preserved copyright line");
    assert.doesNotMatch(license, /web ?now ?playing|tjhrulz/i);
  });

  it("ships the license inside the package, since anyone who receives the extension must receive the terms", () => {
    const copy = path.join(root, "dist", "LICENSE");
    assert.ok(fs.existsSync(copy), "dist/LICENSE (run npm run build)");
    assert.ok(fs.readFileSync(copy).equals(fs.readFileSync(path.join(root, "LICENSE"))));
  });

  it("loads nothing from the network and evaluates nothing", () => {
    for (const file of shipped().filter((f) => /\.(ts|js)$/.test(f))) {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts|\beval\s*\(|new Function\s*\(/, path.relative(root, file));
    }
  });
});
