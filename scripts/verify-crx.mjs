// Usage: node scripts/verify-crx.mjs <file.crx> <manifest.json>
// Fails unless the CRX was signed with the key that matches the manifest's `key`, which is what makes the package's
// extension ID the one MosaicShell's native host allows. It runs in the release workflow before anything is published, so a
// wrong or stale signing secret fails the run instead of shipping a package the Host would refuse to talk to.
import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { crxId } from "./crx-id.mjs";

/** The extension ID a browser derives from a manifest `key` (base64 DER public key). */
export function idFromKey(key) {
  const digest = crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16);
  return [...digest].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join("");
}

export function verify(crxFile, manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (typeof manifest.key !== "string") throw new Error("the manifest has no key, so the package would get a random ID");
  const expected = idFromKey(manifest.key);
  const actual = crxId(crxFile);
  if (actual !== expected) {
    throw new Error(`the CRX is signed for ${actual} but the manifest key is ${expected}: the signing secret does not match the key`);
  }
  return actual;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(`CRX id ${verify(process.argv[2], process.argv[3])} matches the manifest key`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
