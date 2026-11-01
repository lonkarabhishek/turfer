// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedPlayoffs, byesIn, circleRounds, fixtureCount, makeFixtures } from "./fixtures";
import type { Settings } from "./types";

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const pairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");
const league = (over: Partial<Settings> = {}) => ({ format: "league" as const, legs: 1 as const, matches: 0, playoffs: "none" as const, ...over });

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
  test(`circle method, ${n} teams: every pair once, nobody twice in a round`, () => {
    const rounds = circleRounds(ids(n));
    assert.equal(rounds.length, n % 2 ? n : n - 1, "rounds");
    const seen = new Map<string, number>();
    for (const r of rounds) {
      const playing = r.flatMap((p) => [p.home, p.away]);
      assert.equal(new Set(playing).size, playing.length, "nobody plays twice in a round");
      assert.equal(r.length, Math.floor(n / 2), "every team that can play does");
      for (const p of r) {
        assert.notEqual(p.home, p.away);
        seen.set(pairKey(p.home, p.away), (seen.get(pairKey(p.home, p.away)) ?? 0) + 1);
      }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2, "every pair meets");
    assert.ok([...seen.values()].every((c) => c === 1), "exactly once");
  });
}

test("odd teams: each has exactly one bye, one a round", () => {
  for (const n of [3, 5, 7, 9]) {
    const fx = makeFixtures(league(), ids(n));
    const rounds = [...new Set(fx.map((f) => f.round))];
    assert.equal(rounds.length, n);
    const byes = rounds.flatMap((r) => byesIn(fx, r, ids(n)));
    assert.equal(byes.length, n, `${n}: one bye a round`);
    assert.deepEqual([...byes].sort((a, b) => a - b), ids(n), `${n}: each team once`);
  }
  // Even: nobody sits out.
  const fx = makeFixtures(league(), ids(6));
  assert.deepEqual([1, 2, 3, 4, 5].flatMap((r) => byesIn(fx, r, ids(6))), []);
  assert.deepEqual(byesIn(fx, 42, ids(6)), [], "a round with no matches has no byes");
});

test("home and away stay roughly even", () => {
  for (const n of [4, 5, 6, 8, 10, 16]) {
    const fx = makeFixtures(league(), ids(n));
    const home = new Map<number, number>();
    for (const f of fx) home.set(f.home!, (home.get(f.home!) ?? 0) + 1);
    const games = n - 1;
    for (const id of ids(n)) {
      const h = home.get(id) ?? 0;
      assert.ok(Math.abs(h - games / 2) <= Math.ceil(games / 2), `${n} teams, team ${id}: ${h} first of ${games}`);
    }
  }
});

test("a second leg plays every pairing again, home and away swapped", () => {
  const fx = makeFixtures(league({ legs: 2 }), ids(4));
  assert.equal(fx.length, 12);
  const first = fx.filter((f) => f.round <= 3);
  const second = fx.filter((f) => f.round > 3);
  assert.equal(second.length, 6);
  for (const f of first) assert.ok(second.some((g) => g.home === f.away && g.away === f.home), "swapped");
  assert.deepEqual([...new Set(fx.map((f) => f.round))], [1, 2, 3, 4, 5, 6]);
});

test("numbered from 1 in order, nothing filled in", () => {
  const fx = makeFixtures(league({ playoffs: "semis" }), ids(5));
  assert.deepEqual(fx.map((f) => f.id), ids(fx.length));
  assert.deepEqual(fx.map((f) => f.seq), fx.map((_, i) => i));
  assert.ok(fx.every((f) => f.result === null && f.day === null && f.time === null));
  // Rounds never go back.
  assert.ok(fx.every((f, i) => i === 0 || f.round >= fx[i - 1].round));
});

test("league + top-4 playoffs: two semis then a final, teams left for the table", () => {
  const fx = makeFixtures(league({ playoffs: "semis" }), ids(5));
  assert.equal(fx.filter((f) => f.stage === "league").length, 10);
  const po = fx.filter((f) => f.stage !== "league");
  assert.deepEqual(po.map((f) => [f.stage, f.slot, f.round, f.home, f.away]), [
    ["semi", "s1", 6, null, null],
    ["semi", "s2", 6, null, null],
    ["final", "f", 7, null, null],
  ]);
  const top2 = makeFixtures(league({ playoffs: "final" }), ids(6)).filter((f) => f.stage !== "league");
  assert.deepEqual(top2.map((f) => [f.stage, f.slot, f.round]), [["final", "f", 6]]);
});

test("playoffs need enough teams", () => {
  assert.deepEqual(allowedPlayoffs({ format: "league" }, 3), ["none", "final"]);
  assert.deepEqual(allowedPlayoffs({ format: "league" }, 4), ["none", "final", "semis"]);
  assert.deepEqual(allowedPlayoffs({ format: "tri" }, 3), ["none", "final"]);
  assert.deepEqual(allowedPlayoffs({ format: "bilateral" }, 2), ["none"]);
  // Semis asked for three teams: left out, the league stands.
  const fx = makeFixtures(league({ playoffs: "semis" }), ids(3));
  assert.equal(fx.filter((f) => f.stage !== "league").length, 0);
});

test("tri-series: three matches (six home and away), a final if asked", () => {
  const tri = (over: Partial<Settings>) => makeFixtures({ format: "tri", legs: 1, matches: 0, playoffs: "none", ...over }, ids(3));
  assert.equal(tri({}).length, 3);
  assert.equal(tri({ legs: 2 }).length, 6);
  const withFinal = tri({ playoffs: "final" });
  assert.equal(withFinal.length, 4);
  assert.equal(withFinal[3].stage, "final");
});

test("bilateral series: the matches in order, taking turns", () => {
  const fx = makeFixtures({ format: "bilateral", legs: 1, matches: 5, playoffs: "semis" }, [1, 2]);
  assert.equal(fx.length, 5, "playoffs ignored");
  assert.deepEqual(fx.map((f) => [f.round, f.home, f.away]), [[1, 1, 2], [2, 2, 1], [3, 1, 2], [4, 2, 1], [5, 1, 2]]);
  assert.equal(makeFixtures({ format: "bilateral", legs: 1, matches: 40, playoffs: "none" }, [1, 2]).length, 9, "at most 9");
  assert.equal(makeFixtures({ format: "bilateral", legs: 1, matches: 0, playoffs: "none" }, [1, 2]).length, 1, "at least 1");
  assert.deepEqual(makeFixtures({ format: "bilateral", legs: 1, matches: 3, playoffs: "none" }, [1]), [], "two teams needed");
});

test("fixture counts for the setup screen", () => {
  assert.deepEqual(fixtureCount(league({ playoffs: "semis" }), 5), { league: 10, playoffs: 3 });
  assert.deepEqual(fixtureCount(league({ legs: 2 }), 16), { league: 240, playoffs: 0 });
  assert.deepEqual(fixtureCount(league({ playoffs: "final" }), 8), { league: 28, playoffs: 1 });
});
