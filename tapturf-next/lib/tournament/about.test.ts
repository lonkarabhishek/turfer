// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutFacts, aboutOf, indiaDate, progressWords, QUIET_AFTER_DAYS, runningWords, scoredLiveCount, scoredLiveWords, stampWords, startedDay, startVerb, updatedWords } from "./about";
import { makeFixtures } from "./fixtures";
import { resolve } from "./standings";
import type { Fixture, LiveNow, LiveResult, ManualResult, Settings } from "./types";

/** An India clock time as an instant: at("2026-11-16", "18:02") is 6:02 pm on 16 Nov in India. */
const at = (day: string, time = "12:00") => Date.parse(`${day}T${time}:00+05:30`);
const iso = (ms: number) => new Date(ms).toISOString();

test("India's date, whatever the device's clock", () => {
  assert.equal(indiaDate(Date.parse("2026-11-16T18:29:59Z")), "2026-11-16");
  assert.equal(indiaDate(Date.parse("2026-11-16T18:30:00Z")), "2026-11-17", "midnight in India is 18:30 UTC");
  assert.equal(indiaDate(at("2026-11-16", "00:00")), "2026-11-16");
  assert.equal(indiaDate(at("2026-11-16", "23:59")), "2026-11-16");
});

test("started: today, yesterday, then the India date", () => {
  const now = at("2026-11-23", "10:00");
  assert.equal(startedDay(at("2026-11-23", "00:05"), now), "today");
  assert.equal(startedDay(now + 90_000, now), "today", "a clock a little behind the server's");
  assert.equal(startedDay(at("2026-11-22", "23:55"), now), "yesterday", "ten hours ago, but yesterday in India");
  assert.equal(startedDay(at("2026-11-21", "09:00"), now), "21 Nov");
  assert.equal(startedDay(at("2026-11-16", "18:02"), now), "16 Nov");
  assert.equal(startedDay(at("2025-12-30", "18:02"), now), "30 Dec 2025", "another year is said");
  assert.equal(startedDay(at("2026-01-01", "00:00"), at("2026-01-03")), "1 Jan");
  assert.equal(startedDay(at("2025-12-31", "23:59"), at("2026-01-03")), "31 Dec 2025");
});

test("Started, or Set up when the organiser gave it a start day of its own", () => {
  const made = at("2026-11-16", "18:02");
  assert.equal(startVerb(made, null), "Started");
  assert.equal(startVerb(made, "2026-11-16"), "Started", "it starts the day it was made");
  assert.equal(startVerb(made, "2026-11-21"), "Set up", "it starts later: that day is beside it on the page");
  assert.equal(startVerb(made, "2026-11-08"), "Set up", "it began before its page did");
  assert.equal(startVerb(at("2026-11-16", "00:10"), "2026-11-16"), "Started", "India's day, not UTC's");
});

