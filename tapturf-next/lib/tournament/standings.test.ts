// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings, DEFAULT_POINTS } from "../cricket/nrr";
import { makeFixtures } from "./fixtures";
import { formatLabel, resolve } from "./standings";
import type { Fixture, LiveNow, LiveResult, ManualResult, Settings, Team, Tournament } from "./types";

/** A table row without its team id, as the offline tool's table has it. */
const noId = (row: { id: number }) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id"));

const settings = (over: Partial<Settings> = {}): Settings => ({
  format: "league",
  legs: 1,
  matches: 0,
  playoffs: "semis",
  overs: 6,
  points: { win: 2, tie: 1, nr: 1, loss: 0 },
  venue: null,
  starts: null,
  ends: null,
  ...over,
});
const NAMES = ["Titans", "Strikers", "Royals", "Kings", "Blasters"];
const teams = (n = 5): Team[] => NAMES.slice(0, n).map((name, i) => ({ id: i + 1, name, short: null }));
const inn = (runs: number, balls = 36, wickets = 5, allOut = false) => ({ runs, wickets, balls, allOut });
const won = (home: number, away: number, result: ManualResult["result"] = "auto"): ManualResult => ({ a: inn(home), b: inn(away), result, battedFirst: "a" });

function tour(s = settings(), n = 5): Pick<Tournament, "settings" | "teams" | "fixtures"> {
  const fixtures: Fixture[] = makeFixtures(s, teams(n).map((t) => t.id)).map((f) => ({ ...f, live: null, liveResult: null }));
  return { settings: s, teams: teams(n), fixtures };
}
/** Every league match won by the lower team id, by its id's margin. */
function playLeague(t: ReturnType<typeof tour>) {
  for (const f of t.fixtures) if (f.stage === "league") f.result = f.home! < f.away! ? won(100, 90 - f.home!) : won(90 - f.away!, 100);
}

test("a table straight from the shared maths: same rows as the offline tool's", () => {
  const t = tour();
  playLeague(t);
  const r = resolve(t);
  const offline = computeStandings(
    NAMES,
    r.fixtures.filter((x) => x.match).map((x) => x.match!),
    { ...DEFAULT_POINTS, oversPerSide: 6 },
  );
  assert.deepEqual(r.table.map(noId), offline);
  assert.deepEqual(r.table.map((x) => x.team), NAMES, "lower ids won every match");
  assert.deepEqual(r.table.map((x) => x.points), [8, 6, 4, 2, 0]);
  assert.equal(r.leagueDone, true);
  assert.equal(r.played, 10);
  assert.equal(r.total, 13);
  assert.equal(r.qualify, 4);
});

test("playoffs wait for the league, then fill from the table: 1v4, 2v3, final of winners", () => {
  const t = tour();
  // One league match short: nothing filled.
  playLeague(t);
  const last = t.fixtures.find((f) => f.stage === "league" && f.id === 10)!;
  const kept = last.result;
  last.result = null;
  let r = resolve(t);
  assert.equal(r.leagueDone, false);
  const semis = () => r.fixtures.filter((x) => x.fixture.stage === "semi");
  assert.deepEqual(semis().map((x) => [x.home, x.away, x.homeLabel, x.awayLabel]), [[null, null, "1st", "4th"], [null, null, "2nd", "3rd"]]);
  const final = () => r.fixtures.find((x) => x.fixture.stage === "final")!;
  assert.deepEqual([final().homeLabel, final().awayLabel], ["Winner SF1", "Winner SF2"]);
  assert.equal(r.champion, null);

  last.result = kept;
  r = resolve(t);
  assert.deepEqual(semis().map((x) => [x.home, x.away, x.filled]), [[1, 4, true], [2, 3, true]]);
  assert.deepEqual([final().home, final().away], [null, null], "the final waits for the semis");

  // SF1: 4th beats 1st. SF2: tie, so the higher place (listed first) goes through.
  const sf1 = t.fixtures.find((f) => f.slot === "s1")!;
  const sf2 = t.fixtures.find((f) => f.slot === "s2")!;
  sf1.result = won(80, 81);
  sf2.result = won(70, 70);
  r = resolve(t);
  assert.deepEqual(semis().map((x) => x.winner), [4, 2]);
  assert.equal(semis()[1].text, "Match tied");
  assert.deepEqual([final().home, final().away, final().homeName, final().awayName], [4, 2, "Kings", "Strikers"]);
  // The organiser sets SF2's winner (a super over): the final follows.
  sf2.result = won(70, 70, "b");
  r = resolve(t);
  assert.deepEqual([final().home, final().away], [4, 3]);
  // The final: Royals win it.
  t.fixtures.find((f) => f.slot === "f")!.result = won(60, 75);
  r = resolve(t);
  assert.deepEqual(r.champion, { id: 3 });
  // Level in the final: shared.
  t.fixtures.find((f) => f.slot === "f")!.result = won(60, 60, "nr");
  assert.deepEqual(resolve(t).champion, { shared: true });
});

test("the organiser can set a playoff's teams: the table does not move them", () => {
  const t = tour();
  playLeague(t);
  const sf1 = t.fixtures.find((f) => f.slot === "s1")!;
  sf1.home = 5;
  sf1.away = 1;
  const r = resolve(t);
  const x = r.fixtures.find((f) => f.fixture.slot === "s1")!;
  assert.deepEqual([x.home, x.away, x.filled], [5, 1, false]);
});

test("playoff matches never count in the table", () => {
  const t = tour();
  playLeague(t);
  const before = resolve(t).table;
  t.fixtures.find((f) => f.slot === "s1")!.result = won(10, 200);
  assert.deepEqual(resolve(t).table, before);
});

