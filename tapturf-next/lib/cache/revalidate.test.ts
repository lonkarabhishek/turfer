// Run with: npm run test:cache
//
// The page timers of 10 Nov and what keeps them honest, read from the
// sources (Next reads segment config from the source too): an
// unstable_cache read lowers a page's revalidate to its own and gives the
// page its tags, so a week-long turf page needs week-long shared entries,
// and a day-long list page must take its list reads through its scope
// (lib/queries/listScope.ts), not the hour-long, "turf-data" entries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const segment = (rel: string): number => {
  const m = src(rel).match(/^export const revalidate = (\d+);$/m);
  assert.ok(m, `${rel} exports a literal revalidate`);
  return Number(m[1]);
};
/** The revalidate of the unstable_cache entry whose key array starts with `key`. */
const entry = (rel: string, key: string): number => {
  const s = src(rel);
  const at = s.indexOf(`["${key}"`);
  assert.ok(at >= 0, `${rel}: entry ${key}`);
  const m = s.slice(at, at + 300).match(/revalidate: (\d+)/);
  assert.ok(m, `${rel}: ${key} has a numeric revalidate`);
  return Number(m[1]);
};

const WEEK = 604800;
const DAY = 86400;
const HOUR = 3600;

test("turf pages: a week, and every shared entry they read lasts at least as long", () => {
  assert.equal(segment("app/turf/[id]/page.tsx"), WEEK);
  assert.ok(entry("lib/queries/cities.ts", "live-cities-footer") >= WEEK, "footer cities");
  assert.ok(entry("lib/queries/turfFacts.ts", "turf-facts-v1") >= WEEK, "turf facts");
  assert.ok(entry("lib/queries/groundSizes.ts", "ground-peers-v1") >= WEEK, "ground size peers");
  // The prerendered pages' first life stays (a purge sent during the build reached the old deployment only).
  assert.match(src("lib/queries/turfPage.ts"), /if \(built !== undefined\) await firstLife\(key\);/);
});

test("list pages: a day, home pages an hour (they show open games), games pages 10 minutes, the sitemap a day", () => {
  const want: Record<string, number> = {
    "app/[city]/page.tsx": DAY,
    "app/[city]/[sport]/page.tsx": DAY,
    "app/c/[city]/turfs/page.tsx": DAY,
    "app/turfs/page.tsx": DAY,
    "app/sport/[sport]/page.tsx": DAY,
    "app/turf-near-me/page.tsx": DAY,
    "app/badminton-courts-near-me/page.tsx": DAY,
    "app/pickleball-courts-near-me/page.tsx": DAY,
    "app/tennis-courts-near-me/page.tsx": DAY,
    "app/page.tsx": HOUR,
    "app/c/[city]/page.tsx": HOUR,
    "app/games/page.tsx": 600,
    "app/c/[city]/games/page.tsx": 600,
    "app/game/[id]/page.tsx": 600,
    "app/sitemap.ts": DAY,
  };
  for (const [rel, s] of Object.entries(want)) assert.equal(segment(rel), s, rel);
  assert.match(src("lib/home/data.ts"), /^export const HOME_REVALIDATE = 3600;$/m);
});

test("every list page names its scope before its reads (else it keeps the old tag and the hour)", () => {
  const scoped: Record<string, RegExp> = {
    "app/[city]/page.tsx": /setListScope\(city\)/,
    "app/[city]/[sport]/page.tsx": /setListScope\(city\)/,
    "app/c/[city]/layout.tsx": /setListScope\(city\)/,
    "app/c/[city]/page.tsx": /setListScope\(/,
    "app/c/[city]/turfs/page.tsx": /setListScope\(/,
    "app/c/[city]/games/page.tsx": /setListScope\(city\)/,
    "app/page.tsx": /setListScope\(INDIA\)/,
    "app/turfs/page.tsx": /setListScope\(INDIA\)/,
    "app/sport/[sport]/page.tsx": /setListScope\(INDIA\)/,
    "app/turf-near-me/page.tsx": /setListScope\(INDIA\)/,
    "components/near/CourtNearMe.tsx": /setListScope\(INDIA\)/,
    "app/sitemap.ts": /withListScope\(INDIA, /,
  };
  for (const [rel, re] of Object.entries(scoped)) assert.match(src(rel), re, rel);
  // Pages with generateMetadata name it there too (Next may run it first).
  for (const rel of ["app/[city]/page.tsx", "app/[city]/[sport]/page.tsx", "app/c/[city]/page.tsx", "app/c/[city]/turfs/page.tsx", "app/page.tsx", "app/turfs/page.tsx", "app/sport/[sport]/page.tsx"]) {
    assert.ok((src(rel).match(/setListScope\(/g) ?? []).length >= 2, `${rel}: metadata and page`);
  }
});

test("pages that show open games carry the games tag", () => {
  assert.match(src("components/game/GamesView.tsx"), /await tagGamesRender\(\);/);
  assert.match(src("app/game/[id]/page.tsx"), /await tagGamesRender\(\);/);
  assert.match(src("lib/home/data.ts"), /await tagGamesRender\(\);/);
  // The game page is an ISR page: without generateStaticParams it rendered on every request.
  assert.match(src("app/game/[id]/page.tsx"), /export function generateStaticParams\(\)/);
});

test("the shared entries keep the old tag for readers with no scope (route handlers)", () => {
  assert.match(src("lib/queries/turfs.ts"), /\["turf-list-meta-v1"[^\]]*\], \{\s*revalidate: 3600,\s*tags: \["turf-data"\],/);
  assert.match(src("lib/queries/trending.ts"), /\["trending-picks-v1"\], \{\s*revalidate: 600,\s*tags: \["turf-data"\],/);
  assert.match(src("lib/home/data.ts"), /\["home-extras-v1"\], \{ revalidate: HOME_REVALIDATE, tags: \["turf-data", GAMES_TAG\] \}/);
});
