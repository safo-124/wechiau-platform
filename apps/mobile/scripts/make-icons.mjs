#!/usr/bin/env node
/**
 * Draws the three apps' icons and splash images, so each app is easy to tell
 * apart on a phone: `node scripts/make-icons.mjs` in apps/mobile.
 *
 *   field   gold egg on green (collecting eggs)
 *   vet     white cross on blue
 *   farmer  white egg in a green nest, on gold
 *
 * Writes assets/images/<variant>/{icon,adaptive-foreground,adaptive-monochrome,splash}.png.
 * Colours come from packages/ui/src/theme.ts. No image packages: shapes are
 * tested per pixel (4x4 samples for smooth edges) and written with node:zlib.
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const GREEN = '#1E5B3A';
const BLUE = '#1F4F8F';
const GOLD = '#C98A1B';
const WHITE = '#FFFFFF';

// Shapes in a box from -1 to 1, y pointing down.
const egg = (cx, cy, rx, ry, taper = 0.16) => (x, y) => {
  const t = (y - cy) / ry;
  const w = rx * (1 + taper * t); // narrower at the top
  return w > 0 && ((x - cx) / w) ** 2 + t ** 2 <= 1;
};
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const roundedRect = (cx, cy, hw, hh, r) => (x, y) => {
  const ax = Math.abs(x - cx);
  const ay = Math.abs(y - cy);
  if (ax > hw || ay > hh) return false;
  const dx = Math.max(ax - (hw - r), 0);
  const dy = Math.max(ay - (hh - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const lowerHalf = (shape, cy) => (x, y) => y >= cy && shape(x, y);
const union = (...shapes) => (x, y) => shapes.some((s) => s(x, y));

const VARIANTS = {
  field: {
    background: GREEN,
    glyph: [
      { shape: egg(0, 0.06, 0.6, 0.86), color: GOLD },
      { shape: ellipse(-0.22, -0.3, 0.11, 0.22), color: WHITE, alpha: 0.35, decoration: true },
    ],
  },
  vet: {
    background: BLUE,
    glyph: [{ shape: union(roundedRect(0, 0, 0.27, 0.84, 0.1), roundedRect(0, 0, 0.84, 0.27, 0.1)), color: WHITE }],
  },
  farmer: {
    background: GOLD,
    glyph: [
      { shape: egg(0, -0.2, 0.48, 0.68), color: WHITE },
      { shape: lowerHalf(ellipse(0, 0.26, 0.9, 0.58), 0.26), color: GREEN },
    ],
  },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * size: canvas in pixels. scale: how much of the canvas the glyph box fills.
 * background: hex or null (transparent). mono: draw the glyph in plain white.
 */
function draw(size, scale, background, glyph, { mono = false } = {}) {
  const S = 4;
  const half = (size * scale) / 2;
  const out = Buffer.alloc(size * size * 4);
  const layers = glyph.filter((l) => !(mono && l.decoration)).map((l) => ({ ...l, rgb: rgb(mono ? WHITE : l.color), alpha: l.alpha ?? 1 }));
  const bg = background ? rgb(background) : null;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S - size / 2) / half;
          const y = (py + (sy + 0.5) / S - size / 2) / half;
          // Paint back to front with "over" blending, kept premultiplied.
          let cr = 0, cg = 0, cb = 0, ca = 0;
          if (bg) [cr, cg, cb, ca] = [bg[0], bg[1], bg[2], 1];
          for (const l of layers) {
            if (!l.shape(x, y)) continue;
            cr = l.rgb[0] * l.alpha + cr * (1 - l.alpha);
            cg = l.rgb[1] * l.alpha + cg * (1 - l.alpha);
            cb = l.rgb[2] * l.alpha + cb * (1 - l.alpha);
            ca = l.alpha + ca * (1 - l.alpha);
          }
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      const n = S * S;
      out[i + 3] = Math.round((a / n) * 255);
      // Un-premultiply for PNG.
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
    }
  }
  return encodePng(size, size, out);
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const images = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
for (const [name, v] of Object.entries(VARIANTS)) {
  const dir = join(images, name);
  mkdirSync(dir, { recursive: true });
  // Full icon: background and glyph. Android's adaptive icon keeps the glyph
  // inside its safe circle (about the middle 60%), so it's drawn at 0.5 there.
  writeFileSync(join(dir, 'icon.png'), draw(1024, 0.56, v.background, v.glyph));
  writeFileSync(join(dir, 'adaptive-foreground.png'), draw(512, 0.5, null, v.glyph));
  writeFileSync(join(dir, 'adaptive-monochrome.png'), draw(432, 0.5, null, v.glyph, { mono: true }));
  writeFileSync(join(dir, 'splash.png'), draw(400, 1, null, v.glyph));
  console.log(`Wrote assets/images/${name}/ (icon, adaptive-foreground, adaptive-monochrome, splash)`);
}
