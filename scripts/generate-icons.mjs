/**
 * generate-icons.mjs
 * ----------------------------------------------------------------------------
 * Renders client/public/favicon.svg into the full PWA / iOS icon set.
 *
 * Why: placeholder 1x1 PNGs were causing iOS Safari "Add to Home Screen" to
 * fall back to a screenshot of the page (broken-looking app icon).
 *
 * Outputs (overwrites placeholders):
 *   client/public/favicon.ico                         (32x32 single-frame)
 *   client/public/icons/icon-192.png                  (PWA, transparent OK)
 *   client/public/icons/icon-512.png                  (PWA)
 *   client/public/icons/icon-maskable-512.png         (PWA, 80% safe-zone, opaque bg)
 *   client/public/icons/apple-touch-icon-152.png      (iPad,            opaque)
 *   client/public/icons/apple-touch-icon-167.png      (iPad Pro,        opaque)
 *   client/public/icons/apple-touch-icon-180.png      (iPhone primary,  opaque)
 *
 * Run: node scripts/generate-icons.mjs
 *      (also wire into a "build:icons" npm script if desired)
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "client/public/favicon.svg");
const ICONS_DIR = resolve(ROOT, "client/public/icons");
const FAVICON_ICO = resolve(ROOT, "client/public/favicon.ico");

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

/** Renders the full SVG at a given size to a PNG buffer (transparent bg). */
async function renderSvg(size, { opaque = false } = {}) {
  const svg = await readFile(SRC);
  let pipe = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (opaque) {
    pipe = pipe.flatten({ background: { r: 0, g: 0, b: 0 } });
  }
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Maskable variant — the inner art must fit in the 80% safe zone (Android
 * adaptive icon mask cuts the rest). We render the SVG at 80% size, centered,
 * over a black square so the mask never shows transparency.
 */
async function renderMaskable(size = 512) {
  const inner = Math.round(size * 0.8);
  const innerPng = await renderSvg(inner, { opaque: false });
  const offset = Math.round((size - inner) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: innerPng, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Single-frame ICO writer — sharp can't emit ICO directly, so we write a
 * minimal ICONDIR + ICONDIRENTRY + embedded PNG (PNG-in-ICO is supported by
 * every browser since IE11). One 32x32 frame is sufficient for the favicon.
 */
async function writeIco(pngBuffer, path, size = 32) {
  const png = pngBuffer;
  const ICONDIR = Buffer.alloc(6);
  ICONDIR.writeUInt16LE(0, 0); // reserved
  ICONDIR.writeUInt16LE(1, 2); // type 1 = icon
  ICONDIR.writeUInt16LE(1, 4); // count

  const ICONDIRENTRY = Buffer.alloc(16);
  ICONDIRENTRY.writeUInt8(size === 256 ? 0 : size, 0); // width  (0 = 256)
  ICONDIRENTRY.writeUInt8(size === 256 ? 0 : size, 1); // height (0 = 256)
  ICONDIRENTRY.writeUInt8(0, 2);                       // colors (0 = >256)
  ICONDIRENTRY.writeUInt8(0, 3);                       // reserved
  ICONDIRENTRY.writeUInt16LE(1, 4);                    // planes
  ICONDIRENTRY.writeUInt16LE(32, 6);                   // bpp
  ICONDIRENTRY.writeUInt32LE(png.length, 8);           // image size
  ICONDIRENTRY.writeUInt32LE(6 + 16, 12);              // image offset

  await writeFile(path, Buffer.concat([ICONDIR, ICONDIRENTRY, png]));
}

async function main() {
  await ensureDir(ICONS_DIR);

  const targets = [
    // PWA — transparent OK
    { name: "icon-192.png", size: 192, opaque: false },
    { name: "icon-512.png", size: 512, opaque: false },
    // Apple touch — Apple flattens to black, so pre-bake opaque to avoid jank
    { name: "apple-touch-icon-152.png", size: 152, opaque: true },
    { name: "apple-touch-icon-167.png", size: 167, opaque: true },
    { name: "apple-touch-icon-180.png", size: 180, opaque: true },
  ];

  for (const t of targets) {
    const buf = await renderSvg(t.size, { opaque: t.opaque });
    const out = resolve(ICONS_DIR, t.name);
    await writeFile(out, buf);
    console.log("wrote", out, `(${t.size}x${t.size}${t.opaque ? ", opaque" : ""})`);
  }

  // Maskable 512 — 80% safe zone, opaque
  const maskable = await renderMaskable(512);
  const maskOut = resolve(ICONS_DIR, "icon-maskable-512.png");
  await writeFile(maskOut, maskable);
  console.log("wrote", maskOut, "(512x512, maskable, 80% safe zone, opaque)");

  // favicon.ico — 32x32 PNG-in-ICO
  const fav32 = await renderSvg(32, { opaque: false });
  await writeIco(fav32, FAVICON_ICO, 32);
  console.log("wrote", FAVICON_ICO, "(32x32 ICO)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
