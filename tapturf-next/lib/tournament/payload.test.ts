// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, readCreate, readDay, readOp, readResult, readSettings, readShort, readTeams } from "./payload";

const SECRET = "ab".repeat(32);
const base = (over: Record<string, unknown> = {}) => ({
  secret: SECRET,
  name: "  Sunday   Box League ",
  settings: { format: "league", legs: 1, playoffs: "semis", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 } },
  teams: ["Titans", "Strikers", "Royals", "Kings", "Blasters"].map((name) => ({ name, short: "" })),
  ...over,
});

test("a create: cleaned, and fixtures made when none are sent", () => {
  const r = readCreate(base());
  assert.ok("ok" in r);
  if (!("ok" in r)) return;
  assert.equal(r.ok.name, "Sunday Box League");
  assert.equal(r.ok.fixtures.length, 13, "10 league + 2 semis + a final");
  assert.equal(r.ok.settings.playoffs, "semis");
  assert.deepEqual(r.ok.settings.points, { win: 2, tie: 1, nr: 1, loss: 0 });
  assert.equal(r.ok.teams[0].short, null);
});

test("a create: what is refused, by field", () => {
  const field = (x: unknown) => {
    const r = readCreate(x);
    return "error" in r ? r.field : "ok";
  };
  assert.equal(field(base({ secret: "nope" })), "secret");
  assert.equal(field(base({ name: "   " })), "name");
  assert.equal(field(base({ teams: [{ name: "A" }] })), "teams");
  assert.equal(field(base({ teams: [{ name: "Titans" }, { name: "titans " }, { name: "X" }] })), "team_names");
  assert.equal(field(base({ teams: Array.from({ length: 17 }, (_, i) => ({ name: `T${i}` })) })), "teams");
  assert.equal(field(base({ settings: { format: "knockout" } })), "settings");
  assert.equal(field(base({ settings: { format: "bilateral" } })), "teams", "a series is two teams");
  assert.equal(field(base({ settings: { format: "tri" } })), "teams", "a tri-series is three");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "league", round: 1, seq: 0, home: 1, away: 1 }] })), "fixtures", "a team against itself");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "league", round: 1, seq: 0, home: 1, away: 9 }] })), "fixtures", "a team that isn't in it");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "league", round: 1, seq: 0, home: 1, away: 2 }, { id: 1, stage: "league", round: 1, seq: 1, home: 3, away: 4 }] })), "fixtures", "an id twice");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "league", round: 1, seq: 0, home: null, away: 2 }] })), "fixtures", "a league match needs both teams");
  assert.equal(field(base({ fixtures: [] })), "fixtures");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "semi", slot: "s1", round: 5, seq: 0, home: null, away: null }] })), "ok", "a playoff waits for its teams");
  assert.equal(field(base({ fixtures: [{ id: 1, stage: "league", round: 1, seq: 0, home: 1, away: 2, result: { a: { runs: -1 } } }] })), "fixtures", "a bad result");
  assert.equal(field(null), "secret");
});

test("settings: limits and defaults", () => {
  const s = readSettings({ format: "league", legs: 3, playoffs: "semis", overs: 99, points: { win: 200, tie: "1" } }, 3)!;
  assert.equal(s.legs, 1);
  assert.equal(s.playoffs, "none", "semis need four teams");
  assert.equal(s.overs, 6, "out of range: the default");
  assert.deepEqual(s.points, { win: 2, tie: 1, nr: 1, loss: 0 });
  assert.equal(readSettings({ format: "league", overs: null }, 4)!.overs, null, "no overs a side: overs faced");
  assert.equal(readSettings({ format: "bilateral", matches: 5 }, 2)!.matches, 5);
  assert.equal(readSettings({ format: "bilateral", matches: 50 }, 2)!.matches, 3);
  const v = readSettings({ format: "league", venue: { id: "6F2B1C2D-0000-4000-8000-000000000001", slug: "ranangan-baner", name: " Ranangan ", area: "Baner" } }, 4)!.venue;
  assert.deepEqual(v, { id: "6f2b1c2d-0000-4000-8000-000000000001", slug: "ranangan-baner", name: "Ranangan", area: "Baner" });
  assert.equal(readSettings({ format: "league", venue: { id: "x", name: "y" } }, 4)!.venue, null);
  const d = readSettings({ format: "league", starts: "2026-11-08", ends: "2026-11-01" }, 4)!;
  assert.deepEqual([d.starts, d.ends], ["2026-11-08", null], "an end before the start is dropped");
});

test("days, short codes, names", () => {
  assert.equal(readDay("2026-11-08"), "2026-11-08");
  assert.equal(readDay("2026-02-30"), null);
  assert.equal(readDay("8 Nov"), null);
  assert.equal(readShort(" tit "), "TIT");
  assert.equal(readShort("t-i-t-a-n-s"), "TITA");
  assert.equal(readShort(""), null);
  assert.equal(cleanText("a\u0000b\n  c", 10), "a b c");
  assert.deepEqual(readTeams([{ name: "A" }, { name: "B" }]), { ok: [{ name: "A", short: null }, { name: "B", short: null }] });
});

