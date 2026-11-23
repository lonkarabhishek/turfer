import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDALS, bestFirst } from "../profile/medals";
import type { PublicPassport } from "../profile/passport";
import { BANNED_COPY } from "../seo/defaults";
import { fitSize, ogText, textEm } from "./gameCard";
import {
  MEDAL_STORY_SIZE,
  STORY_CACHE,
  STORY_GRID_MAX,
  STORY_SAFE,
  isStoryUsername,
  medalStoryFacts,
  medalStoryFile,
  medalStoryPath,
  medalStoryResponse,
  medalStoryVersion,
  storyBrag,
  storyRows,
  type MedalStoryFacts,
  type StoryDeps,
} from "./medalStory";

// The medals' story picture (GET /api/og/medals/<username>): what it says, its version and URL, and what the
// route answers, with the profile and passport reads faked. Fake people.

const numbers = (n: Partial<PublicPassport["numbers"]> = {}): PublicPassport["numbers"] => ({ games: 0, hosted: 0, turfs: 0, cities: 0, sports: 0, reviews: 0, bestStreak: 0, streak: 0, turfers: null, ...n });
const passport = (ids: readonly string[], n: Partial<PublicPassport["numbers"]> = {}): PublicPassport => ({
  numbers: numbers(n),
  // As publicPassport gives them: earned only, best first.
  medals: bestFirst(MEDALS.filter((m) => ids.includes(m.id))).map(({ id, name, blurb, art }) => ({ id, name, blurb, art })),
  reviewed: [],
});
const ALL = MEDALS.map((m) => m.id);
const SEVEN = ["first-game", "games-5", "games-10", "first-host", "turfs-3", "first-review", "streak-4"];
const asha = (ids: readonly string[] = SEVEN, n: Partial<PublicPassport["numbers"]> = { games: 12, hosted: 3, turfs: 5, cities: 2, sports: 2, reviews: 2, bestStreak: 6 }) =>
  medalStoryFacts({ username: "asha", name: "Asha Rao", passport: passport(ids, n) }) as MedalStoryFacts;

/** Every line of text the picture draws. */
const lines = (f: MedalStoryFacts): string[] =>
  [f.title, f.handle, f.initials, f.top.name, f.top.blurb, f.topLabel, f.brag, f.streak, f.count, ...f.others.map((m) => m.name), f.more, f.address, f.invite].filter((x): x is string => !!x);

test("the story says who, their best medal, the brag line, the streak, the other medals and the profile's address", () => {
  const f = asha();
  assert.equal(f.title, "Asha Rao");
  assert.equal(f.handle, "@asha");
  assert.equal(f.initials, "AR");
  // Double Digits (tier 2, first in the catalog) leads; then the other tier 2 medals, then tier 1, in the catalog's order.
  assert.equal(f.top.id, "games-10");
  assert.equal(f.top.name, "Double Digits");
  assert.equal(f.top.blurb, "10 games played");
  assert.equal(f.topLabel, "TOP MEDAL");
  assert.equal(f.brag, "12 games · 5 turfs · 2 cities");
  assert.equal(f.streak, "Best streak: 6 weeks in a row");
  assert.equal(f.count, `7 of ${MEDALS.length} medals`);
  assert.deepEqual(f.others.map((m) => m.id), ["turfs-3", "streak-4", "first-game", "games-5", "first-host", "first-review"]);
  assert.equal(f.more, null);
  assert.equal(f.address, "tapturf.in/u/asha");
  assert.equal(f.invite, "Earn yours on TapTurf");
});

test("one medal: it is the first medal, with no grid and no \"more\"", () => {
  const f = asha(["first-game"], { games: 1, turfs: 1, cities: 1, sports: 1 });
  assert.equal(f.top.id, "first-game");
  assert.equal(f.topLabel, "FIRST MEDAL");
  assert.equal(f.count, `1 of ${MEDALS.length} medals`);
  assert.deepEqual(f.others, []);
  assert.equal(f.more, null);
  assert.equal(f.brag, "1 game · 1 turf · 1 city");
  assert.equal(f.streak, null, "a streak is said from 2 weeks");
});

test("no earned medal: no picture", () => {
  assert.equal(medalStoryFacts({ username: "kabir", name: "Kabir", passport: passport([], { games: 0 }) }), null);
  assert.equal(medalStoryFacts({ username: "no", name: "X", passport: passport(SEVEN) }), null, "not a username");
});

