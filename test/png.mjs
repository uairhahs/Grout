import zlib from "node:zlib";

/** Decodes an 8-bit, non-interlaced RGBA PNG into { width, height, alpha(x, y) }; throws on anything else. */
export function decodeRgbaPng(bytes) {
  if (bytes.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  const data = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString("ascii");
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("expected 8-bit RGBA without interlacing");
    } else if (type === "IDAT") data.push(body);
    at += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const value = raw[y * (stride + 1) + 1 + i];
      const left = i >= 4 ? pixels[y * stride + i - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
      pixels[y * stride + i] = (value + predicted) & 0xff;
    }
  }
  return { width, height, alpha: (x, y) => pixels[y * stride + x * 4 + 3] };
}

/** The smallest box holding every pixel that is not fully transparent: { left, top, right, bottom } (right and bottom are exclusive). */
export function opaqueBounds({ width, height, alpha }) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha(x, y) === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return { left, top, right, bottom };
}
