import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBoard, newBoard } from "../board/index";
import { derive, newMatch } from "../cricket/scoring";
import { LIVE_IDLE_CLOSE_MS } from "../live/types";
import { MEDALS, isToolMedal } from "../profile/medals";
import { aSession, playMatch } from "../turfSession/testkit";
import { addScored, recordFinal, recordScored } from "../turfSession/session";
import { matchLine } from "./line";
import { LINKS_MAX, STATE_WORD, linkLine, linkState, linkTitle, linkWhen, liveLinks, orderLinks, readMineLinks, sidesTitle, sportWord, toMineLinks, type MineLink } from "./links";
import { EMPTY_STORES, PHONE_HREF, PHONE_MAX, SHORTCUTS, OTHER_SPORTS, TOOL_MEDALS_HREF, heldMatch, liveNow, matchesShape, phoneItems, phoneLive, toolMedalCount, toolMedalWords, type PhoneStores, type SavedMatch } from "./phone";
import { TOURNAMENTS_MAX, tournamentRows } from "./tournaments";

// Sunday 22 Nov 2026, 8 PM in India.
const NOW = Date.parse("2026-11-22T14:30:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const C = (n: number) => `l${String(n).padStart(11, "0")}`;
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const row = (n: number, o: Record<string, unknown> = {}) => ({ code: C(n), tool: "cricket", started_at: at(3 * HOUR), status: "live", updated_at: at(2 * MIN), sport: null, team_a: "Titans", team_b: "Royals", title: "", tournament: null, tournament_name: null, ...o });
const link = (n: number, o: Record<string, unknown> = {}): MineLink => toMineLinks({ list: [row(n, o)] })[0];

test("my live links: the database's rows, read field by field", () => {
  const [l] = toMineLinks({ r: "ok", list: [row(1, { title: "Sunday Smash League · Match 3", tournament: "t00000000001", tournament_name: "Sunday Smash League" })] });
  assert.deepEqual(l, { code: C(1), tool: "cricket", status: "live", startedAt: at(3 * HOUR), updatedAt: at(2 * MIN), sport: null, teamA: "Titans", teamB: "Royals", title: "Sunday Smash League · Match 3", tournament: { code: "t00000000001", name: "Sunday Smash League" }, line: null });
  assert.deepEqual(Object.keys(l).sort(), ["code", "line", "sport", "startedAt", "status", "teamA", "teamB", "title", "tool", "tournament", "updatedAt"], "these fields and no other: nothing else of a row is kept");
  // Postgres' own time format is taken, and given back as an ISO instant.
  assert.equal(toMineLinks({ list: [row(1, { updated_at: "2026-11-22T14:28:00.123456+00:00" })] })[0].updatedAt, "2026-11-22T14:28:00.123Z");
  // Anything that is not a link is left out, never thrown.
  for (const bad of [null, undefined, "x", 4, {}, { list: null }, { list: "x" }, { list: [null, 1, "x", {}, row(1, { code: "BAD" }), row(1, { code: null }), row(1, { status: "stopped" }), row(1, { status: "expired" }), row(1, { updated_at: null }), row(1, { updated_at: "soon" })] }]) assert.deepEqual(toMineLinks(bad), []);
  // What the row may lack: its sides and title (a match with no setup), its starter's time.
  const bare = toMineLinks({ list: [{ code: C(2), status: "done", updated_at: at(HOUR), tool: "board", sport: "football" }] })[0];
  assert.deepEqual([bare.teamA, bare.teamB, bare.title, bare.tournament, bare.startedAt, bare.tool, bare.sport], ["", "", "", null, at(HOUR), "board", "football"]);
  // An unknown tool is the cricket scorer's; a tournament needs a real code, and a name of some kind.
  assert.equal(link(1, { tool: "toss" }).tool, "cricket");
  assert.equal(link(1, { tournament: "nope", tournament_name: "X" }).tournament, null);
  assert.deepEqual(link(1, { tournament: "t00000000001", tournament_name: "  " }).tournament, { code: "t00000000001", name: "Tournament" });
  // Long or odd text is cut and cleaned.
  const long = link(1, { team_a: `  ${"A".repeat(70)}`, title: "T\u0000\n".repeat(40) });
  assert.equal(long.teamA.length, 40);
  assert.ok(long.title.length <= 60 && !/[\u0000-\u001f]/.test(long.title));
  // Never more than the read's own cap.
  assert.equal(toMineLinks({ list: Array.from({ length: 50 }, (_, i) => row(100 + i)) }).length, LINKS_MAX);
  assert.equal(LINKS_MAX, 30);
});

test("my live links: the route's body, as the browser reads it", () => {
  const sent = [{ ...link(1, { tournament: "t00000000001", tournament_name: "Cup" }), line: "Titans 45/2 (4.3 ov)" }, { ...link(2, { status: "done" }), line: null }];
  assert.deepEqual(readMineLinks({ list: sent }), sent, "a round trip keeps every field");
  assert.equal(readMineLinks({ list: null }), null, "not readable (before the migration too): null, not an empty list");
  for (const bad of [null, undefined, {}, "x", { error: "login" }]) assert.equal(readMineLinks(bad), null);
  assert.deepEqual(readMineLinks({ list: [] }), [], "none is an empty list");
  assert.deepEqual(readMineLinks({ list: [{ code: "x" }, null, sent[1]] }), [sent[1]], "a row that is not a link is left out");
  assert.equal(readMineLinks({ list: [{ ...sent[0], line: "x".repeat(500) }] })?.[0].line?.length, 200);
  assert.equal(readMineLinks({ list: [{ ...sent[0], line: 7 }] })?.[0].line, null);
});

test("my live links: Live, Finished or Stopped", () => {
  assert.equal(linkState(link(1), NOW), "live");
  assert.equal(linkState(link(1, { updated_at: at(LIVE_IDLE_CLOSE_MS - 1000) }), NOW), "live", "just under 2 hours: still taking updates");
  assert.equal(linkState(link(1, { updated_at: at(LIVE_IDLE_CLOSE_MS) }), NOW), "stopped", "2 hours without an update: the link is closed, as the follower page says");
  assert.equal(linkState(link(1, { updated_at: at(3 * 24 * HOUR) }), NOW), "stopped");
  assert.equal(linkState(link(1, { status: "done" }), NOW), "finished");
  assert.equal(linkState(link(1, { status: "done", updated_at: at(20 * 24 * HOUR) }), NOW), "finished", "a finished match stays finished however old");
  assert.deepEqual(STATE_WORD, { live: "Live", finished: "Finished", stopped: "Stopped" });
  assert.equal(liveLinks([link(1), link(2, { status: "done" }), link(3, { updated_at: at(5 * HOUR) }), link(4, { updated_at: at(30 * MIN) })], NOW), 2);
  assert.equal(liveLinks(null, NOW), 0);
});

test("my live links: what a row says", () => {
  assert.equal(linkTitle(link(1)), "Titans vs Royals");
  assert.equal(linkTitle(link(1, { team_b: "" })), "Titans");
  assert.equal(linkTitle(link(1, { team_a: "", team_b: "" })), "Cricket match");
  assert.equal(linkTitle(link(1, { team_a: "", team_b: "", tool: "board", sport: "football" })), "Football match");
  assert.equal(sidesTitle(" Red FC ", "Blue FC", "x"), "Red FC vs Blue FC");
  // The sport.
  assert.equal(sportWord(link(1)), "Cricket");
  assert.equal(sportWord(link(1, { tool: "board", sport: "table-tennis" })), "Table Tennis");
  assert.equal(sportWord(link(1, { tool: "board", sport: "other" })), "Scoreboard");
  assert.equal(sportWord(link(1, { tool: "board", sport: "curling" })), "Scoreboard", "a sport this build doesn't know");
  assert.equal(sportWord(link(1, { tool: "board", sport: null })), "Scoreboard");
  // When.
  assert.equal(linkWhen(link(1), NOW), "Updated 2 min ago");
  assert.equal(linkWhen(link(1, { updated_at: at(20_000) }), NOW), "Updated just now");
  assert.equal(linkWhen(link(1, { status: "done", updated_at: at(49 * MIN) }), NOW), "Sun 22 Nov, 7:11 PM", "a finished match: the India day and time of its last score");
  assert.equal(linkWhen(link(1, { updated_at: at(26 * HOUR) }), NOW), "Sat 21 Nov, 6 PM", "a stopped one too");
  // The line under the two sides.
  const scored = { ...link(1), line: "Titans 45/2 (4.3 ov)" };
  assert.equal(linkLine(scored, NOW), "Titans 45/2 (4.3 ov)");
  assert.equal(linkLine({ ...link(1, { status: "done" }), line: "Strikers won by 5 runs" }, NOW), "Strikers won by 5 runs");
  assert.equal(linkLine({ ...scored, updatedAt: at(4 * HOUR) }, NOW), "Last score: Titans 45/2 (4.3 ov)", "a stopped link's is its last score, and says so");
  assert.equal(linkLine(link(1), NOW), null, "no line was worked out: none is made up");
  assert.equal(linkLine({ ...link(1), line: "Titans vs Royals" }, NOW), null, "a line that only repeats the two sides is left out");
  assert.equal(linkLine({ ...link(1), line: "   " }, NOW), null);
  for (const w of [linkTitle(link(1)), linkWhen(link(1), NOW), ...Object.values(STATE_WORD)]) assert.doesNotMatch(w, /\bbook/i);
});

test("my live links: a live one leads, then the latest", () => {
  const list = [link(1, { status: "done", updated_at: at(10 * MIN) }), link(2, { updated_at: at(5 * HOUR) }), link(3, { updated_at: at(30 * MIN) }), link(4, { updated_at: at(MIN) }), link(5, { status: "done", updated_at: at(3 * 24 * HOUR) })];
  assert.deepEqual(orderLinks(list, NOW).map((l) => l.code), [C(4), C(3), C(1), C(2), C(5)], "the two live ones first (the latest of them leading), then the rest by last update");
  assert.deepEqual(list.map((l) => l.code), [C(1), C(2), C(3), C(4), C(5)], "the list handed in is left as it was");
  // The same instant: by code, so the order never flickers between reads.
  assert.deepEqual(orderLinks([link(9), link(7), link(8)], NOW).map((l) => l.code), [C(7), C(8), C(9)]);
  assert.deepEqual(orderLinks([], NOW), []);
});

test("my live links: the score line is the follower page's own", () => {
  const m = playMatch(newMatch({ teamA: "Titans", teamB: "Strikers", overs: 1, playersPerSide: 6 }, { id: "m1", now: 1 }), [4, 6, 1, 0, 2, 1], [1, 1, 0, 2, 4, 0]);
  const done = matchLine(m);
  assert.deepEqual(done, { line: derive(m).headline, teamA: "Titans", teamB: "Strikers" }, "a cricket match: the scorer's own headline and the two sides");
  assert.match(done?.line ?? "", /Titans won by 6 runs/);
  const b = applyBoard(applyBoard(newBoard("football", { teamA: "Red FC", teamB: "Blue FC" }, { id: "b1", now: 1 }), { type: "start", at: 2 } as never), { type: "point", side: "a", at: 3 } as never);
  const board = matchLine(b);
  assert.deepEqual([board?.teamA, board?.teamB], ["Red FC", "Blue FC"]);
  assert.equal(typeof board?.line, "string");
  // Sent by the route as JSON, so what comes out of the database is read the same way.
  assert.deepEqual(matchLine(JSON.parse(JSON.stringify(m))), done);
  for (const bad of [null, undefined, "x", 4, {}, { v: 1 }, []]) assert.equal(matchLine(bad), null, "anything that is not a match: no line");
});

const saved = (id: string, o: Partial<SavedMatch> = {}): SavedMatch => ({ id, teamA: "Titans", teamB: "Royals", headline: "Titans 45/2 (4.3 ov)", status: "live", updatedAt: NOW - 10 * MIN, ...o });
const stores = (o: Partial<PhoneStores> = {}): PhoneStores => ({ ...EMPTY_STORES, ...o });

test("on this phone: what the tools hold that the server's list does not show", () => {
  const session = recordFinal(aSession(), { battedFirst: "a", a: { runs: 20, wickets: 1, balls: 6, allOut: false }, b: { runs: 12, wickets: 3, balls: 6, allOut: false }, noResult: false } as never, NOW - 30 * MIN).session;
  const st = stores({
    scorer: [saved("m1"), saved("m2", { status: "done", headline: "Strikers won by 5 runs", teamA: "Strikers", teamB: "Kings", updatedAt: NOW - 3 * HOUR }), saved("m3", { headline: "Titans vs Royals", updatedAt: NOW - 5 * MIN })],
    boards: [saved("b1", { sport: "football", teamA: "Red FC", teamB: "Blue FC", headline: "Red FC 2-1 Blue FC, 2nd half", updatedAt: NOW - 20 * MIN })],
    sessions: [session],
    links: { m1: { code: C(1), on: true }, m2: { code: C(2), on: false } },
  });
  const all = phoneItems(st, new Set());
  assert.deepEqual(all.items.map((i) => [i.kind, i.id, i.open]), [["cricket", "m3", true], ["cricket", "m1", true], ["board", "b1", true], ["session", "s1", true], ["cricket", "m2", false]], "unfinished first, each group by its last change");
  assert.equal(all.more, 0);
  const m1 = all.items.find((i) => i.id === "m1");
  assert.deepEqual(m1, { kind: "cricket", id: "m1", title: "Titans vs Royals", line: "Titans 45/2 (4.3 ov)", what: "Cricket", open: true, state: "In progress", updatedAt: NOW - 10 * MIN, href: "/tools/cricket-live-scorer" });
  assert.equal(all.items.find((i) => i.id === "m3")?.line, null, "nothing scored yet: the line would only repeat the two sides");
  assert.deepEqual([all.items.find((i) => i.id === "m2")?.state, all.items.find((i) => i.id === "m2")?.line], ["Finished", "Strikers won by 5 runs"]);
  const b1 = all.items.find((i) => i.id === "b1");
  assert.deepEqual([b1?.what, b1?.title, b1?.href], ["Football", "Red FC vs Blue FC", "/tools/live-scoreboard"]);
  const s1 = all.items.find((i) => i.kind === "session");
  assert.deepEqual([s1?.title, s1?.what, s1?.state, s1?.href, s1?.line], ["Titans vs Strikers", "Turf session · 1 match", "In progress", "/tools/turf-session", "Titans 1 - 0 Strikers"]);
  // A match whose live link the server's list shows is listed there, not again here; one whose link was turned off stays here.
  const shown = phoneItems(st, new Set([C(1), C(2)]));
  assert.deepEqual(shown.items.map((i) => i.id), ["m3", "b1", "s1", "m2"]);
  // Which saved match a listed link is the link of: only on the phone that holds its key, and still has the match.
  assert.deepEqual(heldMatch(C(1), st), { kind: "cricket", id: "m1" });
  assert.equal(heldMatch(C(2), st), null, "a link turned off here is not this phone's to go on scoring");
  assert.equal(heldMatch(C(3), st), null, "another phone's link");
  assert.equal(heldMatch(C(1), stores({ links: { m1: { code: C(1), on: true } } })), null, "the key without the match (it was cleared from this phone)");
  assert.deepEqual(heldMatch(C(4), stores({ boards: [saved("b9")], links: { b9: { code: C(4), on: true } } })), { kind: "board", id: "b9" });
  // Blocked or empty storage: nothing, and nothing fails.
  assert.deepEqual(phoneItems(EMPTY_STORES, new Set()), { items: [], more: 0 });
  assert.deepEqual(PHONE_HREF, { cricket: "/tools/cricket-live-scorer", board: "/tools/live-scoreboard", session: "/tools/turf-session" });
});

test("on this phone: a session's matches are the session's, and the list has an end", () => {
  // A scored match of a session is one of the scorer's saved matches too: it is listed once, as its session.
  let s = addScored(aSession(), "m77", "a", NOW - HOUR);
  const played = playMatch(newMatch({ teamA: "Titans", teamB: "Strikers", overs: 1, playersPerSide: 6 }, { id: "m77", now: 1 }), [4, 6, 1, 0, 2, 1], [1, 1, 0, 2, 4, 0]);
  s = recordScored(s, 1, derive(played), NOW - 50 * MIN);
  const st = stores({ scorer: [saved("m77"), saved("m5")], sessions: [{ ...s, ended: NOW - 40 * MIN, updatedAt: NOW - 40 * MIN }] });
  const got = phoneItems(st, new Set());
  assert.deepEqual(got.items.map((i) => [i.kind, i.id]), [["cricket", "m5"], ["session", "s1"]]);
  assert.deepEqual([got.items[1].state, got.items[1].open, got.items[1].line], ["Ended", false, "Titans 1 - 0 Strikers"]);
  // No finished match yet: no line.
  assert.equal(phoneItems(stores({ sessions: [aSession()] }), new Set()).items[0].line, null);
  assert.equal(phoneItems(stores({ sessions: [aSession()] }), new Set()).items[0].what, "Turf session · 0 matches");
  // More than the list shows: the newest PHONE_MAX, and how many are left to the tools' own lists.
  const many = stores({ scorer: Array.from({ length: 14 }, (_, i) => saved(`m${i}`, { updatedAt: NOW - i * MIN })) });
  const cut = phoneItems(many, new Set());
  assert.equal(cut.items.length, PHONE_MAX);
  assert.equal(cut.more, 4);
  assert.equal(cut.items[0].id, "m0");
});

test("the tab's count: only what is live right now", () => {
  const st = stores({ scorer: [saved("m1"), saved("m2", { updatedAt: NOW - 5 * HOUR }), saved("m3", { status: "done" })], links: { m1: { code: C(1), on: true } } });
  assert.equal(phoneLive(phoneItems(st, new Set()).items, NOW), 1, "being scored here: unfinished and changed within 2 hours");
  // Before the server's list is in (or before the migration): the match being scored on this phone counts.
  assert.equal(liveNow(null, st, NOW), 1);
  assert.equal(liveNow(undefined as never, st, NOW), 1);
  // With it: the same match is the server's live link now, and is counted once.
  assert.equal(liveNow([link(1)], st, NOW), 1);
  // Another phone's live link and this phone's own match: two.
  assert.equal(liveNow([link(9)], st, NOW), 2);
  // Finished, stopped and old ones are never counted: not a total.
  assert.equal(liveNow([link(1, { status: "done" }), link(2, { updated_at: at(6 * HOUR) })], stores({ scorer: [saved("m2", { updatedAt: NOW - 5 * HOUR }), saved("m3", { status: "done" })] }), NOW), 0);
  assert.equal(liveNow([], EMPTY_STORES, NOW), 0);
});

test("the tab's shape: loading, the empty state or the lists", () => {
  assert.equal(matchesShape({ links: undefined, tournaments: undefined, phone: 0 }), "loading", "nothing known yet");
  assert.equal(matchesShape({ links: [], tournaments: undefined, phone: 0 }), "loading", "one list still on its way");
  assert.equal(matchesShape({ links: [], tournaments: 0, phone: 0 }), "empty", "nothing of theirs anywhere: the tools are offered");
  assert.equal(matchesShape({ links: null, tournaments: 0, phone: 0 }), "empty", "before the migration the server's list is not there: still the friendly way in, nothing fails");
  assert.equal(matchesShape({ links: null, tournaments: 0, phone: 2 }), "full", "and what the phone holds still shows");
  assert.equal(matchesShape({ links: undefined, tournaments: undefined, phone: 1 }), "full", "the phone's own show at once, before the server answers");
  assert.equal(matchesShape({ links: [link(1)], tournaments: 0, phone: 0 }), "full");
  assert.equal(matchesShape({ links: [], tournaments: 3, phone: 0 }), "full");
});

test("the ways in, and the tool medals pointer", () => {
  assert.deepEqual(SHORTCUTS.map((s) => [s.label, s.href]), [["Score a match", "/tools/cricket-live-scorer"], ["Run a tournament", "/tournament/new"], ["Toss", "/tools/cricket-toss"], ["Split teams", "/tools/cricket-team-generator"]]);
  assert.deepEqual(OTHER_SPORTS, { label: "Live Scoreboard", href: "/tools/live-scoreboard" });
  for (const s of SHORTCUTS) {
    assert.doesNotMatch(`${s.label} ${s.line}`, /\bbook|hurry|only \d|last chance|!/i, "no booking claim, no urgency");
    assert.ok(s.label.length <= 16, "short enough for a pill at 320 px");
  }
  // The total is the catalog's, never a number typed in.
  const tool = MEDALS.filter(isToolMedal);
  assert.equal(tool.length, 11);
  assert.deepEqual(toolMedalCount([]), { earned: 0, of: 11 });
  assert.deepEqual(toolMedalCount(["first-game", "tool-scored-1", "tool-toss-1", "games-5", "tool-kit-3", "not-a-medal"]), { earned: 3, of: 11 }, "only tool medals are counted");
  assert.equal(toolMedalWords(["tool-scored-1", "tool-toss-1", "tool-kit-3"]), "3 of 11 medals from the free tools");
  assert.equal(toolMedalWords(tool.map((m) => m.id)), "11 of 11 medals from the free tools");
  assert.equal(TOOL_MEDALS_HREF, "/dashboard?tab=passport#medals");
});

test("my tournaments: the account's, then the ones this phone runs", () => {
  const mine = [
    { code: "t00000000001", name: "Sunday Smash League", format: "league" as const, status: "on" as const, teams: 6, fixtures: 15, played: 4, createdAt: "", updatedAt: "" },
    { code: "t00000000002", name: "Titans v Strikers", format: "bilateral" as const, status: "on" as const, teams: 2, fixtures: 3, played: 3, createdAt: "", updatedAt: "" },
  ];
  const here = { t00000000001: { secret: "a".repeat(64), name: "Sunday Smash League", at: 5 }, t00000000009: { secret: "b".repeat(64), name: "", at: 9 }, t00000000008: { secret: "c".repeat(64), name: "Friday Cup", at: 7 } };
  assert.deepEqual(tournamentRows(mine, here), [
    { code: "t00000000001", name: "Sunday Smash League", sub: "League · 6 teams · 4 of 15 played", here: true, href: "/tournament/t00000000001" },
    { code: "t00000000002", name: "Titans v Strikers", sub: "Series · 2 teams · 3 of 3 played", here: false, href: "/tournament/t00000000002?manage=1" },
    { code: "t00000000009", name: "Tournament", sub: "Run from this phone", here: true, href: "/tournament/t00000000009" },
    { code: "t00000000008", name: "Friday Cup", sub: "Run from this phone", here: true, href: "/tournament/t00000000008" },
  ]);
  assert.equal(tournamentRows(null, here).length, 3, "the account's can't be read: this phone's still show");
  assert.deepEqual(tournamentRows(null, {}), []);
  assert.deepEqual(tournamentRows([], {}), []);
  const lots = Array.from({ length: 20 }, (_, i) => ({ ...mine[0], code: `t${String(i).padStart(11, "0")}` }));
  assert.equal(tournamentRows(lots, {}).length, TOURNAMENTS_MAX);
});
