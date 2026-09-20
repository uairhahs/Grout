import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { packageForStore, storeManifest, storeProblems } from "../scripts/store-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = (over = {}) => ({
  manifest_version: 3,
  name: "Grout",
  version: "2026.9.20.5",
  version_name: "2026.9.20-b5",
  description: "Tells MosaicShell what your browser is playing.",
  key: "MIIB-a-public-key",
  permissions: ["nativeMessaging"],
  ...over,
});

/** A built package on disk: a manifest and a few other files. */
function build(over) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grout-store-"));
  const dist = path.join(dir, "dist");
  fs.mkdirSync(path.join(dist, "icons"), { recursive: true });
  fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest(over), null, 2));
  fs.writeFileSync(path.join(dist, "page.js"), "// page");
  fs.writeFileSync(path.join(dist, "LICENSE"), "the license");
  fs.writeFileSync(path.join(dist, "icons", "icon-128.png"), "png");
  return { dir, dist, out: path.join(dir, "store") };
}

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

describe("the copy for a store", () => {
  it("is the same manifest without the key, which a store refuses on a new item, and nothing else changed", () => {
    const { key, ...rest } = manifest();

    assert.deepEqual(storeManifest(manifest()), rest);
    assert.equal(key, "MIIB-a-public-key");
  });

  it("carries every file of the package, so the store gets exactly what an unpacked install runs", () => {
    const { dist, out } = build();

    packageForStore(dist, out);

    for (const file of ["page.js", "LICENSE", "icons/icon-128.png"]) {
      assert.equal(fs.readFileSync(path.join(out, file), "utf8"), fs.readFileSync(path.join(dist, file), "utf8"), file);
    }
    assert.equal(read(path.join(out, "manifest.json")).key, undefined);
  });

  it("keeps the versions the release stamped, since a store wants each upload to be higher than the last", () => {
    const { dist, out } = build();

    packageForStore(dist, out);

    const stored = read(path.join(out, "manifest.json"));
    assert.equal(stored.version, "2026.9.20.5");
    assert.equal(stored.version_name, "2026.9.20-b5");
  });

  it("leaves the original package alone, key included, because an unpacked install needs it for a stable ID", () => {
    const { dist, out } = build();

    packageForStore(dist, out);

    assert.equal(read(path.join(dist, "manifest.json")).key, "MIIB-a-public-key");
  });

  it("starts clean, so nothing left from an earlier package can end up in the upload", () => {
    const { dist, out } = build();
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "stale.js"), "old");

    packageForStore(dist, out);

    assert.equal(fs.existsSync(path.join(out, "stale.js")), false);
  });

  it("refuses a manifest the store would refuse, before anything is written", () => {
    const { dist, out } = build({ description: "x".repeat(133) });

    assert.throws(() => packageForStore(dist, out), /description/);
    assert.equal(fs.existsSync(out), false);
  });
});

describe("what a store refuses in a manifest", () => {
  it("is a description over 132 characters, a name over 75, or a key left in", () => {
    assert.deepEqual(storeProblems({ name: "Grout", description: "x".repeat(132) }), []);
    assert.match(storeProblems({ name: "Grout", description: "x".repeat(133) }).join(), /description.*133.*132/);
    assert.match(storeProblems({ name: "n".repeat(76), description: "ok" }).join(), /name.*76.*75/);
    assert.match(storeProblems({ name: "Grout", description: "ok", key: "k" }).join(), /key/);
  });

  it("does not trouble the real manifest once the key is taken out", () => {
    const real = read(path.join(root, "extension", "manifest.json"));

    assert.deepEqual(storeProblems(storeManifest(real)), []);
  });
});
