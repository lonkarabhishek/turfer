// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_KEPT,
  ACTIVITY_POLL_MAX,
  ACTIVITY_SHOWN,
  ACTIVITY_UNKNOWN,
  activityLines,
  activityView,
  activityWhen,
  logLine,
  mergeLogs,
  pollActivity,
  readLog,
  resultLine,
  sameActivity,
  takenDownLine,
  toActivityRead,
  type ActivityInput,
  type LogEntry,
} from "./activity";
import { resolve } from "./standings";
import type { Fixture, LiveNow, LiveResult, ManualResult, Settings, Team } from "./types";

/** An India clock time as an instant. */
const at = (day: string, time = "12:00") => Date.parse(`${day}T${time}:00+05:30`);
const iso = (ms: number) => new Date(ms).toISOString();

const SETTINGS: Settings = { format: "league", legs: 1, matches: 0, playoffs: "final", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const TEAMS: Team[] = ["Titans", "Kings", "Royals"].map((name, i) => ({ id: i + 1, name, short: null }));
const inn = (runs: number, wickets = 4) => ({ runs, wickets, balls: 36, allOut: false });
const hand = (a: number, b: number, over: Partial<ManualResult> = {}): ManualResult => ({ a: inn(a), b: inn(b), result: "auto", battedFirst: "a", ...over });
const fx = (id: number, home: number | null, away: number | null, over: Partial<Fixture> = {}): Fixture => ({ id, stage: "league", slot: null, round: id, seq: id - 1, home, away, day: null, time: null, result: null, live: null, liveResult: null, ...over });
const FINAL = fx(4, null, null, { stage: "final", slot: "f", round: 9 });
const liveResult = (a: string, b: string, text = `${a} won by 9 runs`): LiveResult => ({ a: { ...inn(63), name: a }, b: { ...inn(54), name: b }, outcome: "a", battedFirst: "a", text });
const done = (result: LiveResult, updatedAt: number): LiveNow => ({ status: "done", closed: false, headline: "", a: null, b: null, batting: null, updatedAt: iso(updatedAt), result });

const CREATED = at("2026-11-20", "18:02");
const input = (fixtures: Fixture[], over: Partial<ActivityInput> = {}, live: Record<string, LiveNow> = {}, settings: Settings = SETTINGS, teams: Team[] = TEAMS): ActivityInput => ({
  tournament: { createdAt: iso(CREATED), settings, teams },
  res: resolve({ settings, teams, fixtures }, live),
  ...over,
});
const texts = (i: ActivityInput) => activityLines(i).map((l) => l.text);
const CTX: { format: Settings["format"]; matches: number } = { format: "league", matches: 0 };
const say = (e: Record<string, unknown>, ctx = CTX) => {
  const [entry] = readLog([{ at: "2026-11-21T10:00:00.123456+00:00", ...e }]);
  return entry ? (logLine(entry, ctx)?.text ?? null) : null;
};

test("a brand new tournament has one line, and names its organiser only when the page was served one", () => {
  const fixtures = [fx(1, 1, 2), fx(2, 1, 3), fx(3, 2, 3), FINAL];
  assert.deepEqual(activityLines(input(fixtures, { log: [] })), [{ key: "started", at: CREATED, kind: "started", text: "Tournament started" }]);
  assert.deepEqual(texts(input(fixtures)), ["Tournament started"], "before the log is kept: the same line");
  assert.deepEqual(texts(input(fixtures, { host: null })), ["Tournament started"], "nobody to name");
  assert.deepEqual(texts(input(fixtures, { host: { name: "Asha Rao" } })), ["Asha Rao started the tournament"]);
  // A start day of its own on another day: the masthead says "Set up", and so does the line.
  assert.deepEqual(texts(input(fixtures, { host: { name: "Asha Rao" } }, {}, { ...SETTINGS, starts: "2026-11-28" })), ["Asha Rao set up the tournament"]);
  assert.deepEqual(texts(input(fixtures, {}, {}, { ...SETTINGS, starts: "2026-11-28" })), ["Tournament set up"]);
  assert.deepEqual(texts(input(fixtures, {}, {}, { ...SETTINGS, starts: "2026-11-20" })), ["Tournament started"], "it starts the day it was made");
  assert.deepEqual(activityLines({ ...input(fixtures), tournament: { createdAt: "not a time", settings: SETTINGS, teams: TEAMS } }), [], "no time to say: nothing");
});

test("every stored kind, in the page's own words", () => {
  // The tournament's own row.
  assert.equal(say({ k: "name", to: "Sunday Premier League" }), "Tournament renamed: Sunday Premier League");
  assert.equal(say({ k: "venue", to: "Ranangan" }), "Venue set: Ranangan");
  assert.equal(say({ k: "venue", from: "Ranangan", to: "Kings Turf Arena" }), "Venue changed: Ranangan → Kings Turf Arena");
  assert.equal(say({ k: "venue", from: "Ranangan" }), "Venue taken off");
  assert.equal(say({ k: "venue", from: "Ranangan", to: "Ranangan" }), null, "the same venue again says nothing");
  assert.equal(say({ k: "dates", ts: "2026-11-08", te: "2026-11-15" }), "Dates set: 8 to 15 Nov");
  assert.equal(say({ k: "dates", fs: "2026-11-08", ts: "2026-11-28", te: "2026-12-03" }), "Dates changed: 28 Nov to 3 Dec");
  assert.equal(say({ k: "dates", ts: "2026-11-08" }), "Dates set: from 8 Nov");
  assert.equal(say({ k: "dates", fe: "2026-11-08", te: "2026-11-15" }), "Dates changed: until 15 Nov");
  assert.equal(say({ k: "dates", fs: "2026-11-08", fe: "2026-11-15" }), "Dates taken off");
  assert.equal(say({ k: "dates" }), null);
  assert.equal(say({ k: "overs", from: 6, to: 8 }), "Overs a side changed: 6 → 8");
  assert.equal(say({ k: "overs", to: 1 }), "Overs a side set: 1");
  assert.equal(say({ k: "overs", from: 6 }), "Overs a side no longer set");
  assert.equal(say({ k: "points", p: [3, 1, 1, 0] }), "Points changed: win 3, tie 1, no result 1");
  assert.equal(say({ k: "points", p: [4, 2, 2, 1] }), "Points changed: win 4, tie 2, no result 2, loss 1");
  assert.equal(say({ k: "format", legs: 2, playoffs: "semis" }), "Format changed: Double round robin + semi-finals");
  assert.equal(say({ k: "format", legs: 1, playoffs: "none" }), "Format changed: League");
  assert.equal(say({ k: "format", legs: 1, playoffs: "final" }, { format: "tri", matches: 0 }), "Format changed: Tri-series + final");
  // Teams.
  assert.equal(say({ k: "team", from: "Titans", to: "Baner Titans" }), "Team renamed: Titans → Baner Titans");
  assert.equal(say({ k: "team_add", to: "Lions" }), "Team added: Lions");
  // Fixtures.
  const m = { f: 3, h: "Titans", a: "Kings" };
  assert.equal(say({ k: "fx_add", ...m }), "Match added: Titans v Kings");
  assert.equal(say({ k: "fx_add", ...m, d: "2026-11-28", t: "19:30" }), "Match added: Titans v Kings, Sat 28 Nov, 7:30 pm");
  assert.equal(say({ k: "fx_add", ...m, d: "2026-11-28" }), "Match added: Titans v Kings, Sat 28 Nov");
  assert.equal(say({ k: "fx_add", f: 7, p: "f" }), "Final added");
  assert.equal(say({ k: "fx_add", f: 7, p: "s2", d: "2026-11-29", t: "12:00" }), "Semi-final 2 added: Sun 29 Nov, 12 noon");
  assert.equal(say({ k: "fx_add", f: 7, p: "s1", h: "Titans", a: "Kings" }), "Semi-final 1 added: Titans v Kings");
  assert.equal(say({ k: "fx_out", ...m }), "Match taken out: Titans v Kings");
  assert.equal(say({ k: "fx_out", f: 7, p: "f" }), "Final taken out");
  assert.equal(say({ k: "fx_teams", ...m }), "Match changed: now Titans v Kings");
  assert.equal(say({ k: "fx_teams", ...m, p: "f" }), "Final set: Titans v Kings");
  assert.equal(say({ k: "fx_teams", f: 7, p: "s1" }), "Semi-final 1: teams to be decided");
  assert.equal(say({ k: "fx_move", ...m, fd: "2026-11-28", ft: "19:30", d: "2026-11-29", t: "18:00" }), "Titans v Kings moved: Sat 28 Nov, 7:30 pm → Sun 29 Nov, 6 pm");
  assert.equal(say({ k: "fx_move", ...m, d: "2026-11-29", t: "18:00" }), "Titans v Kings set for Sun 29 Nov, 6 pm");
  assert.equal(say({ k: "fx_move", ...m, fd: "2026-11-28", d: "2026-11-28", t: "07:05" }), "Titans v Kings moved: Sat 28 Nov → Sat 28 Nov, 7:05 am");
  assert.equal(say({ k: "fx_move", ...m, fd: "2026-11-28", ft: "19:30" }), "Titans v Kings: date to be set");
  assert.equal(say({ k: "fx_move", f: 7, p: "f", d: "2026-12-05", t: "19:00" }), "Final set for Sat 5 Dec, 7 pm");
  assert.equal(say({ k: "fx_move", ...m, fd: "2026-11-28", d: "2026-11-28" }), null, "nothing moved");
  assert.equal(say({ k: "live", ...m }), "Titans v Kings went live");
  assert.equal(say({ k: "live", ...m, p: "f" }), "Final: Titans v Kings went live");
  assert.equal(say({ k: "live", f: 7, p: "s1" }), "Semi-final 1 went live");
  assert.deepEqual(readLog([{ at: "2026-11-21T10:00:00Z", k: "live", ...m, c: "livelinkaaaa" }]), [{ at: Date.parse("2026-11-21T10:00:00Z"), k: "live", ...m }], "a scorecard's code is not part of an entry: one that came along is left out");
  // Results: describeResult's words for one typed by hand, the sender's own when there are any.
  const r = (s: number[], over: Record<string, unknown> = {}) => ({ k: "res", ...m, s, w: "auto", bf: "a", ...over });
  assert.equal(say(r([63, 4, 51, 9])), "Titans beat Kings by 12 runs");
  assert.equal(say(r([63, 4, 62, 9])), "Titans beat Kings by 1 run", "one run");
  assert.equal(say(r([63, 4, 64, 7])), "Kings beat Titans by 3 wickets", "the chaser wins by wickets");
  assert.equal(say(r([63, 4, 64, 9])), "Kings beat Titans by 1 wicket", "one wicket");
  assert.equal(say(r([63, 4, 64, 0])), "Kings beat Titans", "no margin to say");
  assert.equal(say(r([63, 4, 64, 7], { bf: "b" })), "Kings beat Titans by 1 run", "away batted first");
  assert.equal(say(r([63, 4, 63, 9])), "Titans v Kings: Match tied");
  assert.equal(say(r([10, 0, 0, 0], { w: "nr" })), "Titans v Kings: No result");
  assert.equal(say(r([63, 4, 51, 9], { w: "b" })), "Kings beat Titans by 1 wicket", "the organiser gave it to the away side, which batted second");
  assert.equal(say(r([63, 4, 51, 9], { x: "Strikers won by 3 wickets" })), "Titans v Kings: Strikers won by 3 wickets", "a turf session's own words, with other names");
  assert.equal(say(r([63, 4, 51, 9], { p: "f" })), "Final: Titans beat Kings by 12 runs");
  assert.equal(say({ k: "res", ...m, p: "s2", live: true, x: "Kings won by 4 wickets" }), "Semi-final 2: Kings beat Titans by 4 wickets");
  assert.equal(say({ k: "res", ...m, live: true, x: "Titans won by 9 runs" }), "Titans beat Kings by 9 runs", "the scorecard's own words");
  assert.equal(say({ k: "res", ...m, live: true }), "Titans v Kings: result in", "a scorecard that said nothing");
  assert.equal(say({ k: "fix", ...m, s: [63, 4, 53, 9], w: "auto", bf: "a" }), "Result corrected: Titans beat Kings by 10 runs");
  assert.equal(say({ k: "fix", ...m, live: true, x: "Titans won by 10 runs" }), "Result updated: Titans beat Kings by 10 runs");
  assert.equal(say({ k: "clear", ...m }), "Result cleared: Titans v Kings");
  assert.equal(say({ k: "clear", ...m, p: "f" }), "Result cleared: Final, Titans v Kings");
  assert.equal(say({ k: "draw", to: "semis" }), "League stage over: the semi-finals are set");
  assert.equal(say({ k: "draw", to: "final" }), "League stage over: the final is set");
  assert.equal(say({ k: "done" }), "Tournament finished");
  assert.equal(say({ k: "done" }, { format: "bilateral", matches: 3 }), "Series finished");
});

test("team names with odd characters are said as they are", () => {
  assert.equal(resultLine("Titans", "Kings", "Titans won by 12 runs"), "Titans beat Kings by 12 runs");
  assert.equal(resultLine("Titans", "Kings", "Kings won"), "Kings beat Titans");
  assert.equal(resultLine("Titans", "Titans B", "Titans B won by 2 runs"), "Titans B beat Titans by 2 runs", "one name starting with the other");
  assert.equal(resultLine("Titans B", "Titans", "Titans won by 2 runs"), "Titans beat Titans B by 2 runs");
  assert.equal(resultLine("A won", "A", "A won won by 3 runs"), "A won beat A by 3 runs", "a name that ends in the verb");
  assert.equal(resultLine("A won", "A", "A won by 3 runs"), "A beat A won by 3 runs");
  assert.equal(resultLine("$& (.*)", "Kings+", "$& (.*) won by 1 wicket"), "$& (.*) beat Kings+ by 1 wicket", "nothing is read as a pattern");
  assert.equal(resultLine("Titans", "Kings", "titans won by 2 runs"), "Titans v Kings: titans won by 2 runs", "not the team's exact name: said as it came");
  assert.equal(resultLine("Titans", "Kings", "Match tied"), "Titans v Kings: Match tied");
  const odd = { f: 1, h: "<b>Team</b> & \"Co\"", a: "பெங்களூரு ⚡ XI" };
  assert.equal(say({ k: "res", ...odd, s: [40, 2, 30, 10], w: "auto", bf: "a" }), "<b>Team</b> & \"Co\" beat பெங்களூரு ⚡ XI by 10 runs", "text, never markup");
  assert.equal(say({ k: "live", ...odd }), "<b>Team</b> & \"Co\" v பெங்களூரு ⚡ XI went live");
  assert.equal(say({ k: "team", from: "O'Neil's XI", to: "D’Souza → Lions" }), "Team renamed: O'Neil's XI → D’Souza → Lions");
  assert.equal(say({ k: "team", from: "  Titans\n\tB  ", to: "Titans\u0000C" }), "Team renamed: Titans B → Titans C", "one line, control characters out");
  assert.equal(say({ k: "name", to: "x".repeat(200) }), `Tournament renamed: ${"x".repeat(60)}`, "cut at the name's own limit");
});

test("an unknown kind from a newer database, and rows that are not entries, draw nothing", () => {
  const good = { at: "2026-11-21T10:00:00Z", k: "done" };
  assert.deepEqual(readLog([{ at: "2026-11-21T10:00:00Z", k: "trophy_engraved", who: "x" }, good]), [{ at: Date.parse(good.at), k: "done" }]);
  assert.deepEqual(readLog([null, 7, "x", [], {}, { k: "done" }, { at: "never", k: "done" }, { at: good.at }, { at: good.at, k: 5 }]), []);
  assert.deepEqual(readLog([{ at: good.at, k: "res" }, { at: good.at, k: "fx_out", f: "3" }, { at: good.at, k: "team", from: "A" }, { at: good.at, k: "points", p: [2, 1] }, { at: good.at, k: "draw", to: "quarters" }, { at: good.at, k: "format", legs: 3, playoffs: "final" }]), []);
  for (const not of [undefined, null, {}, "[]", 4, { log: [] }]) assert.deepEqual(readLog(not), []);
  // A line for a kind this build doesn't know is no line, whatever handed it over.
  assert.equal(logLine({ at: 1, k: "trophy_engraved" } as unknown as LogEntry, CTX), null);
  const fixtures = [fx(1, 1, 2), fx(2, 1, 3), fx(3, 2, 3), FINAL];
  assert.deepEqual(texts(input(fixtures, { log: [{ at: CREATED + 60_000, k: "trophy_engraved" } as unknown as LogEntry] })), ["Tournament started"]);
  // Only what the entry's kind is known to carry is kept: nothing rides along.
  const [kept] = readLog([{ at: good.at, k: "team", from: "A", to: "B", user_id: "00000000-0000-4000-8000-000000000001", secret: "ab".repeat(32), ip_hash: "0".repeat(32) }]);
  assert.deepEqual(kept, { at: Date.parse(good.at), k: "team", from: "A", to: "B" });
  // Postgres's own timestamps (microseconds, +00:00) are read.
  assert.equal(readLog([{ at: "2026-11-21T10:00:00.123456+00:00", k: "done" }])[0].at, Date.parse("2026-11-21T10:00:00.123Z"));
});

test("the database's answer: a list, nothing, or could not be asked", () => {
  assert.deepEqual(toActivityRead(null), { known: true, log: [] }, "no such tournament, or taken down");
  assert.deepEqual(toActivityRead([]), { known: true, log: [] });
  assert.deepEqual(toActivityRead([{ at: "2026-11-21T10:00:00Z", k: "done" }]), { known: true, log: [{ at: Date.parse("2026-11-21T10:00:00Z"), k: "done" }] });
  assert.deepEqual(toActivityRead({ r: "unavailable" }), ACTIVITY_UNKNOWN, "a refusal");
  assert.deepEqual(toActivityRead("x"), ACTIVITY_UNKNOWN);
  assert.equal(ACTIVITY_UNKNOWN.known, false);
});

/** A busy tournament: three league matches and a final, everything that can happen to it. */
function busy() {
  const t0 = CREATED;
  const h = (n: number) => t0 + n * 3_600_000;
  const stored = [
    { at: iso(h(1)), k: "team", from: "Titans", to: "Baner Titans" },
    { at: iso(h(2)), k: "name", to: "Sunday League" },
    { at: iso(h(2)), k: "venue", to: "Ranangan" },
    { at: iso(h(2)), k: "dates", ts: "2026-11-21", te: "2026-11-29" },
    { at: iso(h(2)), k: "overs", from: 6, to: 8 },
    { at: iso(h(3)), k: "fx_add", f: 5, h: "Kings", a: "Baner Titans", d: "2026-11-29", t: "19:30" },
    { at: iso(h(4)), k: "fx_move", f: 5, h: "Kings", a: "Baner Titans", fd: "2026-11-29", ft: "19:30", d: "2026-11-30", t: "18:00" },
    { at: iso(h(5)), k: "fx_out", f: 5, h: "Kings", a: "Baner Titans" },
    { at: iso(h(6)), k: "live", f: 1, h: "Baner Titans", a: "Kings" },
    { at: iso(h(7)), k: "res", f: 2, h: "Baner Titans", a: "Royals", s: [60, 4, 50, 4], w: "auto", bf: "a" },
    { at: iso(h(8)), k: "fix", f: 2, h: "Baner Titans", a: "Royals", s: [61, 4, 50, 4], w: "auto", bf: "a" },
    { at: iso(h(9)), k: "res", f: 1, h: "Baner Titans", a: "Kings", live: true, x: "Baner Titans won by 9 runs" },
    { at: iso(h(10)), k: "res", f: 3, h: "Kings", a: "Royals", s: [40, 4, 50, 4], w: "auto", bf: "a" },
    { at: iso(h(10)), k: "draw", to: "final" },
    { at: iso(h(11)), k: "points", p: [3, 1, 1, 0] },
    { at: iso(h(12)), k: "live", f: 4, p: "f", h: "Baner Titans", a: "Royals" },
    { at: iso(h(13)), k: "res", f: 4, p: "f", h: "Baner Titans", a: "Royals", live: true, x: "Royals won by 2 wickets" },
    { at: iso(h(13)), k: "done" },
  ];
  const teams: Team[] = [{ id: 1, name: "Baner Titans", short: null }, TEAMS[1], TEAMS[2]];
  const fixtures = [
    fx(1, 1, 2, { live: "livelinkaaaa", liveResult: liveResult("Baner Titans", "Kings") }),
    fx(2, 1, 3, { result: hand(61, 50) }),
    fx(3, 2, 3, { result: hand(40, 50) }),
    fx(4, 1, 3, { stage: "final", slot: "f", round: 9, live: "livelinkbbbb", liveResult: { ...liveResult("Royals", "Baner Titans", "Royals won by 2 wickets") } }),
  ];
  const live = { "1": done(liveResult("Baner Titans", "Kings"), h(9) - 20_000), "4": done(liveResult("Royals", "Baner Titans", "Royals won by 2 wickets"), h(13) - 20_000) };
  return { stored, log: readLog(stored), teams, fixtures, live, h };
}

test("a busy tournament: derived and logged lines merged, newest first", () => {
  const b = busy();
  const lines = activityLines(input(b.fixtures, { log: b.log, host: { name: "Asha Rao" } }, b.live, SETTINGS, b.teams));
  assert.deepEqual(lines.map((l) => l.text), [
    "Tournament finished. Champions: Royals",
    "Final: Royals beat Baner Titans by 2 wickets",
    "Final: Baner Titans v Royals went live",
    "Points changed: win 3, tie 1, no result 1",
    "League stage over: the final is set",
    "Royals beat Kings by 6 wickets",
    "Baner Titans beat Kings by 9 runs",
    "Result corrected: Baner Titans beat Royals by 11 runs",
    "Baner Titans beat Royals by 10 runs",
    "Baner Titans v Kings went live",
    "Match taken out: Kings v Baner Titans",
    "Kings v Baner Titans moved: Sun 29 Nov, 7:30 pm → Mon 30 Nov, 6 pm",
    "Match added: Kings v Baner Titans, Sun 29 Nov, 7:30 pm",
    "Overs a side changed: 6 → 8",
    "Dates set: 21 to 29 Nov",
    "Venue set: Ranangan",
    "Tournament renamed: Sunday League",
    "Team renamed: Titans → Baner Titans",
    "Asha Rao started the tournament",
  ]);
  assert.deepEqual(lines.map((l) => l.kind), ["finished", "result", "live", "settings", "draw", "result", "result", "fixed", "result", "live", "out", "moved", "added", "settings", "dates", "venue", "settings", "team", "started"]);
  assert.ok(lines.every((l, n) => n === 0 || l.at <= lines[n - 1].at), "newest first");
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length, "each with its own key");
  // Links: only to a scorecard the page itself still links to.
  assert.deepEqual(lines.filter((l) => l.href).map((l) => [l.text, l.href]), [
    ["Final: Royals beat Baner Titans by 2 wickets", "/live/livelinkbbbb"],
    ["Final: Baner Titans v Royals went live", "/live/livelinkbbbb"],
    ["Baner Titans beat Kings by 9 runs", "/live/livelinkaaaa"],
    ["Baner Titans v Kings went live", "/live/livelinkaaaa"],
  ]);
  // The scorecards' results are in the log: the page's own working out adds no second line for them.
  assert.equal(lines.filter((l) => l.kind === "result").length, 4);
});

