// Reads the extension ID out of a CRX3 file, so a release can prove the package was signed with the key that matches the
// manifest before it is published. A CRX3 file is: "Cr24", a little-endian version (3), a little-endian header length, a
// protobuf header, then the zip. The header's `signed_header_data` (field 10000) holds a protobuf whose field 1 is the
// 16-byte crx_id, which is the first 16 bytes of the SHA-256 of the signing public key.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

function varint(bytes, at) {
  let value = 0;
  let shift = 0;
  for (let i = at; i < bytes.length; i++) {
    value += (bytes[i] & 0x7f) * 2 ** shift;
    if ((bytes[i] & 0x80) === 0) return { value, next: i + 1 };
    shift += 7;
  }
  throw new Error("truncated protobuf");
}

/** The value of the first length-delimited field with this number, or null. */
function field(bytes, wanted) {
  let at = 0;
  while (at < bytes.length) {
    const tag = varint(bytes, at);
    at = tag.next;
    const number = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (wire === 2) {
      const length = varint(bytes, at);
      const start = length.next;
      if (number === wanted) return bytes.subarray(start, start + length.value);
      at = start + length.value;
    } else if (wire === 0) {
      at = varint(bytes, at).next;
    } else {
      throw new Error(`unsupported protobuf wire type ${wire}`);
    }
  }
  return null;
}

/** The 32-letter extension ID (a to p) of a CRX3 file's signing key. */
export function crxId(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 4).toString("latin1") !== "Cr24") throw new Error("not a CRX file");
  if (bytes.readUInt32LE(4) !== 3) throw new Error("not a CRX3 file");

  const header = bytes.subarray(12, 12 + bytes.readUInt32LE(8));
  const signed = field(header, 10000);
  const id = signed && field(signed, 1);
  if (!id || id.length !== 16) throw new Error("the CRX header has no crx_id");
  return [...id].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join("");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(crxId(process.argv[2]));
}
