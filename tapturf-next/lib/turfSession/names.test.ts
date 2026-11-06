// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { prefillFromGame, readNames, sameNames, shortNames, sideName, type GameAsk } from "./names";

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("short names: first names, told apart by a last initial or a number", () => {
  assert.deepEqual(shortNames(["Rohan Patil", "Amit Shah", "Rohan Kulkarni"]), ["Rohan P", "Amit", "Rohan K"]);
  assert.deepEqual(shortNames(["Rohan", "Rohan Kulkarni"]), ["Rohan", "Rohan 2"], "no last name: a number");
  assert.deepEqual(shortNames(["Rohan Patil", "Rohan Pawar"]), ["Rohan", "Rohan 2"], "the same letter tells nobody apart");
  assert.deepEqual(shortNames(["Rohan Patil", "rohan patil", "  Rohan   Patil "]), ["Rohan"], "typed twice is one person");
  assert.deepEqual(shortNames(["Player", "player", "", "  ", "Sameer"]), ["Sameer"]);
  assert.deepEqual(shortNames(["sahil"]), ["Sahil"]);
  assert.deepEqual(shortNames(["Rohan Kulkarni", "Rohan", "Rohan Joshi"]), ["Rohan", "Rohan 2", "Rohan 3"]);
  const many = shortNames(Array.from({ length: 40 }, (_, i) => `P${i} Last`));
  assert.equal(many.length, 30);
  assert.ok(shortNames(["A".repeat(60)])[0].length <= 40);
  const labels = shortNames(["Rohan", "Rohan Kulkarni", "Rohan Joshi", "Rohan 2"]);
  assert.equal(new Set(labels.map((l) => l.toLowerCase())).size, labels.length, "never two the same");
});

const ask = (over: Partial<GameAsk["game"]> = {}, names = ["Rohan Patil", "Amit Shah", "Sameer Khan", "Vikas", "Arjun", "Sahil"]): GameAsk => ({
  game: { id: "11111111-2222-3333-4444-555555555555", sport: "Box Cricket", date: "2026-11-08", start: "19:00", end: "21:00", spots: 12, ...over },
  venue: { name: "Sai Sports Arena", turf: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", slug: "sai-sports-arena", name: "Sai Sports Arena", area: "Baner" } },
  names,
});

test("a box cricket game: box format, 6 overs, 6 a side, 6 matches in 2 hours, players split", () => {
  const p = prefillFromGame(ask(), 0, seeded(4));
  assert.equal(p.format, "box");
  assert.equal(p.overs, 6);
  assert.equal(p.playersPerSide, 6);
  assert.equal(p.plan, 6);
  assert.equal(p.slot, 120);
  assert.equal(p.venue, "Sai Sports Arena");
  assert.equal(p.turf?.slug, "sai-sports-arena");
  assert.equal(p.day, "2026-11-08");
  assert.deepEqual(p.game, { id: "11111111-2222-3333-4444-555555555555", start: "19:00", end: "21:00" });
  assert.equal(p.sides.a.name, "Team A");
  assert.equal(p.sides.b.name, "Team B");
  assert.equal(p.sides.a.players.length, 3);
  assert.equal(p.sides.b.players.length, 3);
  assert.deepEqual([...p.sides.a.players, ...p.sides.b.players].sort(), ["Amit", "Arjun", "Rohan", "Sahil", "Sameer", "Vikas"]);
  assert.deepEqual(prefillFromGame(ask(), 0, seeded(4)).sides, p.sides, "the same seed, the same split");
});

test("a cricket game: cricket format, 10 overs, 11 a side, 2 matches; an hour's slot fits 1", () => {
  const p = prefillFromGame(ask({ sport: "Cricket", spots: 22 }), 0, seeded(1));
  assert.equal(p.format, "cricket");
  assert.equal(p.overs, 10);
  assert.equal(p.playersPerSide, 11);
  assert.equal(p.plan, 2);
  const hour = prefillFromGame(ask({ sport: "cricket", spots: 14, start: "07:00", end: "08:00" }), 0, seeded(1));
  assert.equal(hour.playersPerSide, 7);
  assert.equal(hour.plan, 1);
  const none = prefillFromGame(ask({ spots: 0 }, []), 0);
  assert.equal(none.playersPerSide, 6);
  assert.deepEqual(none.sides.a.players, []);
});

test("typed names and side names", () => {
  assert.deepEqual(readNames("Rohan, Amit\nrohan\n\n  Sameer  Khan ,"), ["Rohan", "Amit", "Sameer Khan"]);
  assert.equal(readNames(Array.from({ length: 40 }, (_, i) => `N${i}`).join(",")).length, 30);
  assert.equal(sideName("  Titans   XI  "), "Titans XI");
  assert.equal(sideName("x".repeat(40)).length, 30);
  assert.equal(sameNames("Titans", " titans "), true);
  assert.equal(sameNames("Titans", "Strikers"), false);
});