test("a scorecard unlinked or changed since is not linked to", () => {
  const b = busy();
  // Match 1 is on another link now, with no ball bowled; the final's result is a hand one now, so its card has no scorecard link.
  const fixtures = b.fixtures.map((f) => (f.id === 1 ? { ...f, live: "livelinkcccc", liveResult: null } : f.id === 4 ? { ...f, result: hand(10, 20) } : f));
  assert.deepEqual(activityLines(input(fixtures, { log: b.log }, {}, SETTINGS, b.teams)).filter((l) => l.href), [], "nothing links to a scorecard the page no longer links to");
  // Unlinked altogether.
  const unlinked = b.fixtures.map((f) => ({ ...f, live: null, liveResult: null }));
  assert.deepEqual(activityLines(input(unlinked, { log: b.log }, {}, SETTINGS, b.teams)).filter((l) => l.href), []);
  // Match 1 went live again on a new scorecard, which is being scored: only that newest line links there; the earlier
  // "went live" and the earlier scorecard's result, which were about another scorecard, do not.
  const again = readLog([...b.stored, { at: iso(b.h(14)), k: "clear", f: 1, h: "Baner Titans", a: "Kings" }, { at: iso(b.h(14)), k: "live", f: 1, h: "Baner Titans", a: "Kings" }]);
  const now: LiveNow = { status: "live", closed: false, headline: "", a: { score: "12/1", overs: "2.0" }, b: null, batting: "a", updatedAt: iso(b.h(14) + 60_000), result: null };
  const relinked = activityLines(input(fixtures.map((f) => (f.id === 4 ? b.fixtures[3] : f)), { log: again }, { "1": now, "4": b.live["4"] }, SETTINGS, b.teams));
  assert.deepEqual(relinked.filter((l) => l.href).map((l) => [l.text, l.href, l.at]), [
    ["Baner Titans v Kings went live", "/live/livelinkcccc", b.h(14)],
    ["Final: Royals beat Baner Titans by 2 wickets", "/live/livelinkbbbb", b.h(13)],
    ["Final: Baner Titans v Royals went live", "/live/livelinkbbbb", b.h(12)],
  ]);
});

