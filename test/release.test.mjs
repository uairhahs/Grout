import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { idFromKey, idOfManifest } from "../scripts/extension-id.mjs";
import { manifestVersions, releaseTag } from "../scripts/version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("the release tag", () => {
  it("is MosaicShell's date-build form: the UTC date without zero padding, then -b and the run number", () => {
    assert.equal(releaseTag(new Date(Date.UTC(2026, 8, 20, 23, 59)), 5), "2026.9.20-b5");
    assert.equal(releaseTag(new Date(Date.UTC(2027, 0, 3)), 41), "2027.1.3-b41");
  });

  it("uses the UTC date, whatever the machine's time zone", () => {
    // 00:30 on the 21st in UTC is still the 20th in a zone behind UTC, and must be the 21st here.
    assert.equal(releaseTag(new Date("2026-09-21T00:30:00Z"), 1), "2026.9.21-b1");
  });
});

describe("the versions stamped into the manifest", () => {
  it("are four integers for the browser to compare, and the tag itself for people to read", () => {
    assert.deepEqual(manifestVersions("2026.9.20-b5"), { version: "2026.9.20.5", version_name: "2026.9.20-b5" });
    assert.deepEqual(manifestVersions("2027.12.31-b1200"), { version: "2027.12.31.1200", version_name: "2027.12.31-b1200" });
  });

  it("increase with every release, so the browser sees each as an upgrade", () => {
    const parts = (tag) => manifestVersions(tag).version.split(".").map(Number);
    const older = parts("2026.9.20-b5");
    for (const newer of ["2026.9.20-b6", "2026.9.21-b1", "2026.10.1-b1", "2027.1.1-b1"]) {
      const next = parts(newer);
      const index = next.findIndex((n, i) => n !== older[i]);
      assert.ok(next[index] > older[index], newer);
    }
  });

  it("refuse anything a browser would refuse, or that is not a release tag", () => {
    for (const bad of ["", "v1.0.0", "2026.9.20", "2026.09.20-b5", "2026.9.20-b0", "2026.13.1-b1", "2026.9.32-b1", "2026.9.20-b65536", "2026.9.20-b5-extra"]) {
      assert.throws(() => manifestVersions(bad), undefined, `"${bad}"`);
    }
  });
});

describe("the extension ID", () => {
  it("is derived from the manifest key the way a browser does it: 32 letters a to p", () => {
    const id = idOfManifest(path.join(root, "extension", "manifest.json"));

    assert.match(id, /^[a-p]{32}$/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
    assert.equal(id, idFromKey(manifest.key));
  });

  it("matches an independent calculation: the first 32 hex digits of the key's SHA-256, each shifted onto a to p", () => {
    for (const bytes of ["hello", "another key", "\u0000\u0001\u0002"]) {
      const hex = crypto.createHash("sha256").update(Buffer.from(bytes, "latin1")).digest("hex").slice(0, 32);
      const expected = [...hex].map((digit) => String.fromCharCode("a".charCodeAt(0) + parseInt(digit, 16))).join("");

      assert.equal(idFromKey(Buffer.from(bytes, "latin1").toString("base64")), expected, JSON.stringify(bytes));
    }
  });

  it("refuses a manifest with no key, which would give the package a random ID", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grout-id-"));
    const file = path.join(dir, "manifest.json");
    fs.writeFileSync(file, JSON.stringify({ manifest_version: 3, name: "x", version: "1" }));

    assert.throws(() => idOfManifest(file), /no key/);
  });
});
