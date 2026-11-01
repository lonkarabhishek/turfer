/**
 * A contact sheet of the drawn avatars (lib/account/avatarArt.ts): every
 * player at 32, 48, 96 and 160 px, in the circle the site shows them in,
 * on white and on the dark of the site's hero, with its name, role and
 * id. For looking at the art; the site never uses it.
 *
 *   node scripts/avatar-sheet.mjs <out.png> [--dpr 2] [--only id,id]
 *
 * It compiles the two files with tsc into .test-out/avatar-sheet. Drawing
 * needs Playwright and a Chromium, which the app does not depend on:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node scripts/avatar-sheet.mjs out.png
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const opts = {};
const files = [];
for (let a = process.argv.slice(2); a.length; ) {
  const x = a.shift();
  if (x.startsWith("--")) opts[x.slice(2)] = a.shift();
  else files.push(x);
}
const out = files[0] ?? "avatar-sheet.png";
const dpr = Number(opts.dpr ?? 1);
const only = opts.only?.split(",");

const root = process.cwd();
const build = path.join(root, ".test-out", "avatar-sheet");
execFileSync(
  path.join(root, "node_modules", ".bin", "tsc"),
  ["lib/account/avatar.ts", "lib/account/avatarArt.ts", "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node", "--rootDir", ".", "--outDir", build, "--skipLibCheck"],
  { stdio: "inherit" },
);
const require = createRequire(import.meta.url);
const { AVATAR_PRESETS, AVATAR_GROUPS } = require(path.join(build, "lib/account/avatar.js"));
const { avatarSvg } = require(path.join(build, "lib/account/avatarArt.js"));

const SIZES = [32, 48, 96, 160];
const DARK = "#111113"; // --color-primary-600, the hero and CTA background
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const uri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const presets = AVATAR_PRESETS.filter((p) => !only || only.includes(p.id));
const row = (p, bg) =>
  `<div class="row" style="background:${bg}">${SIZES.map((s) => `<img src="${uri(avatarSvg(p.id))}" width="${s}" height="${s}" alt="">`).join("")}</div>`;
const cards = presets
  .map((p) => {
    const bytes = Buffer.byteLength(avatarSvg(p.id));
    const group = AVATAR_GROUPS.find((g) => g.id === p.group)?.label ?? p.group;
    return `<div class="card"><p><b>${esc(p.name)}</b> &middot; ${esc(p.role)}<span>${esc(group)} &middot; ${p.id} &middot; ${(bytes / 1024).toFixed(1)} KB</span></p>${row(p, "#fff")}${row(p, DARK)}</div>`;
  })
  .join("");
// The whole set side by side at the nav's 24 px and the header's 32, as a phone shows them.
const lineup = [24, 32]
  .flatMap((s) => ["#fff", DARK].map((bg) => `<div class="row" style="background:${bg}">${presets.map((p) => `<img src="${uri(avatarSvg(p.id))}" width="${s}" height="${s}" alt="">`).join("")}</div>`))
  .join("");
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #F3F4F6; font: 14px/1.3 "Liberation Sans", Arial, sans-serif; color: #1D1D1F; }
  .lineup { margin-bottom: 16px; border-radius: 16px; overflow: hidden; width: max-content; }
  .lineup .row { gap: 10px; }
  .grid { display: grid; grid-template-columns: repeat(4, max-content); gap: 16px; }
  .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
  .card p { margin: 0; padding: 10px 14px 8px; }
  .card span { display: block; font-size: 12px; color: #6E6E73; }
  .row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; }
  img { border-radius: 50%; object-fit: cover; background: #F3F4F6; display: block; }
</style><div class="lineup">${lineup}</div><div class="grid">${cards}</div>`;

// require() finds a global install (NODE_PATH); import() would not.
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require("playwright");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr });
await page.setContent(html);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${presets.length} avatars -> ${out}`);