test("singular and plural: 1 game, 1 turf, 1 city; 2 of each; reviews when no game was played", () => {
  assert.equal(storyBrag(numbers({ games: 1, turfs: 1, cities: 1 })), "1 game · 1 turf · 1 city");
  assert.equal(storyBrag(numbers({ games: 2, turfs: 2, cities: 2 })), "2 games · 2 turfs · 2 cities");
  assert.equal(storyBrag(numbers({ games: 3 })), "3 games", "a game at a typed venue has no turf or city");
  assert.equal(storyBrag(numbers({ reviews: 1 })), "1 review");
  assert.equal(storyBrag(numbers({ reviews: 5 })), "5 reviews");
  assert.equal(storyBrag(numbers()), null);
  // Turfers (how many players they have played with) take the cities' place, so the line stays short.
  assert.equal(storyBrag(numbers({ games: 12, turfs: 5, cities: 2, turfers: 34 })), "12 games · 34 Turfers · 5 turfs");
  assert.equal(storyBrag(numbers({ games: 1, turfs: 1, cities: 1, turfers: 1 })), "1 game · 1 Turfer · 1 turf");
  assert.equal(storyBrag(numbers({ games: 3, turfers: 4 })), "3 games · 4 Turfers", "a typed venue: no turf");
  assert.equal(storyBrag(numbers({ games: 2, turfs: 2, cities: 2, turfers: 0 })), "2 games · 2 turfs · 2 cities", "nobody is shown 0 Turfers");
  assert.equal(storyBrag(numbers({ games: 2, turfs: 2, cities: 2, turfers: null })), "2 games · 2 turfs · 2 cities", "the count could not be read: the line as it was");
  assert.equal(storyBrag(numbers({ reviews: 2, turfers: 9 })), "2 reviews", "no game, no Turfers");
  // The version follows the line, so a new Turfer is a new picture.
  const withTurfers = asha(SEVEN, { games: 12, hosted: 3, turfs: 5, cities: 2, sports: 2, reviews: 2, bestStreak: 6, turfers: 34 });
  assert.equal(withTurfers.brag, "12 games · 34 Turfers · 5 turfs");
  assert.notEqual(medalStoryVersion(withTurfers), medalStoryVersion(asha()));
  assert.notEqual(medalStoryVersion(withTurfers), medalStoryVersion(asha(SEVEN, { games: 12, hosted: 3, turfs: 5, cities: 2, sports: 2, reviews: 2, bestStreak: 6, turfers: 35 })));
  const crowd = asha(SEVEN, { games: 112, turfs: 31, cities: 12, turfers: 1248 });
  assert.equal(crowd.brag, "112 games · 1248 Turfers · 31 turfs");
  assert.equal(asha(SEVEN, { games: 9, bestStreak: 1 }).streak, null);
  assert.equal(asha(SEVEN, { games: 9, bestStreak: 2 }).streak, "Best streak: 2 weeks in a row");
  assert.equal(asha(["first-game", "first-review"], { games: 1, reviews: 1 }).count, `2 of ${MEDALS.length} medals`);
});

