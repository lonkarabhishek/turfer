// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { askBody, forget, keep, MAX_SESSIONS, readAsk, readSession, readSessions, sessionForGame, STORE_KEY } from "./store";
import { aSession, T0, withFinal, withScored } from "./testkit";

test("a session comes back as it was saved", () => {
  let s = withFinal(aSession({ game: { id: "11111111-2222-3333-4444-555555555555", start: "19:00", end: "21:00" }, turf: { id: "AAAAAAAA-bbbb-cccc-dddd-eeeeeeeeeeee", slug: "sai", name: "Sai", area: null } }), 60, 50);
  ({ session: s } = withScored(s, [1, 1, 1, 1, 1, 1], [4, 4]));
  s = { ...s, live: { ...s.live, want: true, code: "abcdefgh1234", secret: "b".repeat(64), pushed: { "1": "x" }, error: "limit" } };
  const back = readSession(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, { ...s, turf: { ...s.turf!, id: s.turf!.id.toLowerCase() } });
  assert.ok(!STORE_KEY.startsWith("tapturf_scorer"), "the Live Scorer's storage listener leaves it alone");
});

test("anything malformed is left out, never thrown", () => {
  assert.deepEqual(readSessions(null), { v: 1, current: null, list: [] });
  assert.deepEqual(readSessions("{not json"), { v: 1, current: null, list: [] });
  assert.deepEqual(readSessions(JSON.stringify({ v: 2, list: [] })).list, []);
  const s = withFinal(aSession(), 60, 50);
  const bad = [{ ...s, id: "../x" }, { ...s, sides: { a: { name: "" }, b: s.sides.b } }, { ...s, overs: 0 }, null, 5];
  const store = readSessions(JSON.stringify({ v: 1, current: "nope", list: [s, ...bad] }));
  assert.equal(store.list.length, 1);
  assert.equal(store.current, null, "a current that is not kept is none");
  // A match that is not one is dropped and the rest renumbered; lines that are not lines go.
  const odd = readSession({ ...s, matches: [{ n: 1, kind: "final" }, { ...s.matches[0], n: 2, bat: [["x", "c", 1, 1, true], ["Rohan", "a", 5, 3, false]] }] })!;
  assert.equal(odd.matches.length, 1);
  assert.equal(odd.matches[0].n, 1);
  assert.deepEqual(odd.matches[0].bat, [["Rohan", "a", 5, 3, false]]);
  assert.equal(readSession({ ...s, live: { secret: "short", code: "BAD", error: "nope" } })!.live.secret, null);
});

test("ten sessions at most, newest first; the current one is never dropped", () => {
  let store = readSessions(null);
  const first = { ...aSession(), id: "s0", updatedAt: 0 };
  store = keep(store, first);
  for (let i = 1; i <= 12; i++) store = keep(store, { ...aSession(), id: `s${i}`, updatedAt: i * 1000 }, false);
  assert.equal(store.list.length, MAX_SESSIONS);
  assert.equal(store.current, "s0");
  assert.ok(store.list.some((s) => s.id === "s0"));
  assert.equal(store.list[0].id, "s12");
  store = forget(store, "s0");
  assert.equal(store.current, null);
  assert.ok(!store.list.some((s) => s.id === "s0"));
});

test("the game page's hand-off: same game, within 30 minutes", () => {
  const ask = { game: { id: "11111111-2222-3333-4444-555555555555", sport: "Box Cricket", date: "2026-11-08", start: "19:00", end: "21:00", spots: 12 }, venue: { name: "Sai", turf: null }, names: ["Rohan Patil", "Amit"] };
  const raw = askBody(ask, T0);
  assert.deepEqual(readAsk(raw, "11111111-2222-3333-4444-555555555555", T0 + 60_000), ask);
  assert.equal(readAsk(raw, "11111111-2222-3333-4444-555555555556", T0), null, "another game");
  assert.equal(readAsk(raw, "11111111-2222-3333-4444-555555555555", T0 + 31 * 60_000), null, "too old");
  assert.equal(readAsk("garbage", "x", T0), null);
  const s = aSession({ game: { id: ask.game.id, start: "19:00", end: "21:00" } });
  assert.equal(sessionForGame(keep(readSessions(null), s), ask.game.id.toUpperCase())?.id, s.id);
});