test("running for: only while it is running", () => {
  const made = at("2026-11-16", "18:02");
  const base = { createdMs: made, updatedMs: at("2026-11-22", "21:14"), starts: null, ends: null, played: 3, total: 6 };
  const now = at("2026-11-23", "10:00");
  assert.equal(runningWords(base, now), "Running for 7 days");
  assert.equal(runningWords({ ...base, updatedMs: made + 3_600_000 }, at("2026-11-18", "00:01")), "Running for 2 days", "counted in India's days");
  assert.equal(runningWords({ ...base, updatedMs: made + 3_600_000 }, at("2026-11-17", "23:59")), null, "since yesterday: the day already says it");
  assert.equal(runningWords({ ...base, updatedMs: made + 3_600_000 }, at("2026-11-16", "23:00")), null, "today");
  assert.equal(runningWords({ ...base, updatedMs: at("2026-11-29") }, at("2026-11-29")), "Running for 13 days");
  assert.equal(runningWords({ ...base, updatedMs: at("2026-11-30") }, at("2026-11-30")), "Running for 2 weeks");
  assert.equal(runningWords({ ...base, updatedMs: at("2026-12-20") }, at("2026-12-21")), "Running for 5 weeks");
  assert.equal(runningWords({ ...base, updatedMs: at("2027-01-14") }, at("2027-01-14")), "Running for 8 weeks", "59 days");
  assert.equal(runningWords({ ...base, updatedMs: at("2027-01-15") }, at("2027-01-15")), "Running for 2 months", "60 days");
  assert.equal(runningWords({ ...base, updatedMs: at("2027-05-01") }, at("2027-05-02")), "Running for 5 months");
  // Not said when it would not be true.
  assert.equal(runningWords({ ...base, played: 6 }, now), null, "every match played: it is not running");
  assert.equal(runningWords({ ...base, played: 0 }, now), null, "no result yet: it has not begun");
  assert.equal(runningWords({ ...base, played: 0, total: 0 }, now), null, "no matches");
  assert.equal(runningWords({ ...base, starts: "2026-11-16" }, now), null, "its own dates are on the page instead");
  assert.equal(runningWords({ ...base, ends: "2026-11-30" }, now), null);
  assert.equal(QUIET_AFTER_DAYS, 14);
  assert.equal(runningWords({ ...base, updatedMs: at("2026-11-22") }, at("2026-12-06", "23:00")), "Running for 2 weeks", "changed 14 days ago: still");
  assert.equal(runningWords({ ...base, updatedMs: at("2026-11-22") }, at("2026-12-07", "00:30")), null, "15 days without a change: gone quiet, nothing is claimed");
  assert.equal(runningWords(base, at("2027-03-01")), null, "abandoned months ago");
});

test("progress", () => {
  assert.equal(progressWords(4, 4), "4 of 4 matches played");
  assert.equal(progressWords(0, 6), "0 of 6 matches played");
  assert.equal(progressWords(1, 1), "1 of 1 match played");
  assert.equal(progressWords(12, 240), "12 of 240 matches played");
  assert.equal(progressWords(0, 0), "No matches yet");
  assert.equal(progressWords(7, 6), "6 of 6 matches played", "never more than there are");
});

test("scored live: a count of its own fixtures, nothing else", () => {
  assert.equal(scoredLiveWords(0, 4, 4), null);
  assert.equal(scoredLiveWords(3, 4, 4), "3 scored live");
  assert.equal(scoredLiveWords(4, 4, 4), "All 4 scored live");
  assert.equal(scoredLiveWords(1, 1, 1), "1 scored live", "a one-match tournament doesn't say All");
  assert.equal(scoredLiveWords(3, 3, 6), "3 scored live", "all so far, but there are matches to come");
  assert.equal(scoredLiveWords(1, 0, 6), "1 scored live", "one being scored now");
  assert.equal(scoredLiveWords(9, 4, 4), "All 4 scored live", "never more than its matches");
  assert.equal(scoredLiveWords(2, 0, 0), null);
});