test("many medals: the grid holds ten; with more, nine and \"+N more\", and every earned medal is counted", () => {
  // 11 medals: the best and ten others, all drawn.
  const eleven = asha(ALL.slice(0, 11), { games: 52 });
  assert.equal(eleven.others.length, STORY_GRID_MAX);
  assert.equal(eleven.more, null);
  // 12: the best, nine others and "+2 more".
  const twelve = asha(ALL.slice(0, 12), { games: 52 });
  assert.equal(twelve.others.length, STORY_GRID_MAX - 1);
  assert.equal(twelve.more, "+2 more");
  // Every medal there is.
  const all = asha(ALL, { games: 64 });
  assert.equal(all.top.id, "games-50", "the hardest tier leads");
  assert.equal(all.others.length, 9);
  const left = MEDALS.length - 10;
  assert.equal(all.more, `+${left} more`);
  assert.equal(all.count, `${MEDALS.length} of ${MEDALS.length} medals`);
  assert.equal(1 + all.others.length + left, MEDALS.length);
  assert.equal(new Set([all.top.id, ...all.others.map((m) => m.id)]).size, 10, "no medal twice");
  // The playing medals fill the grid before any tool medal: those are the ones behind "+N more".
  assert.ok([all.top, ...all.others].every((m) => !m.id.startsWith("tool-")), "playing medals lead the picture");

  // Only tool medals (someone who scores and tosses but has not played a TapTurf game yet): one of them is the top medal.
  const TOOLS = ALL.filter((id) => id.startsWith("tool-"));
  assert.ok(TOOLS.length >= 9);
  const tools = asha(TOOLS, {});
  assert.equal(tools.top.id, "tool-scored-10", "the harder tier leads, then the catalog");
  assert.equal(tools.topLabel, "TOP MEDAL");
  assert.equal(tools.brag, null, "no game and no review: no line of numbers");
  assert.equal(tools.count, `${TOOLS.length} of ${MEDALS.length} medals`);
  assert.equal(tools.others.length + (tools.more ? Number(tools.more.replace(/\D/g, "")) : 0), TOOLS.length - 1);
  const oneTool = asha(["tool-toss-1"], {});
  assert.deepEqual([oneTool.top.name, oneTool.topLabel, oneTool.top.blurb, oneTool.others.length], ["Heads or Tails", "FIRST MEDAL", "First toss", 0]);
  // With one playing medal the tool medals fall in behind it, whatever their tier.
  const mixed = asha(["tool-scored-10", "first-review", "tool-kit-5"], { reviews: 1 });
  assert.deepEqual([mixed.top.id, ...mixed.others.map((m) => m.id)], ["first-review", "tool-scored-10", "tool-kit-5"]);
});

test("the grid's rows: one row up to four, then two, the first the longer", () => {
  assert.deepEqual(storyRows(0), []);
  assert.deepEqual(storyRows(1), [1]);
  assert.deepEqual(storyRows(4), [4]);
  assert.deepEqual(storyRows(5), [3, 2]);
  assert.deepEqual(storyRows(6), [3, 3]);
  assert.deepEqual(storyRows(7), [4, 3]);
  assert.deepEqual(storyRows(8), [4, 4]);
  assert.deepEqual(storyRows(9), [5, 4]);
  assert.deepEqual(storyRows(10), [5, 5]);
  assert.deepEqual(storyRows(15), [5, 5], "never more than the grid holds");
  for (let n = 0; n <= STORY_GRID_MAX; n++) assert.equal(storyRows(n).reduce((a, b) => a + b, 0), n);
});

test("a long name is cut at a word with an ellipsis, and one long word still fits its line", () => {
  const long = medalStoryFacts({ username: "sudarshanprasad_k_99", name: "Sudarshanprasad Venkataramanan Krishnamoorthy Iyer", passport: passport(SEVEN, { games: 112, turfs: 31, cities: 12 }) }) as MedalStoryFacts;
  assert.ok([...long.title].length <= 44, long.title);
  assert.ok(long.title.endsWith("…"));
  assert.ok(long.title.startsWith("Sudarshanprasad Venkataramanan"));
  assert.equal(long.initials, "SI", "the initials are the whole name's");
  assert.equal(long.address, "tapturf.in/u/sudarshanprasad_k_99");
  assert.equal(long.brag, "112 games · 31 turfs · 12 cities");
  // The longest lines the picture can have fit its column (936 px) at sizes the design allows.
  const col = MEDAL_STORY_SIZE.width - 2 * 72;
  const fits = (text: string, max: number, min: number, room = col) => textEm(text) * fitSize(text, { width: room, max, min }) <= room;
  assert.ok(fits(long.brag as string, 44, 28));
  assert.ok(fits("tapturf.in/u/abcdefghijklmnopqrst", 42, 26, col - 150), "a 20 character username");
  assert.ok(fits("Best streak: 104 weeks in a row", 34, 30));
  const word = medalStoryFacts({ username: "mahalaxmi", name: "MAHALAXMISPORTSARENAANDCLUBHOUSE", passport: passport(SEVEN) }) as MedalStoryFacts;
  assert.equal(word.title, "MAHALAXMISPORTSARENAANDCLUBHOUSE");
  assert.ok(fits(word.title, 62, 36, col - 112 - 26), "one word, on the line beside the initials");
});

