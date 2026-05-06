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
 *   client/public/favicon-16.png                      (browser tab, retina-friendly)
 *   client/public/favicon-32.png                      (browser tab)
 *   client/public/icons/icon-192.png                  (PWA, transparent OK)
 *   client/public/icons/icon-512.png                  (PWA)
 *   client/public/icons/icon-1024.png                 (PWA / store assets)
 *   client/public/icons/icon-maskable-512.png         (PWA, 80% safe-zone, opaque bg)
 *   client/public/icons/apple-touch-icon.png          (iOS canonical name, 180)
 *   client/public/icons/apple-touch-icon-152.png      (iPad,            opaque)
 *   client/public/icons/apple-touch-icon-167.png      (iPad Pro,        opaque)
 *   client/public/icons/apple-touch-icon-180.png      (iPhone primary,  opaque)
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "client/public/favicon.svg");
const PUBLIC_DIR = resolve(ROOT, "client/public");
const ICONS_DIR = resolve(ROOT, "client/public/icons");
const FAVICON_ICO = resolve(ROOT, "client/public/favicon.ico");

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

/** Renders the full SVG at a given size to a PNG buffer. */
async function renderSvg(size, { opaque = false } = {}) {
  const svg = await readFile(SRC);
  // density scales SVG rasterization; 384 gives clean 512+ output.
  let pipe = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (opaque) {
    // Flatten transparency onto the warm near-black bg used in the SVG.
    pipe = pipe.flatten({ background: { r: 13, g: 10, b: 5 } });
  }
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Maskable variant — the inner art must fit in the 80% safe zone (Android
 * adaptive icon mask cuts the rest). We render the SVG at 80% size, centered,
 * over an opaque square so the mask never shows transparency.
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
      background: { r: 13, g: 10, b: 5, alpha: 1 },
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
  ICONDIRENTRY.writeUInt8(0, 2); // colors (0 = >256)
  ICONDIRENTRY.writeUInt8(0, 3); // reserved
  ICONDIRENTRY.writeUInt16LE(1, 4); // planes
  ICONDIRENTRY.writeUInt16LE(32, 6); // bpp
  ICONDIRENTRY.writeUInt32LE(png.length, 8); // image size
  ICONDIRENTRY.writeUInt32LE(6 + 16, 12); // image offset

  await writeFile(path, Buffer.concat([ICONDIR, ICONDIRENTRY, png]));
}

async function logSize(label, path) {
  const s = await stat(path);
  console.log(`wrote ${label.padEnd(36)} ${path}  (${s.size.toLocaleString()} bytes)`);
}

async function main() {
  await ensureDir(ICONS_DIR);
  await ensureDir(PUBLIC_DIR);

  const targets = [
    // PWA — opaque so the warm-amber glow renders correctly on every OS.
    { dir: ICONS_DIR, name: "icon-192.png", size: 192, opaque: true },
    { dir: ICONS_DIR, name: "icon-512.png", size: 512, opaque: true },
    { dir: ICONS_DIR, name: "icon-1024.png", size: 1024, opaque: true },
    // Apple touch — Apple flattens to black, so pre-bake opaque to avoid jank.
    { dir: ICONS_DIR, name: "apple-touch-icon.png", size: 180, opaque: true },
    { dir: ICONS_DIR, name: "apple-touch-icon-152.png", size: 152, opaque: true },
    { dir: ICONS_DIR, name: "apple-touch-icon-167.png", size: 167, opaque: true },
    { dir: ICONS_DIR, name: "apple-touch-icon-180.png", size: 180, opaque: true },
    // Browser-tab favicons in /public root for legacy paths (<link rel=icon>).
    { dir: PUBLIC_DIR, name: "favicon-16.png", size: 16, opaque: true },
    { dir: PUBLIC_DIR, name: "favicon-32.png", size: 32, opaque: true },
  ];

  for (const t of targets) {
    const buf = await renderSvg(t.size, { opaque: t.opaque });
    const out = resolve(t.dir, t.name);
    await writeFile(out, buf);
    await logSize(`${t.name} (${t.size}x${t.size})`, out);
  }

  // Maskable 512 — 80% safe zone, opaque
  const maskable = await renderMaskable(512);
  const maskOut = resolve(ICONS_DIR, "icon-maskable-512.png");
  await writeFile(maskOut, maskable);
  await logSize("icon-maskable-512.png (512x512)", maskOut);

  // favicon.ico — 32x32 PNG-in-ICO (opaque so it renders cleanly in tabs).
  const fav32 = await renderSvg(32, { opaque: true });
  await writeIco(fav32, FAVICON_ICO, 32);
  await logSize("favicon.ico (32x32)", FAVICON_ICO);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
