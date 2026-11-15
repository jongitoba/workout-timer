// Draws the app icons (a white stopwatch on the site's green) and writes them as PNGs
// to public/icons/. No image libraries: shapes are signed distance functions,
// anti-aliased by supersampling, and encoded with node:zlib.
// Run with `npm run icons` after changing the design; the PNGs are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1f, 0x6f, 0x5c];
const FG = [0xff, 0xff, 0xff];
const SAMPLES = 4; // 4x4 supersampling per pixel

// Shapes in a unit square (0..1), y pointing down.
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - r;
};

/** True when (x, y) is on the stopwatch glyph. */
function glyph(x, y) {
  const cx = 0.5, cy = 0.55, r = 0.26;
  const ring = Math.abs(Math.hypot(x - cx, y - cy) - r) - 0.035;
  const button = sdRoundRect(x, y, 0.5, 0.215, 0.055, 0.03, 0.015);
  const stem = sdRoundRect(x, y, 0.5, 0.265, 0.025, 0.03, 0);
  const hand = sdSegment(x, y, cx, cy, cx + 0.12, cy - 0.12, 0.03);
  const hub = Math.hypot(x - cx, y - cy) - 0.045;
  return Math.min(ring, button, stem, hand, hub) <= 0;
}

/**
 * @param {number} size  pixel size
 * @param {object} opts  rounded: transparent rounded corners; scale: glyph scale (maskable safe zone)
 */
function render(size, { rounded, scale }) {
  const px = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let bg = 0, fg = 0;
      for (let sj = 0; sj < SAMPLES; sj++) {
        for (let si = 0; si < SAMPLES; si++) {
          const x = (i + (si + 0.5) / SAMPLES) / size;
          const y = (j + (sj + 0.5) / SAMPLES) / size;
          const inside = !rounded || sdRoundRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) <= 0;
          if (!inside) continue;
          bg++;
          if (glyph(0.5 + (x - 0.5) / scale, 0.5 + (y - 0.5) / scale)) fg++;
        }
      }
      const n = SAMPLES * SAMPLES;
      const o = (j * size + i) * 4;
      const t = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] * (1 - t) + FG[c] * t);
      px[o + 3] = Math.round((bg / n) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const icons = {
  'icon-192.png': render(192, { rounded: true, scale: 1 }),
  'icon-512.png': render(512, { rounded: true, scale: 1 }),
  // Maskable: full bleed, glyph shrunk into the 80% safe zone.
  'maskable-512.png': render(512, { rounded: false, scale: 0.8 }),
  // iOS rounds the corners itself and shows transparency as black.
  'apple-touch-icon.png': render(180, { rounded: false, scale: 0.9 }),
};
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(new URL(name, out), png);
  console.log(`public/icons/${name} (${png.length} bytes)`);
}