test("finished and the playoffs are said once, and only while they are true", () => {
  const b = busy();
  // The final's result is cleared: the tournament is not finished now, so the old "finished" is not said.
  const cleared = [...b.stored, { at: iso(b.h(14)), k: "clear", f: 4, p: "f", h: "Baner Titans", a: "Royals" }];
  const open = b.fixtures.map((f) => (f.id === 4 ? { ...f, liveResult: null, live: null } : f));
  const t1 = texts(input(open, { log: readLog(cleared) }, {}, SETTINGS, b.teams));
  assert.equal(t1[0], "Result cleared: Final, Baner Titans v Royals");
  assert.ok(!t1.some((x) => x.startsWith("Tournament finished")), "not finished any more");
  assert.ok(t1.includes("League stage over: the final is set"), "the league is still done");
  // Finished again later: the newest ending is the one said, and it names the winner.
  const again = [...cleared, { at: iso(b.h(15)), k: "res", f: 4, p: "f", h: "Baner Titans", a: "Royals", s: [70, 4, 60, 4], w: "auto", bf: "a" }, { at: iso(b.h(15)), k: "done" }];
  const closed = b.fixtures.map((f) => (f.id === 4 ? { ...f, liveResult: null, live: null, result: hand(70, 60) } : f));
  const t2 = texts(input(closed, { log: readLog(again) }, {}, SETTINGS, b.teams));
  assert.deepEqual(t2.slice(0, 2), ["Tournament finished. Champions: Baner Titans", "Final: Baner Titans beat Royals by 10 runs"]);
  assert.equal(t2.filter((x) => x.startsWith("Tournament finished")).length, 1, "once");
  // A result corrected after the end: the winner now may not be the winner then, so the ending names nobody.
  const fixed = [...again, { at: iso(b.h(16)), k: "fix", f: 4, p: "f", h: "Baner Titans", a: "Royals", s: [50, 4, 60, 4], w: "auto", bf: "a" }];
  const t3 = texts(input(b.fixtures.map((f) => (f.id === 4 ? { ...f, liveResult: null, live: null, result: hand(50, 60) } : f)), { log: readLog(fixed) }, {}, SETTINGS, b.teams));
  assert.deepEqual(t3.slice(0, 2), ["Result corrected: Final: Royals beat Baner Titans by 6 wickets", "Tournament finished"]);
  // A league result cleared: the playoffs are not set any more.
  const reopened = [...b.stored.slice(0, 14), { at: iso(b.h(11)), k: "clear", f: 3, h: "Kings", a: "Royals" }];
  const t4 = texts(input(b.fixtures.map((f) => (f.id === 3 ? { ...f, result: null } : f.id === 4 ? FINAL : f)), { log: readLog(reopened) }, {}, SETTINGS, b.teams));
  assert.ok(!t4.includes("League stage over: the final is set"));
  // A final level on runs: the title is shared.
  const tie = [...b.stored.slice(0, 16), { at: iso(b.h(13)), k: "res", f: 4, p: "f", h: "Baner Titans", a: "Royals", s: [60, 4, 60, 4], w: "auto", bf: "a" }, { at: iso(b.h(13)), k: "done" }];
  const t5 = texts(input(b.fixtures.map((f) => (f.id === 4 ? { ...f, liveResult: null, live: null, result: hand(60, 60) } : f)), { log: readLog(tie) }, {}, SETTINGS, b.teams));
  assert.deepEqual(t5.slice(0, 2), ["Tournament finished. Title shared", "Final: Baner Titans v Royals: Match tied"]);
});

