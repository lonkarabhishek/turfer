/**
 * Coin faces for the cricket toss (components/tools/TossCoin.tsx).
 *
 * The art is SVG with lighting filters, which is too slow to draw while
 * the coin spins, so it is baked once into WebP files the page loads.
 *
 *   node scripts/toss-faces.mjs            writes public/tools/toss/src/{heads,tails}.svg
 *   node scripts/toss-faces.mjs --raster   also bakes public/tools/toss/{heads,tails}-{448,672}.webp
 *
 * Baking needs Playwright and a Chromium, which the app does not depend on:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node scripts/toss-faces.mjs --raster
 * Commit the SVGs and the WebP files together.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "tools", "toss");
// 2x and 3x of the 192px coin, with room for the coin growing at the top of the toss.
const SIZES = [448, 672];
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
// Baked into the image, so the lettering is the same on every phone.
const FONT = "'Liberation Sans', Arial, Helvetica, sans-serif";
const LA = Math.atan2(-0.62, -0.42); // light direction in the face plane (upper left)

const f = (n) => Math.round(n * 100) / 100;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c.join(",")})`;

// Lathe-turned metal: thin wedges whose brightness follows a two-lobed reflection, blurred smooth.
function lathe(dark, light, phase) {
  let s = "";
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1.08) / n) * TAU, m = ((i + 0.5) / n) * TAU;
    let v = 0.5 + 0.36 * Math.cos(2 * (m - LA)) + 0.08 * Math.cos(6 * m + phase) + 0.05 * Math.sin(13 * m + 2 * phase);
    v = Math.max(0, Math.min(1, v));
    s += `<path d="M100 100L${f(100 + 150 * Math.cos(a0))} ${f(100 + 150 * Math.sin(a0))}L${f(100 + 150 * Math.cos(a1))} ${f(100 + 150 * Math.sin(a1))}Z" fill="${rgb(mix(dark, light, v))}"/>`;
  }
  return s;
}

function star(cx, cy, ro, ri) {
  let p = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / 5;
    p += `${i ? "L" : "M"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return `<path d="${p}Z"/>`;
}

// Laurel: two arcs of paired leaves from the bottom up each side, open at the top.
function wreath(cx, cy, r, leaf) {
  let leaves = "", stem = "";
  for (const side of [-1, 1]) {
    const a0 = side < 0 ? 104 : 76, a1 = side < 0 ? 232 : -52, n = 9;
    const p0 = [cx + r * Math.cos(a0 * RAD), cy + r * Math.sin(a0 * RAD)];
    const p1 = [cx + r * Math.cos(a1 * RAD), cy + r * Math.sin(a1 * RAD)];
    stem += `M${f(p0[0])} ${f(p0[1])}A${r} ${r} 0 0 ${side < 0 ? 1 : 0} ${f(p1[0])} ${f(p1[1])}`;
    for (let j = 0; j <= n; j++) {
      const t = j / n, ang = (a0 + (a1 - a0) * t) * RAD;
      const bx = cx + r * Math.cos(ang), by = cy + r * Math.sin(ang);
      const dir = side < 0 ? 1 : -1, tx = -Math.sin(ang) * dir, ty = Math.cos(ang) * dir;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const L = (13.5 - 4.5 * t) * leaf, W = (4.6 - 1.6 * t) * leaf;
      for (const sd of j === n ? [0] : [1, -1]) {
        const sp = sd * 0.6, ux = tx * Math.cos(sp) + nx * Math.sin(sp), uy = ty * Math.cos(sp) + ny * Math.sin(sp);
        const px = bx + ux * L, py = by + uy * L, mx = bx + ux * L * 0.5, my = by + uy * L * 0.5, vx = -uy, vy = ux;
        leaves += `M${f(bx)} ${f(by)}Q${f(mx + vx * W)} ${f(my + vy * W)} ${f(px)} ${f(py)}Q${f(mx - vx * W)} ${f(my - vy * W)} ${f(bx)} ${f(by)}Z`;
      }
    }
  }
  return `<path d="${leaves}"/><path d="${stem}" fill="none" stroke="url(#gRel)" stroke-width="1.5" stroke-linecap="round"/>`;
}

// Cricket ball seam, drawn for a ball of radius 26 at (100, 95) and scaled into place:
// two thin seam lines with a row of stitches outside each.
const SEAM =
  '<path d="M78.6 114.9Q101.8 99.6 115.6 73.2" stroke-width=".9"/>' +
  '<path d="M83.4 119.7Q106.6 104.4 120.4 78" stroke-width=".9"/>' +
  '<path d="M75.2 111.5Q98.4 96.2 112.2 69.8" stroke-width="2.4" stroke-dasharray="1 1.9"/>' +
  '<path d="M86.8 123.1Q110 107.8 123.8 81.4" stroke-width="2.4" stroke-dasharray="1 1.9"/>';
function ballAt(cx, cy, r) {
  return `transform="translate(${f(cx)} ${f(cy)}) scale(${f(r / 26)}) translate(-100 -95)"`;
}

// A bat standing on its toe: origin at the top centre of the blade, handle pointing down.
function bat(len, bw) {
  const bl = len * 0.64, hw = 2.6, w = bw / 2;
  return `<path d="M${-w + 3} 0Q${-w} 0 ${-w} 3L${-w} ${bl}L${-hw} ${bl + 5}L${-hw} ${len - 1.6}Q0 ${len + 1.2} ${hw} ${len - 1.6}L${hw} ${bl + 5}L${w} ${bl}L${w} 3Q${w} 0 ${w - 3} 0Z"/>`;
}

// Tails: two crossed bats in front of a wicket, ball at their foot.
function tailsEmblem() {
  const cx = 100, cy = 93, len = 64, bw = 15, ang = 32, bl = len * 0.64, at = 0.45;
  const place = (a) => `transform="translate(${cx} ${cy}) rotate(${a}) translate(0 ${f(-len * at)})"`;
  const batA = `<g ${place(ang)}>${bat(len, bw)}</g>`;
  const batB = `<g ${place(-ang)}>${bat(len, bw)}</g>`;
  // grip wraps, the splice V and a grain line, cut into each bat
  const marks = (a) => {
    let g = `<g ${place(a)} stroke="#000" stroke-linecap="round" fill="none">`;
    for (let i = 0; i < 4; i++) g += `<path d="M-2.6 ${f(bl + 7.5 + i * 3.8)}L2.6 ${f(bl + 9.3 + i * 3.8)}" stroke-width=".9"/>`;
    g += `<path d="M-2.6 ${f(bl + 3.5)}L0 ${f(bl - 9)}L2.6 ${f(bl + 3.5)}" stroke-width=".95"/>`;
    g += `<path d="M0 6L0 ${f(bl - 14)}" stroke-width=".7" stroke-opacity=".8"/></g>`;
    return g;
  };
  let stumps = "";
  for (const dx of [-8.4, 0, 8.4]) stumps += `<rect x="${f(cx + dx - 2.5)}" y="47.6" width="5" height="55" rx="2.5"/>`;
  stumps += `<rect x="${f(cx - 11)}" y="42.6" width="10.4" height="3.4" rx="1.7"/><rect x="${f(cx + 0.6)}" y="42.6" width="10.4" height="3.4" rx="1.7"/>`;
  const by = 117, br = 6.2;
  return (
    `<mask id="mStumps"><rect width="200" height="200" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="4.4">${batA}${batB}</g></mask>` +
    `<mask id="mBatB"><rect width="200" height="200" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="4">${batA}</g>${marks(-ang)}</mask>` +
    `<mask id="mBatA"><rect width="200" height="200" fill="#fff"/>${marks(ang)}</mask>` +
    `<mask id="mBall"><circle cx="100" cy="${by}" r="${br}" fill="#fff"/><path d="M${f(100 - br)} ${f(by - 2.3)}Q100 ${f(by + 2.1)} ${f(100 + br)} ${f(by - 2.3)}" stroke="#000" stroke-width="1.1" fill="none"/></mask>` +
    `<g mask="url(#mStumps)">${stumps}</g>` +
    `<g mask="url(#mBatB)">${batB}</g>` +
    `<g mask="url(#mBatA)">${batA}</g>` +
    `<circle cx="100" cy="${by}" r="${br}" fill="url(#ballG)" mask="url(#mBall)"/>`
  );
}

export function faceSVG(kind) {
  const heads = kind === "heads";
  const top = heads ? "TAPTURF" : "CRICKET TOSS";
  const bottom = heads ? "CRICKET TOSS" : "TAPTURF";
  const label = heads ? "HEADS" : "TAILS";
  // Heads: a cricket ball in a laurel. The ball is part of the raised relief; its seam is drawn on top.
  const BALL = { cx: 100, cy: 81, r: 22.4 };
  const emblem = heads
    ? `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}" fill="url(#ballG)"/>` + wreath(100, 83, 35, 1.0)
    : tailsEmblem();
  const seam = heads
    ? `<clipPath id="cBall"><circle cx="100" cy="95" r="26.2"/></clipPath>` +
      `<g ${ballAt(BALL.cx, BALL.cy, BALL.r)}><g clip-path="url(#cBall)" fill="none">` +
      `<g stroke="#FFF2C6" stroke-opacity=".8" transform="translate(.45 .55)">${SEAM}</g>` +
      `<g stroke="#6E4A12">${SEAM}</g></g></g>`
    : "";
  const light = 'azimuth="236" elevation="40"';
  const emb = (id, blur) =>
    `<filter id="${id}" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="b"/>` +
    `<feDiffuseLighting in="b" surfaceScale="2.6" diffuseConstant="1.15" result="d"><feDistantLight ${light}/></feDiffuseLighting>` +
    `<feSpecularLighting in="b" surfaceScale="2.6" specularConstant="1" specularExponent="24" result="s"><feDistantLight ${light}/></feSpecularLighting>` +
    '<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>' +
    '<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.3" result="m"/>' +
    '<feComposite in="m" in2="s2" operator="arithmetic" k2="1" k3=".9" result="o"/>' +
    '<feComposite in="o" in2="SourceAlpha" operator="in"/></filter>';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200" width="400" height="400">\n' +
    "<defs>" +
    '<linearGradient id="sRel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#E3E7EB"/><stop offset=".72" stop-color="#C5CBD2"/><stop offset="1" stop-color="#EEF1F4"/></linearGradient>' +
    '<linearGradient id="gRel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3CC"/><stop offset=".42" stop-color="#F1CD74"/><stop offset=".74" stop-color="#D8A443"/><stop offset="1" stop-color="#F6D98D"/></linearGradient>' +
    '<radialGradient id="ballG" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#FFF8DE"/><stop offset=".42" stop-color="#EEC66B"/><stop offset="1" stop-color="#A47520"/></radialGradient>' +
    '<filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
    emb("embS", 0.75) +
    emb("embG", 1.0) +
    '<filter id="cast" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur in="SourceAlpha" stdDeviation=".9"/><feOffset dx="1" dy="1.3" result="o"/>' +
    '<feFlood flood-color="#120C02" flood-opacity=".5"/><feComposite in2="o" operator="in"/></filter>' +
    '<clipPath id="cAll"><circle cx="100" cy="100" r="100"/></clipPath>' +
    '<clipPath id="cGold"><circle cx="100" cy="100" r="64.6"/></clipPath>' +
    '<path id="pTop" d="M26 100A74 74 0 0 1 174 100"/>' +
    '<path id="pBot" d="M15.6 100A84.4 84.4 0 0 0 184.4 100"/>' +
    '<g id="relS" fill="url(#sRel)">' +
    '<path fill-rule="evenodd" d="M100 0a100 100 0 1 0 .01 0ZM100 8.6a91.4 91.4 0 1 1-.01 0Z"/>' +
    '<circle cx="100" cy="100" r="88.6" fill="none" stroke="url(#sRel)" stroke-width="2.2" stroke-dasharray="1.15 1.62"/>' +
    `<g font-family="${FONT}" font-weight="800" font-size="12.4" letter-spacing="1.4" text-anchor="middle">` +
    `<text><textPath xlink:href="#pTop" href="#pTop" startOffset="50%">${top}</textPath></text>` +
    `<text><textPath xlink:href="#pBot" href="#pBot" startOffset="50%">${bottom}</textPath></text></g>` +
    star(21, 100, 4.8, 2) +
    star(179, 100, 4.8, 2) +
    "</g>" +
    '<g id="relG" fill="url(#gRel)">' +
    '<path fill-rule="evenodd" d="M100 36.4a63.6 63.6 0 1 0 .01 0ZM100 39.6a60.4 60.4 0 1 1-.01 0Z"/>' +
    emblem +
    `<text x="100" y="${heads ? 142 : 142.5}" font-family="${FONT}" font-weight="900" font-size="16.5" letter-spacing="2.2" text-anchor="middle">${label}</text>` +
    "</g>" +
    "</defs>\n" +
    `<g clip-path="url(#cAll)"><g filter="url(#soft)">${lathe([92, 100, 112], [238, 241, 245], 0.4)}</g></g>\n` +
    `<g clip-path="url(#cGold)"><g filter="url(#soft)">${lathe([124, 80, 18], [252, 224, 148], 1.9)}</g></g>\n` +
    '<circle cx="100" cy="100" r="64.9" fill="none" stroke="#2A2214" stroke-opacity=".55" stroke-width=".9"/>' +
    '<circle cx="100" cy="100" r="65.7" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/>\n' +
    '<g filter="url(#cast)"><use xlink:href="#relS" href="#relS"/><use xlink:href="#relG" href="#relG"/></g>\n' +
    '<use xlink:href="#relS" href="#relS" filter="url(#embS)"/>\n' +
    '<use xlink:href="#relG" href="#relG" filter="url(#embG)"/>\n' +
    seam +
    "\n</svg>\n"
  );
}

async function raster(files) {
  const mod = process.env.PLAYWRIGHT_MODULE || "playwright";
  const { chromium } = await import(mod);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  for (const [kind, svg] of files) {
    for (const px of SIZES) {
      const b64 = await page.evaluate(
        async ({ svg, px }) => {
          const img = new Image();
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          await img.decode();
          const c = document.createElement("canvas");
          c.width = c.height = px;
          c.getContext("2d").drawImage(img, 0, 0, px, px);
          return c.toDataURL("image/webp", 0.86).split(",")[1];
        },
        { svg, px },
      );
      const file = path.join(OUT, `${kind}-${px}.webp`);
      fs.writeFileSync(file, Buffer.from(b64, "base64"));
      console.log("baked", path.relative(process.cwd(), file));
    }
  }
  await browser.close();
}

const files = [
  ["heads", faceSVG("heads")],
  ["tails", faceSVG("tails")],
];
fs.mkdirSync(path.join(OUT, "src"), { recursive: true });
for (const [kind, svg] of files) {
  const file = path.join(OUT, "src", `${kind}.svg`);
  fs.writeFileSync(file, svg);
  console.log("wrote", path.relative(process.cwd(), file));
}
if (process.argv.includes("--raster")) await raster(files);
