import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADS_TXT_LINE, ADSENSE_CLIENT, ADSENSE_META_NAME, ADSENSE_SRC, adsAllowedOn, NO_ADS_PERSONAL, NO_ADS_PROMISED } from "./ads";
import { quietPath } from "./outcome/prompt";

/**
 * Google AdSense (lib/ads.ts): the owner's account, where the script may
 * never load, and that it reaches a page only through the consent gate
 * (lib/analytics/ads.ts; its behaviour is in lib/analytics/consentGates.test.ts).
 */

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
/** A source file without its comments, so a sentence about a thing is not taken for the thing. */
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("the account and the script are the owner's, exactly as AdSense gave them", () => {
  assert.equal(ADSENSE_CLIENT, "ca-pub-4556049898419830");
  assert.equal(ADSENSE_SRC, "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4556049898419830");
  assert.equal(ADSENSE_META_NAME, "google-adsense-account");
  assert.equal(ADS_TXT_LINE, "google.com, pub-4556049898419830, DIRECT, f08c47fec0942fa0");
});

test("ads.txt: the one line, at the site's root", () => {
  assert.equal(read("public/ads.txt"), `${ADS_TXT_LINE}\n`);
  // Nothing can answer /ads.txt before the file: no route of that name, and the proxy skips paths with an extension.
  assert.equal(fs.existsSync(path.join(process.cwd(), "app/ads.txt")), false);
  assert.match(read("proxy.ts"), /\.\*\\\\\.\[a-zA-Z0-9\]\+\$/, "the proxy's catch-all leaves out every path that ends in an extension");
});

test("the root layout: the meta tag that loads nothing, and no ad script or ad unit in the server HTML", () => {
  const layout = code("app/layout.tsx");
  assert.match(layout, /<meta name=\{ADSENSE_META_NAME\} content=\{ADSENSE_CLIENT\} \/>/, "site verification by meta tag");
  assert.match(layout, /<GoogleAdSense \/>/, "the loader, a client component that waits for Accept");
  for (const file of ["app/layout.tsx", "components/analytics/GoogleAdSense.tsx"]) {
    const src = code(file);
    assert.doesNotMatch(src, /<script|next\/script|googlesyndication|doubleclick/i, `${file}: no script tag and no ad host`);
    assert.doesNotMatch(src, /<ins\b|adsbygoogle/, `${file}: no ad unit`);
  }
});