test("a series: finished after each round is said only for the round that ended it", () => {
  const settings: Settings = { ...SETTINGS, format: "bilateral", matches: 2, playoffs: "none" };
  const teams = TEAMS.slice(0, 2);
  const h = (n: number) => CREATED + n * 3_600_000;
  const stored = [
    { at: iso(h(1)), k: "res", f: 1, h: "Titans", a: "Kings", s: [30, 2, 20, 4], w: "auto", bf: "a", x: "Titans won by 10 runs" },
    { at: iso(h(1)), k: "done" },
    { at: iso(h(2)), k: "fx_add", f: 2, h: "Kings", a: "Titans" },
    { at: iso(h(3)), k: "res", f: 2, h: "Kings", a: "Titans", s: [30, 2, 31, 4], w: "auto", bf: "a" },
    { at: iso(h(3)), k: "done" },
  ];
  const fixtures = [fx(1, 1, 2, { result: hand(30, 20, { text: "Titans won by 10 runs" }) }), fx(2, 2, 1, { result: hand(30, 31) })];
  assert.deepEqual(texts(input(fixtures, { log: readLog(stored) }, {}, settings, teams)), ["Series finished. Titans won the series", "Titans beat Kings by 6 wickets", "Match added: Kings v Titans", "Titans beat Kings by 10 runs", "Tournament started"]);
  const level = [fx(1, 1, 2, { result: hand(30, 20) }), fx(2, 2, 1, { result: hand(40, 31) })];
  assert.equal(texts(input(level, { log: readLog(stored) }, {}, settings, teams))[0], "Series finished. Series drawn");
  // A third match added and not played yet: not finished, so nothing says it is.
  const more = [...fixtures, fx(3, 1, 2)];
  assert.ok(!texts(input(more, { log: readLog([...stored, { at: iso(h(4)), k: "fx_add", f: 3, h: "Titans", a: "Kings" }]) }, {}, settings, teams)).some((x) => x.startsWith("Series finished")));
});

