import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { GameRow } from "./history";
import { MEDALS, TOOL_TRACKS, bestFirst, isToolMedal, lockedShortlist, medalsOf, nextMedal, toGo, type MedalProgress, type ToolTrack, type TrackCount } from "./medals";
import { MEDAL_GLYPHS } from "./medalShapes";
import { buildPassport, publicPassport } from "./passport";
import { bestBadge, medalOf } from "./playerBadge";
import { publicPassportOf } from "./publicPassport";
import { getPassport, getPlayed, type ProfileDeps } from "./routes";
import { parseToolUses, toolProgress, TOOL_DAYS_MAX, TOOL_LIVE_MAX, type ToolUses } from "./toolUses";
import { turfersCount, turfersMeaning, turfersOf, turfersWord } from "./turfers";
import type { PassportResponse, PlayedResponse } from "./types";
import { COUNTED_TOOLS } from "../tools/usage";
import { BANNED_COPY } from "../seo/defaults";

// The tool medals (uses of the free tools made while signed in) and
// Turfers (how many players someone has played with). What the database
// answers for the shared cases is pinned by
// scripts/sql-tests/tool_medals.check.mjs; here, what the app makes of
// that answer. Fake people.

type Cases = {
  answer: Record<string, unknown>;
  progress: Record<string, Record<ToolTrack, TrackCount>>;
  medals: Record<string, { earned: Record<string, string>; locked?: Record<string, string> }>;
};
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/profile/toolUses.cases.json"), "utf8")) as Cases;
const NOW = Date.parse("2026-11-20T12:30:00Z");
const ME = "acc-asha";
const TOOL = MEDALS.filter(isToolMedal);
const PLAY = MEDALS.filter((m) => !isToolMedal(m));
const NO_PLAY: MedalProgress = {
  games: { have: 0, days: [] },
  hosted: { have: 0, days: [] },
  turfs: { have: 0, days: [] },
  cities: { have: 0, days: [] },
  sports: { have: 0, days: [] },
  reviews: { have: 0, days: [] },
  streak: { best: 0, current: 0, reachedOn: () => null },
};
const uses = (who: string): ToolUses => parseToolUses(CASES.answer[who]) as ToolUses;
const game = (id: string, date: string, o: Partial<GameRow> = {}): GameRow => ({ id, creator_id: "acc-host", turf_id: "t1", sport: "Football", date, start_time: "19:00", end_time: "20:00", status: "completed", ...o });