test("only the consent-gated loader ever adds the script, and nothing places an ad unit or pushes one", () => {
  const loader = code("lib/analytics/ads.ts");
  assert.match(loader, /if \(!adsAllowedOn\(path\) \|\| !analyticsAllowed\(\)\) \{/, "the path rule, then the gate every consent gate uses");
  assert.match(loader, /process\.env\.NODE_ENV !== "production"\) return false;/, "production only");
  assert.match(loader, /s\.async = true;\s+s\.src = ADSENSE_SRC;\s+s\.crossOrigin = "anonymous";/);
  const component = code("components/analytics/GoogleAdSense.tsx");
  assert.match(component, /startAds\(pathname\)/);
  // Across the app's own source: one place names the ad host, and nobody draws an ad unit.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib", "pages"]) walk(dir);
  const naming = files.filter((f) => /googlesyndication|doubleclick\.net/.test(code(f)));
  assert.deepEqual(naming, ["lib/ads.ts"], "the ad host is named in one place");
  for (const f of files) {
    const src = code(f);
    assert.doesNotMatch(src, /<ins\b[^>]*adsbygoogle/, `${f}: no ad unit`);
    assert.doesNotMatch(src, /adsbygoogle[^\n;]*\.push\(/, `${f}: nothing is pushed to the ad script`);
  }
  assert.deepEqual(files.filter((f) => /\bstartAds\(/.test(code(f))).sort(), ["components/analytics/GoogleAdSense.tsx", "lib/analytics/ads.ts"], "one caller");
});

test("where ads may load: the pages people browse", () => {
  for (const p of [
    "/",
    "/turfs",
    "/turfs?q=box",
    "/games",
    "/map",
    "/pune",
    "/pune/football",
    "/mysore",
    "/c/pune",
    "/turf/kings-turf-arena-nashik",
    "/turf/kings-turf-arena-nashik#free-slots",
    "/sport/football",
    "/turf-near-me",
    "/game/football-kings-turf-nashik-sat-15-nov-7pm-4b63fb76",
    "/blog",
    "/blog/ad-free-cricket-scorer-cricheroes-alternative",
    "/tools",
    "/tools/cricket-toss",
    "/tools/cricket-team-generator",
    "/tournament/abc123",
    "/privacy",
    "/terms",
  ]) {
    assert.equal(adsAllowedOn(p), true, p);
  }
});

test("where ads never load: the outcome card's quiet pages, a person's own pages, and where we said there are none", () => {
  // The same list the outcome card and the turf pages' labels stay off (lib/outcome/prompt.ts quietPath), by calling it.
  for (const p of ["/admin", "/admin/traffic", "/admin/tools", "/my", "/my/turf/abc?tab=page", "/report/abc.def", "/email/off?t=x"]) {
    assert.equal(quietPath(p), true, p);
    assert.equal(adsAllowedOn(p), false, p);
  }
  for (const p of ["/dashboard", "/dashboard?tab=passport#medals", "/login", "/login/complete", "/account/link", "/u/asha_rao", "/game/create", "/tournament/new"]) {
    assert.equal(adsAllowedOn(p), false, p);
  }
  for (const p of ["/tools/cricket-live-scorer", "/tools/live-scoreboard", "/tools/turf-session?game=abc", "/live/abc123"]) {
    assert.equal(adsAllowedOn(p), false, p);
  }
  // Upper case, a trailing slash, a query and a hash change nothing.
  for (const p of ["/Dashboard", "/dashboard/", "/MY/turf/1", "/Live/ABC123/", "/u/Asha#top"]) assert.equal(adsAllowedOn(p), false, p);
  // Not a path at all: no.
  for (const p of [null, undefined, "", "dashboard", "https://www.tapturf.in/"]) assert.equal(adsAllowedOn(p), false, String(p));
  // A page whose name only starts like one of them is its own page.
  for (const p of ["/mysore", "/myturf", "/udaipur", "/liverpool", "/login-help", "/game/created-by-asha-1a2b3c4d", "/tools/live-scoreboard-rules", "/reports"]) {
    assert.equal(adsAllowedOn(p), true, p);
  }
  assert.deepEqual([...NO_ADS_PERSONAL], ["/dashboard", "/login", "/account", "/u", "/game/create", "/tournament/new"]);
  assert.deepEqual([...NO_ADS_PROMISED], ["/tools/cricket-live-scorer", "/tools/live-scoreboard", "/tools/turf-session", "/live"]);
});

test("every page that is private to a person or asks them to sign in is on the list", () => {
  // The pages that say noindex in their own files, less the public ones (a thin city or sport page, a game, a turf, a blog post, a tournament).
  const noindex = ["/admin", "/admin/tools", "/account/link", "/login", "/login/complete", "/my", "/my/turf/x", "/u/someone", "/tournament/new"];
  for (const p of noindex) assert.equal(adsAllowedOn(p), false, p);
  // And the two the app sends a signed-out person away from.
  for (const p of ["/dashboard", "/game/create"]) assert.equal(adsAllowedOn(p), false, p);
  for (const dir of ["app/login", "app/account/link", "app/my", "app/dashboard", "app/u/[username]", "app/game/create", "app/tournament/new", "app/admin", "app/report/[token]", "app/email/off"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), dir)), true, `${dir} is still where the list says`);
  }
});

test("the scorers and live pages the blog calls ad-free are on the list, for as long as it says so", () => {
  const post = read("content/blog/posts/ad-free-cricket-scorer-cricheroes-alternative.ts");
  assert.match(post, /TapTurf's Live Cricket Scorer and Live Scoreboard are free, show no ads/);
  assert.match(post, /value: "0 ads", label: "On the scorer and scoreboard"/);
  for (const p of ["/tools/cricket-live-scorer", "/tools/live-scoreboard", "/live/abc123"]) assert.equal(adsAllowedOn(p), false, p);
  for (const dir of ["app/tools/cricket-live-scorer", "app/tools/live-scoreboard", "app/tools/turf-session", "app/live/[code]"]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), dir)), true, `${dir} is still where the list says`);
  }
});

test("the cookie banner says ads too, in plain words", () => {
  const banner = read("components/consent/CookieBanner.tsx").replace(/\s+/g, " ");
  const at = banner.indexOf('<p id="tt-cookie-text"');
  const text = banner.slice(banner.indexOf(">", at) + 1, banner.indexOf("<Link", at));
  assert.equal(
    text.trim(),
    "We&rsquo;d like to use Google Analytics and similar tools to see how TapTurf is used, to show maps from Google, and to show ads from Google AdSense, which uses cookies to show and measure ads and may personalise them. They load only if you accept. TapTurf&rsquo;s own anonymous counts run either way and keep nothing on your device.{\" \"}",
  );
  assert.match(banner, /"Now: accepted\. Google Analytics, Google maps and ads from Google are on\."/, "Cookie settings says what an Accept has on");
  assert.match(banner, /"Now: rejected\. They stay off\."/);
  // The house rules for words people read.
  for (const s of [text.replace(/&rsquo;/g, "'"), "Now: accepted. Google Analytics, Google maps and ads from Google are on."]) {
    assert.doesNotMatch(s, /[—–;]|&mdash;|&ndash;/, "no dashes, no semicolons");
    assert.doesNotMatch(s, /\bbook/i);
  }
});
