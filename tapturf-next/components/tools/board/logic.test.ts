import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBoard, deriveBoard, newBoard, padFor } from "../../../lib/board";
import type { Board, BoardEvent } from "../../../lib/board/types";
import { RALLY_GUARD_MS, TAP_GUARD_MS, endEvent, endPreview, guardMs, knownPlayers, namePrompt, offersName, optionOn, padParts, playerTeam, reasonAllowed, rulesDiff, setTimeMs, clockParts, stamp, withPlayer } from "./logic";
import { MAX_SAVED, deleteBoard, loadBoard, loadIndex, loadPrefs, metaOf, saveBoard, savePrefs } from "./storage";

/* A small in-memory localStorage, enough for storage.ts. */
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

let t = 1_000_000;
const go = (b: Board, e: BoardEvent): Board => {
  const n = applyBoard(b, stamp(e, (t += 5_000)));
  assert.notEqual(n, b, `refused: ${JSON.stringify(e)}`);
  return n;
};

test("pad parts: each side's column, timeouts in their own strip, match-wide by id", () => {
  let b = newBoard("pickleball", { teamA: "Asha", teamB: "Ravi" }, { id: "bp1", now: 1 });
  b = go(b, { type: "serve", side: "a" });
  const p = padParts(padFor(b));
  assert.deepEqual(
    p.a.map((x) => x.id),
    ["point-a"],
  );
  assert.equal(p.timeout.a?.id, "timeout-a");
  assert.equal(p.timeout.b?.id, "timeout-b");
  assert.ok(p.wide.has("fix-serve"));
  // A column always means "this side": every action's event is for its side.
  for (const x of [...p.a, ...p.b]) assert.equal((x.event as { side?: string }).side, x.side);
});

test("football own goal sits in the credited team's column, its player belongs to the other team", () => {
  const b = newBoard("football", { teamA: "Red FC", teamB: "Blue FC" }, { id: "bf1", now: 1 });
  const og = padParts(padFor(b)).a.find((x) => x.id === "og-a")!;
  assert.equal(og.side, "a");
  assert.equal(playerTeam(og.event), "b");
  assert.equal(namePrompt(og.event).title, "Who put it in?");
  assert.equal(namePrompt({ type: "point", side: "a", how: "goal" }).button, "Add scorer");
});

test("tap guard: 500 ms for a rally point, 250 for everything else", () => {
  assert.equal(guardMs({ event: { type: "point", side: "a" } }), RALLY_GUARD_MS);
  assert.equal(guardMs({ event: { type: "point", side: "a", how: "goal" } }), TAP_GUARD_MS);
  assert.equal(guardMs({ event: { type: "point", side: "a", value: 2, how: "two" } }), TAP_GUARD_MS);
  assert.equal(guardMs({ event: { type: "serve", side: "a" } }), TAP_GUARD_MS);
});

test("names after a tap: basketball only when asked for, football always", () => {
  assert.equal(offersName({ ask: "player" }, "basketball", false), false);
  assert.equal(offersName({ ask: "player" }, "basketball", true), true);
  assert.equal(offersName({ ask: "player" }, "football", false), true);
  assert.equal(offersName({}, "football", true), false);
});

test("withPlayer names the last tap, keeps its time, and refuses once something came after", () => {
  let b = newBoard("football", { teamA: "Red FC", teamB: "Blue FC" }, { id: "bf2", now: 1 });
  b = go(b, { type: "clock", run: true, at: 0 });
  b = go(b, { type: "point", side: "a", how: "goal" });
  const at = (b.events[1] as { at?: number }).at;
  const named = withPlayer(b, 1, "  Ravi  ")!;
  assert.ok(named);
  assert.equal((named.events[1] as { player?: string }).player, "Ravi");
  assert.equal((named.events[1] as { at?: number }).at, at);
  assert.deepEqual(deriveBoard(named).players.map((p) => p.name), ["Ravi"]);
  const later = go(named, { type: "point", side: "b", how: "goal" });
  assert.equal(withPlayer(later, 1, "Arjun"), null);
  assert.equal(withPlayer(later, 2, ""), null);
  assert.deepEqual(knownPlayers(withPlayer(later, 2, "Arjun")!, "b"), ["Arjun"]);
  assert.deepEqual(knownPlayers(named, "a"), ["Ravi"]);
});

