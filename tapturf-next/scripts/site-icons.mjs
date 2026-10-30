/**
 * The site icons, cut from the logo (public/logo.png): the round stadium
 * scene with the cricket ball flying into it. The wordmark is left out: it
 * covers the bottom of the scene and can't be read at icon sizes.
 *
 *   node scripts/site-icons.mjs
 *
 * writes
 *   app/favicon.ico          16, 32 and 48px on transparent, for browser tabs
 *   public/icon-192.png      maskable home-screen icons: the emblem inside the
 *   public/icon-512.png      central 80% safe zone, on white
 *   public/apple-icon.png    180px, the same on opaque white, for iOS
 *
 * Uses sharp, which Next installs. Run it again if the logo changes and
 * commit the four files together.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO = path.join(ROOT, "public", "logo.png");

// In logo.png's pixels (1240x1112). SCENE is the largest disc of the
// stadium that stays inside its dome and above the gap over the wordmark;
// BALL is the cricket ball, which overlaps the dome's edge as in the logo.
const SCENE = { cx: 560, cy: 348, r: 266 };
const BALL = { cx: 296, cy: 248, rx: 110, ry: 107 };
// The emblem's enclosing circle spans this share of an app icon's width:
// under 0.8, so it sits inside the maskable safe zone with a little air.
const FILL = 0.78;
// The manifest's background_color, so the splash screen matches.
const BG = "#FFFFFF";

/** The emblem on transparent, cropped to its box, with the enclosing circle in its pixels. */
async function emblem() {
  const meta = await sharp(LOGO).metadata();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">` +
      `<circle cx="${SCENE.cx}" cy="${SCENE.cy}" r="${SCENE.r}" fill="#fff"/>` +
      `<ellipse cx="${BALL.cx}" cy="${BALL.cy}" rx="${BALL.rx}" ry="${BALL.ry}" fill="#fff"/></svg>`,
  );
  const left = Math.min(SCENE.cx - SCENE.r, BALL.cx - BALL.rx);
  const top = Math.min(SCENE.cy - SCENE.r, BALL.cy - BALL.ry);
  const width = Math.max(SCENE.cx + SCENE.r, BALL.cx + BALL.rx) - left;
  const height = Math.max(SCENE.cy + SCENE.r, BALL.cy + BALL.ry) - top;
  const masked = await sharp(LOGO).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const image = await sharp(masked).extract({ left, top, width, height }).png().toBuffer();

  // Smallest circle holding both discs (the ball counted round, at its wider radius).
  const ballR = Math.max(BALL.rx, BALL.ry);
  const d = Math.hypot(SCENE.cx - BALL.cx, SCENE.cy - BALL.cy);
  const r = (d + SCENE.r + ballR) / 2;
  const t = (r - ballR) / d;
  const cx = BALL.cx + (SCENE.cx - BALL.cx) * t - left;
  const cy = BALL.cy + (SCENE.cy - BALL.cy) * t - top;
  return { image, width, height, circle: { cx, cy, r } };
}

/** A square app icon: the emblem centred by its enclosing circle on an opaque background. */
async function appIcon(e, size) {
  const scale = (size * FILL) / 2 / e.circle.r;
  const w = Math.round(e.width * scale);
  const h = Math.round(e.height * scale);
  const art = await sharp(e.image).resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
  const icon = await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: art, left: Math.round(size / 2 - e.circle.cx * scale), top: Math.round(size / 2 - e.circle.cy * scale) }])
    .png()
    .toBuffer();
  // Compositing adds an alpha channel; drop it so the file is plainly opaque.
  return sharp(icon).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

/** A favicon frame: the emblem as large as fits, on transparent; a light sharpen keeps 16 and 32 crisp. */
async function tabIcon(e, size) {
  const fit = await sharp(e.image)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png()
    .toBuffer();
  return size <= 32 ? sharp(fit).sharpen({ sigma: 0.5 }).png({ compressionLevel: 9 }).toBuffer() : fit;
}

/** An .ico holding PNG frames, which every current browser reads. */
function ico(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt8(0, at + 2);
    head.writeUInt8(0, at + 3);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f.png)]);
}

const e = await emblem();
const out = {
  "public/icon-192.png": await appIcon(e, 192),
  "public/icon-512.png": await appIcon(e, 512),
  "public/apple-icon.png": await appIcon(e, 180),
  // 48 first: Next declares the first frame's size on the <link>, and a
  // browser told the .ico is only 16px fetches the 192px icon for a 2x tab.
  "app/favicon.ico": ico(await Promise.all([48, 32, 16].map(async (size) => ({ size, png: await tabIcon(e, size) })))),
};
for (const [file, buf] of Object.entries(out)) {
  fs.writeFileSync(path.join(ROOT, file), buf);
  console.log(`${file}  ${(buf.length / 1024).toFixed(1)} KB`);
}