test("a name the font cannot draw whole is left off: the username stands in, never half a name", () => {
  for (const name of ["आशुतोष पाटील", "அருண்", "రవి కుమార్", "Ashu पाटील", "محمد", null, "", "   "]) {
    const f = medalStoryFacts({ username: "Ashu_Patil", name, passport: passport(SEVEN) }) as MedalStoryFacts;
    assert.equal(f.title, "@ashu_patil", String(name));
    assert.equal(f.handle, null, "the username is not said twice");
    assert.equal(f.initials, "A");
    assert.equal(f.address, "tapturf.in/u/ashu_patil");
  }
  // Marks the font lacks come off a Latin letter; an emoji is dropped; the rest stays.
  const marked = medalStoryFacts({ username: "sneha", name: "Snēha 🔥 Patil", passport: passport(SEVEN) }) as MedalStoryFacts;
  assert.equal(marked.title, "Sneha Patil");
  assert.equal(marked.initials, "SP");
});

test("every line is drawable in the bundled font, so nothing is fetched to draw it", () => {
  const cases = [
    asha(),
    asha(ALL, { games: 64, turfs: 14, cities: 4, bestStreak: 13 }),
    asha(["first-review"], { reviews: 1 }),
    medalStoryFacts({ username: "ashu_patil", name: "आशुतोष", passport: passport(SEVEN) }) as MedalStoryFacts,
    medalStoryFacts({ username: "zoe", name: "Zoë Åström-Müller", passport: passport(SEVEN) }) as MedalStoryFacts,
    medalStoryFacts({ username: "yy", name: "ÿµ", passport: passport(SEVEN) }),
  ].filter((f): f is MedalStoryFacts => !!f);
  for (const f of cases) {
    for (const line of lines(f)) {
      const { text, lost } = ogText(line);
      assert.equal(text, line, `"${line}" is drawn as it is`);
      assert.equal(lost, false);
    }
  }
  // The whole catalog, so a new medal's name or blurb cannot bring a glyph the font lacks.
  for (const m of MEDALS) {
    assert.equal(ogText(m.name).text, m.name);
    assert.equal(ogText(m.blurb).text, m.blurb);
  }
});

test("the story never says \"book\" and hurries nobody", () => {
  const [book, , , hurry] = BANNED_COPY;
  for (const f of [asha(), asha(ALL, { games: 64 }), asha(["first-game"], { games: 1 })]) {
    for (const line of lines(f)) {
      assert.equal(book.test(line), false, line);
      assert.equal(hurry.test(line), false, line);
    }
  }
});

test("only what the public profile shows goes in: no place, no date, no photo", () => {
  const f = asha();
  assert.deepEqual(Object.keys(f).sort(), ["address", "brag", "count", "handle", "initials", "invite", "more", "others", "streak", "title", "top", "topLabel"]);
  for (const m of [f.top, ...f.others]) assert.deepEqual(Object.keys(m).sort(), ["art", "blurb", "id", "name"]);
});

test("the version changes with anything drawn, and only then", () => {
  const v = medalStoryVersion(asha());
  assert.match(v, /^[0-9a-z]{1,8}$/);
  assert.equal(medalStoryVersion(asha()), v, "the same facts, the same version");
  assert.notEqual(medalStoryVersion(asha(SEVEN, { games: 13, hosted: 3, turfs: 5, cities: 2, bestStreak: 6 })), v, "a game more");
  assert.notEqual(medalStoryVersion(asha([...SEVEN, "sports-3"])), v, "a medal more");
  assert.notEqual(medalStoryVersion(medalStoryFacts({ username: "asha", name: "Asha R", passport: passport(SEVEN, { games: 12, hosted: 3, turfs: 5, cities: 2, sports: 2, reviews: 2, bestStreak: 6 }) }) as MedalStoryFacts), v, "another name");
  // Numbers the picture does not draw change nothing.
  assert.equal(medalStoryVersion(asha(SEVEN, { games: 12, hosted: 4, turfs: 5, cities: 2, sports: 3, reviews: 2, bestStreak: 6 })), v);
});

test("the picture's URL and file name", () => {
  assert.equal(medalStoryPath("Asha"), "/api/og/medals/asha");
  assert.equal(medalStoryPath("asha", "1abc"), "/api/og/medals/asha?v=1abc");
  assert.equal(medalStoryFile("Asha_R"), "tapturf-medals-asha_r.png");
  assert.equal(isStoryUsername("asha"), true);
  assert.equal(isStoryUsername("Asha_99"), true);
  for (const bad of ["ab", "9asha", "asha rao", "asha/../x", "a".repeat(21), "", null, 5]) assert.equal(isStoryUsername(bad), false, String(bad));
  assert.deepEqual(MEDAL_STORY_SIZE, { width: 1080, height: 1920 });
  assert.ok(STORY_SAFE.top >= 250 && STORY_SAFE.bottom >= 340, "Instagram's own controls");
});