test("the catalog: eleven tool medals after the sixteen playing ones, in the lower tiers, each with its own art", () => {
  assert.equal(PLAY.length, 16);
  assert.equal(TOOL.length, 11);
  assert.deepEqual(MEDALS.slice(0, 16), PLAY, "the playing medals first, as they were");
  assert.deepEqual(MEDALS.slice(16), TOOL, "then the tool medals");
  assert.deepEqual(
    TOOL.map((m) => [m.id, m.name, m.track, m.goal, m.tier]),
    [
      ["tool-scored-1", "Keeping Score", "scored", 1, 1],
      ["tool-scored-10", "Third Umpire", "scored", 10, 2],
      ["tool-card-1", "Match Report", "cards", 1, 1],
      ["tool-card-5", "Press Box", "cards", 5, 2],
      ["tool-toss-1", "Heads or Tails", "tossDays", 1, 1],
      ["tool-toss-5", "Lucky Coin", "tossDays", 5, 2],
      ["tool-teams-1", "Team Sheet", "teams", 1, 1],
      ["tool-table-3", "Table Topper", "results", 3, 1],
      ["tool-live-1", "On Air", "live", 1, 1],
      ["tool-kit-3", "Kit Bag", "kit", 3, 1],
      ["tool-kit-5", "Kit Manager", "kit", 5, 2],
    ],
  );
  assert.ok(TOOL.every((m) => m.tier <= 2), "easier than playing 25 games: tiers 1 and 2 only");
  assert.deepEqual([...new Set(TOOL.map((m) => m.track))].sort(), [...TOOL_TRACKS].sort(), "every tool track has a medal");
  // Ids the badge table takes (20261121: lower-case words joined by hyphens, 32 characters at most), names and blurbs that fit a tile.
  for (const m of TOOL) {
    assert.match(m.id, /^tool-[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(m.id.length <= 32 && m.name.length <= 14 && m.blurb.length <= 18, m.id);
    assert.ok(MEDAL_GLYPHS[m.art.glyph].length > 0, `${m.id} has a glyph`);
    assert.equal(medalOf(m.id)?.name, m.name, "the photo badge knows it");
  }
  // No two medals look alike: a shape and a tone together are one medal's, and no glyph is used twice.
  assert.equal(new Set(MEDALS.map((m) => `${m.art.shape} ${m.art.tone}`)).size, MEDALS.length - 1, "one pair shares a shape and tone (the two round teal firsts, as before)");
  assert.equal(new Set(MEDALS.map((m) => m.art.glyph)).size, MEDALS.length);
  // Gold is kept for one tool medal (the coin itself), and the top tier's rosette for none but the last.
  assert.deepEqual(TOOL.filter((m) => m.art.tone === "gold").map((m) => m.id), ["tool-toss-5"]);
  assert.deepEqual(TOOL.filter((m) => m.art.shape === "rosette").map((m) => m.id), ["tool-kit-5"]);
  const [book, , , hurry] = BANNED_COPY;
  for (const m of TOOL) for (const line of [m.name, m.blurb]) assert.ok(!book.test(line) && !hurry.test(line), line);
});

test("the read's answer: parsed as it is, and anything that isn't a use is left out", () => {
  const a = uses("a");
  assert.deepEqual(Object.keys(a.tools).sort(), ["live_scoreboard", "live_scorer", "scorecard_maker", "team_generator", "toss", "tournament_scorer"]);
  assert.deepEqual(a.tools.toss, { first: "2026-10-27", days: [["2026-10-27", 2], ["2026-10-28", 1], ["2026-11-03", 1], ["2026-11-10", 1], ["2026-11-17", 1]] });
  assert.deepEqual(a.live, ["2026-10-27", "2026-11-05"]);
  assert.deepEqual(parseToolUses(CASES.answer.nobody), { tools: {}, live: [] });
  for (const bad of [null, undefined, "ok", [], {}, { r: "unavailable" }, { r: "bad" }, { r: "ok" }, { r: "ok", tools: "x" }]) assert.equal(parseToolUses(bad), null, JSON.stringify(bad));
  const odd = parseToolUses({
    r: "ok",
    tools: [
      { t: "toss", first: "2026-11-02", days: [["2026-11-03", 2], ["2026-11-02", 1], ["not a day", 1], ["2026-11-04", 0], ["2026-11-05", 1.5], ["2026-11-06", "3"], "x", ["2026-11-07", 5000]] },
      { t: "a_tool_this_build_does_not_count", first: "2026-11-02", days: [["2026-11-02", 9]] },
      { t: "team_generator", first: "yesterday", days: [["2026-11-02", 9]] },
      { t: "nrr_calculator", first: "2026-11-02" },
      null,
    ],
    live: ["2026-11-09", 7, "2026-11-08", "2026-11-08T10:00:00Z"],
  });
  assert.deepEqual(odd, { tools: { toss: { first: "2026-11-02", days: [["2026-11-02", 1], ["2026-11-03", 2], ["2026-11-07", 999]] }, nrr_calculator: { first: "2026-11-02", days: [] } }, live: ["2026-11-08", "2026-11-09"] });
  // The read's own caps are kept here too.
  const many = parseToolUses({ r: "ok", tools: [{ t: "toss", first: "2026-01-01", days: Array.from({ length: 150 }, (_, i) => [`2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, 1]) }], live: Array.from({ length: 30 }, () => "2026-01-01") });
  assert.equal(many?.tools.toss?.days.length, TOOL_DAYS_MAX);
  assert.equal(many?.live.length, TOOL_LIVE_MAX);
});

test("progress: what each track counts, and the day each count was reached", () => {
  for (const who of Object.keys(CASES.progress)) assert.deepEqual(toolProgress(uses(who)), CASES.progress[who], who);
  // No read (before the migration, or it failed): every track at zero.
  for (const none of [null, undefined]) {
    const p = toolProgress(none);
    assert.deepEqual(Object.keys(p).sort(), [...TOOL_TRACKS].sort());
    assert.ok(Object.values(p).every((t) => t.have === 0 && t.days.length === 0));
  }
  // A toss counts by the day: thirty flips in one evening are one day, never Lucky Coin.
  const flips = toolProgress({ tools: { toss: { first: "2026-11-01", days: [["2026-11-01", 30]] } }, live: [] });
  assert.deepEqual(flips.tossDays, { have: 1, days: ["2026-11-01"] });
  // Matches scored: the cricket scorer's and the scoreboard's together, in the order they were scored.
  const both = toolProgress({ tools: { live_scorer: { first: "2026-11-01", days: [["2026-11-01", 2], ["2026-11-09", 1]] }, live_scoreboard: { first: "2026-11-03", days: [["2026-11-03", 1]] } }, live: [] });
  assert.deepEqual(both.scored, { have: 4, days: ["2026-11-01", "2026-11-01", "2026-11-03", "2026-11-09"] });
  // A tool counts as used from its first use of any kind; every counted tool can count.
  const every = toolProgress({ tools: Object.fromEntries(COUNTED_TOOLS.map((t, i) => [t, { first: `2026-11-0${7 - i}`, days: [] }])), live: [] });
  assert.deepEqual(every.kit, { have: 7, days: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"] });
  assert.ok(Object.entries(every).every(([k, t]) => k === "kit" || t.have === 0), "a tool only started finishes nothing");
  // Far more uses than a medal asks for: the count is whole, the listed days stop at 100.
  const lots = toolProgress({ tools: { scorecard_maker: { first: "2026-11-01", days: [["2026-11-01", 999], ["2026-11-02", 4]] } }, live: [] });
  assert.equal(lots.cards.have, 1003);
  assert.equal(lots.cards.days.length, 100);
});

test("medals: earned from signed-in uses, on the day of the use that reached the goal", () => {
  for (const who of Object.keys(CASES.medals)) {
    const medals = medalsOf({ ...NO_PLAY, ...toolProgress(uses(who)) });
    const earned = Object.fromEntries(medals.filter((m) => m.earned).map((m) => [m.id, m.earnedOn]));
    assert.deepEqual(earned, CASES.medals[who].earned, `${who}: earned, and when`);
    for (const [id, line] of Object.entries(CASES.medals[who].locked ?? {})) assert.equal(toGo(medals.find((m) => m.id === id)!), line, `${who}: ${id}`);
    assert.ok(medals.filter((m) => !isToolMedal(m)).every((m) => !m.earned), "no playing medal comes from a tool");
  }
  // Asha's passport, from her history and her uses: the same medals, and nothing else moved.
  const withTools = buildPassport({ userId: ME, games: [], turfs: [], reviews: [], tools: uses("a"), since: null, now: NOW });
  assert.deepEqual(Object.fromEntries(withTools.medals.filter((m) => m.earned).map((m) => [m.id, m.earnedOn])), CASES.medals.a.earned);
  assert.deepEqual(withTools.numbers, { games: 0, hosted: 0, turfs: 0, cities: 0, sports: 0, reviews: 0, since: null });
  assert.equal(withTools.medals.find((m) => m.id === "tool-scored-10")?.progress, 0.4);
  assert.equal(withTools.medals.find((m) => m.id === "tool-toss-5")?.need, null, "nothing to go once earned");
  // No read at all: every tool medal locked at zero, the rest as it was.
  for (const tools of [undefined, null]) {
    const p = buildPassport({ userId: ME, games: [game("g1", "2026-11-10")], turfs: [], reviews: [], tools, since: null, now: NOW });
    assert.ok(p.medals.filter(isToolMedal).every((m) => !m.earned && m.earnedOn === null && m.have === 0 && m.progress === 0 && m.need));
    assert.deepEqual(p.medals.filter((m) => m.earned).map((m) => m.id), ["first-game"]);
    assert.equal(p.medals.length, MEDALS.length);
  }
  // A progress with no tool tracks (an older caller): the same.
  assert.ok(medalsOf(NO_PLAY).filter(isToolMedal).every((m) => !m.earned && m.have === 0));
});

test("a locked tool medal says what to do, and that it counts only signed in", () => {
  const none = medalsOf(NO_PLAY);
  const by = (list: typeof none, id: string) => list.find((m) => m.id === id)!;
  assert.deepEqual(
    Object.fromEntries(none.filter(isToolMedal).map((m) => [m.id, m.need])),
    {
      "tool-scored-1": "Score a match to the end, signed in, for Keeping Score",
      "tool-scored-10": "Score 10 matches to the end, signed in, for Third Umpire",
      "tool-card-1": "Make a scorecard, signed in, for Match Report",
      "tool-card-5": "Make 5 scorecards, signed in, for Press Box",
      "tool-toss-1": "Flip the toss, signed in, for Heads or Tails",
      "tool-toss-5": "Toss on 5 different days, signed in, for Lucky Coin",
      "tool-teams-1": "Split players into teams, signed in, for Team Sheet",
      "tool-table-3": "Add 3 results to a tournament table, signed in, for Table Topper",
      "tool-live-1": "Finish a match with its live link on for On Air",
      "tool-kit-3": "Use 3 different tools, signed in, for Kit Bag",
      "tool-kit-5": "Use 5 different tools, signed in, for Kit Manager",
    },
  );
  // On its own tile, without its name: no comma left hanging.
  assert.equal(toGo(by(none, "tool-scored-1")), "Score a match to the end, signed in");
  assert.equal(toGo(by(none, "tool-live-1")), "Finish a match with its live link on");
  // Every one but the live link's says "signed in" (a live link can only be turned on signed in).
  for (const m of none.filter(isToolMedal)) assert.equal(/, signed in$/.test(toGo(m) ?? ""), m.id !== "tool-live-1", m.id);
  // No two read alike, with nothing done or part of the way.
  const lines = none.filter(isToolMedal).map((m) => toGo(m));
  assert.equal(new Set(lines).size, lines.length);
  const some = medalsOf({
    ...NO_PLAY,
    scored: { have: 3, days: ["2026-11-01", "2026-11-02", "2026-11-03"] },
    cards: { have: 4, days: ["2026-11-01", "2026-11-01", "2026-11-02", "2026-11-03"] },
    tossDays: { have: 4, days: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"] },
    results: { have: 1, days: ["2026-11-01"] },
    kit: { have: 2, days: ["2026-11-01", "2026-11-01"] },
  });
  assert.equal(by(some, "tool-scored-10").need, "Score 7 more matches, signed in, for Third Umpire");
  assert.equal(toGo(by(some, "tool-card-5")), "Make 1 more scorecard, signed in");
  assert.equal(toGo(by(some, "tool-toss-5")), "Toss on 1 more day, signed in");
  assert.equal(toGo(by(some, "tool-table-3")), "Add 2 more tournament results, signed in");
  assert.equal(toGo(by(some, "tool-kit-3")), "Use 1 more tool, signed in");
  assert.equal(toGo(by(some, "tool-kit-5")), "Use 3 more tools, signed in");
  assert.equal(by(some, "tool-scored-1").earnedOn, "2026-11-01");
  assert.equal(by(some, "tool-card-5").progress, 0.8);
  const [book, , , hurry] = BANNED_COPY;
  for (const m of [...none, ...some]) if (m.need) assert.ok(!book.test(m.need) && !hurry.test(m.need), m.need);
});

test("the top medal stays a playing medal; a tool medal leads only when tool medals are all there is", () => {
  const ids = (list: { id: string }[]) => list.map((m) => m.id);
  // A tier 2 tool medal never leads a tier 1 playing medal, whichever it is.
  assert.deepEqual(ids(bestFirst([{ id: "tool-scored-10" }, { id: "first-game" }])), ["first-game", "tool-scored-10"]);
  assert.deepEqual(ids(bestFirst([{ id: "tool-kit-5" }, { id: "tool-toss-5" }, { id: "first-review" }])), ["first-review", "tool-toss-5", "tool-kit-5"]);
  assert.deepEqual(ids(bestFirst([{ id: "tool-toss-1" }, { id: "streak-4" }, { id: "first-host" }, { id: "tool-scored-10" }, { id: "games-25" }])), ["games-25", "streak-4", "first-host", "tool-scored-10", "tool-toss-1"]);
  // Only tool medals: the harder tier, then the catalog.
  assert.deepEqual(ids(bestFirst([{ id: "tool-toss-1" }, { id: "tool-kit-3" }, { id: "tool-card-5" }, { id: "tool-scored-1" }, { id: "tool-kit-5" }])), ["tool-card-5", "tool-kit-5", "tool-scored-1", "tool-toss-1", "tool-kit-3"]);
  assert.deepEqual(ids(bestFirst(MEDALS.map((m) => ({ id: m.id })))).slice(0, 16).sort(), ids([...PLAY]).sort(), "of them all, the sixteen playing medals come first");
  // So the photo badge and the public profile lead with a playing medal.
  const both = buildPassport({ userId: ME, games: [game("g1", "2026-11-10")], turfs: [], reviews: [], tools: uses("a"), since: null, now: NOW });
  const pub = publicPassport(both);
  assert.equal(pub.medals[0].id, "first-game");
  assert.equal(pub.medals.length, 9);
  assert.deepEqual(ids(pub.medals).slice(1, 4), ["tool-card-5", "tool-toss-5", "tool-kit-5"], "then her tier 2 tool medals, in the catalog's order");
  assert.deepEqual(bestBadge(ids(pub.medals)), { medal: "first-game", medals: 9 });
  const toolsOnly = publicPassport(buildPassport({ userId: ME, games: [], turfs: [], reviews: [], tools: uses("a"), since: null, now: NOW }));
  assert.equal(toolsOnly.medals[0].id, "tool-card-5");
  assert.deepEqual(bestBadge(ids(toolsOnly.medals)), { medal: "tool-card-5", medals: 8 });
  assert.doesNotMatch(JSON.stringify(toolsOnly), /2026-|live_scorer|scorecard_maker|"(days|first|live|tools|have)":/, "no day, no count and no tool's own name is public: only the medals");
});

test("the Me tab's lists: the playing medals keep theirs, the tool medals have a short one of their own", () => {
  // Before a first game: the three starters, whatever the tools did.
  const fresh = lockedShortlist(medalsOf({ ...NO_PLAY, ...toolProgress(uses("a")) }), 0);
  assert.equal(fresh.next, null);
  assert.deepEqual(fresh.shown.map((m) => m.name), ["First Whistle", "Captain", "First Word"]);
  assert.deepEqual(fresh.tools.shown.map((m) => m.id), ["tool-table-3", "tool-scored-10", "tool-teams-1"], "2 of 3 results, 4 of 10 matches, then the one not begun");
  assert.deepEqual(fresh.tools.rest, []);
  // Nothing done anywhere: the first three tool medals in the catalog, the others behind "See all".
  const none = lockedShortlist(medalsOf(NO_PLAY), 0);
  assert.deepEqual(none.tools.shown.map((m) => m.name), ["Keeping Score", "Third Umpire", "Match Report"]);
  assert.deepEqual(none.tools.rest.map((m) => m.id), TOOL.slice(3).map((m) => m.id), "the catalog's order");
  // With games: "Next up" is the next playing medal even when a tool medal is closer to done.
  const playing: MedalProgress = { ...NO_PLAY, games: { have: 1, days: ["2026-11-10"] }, turfs: { have: 1, days: ["2026-11-10"] }, cards: { have: 4, days: ["2026-11-01", "2026-11-01", "2026-11-02", "2026-11-03"] }, kit: { have: 2, days: ["2026-11-01", "2026-11-02"] } };
  const medals = medalsOf(playing);
  assert.equal(nextMedal(medals)?.id, "tool-card-5", "of every medal, Press Box is the closest (4 of 5)");
  const list = lockedShortlist(medals, 1);
  assert.equal(list.next?.id, "turfs-3", "but Next up is the closest playing medal");
  assert.ok([...list.shown, ...list.rest].every((m) => !isToolMedal(m)));
  assert.deepEqual(list.tools.shown.map((m) => m.id), ["tool-card-5", "tool-kit-3", "tool-kit-5"]);
  const locked = medals.filter((m) => !m.earned);
  assert.equal((list.next ? 1 : 0) + list.shown.length + list.rest.length + list.tools.shown.length + list.tools.rest.length, locked.length, "every locked medal is in exactly one list");
  // Every tool medal earned: nothing of theirs left to show.
  const all = lockedShortlist(medalsOf({ ...NO_PLAY, ...Object.fromEntries(TOOL_TRACKS.map((t) => [t, { have: 10, days: Array.from({ length: 10 }, () => "2026-11-01") }])) }), 0);
  assert.deepEqual([all.tools.shown, all.tools.rest], [[], []]);
});

// ── Turfers ──

const GAMES = [game("g1", "2026-10-21", { creator_id: ME }), game("g2", "2026-10-28", { creator_id: "acc-ravi" }), game("g3", "2026-11-25", { creator_id: "acc-ravi" }), game("g4", "2026-10-14", { creator_id: "acc-neha", status: "cancelled" })];
const ROSTERS: Record<string, string[]> = { g1: [ME, "acc-ravi", "acc-priya"], g2: ["acc-ravi", ME, "acc-ravi"], g3: ["acc-ravi", ME, "acc-kiran"], g4: ["acc-neha", ME] };
const HISTORY = { games: GAMES, turfs: [{ id: "t1", slug: "turf-one", name: "Turf One", city: "pune", cityLabel: "Pune" }], reviews: [] };
const rosters = async (games: readonly Pick<GameRow, "id" | "creator_id">[]) => new Map(games.map((x) => [x.id, ROSTERS[x.id] ?? []]));

test("Turfers: one word and one count, the players someone has played with", () => {
  assert.deepEqual([turfersWord(0), turfersWord(1), turfersWord(2), turfersWord(34)], ["Turfers", "Turfer", "Turfers", "Turfers"]);
  assert.deepEqual([turfersCount(1), turfersCount(34)], ["1 Turfer", "34 Turfers"]);
  assert.equal(turfersMeaning("Asha"), "Turfers: people Asha has played with on TapTurf");
  assert.equal(turfersMeaning(), "Turfers: people you have played with on TapTurf");
  assert.equal(turfersMeaning("  "), "Turfers: people you have played with on TapTurf");
  const played = [{ id: "g1", day: "2026-10-21" }, { id: "g2", day: "2026-10-28" }].map((g) => ({ ...g, turfId: "t1", sport: "Football", hosted: false, endsAt: 0 }));
  const map = new Map(Object.entries(ROSTERS));
  // Each person once, however many games together; never themselves; only the games played.
  assert.equal(turfersOf(ME, played as never, map), 2, "Ravi (twice, and listed twice in one game) and Priya");
  assert.equal(turfersOf(ME, [], map), 0);
  assert.equal(turfersOf(ME, played as never, new Map()), 0);
});

test("the public passport: Turfers is the played summary's own count, a number only", async () => {
  const pub = await publicPassportOf(ME, { history: async () => HISTORY, rosters, now: () => NOW });
  // g1 and g2 are played (g3 is to come, g4 was cancelled): Ravi and Priya.
  assert.equal(pub.numbers.games, 2);
  assert.equal(pub.numbers.turfers, 2);
  // The same number the Me tab's routes answer, from the same rosters.
  const deps: ProfileDeps = {
    who: async () => ({ userId: ME, since: null }),
    history: async () => HISTORY,
    rosters,
    people: async () => new Map([["acc-ravi", { name: "Ravi Kumar", photo: null }], ["acc-priya", { name: "Priya Sharma", photo: null }]]),
    extras: async () => null,
    whatsapp: async () => ({ unavailable: true }),
    now: () => NOW,
  };
  const played = (await (await getPlayed(new Request("https://tapturf.in/api/me/played"), deps)).json()) as PlayedResponse;
  const passport = (await (await getPassport(new Request("https://tapturf.in/api/me/passport"), deps)).json()) as PassportResponse;
  assert.equal(played.people, pub.numbers.turfers, "the played summary");
  assert.equal(passport.played.people, pub.numbers.turfers, "the Me tab");
  assert.equal(passport.playedWith.length, 2);
  // A count only: nobody's id or name is in what the public gets.
  assert.doesNotMatch(JSON.stringify(pub), /acc-|Ravi|Priya/);
  assert.deepEqual(Object.keys(pub.numbers).sort(), ["bestStreak", "cities", "games", "hosted", "reviews", "sports", "turfers", "turfs"]);

  // The rosters are read once, for the played games only; nobody without a game is asked about.
  const asked: string[][] = [];
  const none = await publicPassportOf(ME, { history: async () => ({ games: [GAMES[2], GAMES[3]], turfs: [], reviews: [] }), rosters: async (g) => (asked.push(g.map((x) => x.id)), new Map()), now: () => NOW });
  assert.deepEqual([none.numbers.games, none.numbers.turfers, asked.length], [0, 0, 0], "no game played: zero, and no read");
  await publicPassportOf(ME, { history: async () => HISTORY, rosters: async (g) => (asked.push(g.map((x) => x.id)), new Map()), now: () => NOW });
  assert.deepEqual(asked, [["g1", "g2"]]);

  // The rosters read fails: the count is left out and everything else stands.
  const down = await publicPassportOf(ME, { history: async () => ({ ...HISTORY, tools: uses("a") }), rosters: async () => Promise.reject(new Error("down")), now: () => NOW });
  assert.equal(down.numbers.turfers, null);
  assert.equal(down.numbers.games, 2);
  assert.ok(down.medals.some((m) => m.id === "first-game") && down.medals.some((m) => m.id === "tool-toss-5"), "the medals are all there");
  // The history read fails: that is the caller's to handle (the page shows the profile without a passport).
  await assert.rejects(publicPassportOf(ME, { history: async () => Promise.reject(new Error("down")), rosters, now: () => NOW }), /down/);
  // Anything that isn't a count is no count.
  const p = buildPassport({ userId: ME, ...HISTORY, since: null, now: NOW });
  assert.deepEqual([publicPassport(p).numbers.turfers, publicPassport(p, 7).numbers.turfers, publicPassport(p, -1).numbers.turfers, publicPassport(p, 2.5).numbers.turfers, publicPassport(p, 0).numbers.turfers], [null, 7, null, null, 0]);
});

test("the routes: tool uses read with the history reach the medals, the summary and the badge; without them nothing fails", async () => {
  const sent: [string, readonly string[]][] = [];
  const deps = (tools: ToolUses | null | undefined): ProfileDeps => ({
    who: async () => ({ userId: ME, since: null }),
    history: async () => ({ ...HISTORY, ...(tools === undefined ? {} : { tools }) }),
    rosters,
    people: async () => new Map(),
    extras: async () => null,
    whatsapp: async () => ({ unavailable: true }),
    badge: (id, medals) => void sent.push([id, medals]),
    now: () => NOW,
  });
  const withTools = (await (await getPassport(new Request("https://tapturf.in/api/me/passport"), deps(uses("a")))).json()) as PassportResponse;
  const earned = withTools.passport.medals.filter((m) => m.earned).map((m) => m.id);
  assert.ok(earned.includes("tool-toss-5") && earned.includes("first-game"));
  assert.equal(withTools.passport.medals.find((m) => m.id === "tool-toss-5")?.earnedOn, "2026-11-17");
  assert.equal(withTools.played.medals[0], "first-game", "best first: the playing medal");
  assert.equal(withTools.played.medals.length, earned.length);
  assert.deepEqual(sent.at(-1), [ME, withTools.played.medals], "the badge is told the same list");
  // The tool uses could not be read this time: the reply is as it would be without them, and the badge is left alone
  // (it must not lose a medal over one failed read).
  {
    const n = sent.length;
    const d = deps(null);
    const failing: ProfileDeps = { ...d, history: async (id) => ({ ...(await d.history(id)), toolsFailed: true }) };
    for (const get of [getPlayed, getPassport]) assert.equal((await get(new Request("https://tapturf.in/api/me/x"), failing)).status, 200);
    assert.equal(sent.length, n, "nothing is sent for the badge");
    // A database that has no such read yet is not a failure: the badge is kept in step as before.
    await getPlayed(new Request("https://tapturf.in/api/me/played"), d);
    assert.equal(sent.length, n + 1);
  }
  for (const none of [null, undefined]) {
    const res = await getPlayed(new Request("https://tapturf.in/api/me/played"), deps(none));
    assert.equal(res.status, 200);
    const body = (await res.json()) as PlayedResponse;
    assert.ok(body.medals.length > 0 && body.medals.every((id) => !id.startsWith("tool-")), "no tool medal, every other as it was");
  }
});