test("a tournament from before the log: only what the page can work out, and nothing made up", () => {
  const made = CREATED;
  const fixtures = [
    fx(1, 1, 2, { live: "livelinkaaaa", liveResult: liveResult("Titans", "Kings") }), // finished on its scorecard, which can still be read
    fx(2, 1, 3, { result: hand(60, 50) }), // typed by hand: no time anywhere
    fx(3, 2, 3, { live: "livelinkbbbb", liveResult: liveResult("Kings", "Royals"), result: hand(1, 2) }), // scored live, then corrected by hand
    fx(4, 1, 2, { stage: "final", slot: "f", round: 9, live: "livelinkcccc" }), // being scored now
    fx(5, 1, 3, { live: "livelinkdddd", liveResult: liveResult("Titans", "Royals") }), // its scorecard was turned off: the kept result has no time
  ];
  const live: Record<string, LiveNow> = {
    "1": done(liveResult("Titans", "Kings"), made + 7_200_000),
    "4": { status: "live", closed: false, headline: "", a: { score: "12/1", overs: "2.0" }, b: null, batting: "a", updatedAt: iso(made + 9_000_000), result: null },
    "5": { status: "off", closed: false, headline: "", a: null, b: null, batting: null, updatedAt: iso(made + 8_000_000), result: null },
  };
  const want = [
    { key: "d1", at: made + 7_200_000, kind: "result", text: "Titans beat Kings by 9 runs", href: "/live/livelinkaaaa" },
    { key: "started", at: made, kind: "started", text: "Tournament started" },
  ];
  assert.deepEqual(activityLines(input(fixtures, {}, live)), want, "the log could not be asked");
  assert.deepEqual(activityLines(input(fixtures, { log: [] }, live)), want, "an empty log says the same");
  // The scorer typed the sides the other way round: the result is said by the tournament's names.
  const swapped = { "1": done(liveResult("Kings", "Titans", "Kings won by 9 runs"), made + 7_200_000) };
  assert.equal(activityLines(input([fixtures[0]], {}, swapped))[0].text, "Kings beat Titans by 9 runs");
  // A semi-final from a scorecard says which match it is.
  const semi = fx(6, 1, 2, { stage: "semi", slot: "s2", round: 8, live: "livelinkeeee" });
  assert.equal(activityLines(input([semi], {}, { "6": done(liveResult("Titans", "Kings"), made + 60_000) }))[0].text, "Semi-final 2: Titans beat Kings by 9 runs");
  // Once the log has that scorecard's result, the worked-out line gives way to it.
  const logged = readLog([{ at: iso(made + 7_260_000), k: "res", f: 1, h: "Titans", a: "Kings", live: true, x: "Titans won by 9 runs" }]);
  const merged = activityLines(input(fixtures, { log: logged }, live));
  assert.deepEqual(merged.map((l) => [l.key.slice(0, 1), l.text]), [["l", "Titans beat Kings by 9 runs"], ["s", "Tournament started"]]);
});

