import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { crxId } from "../scripts/crx-id.mjs";
import { manifestVersions, releaseTag } from "../scripts/version.mjs";

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

describe("reading the extension ID from a CRX3 file", () => {
  const varint = (n) => {
    const out = [];
    while (n > 0x7f) {
      out.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    return Buffer.from([...out, n]);
  };
  const lengthDelimited = (number, body) => Buffer.concat([varint(number * 8 + 2), varint(body.length), body]);

  /** A CRX3 file with the given header bytes and a stand-in payload. */
  function crx(header, { magic = "Cr24", version = 3 } = {}) {
    const head = Buffer.alloc(12);
    head.write(magic, 0, "latin1");
    head.writeUInt32LE(version, 4);
    head.writeUInt32LE(header.length, 8);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "grout-crx-")), "test.crx");
    fs.writeFileSync(file, Buffer.concat([head, header, Buffer.from("PK-zip-payload")]));
    return file;
  }

  const id = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const header = Buffer.concat([
    lengthDelimited(2, Buffer.from("a signature proof the reader must skip over")),
    lengthDelimited(10000, lengthDelimited(1, id)),
  ]);

  it("turns the 16-byte crx_id into the 32 letters a to p that a browser shows", () => {
    assert.equal(crxId(crx(header)), "aabbccddeeffgghhiijjkkllmmnnoopp");
  });

  it("skips the fields around it, in either order", () => {
    const reversed = Buffer.concat([lengthDelimited(10000, lengthDelimited(1, id)), lengthDelimited(2, Buffer.from("proof"))]);
    assert.equal(crxId(crx(reversed)), "aabbccddeeffgghhiijjkkllmmnnoopp");
  });

  it("refuses a file that is not a CRX3, or has no id", () => {
    assert.throws(() => crxId(crx(header, { magic: "PK\u0003\u0004" })), /not a CRX/);
    assert.throws(() => crxId(crx(header, { version: 2 })), /CRX3/);
    assert.throws(() => crxId(crx(lengthDelimited(2, Buffer.from("proof")))), /crx_id/);
  });
});