test("results: whole numbers within a match", () => {
  const ok = { a: { runs: 63, wickets: 4, balls: 36 }, b: { runs: 54, wickets: 10, balls: 30, allOut: true }, result: "auto", battedFirst: "b" };
  assert.deepEqual(readResult(ok), { a: { runs: 63, wickets: 4, balls: 36, allOut: false }, b: { runs: 54, wickets: 10, balls: 30, allOut: true }, result: "auto", battedFirst: "b" });
  assert.equal(readResult({ ...ok, result: "dls" }), null);
  assert.equal(readResult({ ...ok, a: { runs: 1.5, wickets: 0, balls: 6 } }), null);
  // Up to 30 down: the live scorer takes 30 a side, last man stands.
  assert.deepEqual(readResult({ ...ok, a: { runs: 10, wickets: 11, balls: 6 } })?.a, { runs: 10, wickets: 11, balls: 6, allOut: false });
  assert.equal(readResult({ ...ok, a: { runs: 10, wickets: 30, balls: 6 } })?.a.wickets, 30);
  assert.equal(readResult({ ...ok, a: { runs: 10, wickets: 31, balls: 6 } }), null);
});

test("a result's own words for the margin are kept, cleaned and cut; blank is none", () => {
  const ok = { a: { runs: 50, wickets: 4, balls: 36 }, b: { runs: 51, wickets: 2, balls: 30 }, result: "auto", battedFirst: "a" };
  assert.equal(readResult({ ...ok, text: "Strikers won  by 3\nwickets" })?.text, "Strikers won by 3 wickets");
  assert.equal(readResult({ ...ok, text: "x".repeat(200) })?.text?.length, 120);
  assert.equal("text" in readResult({ ...ok, text: "   " })!, false);
  assert.equal("text" in readResult({ ...ok, text: 42 })!, false);
  assert.equal("text" in readResult(ok)!, false, "a hand result from the Manage tab has none");
  const op = readOp({ secret: SECRET, op: "result", id: 2, result: { ...ok, text: "Strikers won by 3 wickets" } }, 2);
  assert.ok("ok" in op && op.ok.op.op === "result" && op.ok.op.result?.text === "Strikers won by 3 wickets");
  // The database's 1000-byte check holds: the longest text with the largest numbers.
  const big = readResult({ a: { runs: 999, wickets: 30, balls: 600, allOut: true }, b: { runs: 999, wickets: 30, balls: 600, allOut: true }, result: "auto", battedFirst: "b", text: "x".repeat(500) })!;
  assert.ok(Buffer.byteLength(JSON.stringify(big)) < 1000);
});

test("changes: each op read from its whitelist", () => {
  const op = (x: Record<string, unknown>) => readOp({ secret: SECRET, ...x }, 5);
  assert.deepEqual(op({ op: "team", id: 2, name: " New  Name ", short: "nn" }), { ok: { secret: SECRET, op: { op: "team", id: 2, name: "New Name", short: "NN" } } });
  assert.deepEqual(op({ op: "fixture_remove", id: 3 }), { ok: { secret: SECRET, op: { op: "fixture_remove", id: 3 } } });
  assert.deepEqual(op({ op: "fixture_order", ids: [3, 1, 2] }), { ok: { secret: SECRET, op: { op: "fixture_order", ids: [3, 1, 2] } } });
  assert.ok("error" in op({ op: "fixture_order", ids: [1, 1] }));
  assert.deepEqual(op({ op: "fixture_edit", id: 4, round: 2, home: 1, away: 3, day: "2026-11-08", time: "19:30" }), {
    ok: { secret: SECRET, op: { op: "fixture_edit", id: 4, round: 2, home: 1, away: 3, day: "2026-11-08", time: "19:30" } },
  });
  assert.ok("error" in op({ op: "fixture_edit", id: 4, round: 2, home: 1, away: 1 }), "same team twice");
  assert.ok("error" in op({ op: "fixture_edit", id: 4, round: 2, home: 1, away: 6 }), "past the team count");
  assert.ok("error" in op({ op: "fixture_add", round: 1, stage: "league", home: 1, away: null }));
  assert.ok("ok" in op({ op: "fixture_add", round: 9, stage: "final", slot: "f", home: null, away: null }));
  assert.deepEqual(op({ op: "result", id: 1, result: null }), { ok: { secret: SECRET, op: { op: "result", id: 1, result: null, home: null, away: null } } });
  assert.ok("error" in op({ op: "result", id: 1, result: { a: 1 } }));
  assert.deepEqual(op({ op: "live_link", id: 2, liveCode: "abcdefgh1234", home: 1, away: 4 }), { ok: { secret: SECRET, op: { op: "live_link", id: 2, liveCode: "abcdefgh1234", home: 1, away: 4 } } });
  assert.ok("error" in op({ op: "live_link", id: 2, liveCode: "ABC" }));
  assert.deepEqual(op({ op: "remove" }), { ok: { secret: SECRET, op: { op: "remove" } } });
  assert.ok("error" in op({ op: "drop_table" }));
  assert.ok("error" in readOp({ op: "remove" }), "no secret");
  const s = op({ op: "settings", name: "League", settings: { format: "league", overs: 8 } });
  assert.ok("ok" in s && s.ok.op.op === "settings" && s.ok.op.settings.overs === 8);
});