test("the poll carries the newest few; the rest wait for Show all", () => {
  assert.equal(ACTIVITY_SHOWN, 10);
  assert.equal(ACTIVITY_KEPT, 100);
  assert.equal(ACTIVITY_POLL_MAX, 30);
  const stored = Array.from({ length: 130 }, (_, n) => ({ at: iso(CREATED + (n + 1) * 60_000), k: "team", from: `Team ${n}`, to: `Team ${n + 1}` }));
  const log = readLog(stored);
  assert.equal(log.length, 100, "never more than the database keeps");
  assert.equal((log[0] as { to: string }).to, "Team 31", "the newest 100");
  const wire = pollActivity(log);
  assert.equal(wire.total, 100);
  assert.equal(wire.log.length, 30);
  assert.equal((wire.log[29] as { to: string }).to, "Team 130");
  assert.deepEqual(pollActivity(log.slice(0, 7)), { log: log.slice(0, 7), total: 7 }, "a short log rides whole");
  const fixtures = [fx(1, 1, 2)];
  // With the poll alone: the 30 and "started".
  const part = activityLines(input(fixtures, { log: wire.log, total: wire.total }));
  assert.equal(part.length, 31);
  assert.equal(part[0].text, "Team renamed: Team 129 → Team 130");
  assert.deepEqual(activityView(part, false), { shown: part.slice(0, 10), more: 21 });
  assert.deepEqual(activityView(part, true), { shown: part, more: 0 });
  assert.deepEqual(activityView(part.slice(0, 10), false), { shown: part.slice(0, 10), more: 0 }, "ten or fewer: no button");
  // The whole log, fetched on the tap.
  const whole = activityLines(input(fixtures, { log, total: log.length }));
  assert.equal(whole.length, 101);
  assert.equal(whole.at(-1)!.text, "Tournament started");
  assert.equal(new Set(whole.map((l) => l.key)).size, 101);
  // A later poll brings it up to date without another fetch of everything.
  const later = readLog([...stored.slice(-29), { at: iso(CREATED + 200 * 60_000), k: "done" }]);
  const merged = mergeLogs(log, later);
  assert.equal(merged.length, 101);
  assert.deepEqual(merged.at(-1), { at: CREATED + 200 * 60_000, k: "done" });
  assert.equal(new Set(merged.map((e) => `${e.at}${e.k}`)).size, 101, "nothing twice");
  assert.deepEqual(mergeLogs(log, []), log);
  // While only the newest rode in, a scorecard's result older than them waits for the whole log (its entry may be in the part not sent).
  const live = { "1": done(liveResult("Titans", "Kings"), CREATED + 30_000) };
  const f1 = [fx(1, 1, 2, { live: "livelinkaaaa" })];
  assert.ok(!activityLines(input(f1, { log: wire.log, total: wire.total }, live)).some((l) => l.key === "d1"));
  assert.ok(activityLines(input(f1, { log, total: log.length }, live)).some((l) => l.key === "d1"), "the whole log has no entry for it: it is said");
  const newer = { "1": done(liveResult("Titans", "Kings"), CREATED + 129 * 60_000 + 30_000) };
  assert.equal(activityLines(input(f1, { log: wire.log, total: wire.total }, newer))[1].key, "d1", "newer than the oldest entry sent: said, in its place");
});

