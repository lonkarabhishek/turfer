// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings, DEFAULT_POINTS, seriesStatus, type MatchInput } from "../cricket/nrr";
import { fromLocal, type LocalTournament } from "./local";
import { resolve } from "./standings";
import type { Fixture } from "./types";

/** A table row without its team id, as the offline tool's table has it. */
const noId = (row: { id: number }) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id"));

const inn = (runs: number, balls = 36, wickets = 4, allOut = false) => ({ runs, wickets, balls, allOut });
let n = 0;
const m = (teamA: string, teamB: string, a: ReturnType<typeof inn>, b: ReturnType<typeof inn>, result: MatchInput["result"] = "auto", battedFirst: "a" | "b" = "a") => ({ id: String(++n), teamA, teamB, a, b, result, battedFirst, at: n });

function local(over: Partial<LocalTournament>): LocalTournament {
  return { v: 1, format: "roundrobin", name: "Sunday League", teams: ["Titans", "Strikers", "Royals", "Kings"], points: { ...DEFAULT_POINTS, oversPerSide: 6 }, matches: [], startedAt: 0, ...over };
}
const live = (t: LocalTournament) => {
  const r = fromLocal(t);
  assert.ok("ok" in r, JSON.stringify(r));
  if (!("ok" in r)) throw new Error("no");
  const fixtures: Fixture[] = r.ok.fixtures!.map((f) => ({ ...f, live: null, liveResult: null }));
  return { body: r.ok, t: { settings: r.ok.settings, teams: r.ok.teams.map((x, i) => ({ id: i + 1, ...x })), fixtures } };
};

test("a round robin goes live with the same table, NRR and all", () => {
  const t = local({
    matches: [
      m("Titans", "Strikers", inn(63), inn(54)),
      m("Royals", "Titans", inn(70), inn(71, 33), "auto", "a"), // Titans chase, listed second
      m("Kings", "Royals", inn(40, 24, 10, true), inn(41, 18)),
      m("Strikers", "Kings", inn(80), inn(80), "tie"),
      m("Titans", "Kings", inn(10), inn(200), "nr"),
    ],
  });
  const { body, t: lt } = live(t);
  assert.equal(body.settings.format, "league");
  assert.equal(body.settings.legs, 1);
  assert.equal(body.settings.overs, 6);
  assert.equal(body.fixtures!.length, 6, "every pairing of four teams");
  assert.equal(body.fixtures!.filter((f) => f.result).length, 5);
  const offline = computeStandings(t.teams, t.matches, t.points);
  const online = resolve(lt).table.map(noId);
  assert.deepEqual(online, offline, "the same rows, to the last ball");
});

test("a pairing played twice: home and away, the extra on a second leg", () => {
  const t = local({ teams: ["A", "B", "C"], matches: [m("A", "B", inn(10), inn(5)), m("B", "A", inn(10), inn(5)), m("A", "B", inn(10), inn(5))] });
  const { body, t: lt } = live(t);
  assert.equal(body.settings.legs, 2);
  assert.equal(body.fixtures!.length, 7, "6 for two legs, and the third A v B");
  assert.deepEqual(resolve(lt).table.map(noId), computeStandings(t.teams, t.matches, t.points));
  // Ids and order run 1 up.
  assert.deepEqual(body.fixtures!.map((f) => f.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(body.fixtures!.map((f) => f.seq), [0, 1, 2, 3, 4, 5, 6]);
});

test("a series keeps its score; played past the plan, more matches", () => {
  const t = local({ format: "bilateral", teams: ["Titans", "Strikers"], matches: [m("Titans", "Strikers", inn(63), inn(54)), m("Strikers", "Titans", inn(70), inn(60))] });
  const { body, t: lt } = live(t);
  assert.equal(body.settings.format, "bilateral");
  assert.equal(body.settings.matches, 3);
  assert.equal(body.fixtures!.length, 3);
  assert.equal(resolve(lt).series!.line, seriesStatus("Titans", "Strikers", t.matches).line);
  const many = local({ format: "bilateral", teams: ["A", "B"], matches: Array.from({ length: 11 }, () => m("A", "B", inn(10), inn(5))) });
  assert.equal(live(many).body.fixtures!.length, 11);
});

test("no overs a side stays none, so NRR uses the overs faced", () => {
  const t = local({ points: { ...DEFAULT_POINTS, oversPerSide: null }, matches: [m("Titans", "Strikers", inn(40, 24, 10, true), inn(41, 18))] });
  const { body, t: lt } = live(t);
  assert.equal(body.settings.overs, null);
  assert.deepEqual(resolve(lt).table.map(noId), computeStandings(t.teams, t.matches, t.points));
});

test("a nameless tournament gets a name; too few teams is refused", () => {
  assert.equal(live(local({ name: "  " })).body.name, "Cricket tournament");
  assert.deepEqual(fromLocal(local({ teams: ["A", "B"] })), { error: "teams" });
  assert.deepEqual(fromLocal(local({ format: "tri", teams: ["A", "a", "B"] })), { error: "teams" });
});
