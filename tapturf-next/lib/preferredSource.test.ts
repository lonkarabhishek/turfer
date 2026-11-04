import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PREFERRED_SOURCE_ART,
  PREFERRED_SOURCE_DOMAIN,
  PREFERRED_SOURCE_LABEL,
  PREFERRED_SOURCE_URL,
} from "./preferredSource";
import { PreferredSourceBadge } from "../components/ui/PreferredSourceBadge";

/**
 * The "Add TapTurf as a preferred source on Google" badge
 * (lib/preferredSource.ts, components/ui/PreferredSourceBadge.tsx): the
 * link is Google's documented deeplink for tapturf.in, and the page asks
 * Google for nothing until someone taps it (the cookie banner rule):
 * the artwork is a path on tapturf.in, and there is no script, frame or
 * stylesheet. npm run test:badge.
 */

const ROOT = process.cwd();
const SITE = "https://www.tapturf.in";

test("the link is Google's deeplink for tapturf.in, exactly", () => {
  assert.equal(PREFERRED_SOURCE_URL, "https://www.google.com/preferences/source?q=tapturf.in");
  const u = new URL(PREFERRED_SOURCE_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.host, "www.google.com");
  assert.equal(u.pathname, "/preferences/source");
  assert.deepEqual([...u.searchParams.keys()], ["q"]);
  assert.equal(u.hash, "");
  // A bare domain name: no scheme, no path, no www (sites are listed by domain).
  assert.equal(u.searchParams.get("q"), PREFERRED_SOURCE_DOMAIN);
  assert.match(PREFERRED_SOURCE_DOMAIN, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  assert.ok(!PREFERRED_SOURCE_DOMAIN.startsWith("www."));
});

test("the artwork is a same-origin path, and the file is in public/", () => {
  const src = PREFERRED_SOURCE_ART.src;
  assert.equal(src, "/badges/preferred-source-star.svg");
  assert.ok(src.startsWith("/") && !src.startsWith("//"), "a path, not a URL or protocol-relative link");
  assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(src), "no scheme");
  assert.equal(new URL(src, SITE).origin, SITE);
  const file = join(ROOT, "public", src);
  assert.ok(existsSync(file), `${file} exists`);
  if (src.endsWith(".svg")) {
    const svg = readFileSync(file, "utf8");
    // Nothing the image could fetch: its only URL is the SVG namespace.
    const urls = svg.match(/https?:\/\/[^\s"')]+/g) ?? [];
    assert.deepEqual(urls, ["http://www.w3.org/2000/svg"]);
    assert.ok(!/\b(?:href|src)\s*=|url\(|@import|<script|<foreignObject/i.test(svg));
  }
});

for (const props of [{}, { tone: "dark" as const }, { wide: true }]) {
  test(`the badge renders a plain link to Google, nothing loaded from Google (${JSON.stringify(props)})`, () => {
    const html = renderToStaticMarkup(createElement(PreferredSourceBadge, props));
    // One link, to the deeplink, in a new tab, with no opener and no referrer.
    const links = html.match(/<a\b[^>]*>/g) ?? [];
    assert.equal(links.length, 1);
    const a = links[0];
    const href = (a.match(/\shref="([^"]*)"/) ?? [])[1]?.replace(/&amp;/g, "&");
    assert.equal(href, PREFERRED_SOURCE_URL);
    assert.match(a, /\starget="_blank"/);
    const rel = ((a.match(/\srel="([^"]*)"/) ?? [])[1] ?? "").split(/\s+/);
    assert.ok(rel.includes("noopener") && rel.includes("noreferrer"), `rel="${rel.join(" ")}"`);
    // Every image is the same-origin artwork; no script, frame, stylesheet or font.
    const srcs = [...html.matchAll(/\s(?:src|srcset)="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(srcs, [PREFERRED_SOURCE_ART.src]);
    assert.ok(!/<(?:script|iframe|link|style|object|embed)\b/i.test(html));
    // The only off-site URL anywhere in the markup is the link itself
    // (the arrow's xmlns names the SVG namespace; nothing fetches it).
    const offSite = (html.match(/https?:\/\/[^\s"'<>]+/g) ?? [])
      .map((s) => s.replace(/&amp;/g, "&"))
      .filter((s) => s !== "http://www.w3.org/2000/svg");
    assert.deepEqual(offSite, [PREFERRED_SOURCE_URL]);
    // Its name: the words people see, as one sentence, then the new-tab note.
    const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    assert.equal(text, `${PREFERRED_SOURCE_LABEL} (opens in a new tab)`);
    assert.match(html, /<img\b[^>]*\salt=""/);
  });
}

/** Every .ts/.tsx file under these folders, as paths from the app root. */
function sources(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, p));
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return out.sort();
}

test("placed in the footer, the menu and the end of every blog post, and nowhere else", () => {
  const files = sources(["app", "components", "lib", "content"]);
  const using = files
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => /<PreferredSourceBadge\b/.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepEqual(using, [
    join("app", "blog", "[slug]", "page.tsx"),
    join("components", "layout", "Footer.tsx"),
    join("components", "layout", "HeaderMenu.tsx"),
  ]);
  // The deeplink lives in one place.
  const withUrl = files.filter((f) => readFileSync(join(ROOT, f), "utf8").includes("google.com/preferences/source"));
  assert.deepEqual(withUrl, [join("lib", "preferredSource.test.ts"), join("lib", "preferredSource.ts")]);
  // Google's JavaScript button is not used (it loads a script from
  // news.google.com); only the note saying so names it.
  const withScript = files.filter((f) =>
    /swg\/js|google-add-preferred-source-btn|preferred-sources-control|preferredSource\.init|addPreferredSource\(/.test(readFileSync(join(ROOT, f), "utf8")),
  );
  assert.deepEqual(withScript, [join("lib", "preferredSource.test.ts"), join("lib", "preferredSource.ts")]);
});