test("an open page takes a poll only when the log moved", () => {
  const a = pollActivity(readLog([{ at: iso(CREATED + 1000), k: "done" }]));
  assert.ok(sameActivity(a, { ...a, log: [...a.log] }));
  assert.ok(sameActivity(undefined, undefined));
  assert.ok(!sameActivity(a, undefined));
  assert.ok(!sameActivity(undefined, a));
  assert.ok(!sameActivity(a, pollActivity(readLog([{ at: iso(CREATED + 1000), k: "done" }, { at: iso(CREATED + 2000), k: "done" }]))));
  assert.ok(!sameActivity(a, pollActivity(readLog([{ at: iso(CREATED + 2000), k: "done" }]))), "the same count, a newer entry (the cap)");
  assert.ok(sameActivity(pollActivity([]), pollActivity([])));
});

test("times, as the masthead says them", () => {
  const now = at("2026-11-23", "10:00");
  assert.deepEqual(activityWhen({ at: at("2026-11-23", "08:00") }, now), { ago: "2 h ago", stamp: "Mon 23 Nov, 8 am", iso: "2026-11-23T02:30:00.000Z" });
  assert.deepEqual(activityWhen({ at: now - 30_000 }, now), { ago: "just now", stamp: "Mon 23 Nov, 9:59 am", iso: iso(now - 30_000) });
  assert.equal(activityWhen({ at: at("2026-11-22", "21:14") }, now).ago, "12 h ago");
  assert.equal(activityWhen({ at: at("2026-11-21", "21:14") }, now).ago, "2 days ago");
  assert.deepEqual(activityWhen({ at: at("2026-11-16", "18:02") }, now), { ago: null, stamp: "Mon 16 Nov, 6:02 pm", iso: iso(at("2026-11-16", "18:02")) }, "from a week on, the day and time say it all");
  assert.equal(activityWhen({ at: at("2025-12-30", "12:00") }, now).stamp, "Tue 30 Dec 2025, 12 noon", "another year is said");
});

test("a tournament taken down says only that, and when", () => {
  assert.deepEqual(takenDownLine("2026-11-22T15:44:00Z"), { key: "off", at: Date.parse("2026-11-22T15:44:00Z"), kind: "off", text: "Tournament taken down" });
  assert.equal(takenDownLine(""), null);
  assert.equal(takenDownLine(undefined), null);
});

test("nothing a person reads has a long dash, and nothing says book", () => {
  const b = busy();
  const all = [...texts(input(b.fixtures, { log: b.log, host: { name: "Asha Rao" } }, b.live, SETTINGS, b.teams)), "Tournament taken down"];
  for (const line of all) {
    assert.doesNotMatch(line, /[—–]/);
    assert.doesNotMatch(line, /\bbook/i);
  }
});