test("a top-2 final and a league with no playoffs: winners", () => {
  const t = tour(settings({ playoffs: "final" }), 4);
  playLeague(t);
  let r = resolve(t);
  const f = r.fixtures.find((x) => x.fixture.slot === "f")!;
  assert.deepEqual([f.home, f.away, f.homeLabel], [1, 2, "Titans"]);
  assert.equal(r.qualify, 2);
  const plain = tour(settings({ playoffs: "none" }), 4);
  playLeague(plain);
  r = resolve(plain);
  assert.deepEqual(r.champion, { id: 1 }, "top of the table");
  assert.equal(r.qualify, 0);
});

const liveDone = (lr: LiveResult): LiveNow => ({ status: "done", closed: false, headline: lr.text, a: null, b: null, batting: null, updatedAt: null, result: lr });
const LR: LiveResult = { a: { name: "Titans", runs: 63, wickets: 4, balls: 36, allOut: false }, b: { name: "Strikers", runs: 54, wickets: 10, balls: 30, allOut: true }, outcome: "a", battedFirst: "a", text: "Titans won by 9 runs" };

test("a live scorecard: live counts nothing, finished counts, a hand result wins, the kept one stands in", () => {
  const t = tour(settings({ playoffs: "none" }), 4);
  const f = t.fixtures.find((x) => x.home === 1 && x.away === 2) ?? t.fixtures.find((x) => x.home === 2 && x.away === 1)!;
  f.live = "abcdefghijkl";
  const id = String(f.id);
  const now: LiveNow = { status: "live", closed: false, headline: "Titans 45/3 (5.2 ov)", a: { score: "45/3", overs: "5.2" }, b: null, batting: "a", updatedAt: "2026-11-01T10:00:00Z", result: null };
  let r = resolve(t, { [id]: now });
  let x = r.fixtures.find((y) => y.fixture.id === f.id)!;
  assert.equal(x.state, "live");
  assert.equal(r.played, 0);
  assert.ok(r.table.every((s) => s.played === 0));

  r = resolve(t, { [id]: liveDone(LR) });
  x = r.fixtures.find((y) => y.fixture.id === f.id)!;
  assert.equal(x.state, "done");
  assert.equal(x.source, "live");
  assert.equal(x.text, "Titans won by 9 runs");
  const titans = r.table.find((s) => s.team === "Titans")!;
  assert.equal(titans.points, 2);
  // Strikers bowled out in 5 overs: the full 6 count against them.
  assert.equal(r.table.find((s) => s.team === "Strikers")!.ballsFor, 36);
  assert.equal(x.winner, 1, "Titans, whichever way round the fixture lists them");

  // The link was turned off since: the kept result stands in.
  f.liveResult = LR;
  r = resolve(t, { [id]: { ...now, status: "off", a: null, batting: null } });
  assert.equal(r.fixtures.find((y) => y.fixture.id === f.id)!.source, "live");
  assert.equal(r.table.find((s) => s.team === "Titans")!.won, 1);

  // A hand result wins over both (a DLS call: Strikers given the match).
  f.result = { a: inn(63), b: inn(54), result: f.home === 1 ? "b" : "a", battedFirst: "a" };
  r = resolve(t, { [id]: liveDone(LR) });
  x = r.fixtures.find((y) => y.fixture.id === f.id)!;
  assert.equal(x.source, "manual");
  assert.equal(r.table.find((s) => s.team === "Strikers")!.points, 2);
  assert.equal(r.table.find((s) => s.team === "Titans")!.points, 0);
});

test("a no result is left out of NRR, both sides get its points", () => {
  const t = tour(settings({ playoffs: "none" }), 3);
  t.fixtures[0].result = { a: inn(10), b: inn(200), result: "nr", battedFirst: "a" };
  const r = resolve(t);
  const [h, w] = [t.fixtures[0].home!, t.fixtures[0].away!].map((id) => r.table.find((s) => s.id === id)!);
  assert.deepEqual([h.points, w.points, h.nr, h.nrr, w.nrr], [1, 1, 1, null, null]);
});

test("a bilateral series: the score, and the winner once every match is in", () => {
  const s = settings({ format: "bilateral", matches: 3, playoffs: "none" });
  const t = tour(s, 2);
  t.fixtures[0].result = won(100, 90); // Titans (home)
  t.fixtures[1].result = won(100, 90); // Strikers (home in match 2)
  let r = resolve(t);
  assert.equal(r.series!.line, "Titans 1 - 1 Strikers");
  assert.equal(r.champion, null);
  t.fixtures[2].result = won(80, 90);
  r = resolve(t);
  assert.equal(r.series!.line, "Titans 1 - 2 Strikers");
  assert.deepEqual(r.champion, { id: 2 });
});

test("renamed teams carry their results; fixtures in the organiser's order", () => {
  const t = tour(settings({ playoffs: "none" }), 3);
  t.fixtures[0].result = won(100, 90);
  const winner = t.fixtures[0].home!;
  t.teams = t.teams.map((x) => (x.id === winner ? { ...x, name: "Thunder" } : x));
  t.fixtures[2].seq = -1;
  const r = resolve(t);
  assert.equal(r.table[0].team, "Thunder");
  assert.equal(r.table[0].id, winner);
  assert.equal(r.fixtures[0].fixture.id, t.fixtures[2].id);
});

test("format labels", () => {
  assert.equal(formatLabel(settings()), "League + semi-finals");
  assert.equal(formatLabel(settings({ playoffs: "final", legs: 2 })), "Double round robin + final");
  assert.equal(formatLabel(settings({ playoffs: "none" })), "League");
  assert.equal(formatLabel(settings({ format: "tri", playoffs: "none" })), "Tri-series");
  assert.equal(formatLabel(settings({ format: "bilateral", matches: 5 })), "5-match series");
});
