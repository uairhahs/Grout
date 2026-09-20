// The extension ID a browser derives from a manifest's `key`. The key is the public half of an RSA key pair, and the ID is
// the first 16 bytes of its SHA-256 written as 32 letters a to p. MosaicShell's native host allows exactly this ID, so it
// is defined once, here: the tests and the release workflow both use it.
//
// Usage: node scripts/extension-id.mjs <manifest.json>
import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** The ID for a manifest `key` (a base64 DER public key). */
export function idFromKey(key) {
  const digest = crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16);
  return [...digest].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join("");
}

/** The ID of the extension a manifest file describes; throws if it has no key, since it would then get a random ID. */
export function idOfManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (typeof manifest.key !== "string") throw new Error(`${file} has no key, so the extension would get a random ID`);
  return idFromKey(manifest.key);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(idOfManifest(process.argv[2]));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