test("end choices: a walkover only before play, retired after; the preview says the result", () => {
  let b = newBoard("badminton", { teamA: "Asha", teamB: "Ravi" }, { id: "bb1", now: 1 });
  assert.ok(reasonAllowed(b, "walkover", t));
  const w = endPreview(b, endEvent("walkover", "b")!, t);
  assert.deepEqual(w, { result: "Asha won by walkover" });
  b = go(b, { type: "serve", side: "a" });
  b = go(b, { type: "point", side: "a" });
  assert.equal(reasonAllowed(b, "walkover", t), false);
  assert.ok(reasonAllowed(b, "retired", t));
  const r = endPreview(b, endEvent("retired", "a")!, t);
  assert.ok("result" in r && /Ravi won/.test(r.result));
  assert.equal(endEvent("retired", null), null);
  assert.deepEqual(endEvent("time", null), { type: "end" });
});

test("rules: chips match the rules in force, and a change carries only what changed", () => {
  const b = newBoard("football", {}, { id: "bf3", now: 1 });
  const rules = deriveBoard(b).setup.rules;
  assert.ok(optionOn(rules, { label: "2 x 20", rules: { halves: 2, halfMinutes: 20 } }));
  assert.ok(!optionOn(rules, { label: "2 x 25", rules: { halves: 2, halfMinutes: 25 } }));
  assert.deepEqual(rulesDiff(rules, { ...rules, halfMinutes: 25 } as typeof rules), { halfMinutes: 25 });
  const o = newBoard("other", { rules: { values: [1, 2, 3] } }, { id: "bo1", now: 1 });
  assert.ok(optionOn(deriveBoard(o).setup.rules, { label: "+1 +2 +3", rules: { values: [1, 2, 3] } }));
});

test("set time: football types the match clock, basketball the time left", () => {
  let f = newBoard("football", {}, { id: "bf4", now: 1 });
  f = go(f, { type: "clock", run: true, at: 0 });
  f = go(f, { type: "period" });
  const v = deriveBoard(f);
  // 2nd half of 2 x 20: the clock starts at 20:00.
  assert.deepEqual(setTimeMs(v, 27, 30), { ms: 7.5 * 60_000 });
  assert.ok("error" in setTimeMs(v, 12, 0));
  assert.deepEqual(clockParts(v, 0), { minutes: 20, seconds: 0 });
  const k = deriveBoard(newBoard("basketball", {}, { id: "bk1", now: 1 }));
  assert.deepEqual(setTimeMs(k, 7, 42), { ms: (7 * 60 + 42) * 1000 });
  assert.ok("error" in setTimeMs(k, 11, 0));
  assert.ok("error" in setTimeMs(k, 1, 75));
  assert.deepEqual(clockParts(k, 599_400), { minutes: 10, seconds: 0 });
});

test("storage: saves, reads back through sanitizeBoard, keeps 25 and says which went", () => {
  mem.clear();
  const first = newBoard("tennis", { teamA: "A", teamB: "B" }, { id: "bs0", now: 1 });
  saveBoard(first, metaOf(first, deriveBoard(first), 10));
  assert.deepEqual(loadBoard("bs0"), first);
  savePrefs("bs0", { swap: true, names: false });
  assert.deepEqual(loadPrefs("bs0"), { swap: true, names: false });
  let dropped: string[] = [];
  for (let i = 1; i <= MAX_SAVED; i++) {
    const b = newBoard("football", {}, { id: `bs${i}`, now: i + 1 });
    dropped = saveBoard(b, metaOf(b, deriveBoard(b), 10 + i)).dropped;
  }
  assert.deepEqual(dropped, ["bs0"]);
  assert.equal(loadBoard("bs0"), null);
  assert.deepEqual(loadPrefs("bs0"), { swap: false, names: false });
  assert.equal(loadIndex().list.length, MAX_SAVED);
  assert.equal(loadIndex().current, `bs${MAX_SAVED}`);
  const ix = deleteBoard(`bs${MAX_SAVED}`);
  assert.equal(ix.current, null);
  assert.equal(ix.list.length, MAX_SAVED - 1);
  // Anything that is not a board reads as nothing.
  mem.set("tapturf_board_b_bad", JSON.stringify({ v: 1, setup: {}, events: [] }));
  assert.equal(loadBoard("bad"), null);
  mem.set("tapturf_board_v1", "not json");
  assert.deepEqual(loadIndex(), { v: 1, current: null, list: [] });
});