const SETTINGS: Settings = { format: "league", legs: 1, matches: 0, playoffs: "none", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const TEAMS = ["Titans", "Strikers", "Royals", "Kings"].map((name, i) => ({ id: i + 1, name, short: null }));
const inn = (runs: number) => ({ runs, wickets: 4, balls: 36, allOut: false });
const HAND: ManualResult = { a: inn(63), b: inn(54), result: "auto", battedFirst: "a" };
const liveResult = (a: string, b: string): LiveResult => ({ a: { ...inn(70), name: a }, b: { ...inn(60), name: b }, outcome: "a", battedFirst: "a", text: `${a} won by 10 runs` });
const nameOf = (id: number | null) => TEAMS.find((t) => t.id === id)!.name;

test("scored live, counted from the fixtures as the page resolves them", () => {
  const fixtures: Fixture[] = makeFixtures(SETTINGS, TEAMS.map((t) => t.id)).map((f) => ({ ...f, live: null, liveResult: null }));
  assert.equal(fixtures.length, 6);
  const [f1, f2, f3, f4, f5] = fixtures;
  f1.result = HAND; // typed in by hand
  f2.live = "livelinkaaaa"; // finished on its live scorecard, the result kept
  f2.liveResult = liveResult(nameOf(f2.home), nameOf(f2.away));
  f3.live = "livelinkbbbb"; // scored live, then corrected by hand: it was still scored live
  f3.liveResult = liveResult(nameOf(f3.home), nameOf(f3.away));
  f3.result = HAND;
  f4.live = "livelinkcccc"; // being scored now
  f5.live = "livelinkdddd"; // linked, no ball yet
  const now: LiveNow = { status: "live", closed: false, headline: "", a: { score: "12/1", overs: "2.0" }, b: null, batting: "a", updatedAt: null, result: null };
  const waiting: LiveNow = { status: "waiting", closed: false, headline: "", a: null, b: null, batting: null, updatedAt: null, result: null };
  const res = resolve({ settings: SETTINGS, teams: TEAMS, fixtures }, { [String(f4.id)]: now, [String(f5.id)]: waiting });
  assert.equal(res.played, 3);
  assert.equal(scoredLiveCount(res.fixtures), 3, "the kept one, the corrected one and the one live now; not the hand one, the waiting one or the unplayed one");
  assert.equal(scoredLiveCount(resolve({ settings: SETTINGS, teams: TEAMS, fixtures: fixtures.map((f) => ({ ...f, live: null, liveResult: null })) }, {}).fixtures), 0);
});

test("updated: how long ago, with India's day and time behind it", () => {
  const made = at("2026-11-16", "18:02");
  const upd = at("2026-11-22", "21:14");
  assert.equal(stampWords(upd, upd), "Sun 22 Nov, 9:14 pm");
  assert.equal(stampWords(at("2026-11-16", "12:00"), upd), "Mon 16 Nov, 12 noon");
  assert.equal(stampWords(at("2026-11-16", "00:05"), upd), "Mon 16 Nov, 12:05 am");
  assert.equal(stampWords(at("2025-12-30", "07:00"), upd), "Tue 30 Dec 2025, 7 am");
  assert.deepEqual(updatedWords(made, upd, upd + 20_000), { text: "Updated just now", stamp: "Sun 22 Nov, 9:14 pm", iso: iso(upd) });
  assert.deepEqual(updatedWords(made, upd, upd + 5 * 60_000), { text: "Updated 5 min ago", stamp: "Sun 22 Nov, 9:14 pm", iso: iso(upd) });
  assert.deepEqual(updatedWords(made, upd, upd + 2 * 3_600_000 + 60_000), { text: "Updated 2 h ago", stamp: "Sun 22 Nov, 9:14 pm", iso: iso(upd) });
  assert.equal(updatedWords(made, upd, at("2026-11-23", "20:00"))!.text, "Updated 22 h ago", "under a day is hours");
  assert.equal(updatedWords(made, upd, at("2026-11-23", "22:00"))!.text, "Updated yesterday");
  assert.equal(updatedWords(made, upd, at("2026-11-25", "22:00"))!.text, "Updated 3 days ago");
  assert.deepEqual(updatedWords(made, upd, at("2026-11-28", "23:00")), { text: "Updated 6 days ago", stamp: "Sun 22 Nov, 9:14 pm", iso: iso(upd) });
  assert.deepEqual(updatedWords(made, upd, at("2026-11-29", "09:00")), { text: "Updated Sun 22 Nov, 9:14 pm", stamp: null, iso: iso(upd) }, "from a week on, the day says it once");
  assert.equal(updatedWords(made, upd, at("2027-02-01"))!.text, "Updated Sun 22 Nov 2026, 9:14 pm");
  // Never changed since it was made: nothing to say.
  assert.equal(updatedWords(made, made, upd), null);
  assert.equal(updatedWords(made, made + 59_000, upd), null);
  assert.equal(updatedWords(made, made + 61_000, made + 120_000)!.text, "Updated just now");
});

test("the strip for a league that was run to the end", () => {
  // Started 16 Nov, last changed 22 Nov, 4 of 4 played, looked at on 23 Nov.
  const a = aboutOf({ createdAt: iso(at("2026-11-16", "18:02")), updatedAt: iso(at("2026-11-22", "21:14")), starts: null, ends: null, played: 4, total: 4, scoredLive: 4 }, at("2026-11-23", "10:00"))!;
  assert.deepEqual(a, {
    started: "Started 16 Nov",
    startedBy: "Started 16 Nov by",
    startedIso: iso(at("2026-11-16", "18:02")),
    startedStamp: "Mon 16 Nov, 6:02 pm",
    running: null,
    scoredLive: "All 4 scored live",
    updated: { text: "Updated 12 h ago", stamp: "Sun 22 Nov, 9:14 pm", iso: iso(at("2026-11-22", "21:14")) },
    progress: "4 of 4 matches played",
  });
  assert.deepEqual(aboutFacts(a, false), ["Started 16 Nov", "All 4 scored live"]);
  assert.deepEqual(aboutFacts(a, true), ["All 4 scored live"], "with a name, the name's own line says the day");
});

test("the strip for one in progress, one just made, and one with its own dates", () => {
  const now = at("2026-11-23", "10:00");
  const going = aboutOf({ createdAt: iso(at("2026-11-16", "18:02")), updatedAt: iso(now - 2 * 3_600_000 - 5_000), starts: null, ends: null, played: 3, total: 6, scoredLive: 2 }, now)!;
  assert.deepEqual(aboutFacts(going, false), ["Started 16 Nov", "Running for 7 days", "2 scored live"]);
  assert.equal(going.updated!.text, "Updated 2 h ago");
  assert.equal(going.progress, "3 of 6 matches played");

  const fresh = aboutOf({ createdAt: iso(now - 40_000), updatedAt: iso(now - 40_000), starts: null, ends: null, played: 0, total: 6, scoredLive: 0 }, now)!;
  assert.deepEqual(aboutFacts(fresh, false), ["Started today"]);
  assert.equal(fresh.startedBy, "Started today by");
  assert.equal(fresh.updated, null);
  assert.deepEqual(aboutFacts(fresh, true), [], "named and brand new: the name's line is all there is");

  const dated = aboutOf({ createdAt: iso(at("2026-11-10", "09:00")), updatedAt: iso(at("2026-11-22", "21:14")), starts: "2026-11-15", ends: "2026-11-29", played: 3, total: 6, scoredLive: 0 }, now)!;
  assert.deepEqual(aboutFacts(dated, false), ["Set up 10 Nov"], "its dates are on the masthead; no running for");
  assert.equal(dated.startedBy, "Set up 10 Nov by");
});

test("times that can't be read say nothing", () => {
  assert.equal(aboutOf({ createdAt: "", updatedAt: "", starts: null, ends: null, played: 0, total: 0, scoredLive: 0 }, Date.now()), null);
  assert.equal(aboutOf({ createdAt: "soon", updatedAt: "x", starts: null, ends: null, played: 0, total: 0, scoredLive: 0 }, Date.now()), null);
  const a = aboutOf({ createdAt: "2026-11-16T12:32:00Z", updatedAt: "not a time", starts: null, ends: null, played: 0, total: 2, scoredLive: 0 }, at("2026-11-23"))!;
  assert.equal(a.started, "Started 16 Nov");
  assert.equal(a.updated, null);
});

test("no hurry, no invented number, never 'book'", () => {
  const now = at("2026-11-23", "10:00");
  const all = [
    aboutOf({ createdAt: iso(at("2026-11-16")), updatedAt: iso(now - 60_000), starts: null, ends: null, played: 3, total: 6, scoredLive: 3 }, now)!,
    aboutOf({ createdAt: iso(at("2026-11-16")), updatedAt: iso(at("2026-11-22")), starts: null, ends: null, played: 4, total: 4, scoredLive: 4 }, now)!,
  ];
  for (const a of all) {
    const text = [...aboutFacts(a, false), a.startedBy, a.progress, a.updated?.text ?? "", a.updated?.stamp ?? ""].join(" | ");
    assert.doesNotMatch(text, /\bbook|hurry|fast|only|left|last chance|don't miss|popular|trending|!/i, text);
  }
});
