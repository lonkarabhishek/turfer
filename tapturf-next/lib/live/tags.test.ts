import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_TAGS_MAX, checkLiveTags, createTagLookup, liveTagNames, withTags } from "./tags";

const board = () => ({
  kind: "board",
  setup: { teamA: "Asha", teamB: "Ravi", tags: { a: { u: "asha" }, b: { u: "ravi_old" } } },
  events: [
    { type: "point", side: "a", player: "Asha", tag: { u: "asha" } },
    { type: "point", side: "b", player: "Ravi", tag: { u: "ravi_old" } },
    { type: "rename", side: "b", name: "Ravi", tag: { u: "hidden" } },
    { type: "point", side: "a", player: "Sam" },
    { type: "card", side: "a", color: "yellow", player: "X", tag: null },
  ],
});

test("liveTagNames: every distinct tagged username, events and sides", () => {
  assert.deepEqual(liveTagNames(board()).sort(), ["asha", "hidden", "ravi_old"]);
  assert.deepEqual(liveTagNames({ events: [] }), []);
  assert.deepEqual(liveTagNames(null), []);
  // Not a tag: wrong shape or bad username.
  assert.deepEqual(liveTagNames({ tag: { u: "AB" }, x: { tag: "asha" } }), []);
});

test("withTags: current names kept, others removed; rename keeps the key as null", () => {
  const before = board();
  const out = withTags(before, new Map([["asha", "asha"], ["ravi_old", "ravi"]]));
  assert.deepEqual(out.setup.tags, { a: { u: "asha" }, b: { u: "ravi" } });
  assert.deepEqual(out.events[0], { type: "point", side: "a", player: "Asha", tag: { u: "asha" } });
  assert.deepEqual(out.events[1], { type: "point", side: "b", player: "Ravi", tag: { u: "ravi" } });
  assert.deepEqual(out.events[2], { type: "rename", side: "b", name: "Ravi", tag: null });
  assert.deepEqual(out.events[3], { type: "point", side: "a", player: "Sam" });
  assert.equal(out.events[4].tag, null);
  // The input is not changed.
  assert.deepEqual(before, board());

  const none = withTags(board(), new Map());
  assert.equal("tags" in none.setup, false);
  assert.equal("tag" in none.events[0], false);
  assert.equal(none.events[2].tag, null);
  // A pick tag in the cricket shape, and tagPlayer (whose tag key is required).
  const cricket = withTags({ events: [{ type: "setBatter", name: "A", tag: { u: "gone" } }, { type: "tagPlayer", team: "a", player: "p1", tag: { u: "gone" } }] }, new Map());
  assert.deepEqual(cricket.events, [{ type: "setBatter", name: "A" }, { type: "tagPlayer", team: "a", player: "p1", tag: null }]);
});

test("createTagLookup: remembers answers for the ttl, a failure is null and not remembered", async () => {
  let t = 0;
  const asked: string[][] = [];
  let fail = false;
  const lookup = createTagLookup(
    async (names) => {
      asked.push(names);
      if (fail) return null;
      return names.filter((n) => n !== "hidden").map((n) => ({ asked: n, u: n === "old" ? "new" : n }));
    },
    { ttlMs: 30_000, now: () => t },
  );
  assert.deepEqual([...(await lookup(["asha", "old", "hidden"]))!], [["asha", "asha"], ["old", "new"]]);
  assert.deepEqual([...(await lookup(["asha", "hidden"]))!], [["asha", "asha"]]);
  assert.equal(asked.length, 1, "second call from memory");
  t += 31_000;
  fail = true;
  assert.equal(await lookup(["asha"]), null);
  fail = false;
  assert.deepEqual([...(await lookup(["asha"]))!], [["asha", "asha"]]);
  assert.equal(asked.length, 3);
});

test("checkLiveTags never throws: failure or too many names removes every tag", async () => {
  const m = board();
  const empty = { events: [] };
  assert.equal(await checkLiveTags(empty, async () => { throw new Error("not called"); }), empty, "no tags: no lookup, same match");
  const failed = await checkLiveTags(m, async () => { throw new Error("db down"); });
  assert.deepEqual(liveTagNames(failed), []);
  const nulls = await checkLiveTags(m, async () => null);
  assert.deepEqual(liveTagNames(nulls), []);

  const many = { events: Array.from({ length: LIVE_TAGS_MAX + 1 }, (_, i) => ({ type: "point", side: "a", player: `P${i}`, tag: { u: `player${i}` } })) };
  let called = false;
  const out = await checkLiveTags(many, async () => { called = true; return new Map(); });
  assert.equal(called, false);
  assert.deepEqual(liveTagNames(out), []);

  const ok = await checkLiveTags(m, async (names) => new Map(names.map((n) => [n, n])));
  assert.deepEqual(liveTagNames(ok).sort(), ["asha", "hidden", "ravi_old"]);
});