// ── The route ──

type Seen = { profile: string[]; passport: string[]; drawn: MedalStoryFacts[] };
function deps(o: { found?: Awaited<ReturnType<StoryDeps["profile"]>>; passport?: PublicPassport | null; down?: boolean } = {}) {
  const seen: Seen = { profile: [], passport: [], drawn: [] };
  const d: StoryDeps = {
    profile: async (u) => {
      seen.profile.push(u);
      if (o.down) throw new Error("profile_get failed");
      return o.found === undefined ? { profile: { u: "asha", name: "Asha Rao" } } : o.found;
    },
    passport: async (u) => {
      seen.passport.push(u);
      return o.passport === undefined ? passport(SEVEN, { games: 12, turfs: 5, cities: 2, bestStreak: 6 }) : o.passport;
    },
    draw: (facts, headers) => {
      seen.drawn.push(facts);
      return new Response("png", { headers: { "Content-Type": "image/png", ...headers } });
    },
  };
  return { d, seen };
}
const get = (path: string, d: StoryDeps, username = "asha") => medalStoryResponse(new Request(`https://www.tapturf.in${path}`), username, d);
const CURRENT = medalStoryPath("asha", medalStoryVersion(medalStoryFacts({ username: "asha", name: "Asha Rao", passport: passport(SEVEN, { games: 12, turfs: 5, cities: 2, bestStreak: 6 }) }) as MedalStoryFacts));

test("route: the current URL gets the picture, kept a minute by the CDN and an hour by the browser, noindex", async () => {
  const { d, seen } = deps();
  const res = await get(CURRENT, d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("cache-control"), STORY_CACHE.image);
  assert.match(STORY_CACHE.image, /\bs-maxage=60\b/, "a profile switched off stops being served as soon as its page");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(seen.drawn.length, 1);
  assert.equal(seen.drawn[0].title, "Asha Rao");
  assert.deepEqual(seen.profile, ["asha"]);
});

test("route: any other URL of a real profile redirects to the current one, and draws nothing", async () => {
  for (const [path, name] of [["/api/og/medals/asha", "asha"], ["/api/og/medals/asha?v=old", "asha"], [`${CURRENT}&x=1`, "asha"], ["/api/og/medals/Asha", "Asha"]] as const) {
    const { d, seen } = deps();
    const res = await get(path, d, name);
    assert.equal(res.status, 307, path);
    assert.equal(res.headers.get("location"), CURRENT);
    assert.equal(res.headers.get("cache-control"), STORY_CACHE.minute);
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    assert.equal(seen.drawn.length, 0);
    assert.deepEqual(seen.profile, ["asha"], "asked in lower case, as the page does");
  }
});

test("route: no public profile (none, or tagging turned off), or no medal: 404 for a minute, nothing drawn", async () => {
  for (const o of [{ found: null }, { passport: passport([], { games: 0 }) }]) {
    const { d, seen } = deps(o);
    const res = await get(CURRENT, d);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("cache-control"), STORY_CACHE.minute);
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    assert.equal(seen.drawn.length, 0);
  }
  // A profile that is not public is never asked for its passport.
  const hidden = deps({ found: null });
  await get(CURRENT, hidden.d);
  assert.deepEqual(hidden.seen.passport, []);
});

test("route: not a username is a 404 kept a day, with no read at all", async () => {
  for (const bad of ["ab", "9x", "asha%20rao", "..", "a".repeat(30)]) {
    const { d, seen } = deps();
    const res = await get(`/api/og/medals/${bad}`, d, decodeURIComponent(bad));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("cache-control"), STORY_CACHE.day);
    assert.deepEqual(seen.profile, []);
  }
});

test("route: an old username redirects to the current one's address", async () => {
  const { d, seen } = deps({ found: { movedTo: "asha_rao" } });
  const res = await get("/api/og/medals/asha?v=x", d);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/api/og/medals/asha_rao");
  assert.equal(seen.drawn.length, 0);
});

test("route: when the database cannot be read the answer is a 503 that is never kept", async () => {
  for (const o of [{ down: true }, { passport: null }]) {
    const { d, seen } = deps(o);
    const res = await get(CURRENT, d);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("retry-after"), "30");
    assert.equal(seen.drawn.length, 0);
  }
});
