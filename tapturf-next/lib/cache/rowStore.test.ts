import { test } from "node:test";
import assert from "node:assert/strict";
import { coversColumns, createRowStore, type ListMeta, type ListPart } from "./rowStore";

type Row = { id: string; rating: number | null };
const COLS = "id, rating, name";

/** A database stand-in: a snapshot (version, parts of `size`), a table, and counters. */
function fakeDb(opts: { rows?: number; size?: number } = {}) {
  const db = {
    v: 1,
    /** The last build's stamp (epoch ms); moves on every build, changed or not. */
    built: 1_000,
    /** The version each part was asked for, in order. */
    asked: [] as [number, number][],
    rows: Array.from({ length: opts.rows ?? 1200 }, (_, i): Row => ({ id: `t${String(i).padStart(5, "0")}`, rating: i % 7 === 0 ? null : (i % 50) / 10 })),
    size: opts.size ?? 500,
    partReads: 0,
    liveReads: 0,
    /** Called before each part is read (to rebuild mid-load or fail). */
    onPart: null as null | ((i: number) => Promise<void> | void),
    /** Called after a part was read, before it is answered (to hold an answer back). */
    hold: null as null | ((i: number, v: number) => Promise<void> | void),
    failLive: false,
    meta(over: Partial<ListMeta> = {}): ListMeta {
      return { v: db.v, n: db.rows.length, parts: Math.ceil(db.rows.length / db.size), cols: COLS, age_s: 30, built: db.built, ...over };
    },
  };
  const readPart = async (i: number, v: number): Promise<ListPart<Row> | null> => {
    db.partReads++;
    db.asked.push([i, v]);
    await new Promise((r) => setTimeout(r, 2));
    if (db.onPart) await db.onPart(i);
    const parts = Math.ceil(db.rows.length / db.size);
    const out = i < 0 || i >= parts ? null : { v: db.v, n: db.rows.length, parts, rows: db.rows.slice(i * db.size, (i + 1) * db.size).map((r) => ({ ...r })) };
    if (db.hold) await db.hold(i, db.v);
    return out;
  };
  const readLive = async (): Promise<Row[]> => {
    db.liveReads++;
    await new Promise((r) => setTimeout(r, 2));
    if (db.failLive) throw new Error("Paged fetch failed at row 0");
    return db.rows.map((r) => ({ ...r }));
  };
  return { db, readPart, readLive };
}

function setup(o: { rows?: number; size?: number; clock?: { t: number } } = {}) {
  const f = fakeDb(o);
  const logs: { msg: string; extra: Record<string, unknown> }[] = [];
  const store = createRowStore<Row>({
    cols: COLS,
    readPart: f.readPart,
    readLive: f.readLive,
    now: o.clock ? () => o.clock!.t : undefined,
    log: (msg, extra) => logs.push({ msg, extra }),
  });
  return { ...f, store, logs };
}

test("concurrent callers make one load per version", async () => {
  const { db, store, logs } = setup();
  const got = await Promise.all(Array.from({ length: 20 }, () => store.rowsFor(db.meta())));
  assert.equal(db.partReads, 3, "parts 0, 1 and 2, once");
  assert.ok(got.every((g) => g === got[0]), "every caller gets the same copy");
  assert.equal(got[0].length, 1200);
  assert.equal(db.liveReads, 0, "no table read");
  assert.equal(logs.filter((l) => l.msg === "turf snapshot read").length, 1);
  // Later callers of that version read nothing.
  await store.rowsFor(db.meta());
  assert.equal(db.partReads, 3);
});

test("a new version always loads, however recent the copy (a purge is never hidden)", async () => {
  const { db, store } = setup();
  const a = await store.rowsFor(db.meta());
  db.v = 2;
  db.rows[0] = { ...db.rows[0], rating: 9 };
  const b = await store.rowsFor(db.meta());
  assert.notEqual(a, b);
  assert.equal(db.partReads, 6);
  assert.equal(b.find((r) => r.id === "t00000")?.rating, 9);
});

test("a newer copy beats an older meta (route handlers get stale-while-revalidate metas)", async () => {
  const { db, store } = setup();
  const old = db.meta();
  db.v = 3;
  const fresh = await store.rowsFor(db.meta());
  assert.equal(await store.rowsFor(old), fresh);
  assert.equal(db.partReads, 3);
});

test("an older meta reads part 0's build, newer than it, and follows part 0's part count", async () => {
  const { db, store } = setup();
  const stale = db.meta({ v: 1, parts: 2 });
  db.v = 2;
  db.rows.push(...Array.from({ length: 400 }, (_, i) => ({ id: `u${i}`, rating: 1 })));
  const rows = await store.rowsFor(stale);
  assert.equal(rows.length, 1600, "4 parts, as part 0 says");
  assert.equal(db.partReads, 4);
});

test("parts from two builds throw and keep the previous copy", async () => {
  const { db, store } = setup();
  const v1 = await store.rowsFor(db.meta());
  db.v = 2;
  db.onPart = (i) => {
    if (i === 1) db.v = 3; // rebuilt between part 0 and part 1
  };
  await assert.rejects(store.rowsFor(db.meta({ v: 2 })), /part 1 is not from v2/);
  db.onPart = null;
  assert.equal(await store.rowsFor(db.meta({ v: 1 })), v1, "the old copy still serves an old meta");
  const v3 = await store.rowsFor(db.meta());
  assert.equal(v3.length, 1200, "the next caller loads the current build");
});

test("a missing or short part throws; nothing partial is kept", async () => {
  const { db, store } = setup();
  db.onPart = (i) => {
    if (i === 2) db.size = 1000; // part 2 of 500s no longer exists
  };
  await assert.rejects(store.rowsFor(db.meta()), /part 2 is not from v1/);
  db.onPart = null;
  db.size = 500;
  // A part that lies about its rows: total differs from n.
  const short = setup();
  const readPart = short.readPart;
  const store2 = createRowStore<Row>({
    cols: COLS,
    readLive: short.readLive,
    log: () => {},
    readPart: async (i, v) => {
      const p = await readPart(i, v);
      return p && i === 1 ? { ...p, rows: p.rows.slice(1) } : p;
    },
  });
  await assert.rejects(store2.rowsFor(short.db.meta()), /has 1199 rows, not 1200/);
  assert.equal(db.liveReads + short.db.liveReads, 0, "no fallback to the table on a bad snapshot");
});

test("part 0 older than the meta, or an empty build, throws", async () => {
  const { db, store } = setup();
  await assert.rejects(store.rowsFor(db.meta({ v: 5 })), /older than v5/);
  const empty = setup({ rows: 0 });
  await assert.rejects(empty.store.rowsFor(empty.db.meta({ parts: 1 })), /part 0 missing/);
});

test("a failure keeps serving the old copy and the next caller tries again", async () => {
  const { db, store } = setup();
  const v1 = await store.rowsFor(db.meta());
  db.v = 2;
  let fail = true;
  db.onPart = () => {
    if (fail) throw new Error("TimeoutError: The operation was aborted due to timeout");
  };
  await assert.rejects(store.rowsFor(db.meta()), /TimeoutError/);
  assert.equal(db.partReads, 4, "the failed load stopped at its first part (one failure on the breaker)");
  assert.equal(await store.rowsFor(db.meta({ v: 1 })), v1);
  fail = false;
  const v2 = await store.rowsFor(db.meta());
  assert.notEqual(v2, v1);
});

test("an older load that ends after a newer one does not replace it", async () => {
  const { db, store } = setup({ rows: 300 }); // one part
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  db.hold = async (_i, v) => {
    if (v === 1) await gate;
  };
  const slow = store.rowsFor(db.meta()); // reads v1's part, answer held back
  await new Promise((r) => setTimeout(r, 10));
  db.v = 2;
  const v2 = await store.rowsFor(db.meta());
  release();
  const late = await slow;
  assert.equal(late, v2, "the late v1 load hands out the newer copy");
  assert.equal(await store.rowsFor(db.meta({ v: 1 })), v2, "and v2 stays the copy");
  assert.equal(db.partReads, 2);
});

test("part 0 is asked for the meta's version, later parts for part 0's", async () => {
  const { db, store } = setup();
  const stale = db.meta();
  db.v = 4; // built again after the meta was read
  await store.rowsFor(stale);
  assert.deepEqual(db.asked, [[0, 1], [1, 4], [2, 4]]);
});

test("a snapshot without a column the app selects: the table, once per build", async () => {
  const { db, store, logs } = setup();
  const other = db.meta({ cols: "id, rating" });
  const got = await Promise.all([store.rowsFor(other), store.rowsFor(other), store.rowsFor(other)]);
  assert.equal(db.liveReads, 1);
  assert.equal(db.partReads, 0, "the snapshot is not read");
  assert.ok(got.every((g) => g === got[0]));
  await store.rowsFor(other);
  assert.equal(db.liveReads, 1, "same build: no second read");
  db.v = 2;
  db.built += 60_000;
  await store.rowsFor(db.meta({ cols: "id, rating" }));
  assert.equal(db.liveReads, 2, "a new version reads again");
  const line = logs.find((l) => l.msg === "turf full read");
  assert.deepEqual([line?.extra.src, line?.extra.reason, line?.extra.v, line?.extra.built], ["table", "columns missing", 1, 1_000]);
});

test("without a usable snapshot, every build reads again even when the version stays (a purge is never hidden)", async () => {
  // Code that selects a column the snapshot lacks: an edit of only that
  // column leaves the snapshot's hash, and so its version, unchanged. The
  // list post that follows still builds, which moves built.
  const { db, store } = setup();
  const cols = "id, rating";
  const a = await store.rowsFor(db.meta({ cols }));
  db.rows[0] = { ...db.rows[0], rating: 9 };
  assert.equal(await store.rowsFor(db.meta({ cols })), a, "no build yet: the same copy");
  db.built += 60_000; // the post's build: version unchanged
  const b = await store.rowsFor(db.meta({ cols }));
  assert.equal(db.liveReads, 2);
  assert.equal(b.find((r) => r.id === "t00000")?.rating, 9, "the purge gets the edit");
});

test("without a usable snapshot, an older build's meta takes the newer copy (no read ping-pong)", async () => {
  const { db, store } = setup();
  const cols = "id, rating";
  const old = db.meta({ cols }); // a route handler's cached meta
  db.built += 60_000;
  const fresh = await store.rowsFor(db.meta({ cols })); // a regeneration's meta
  assert.equal(await store.rowsFor(old), fresh);
  assert.equal(await store.rowsFor(db.meta({ cols })), fresh);
  assert.equal(db.liveReads, 1);
  // The next build's read: callers for it join it, the old meta keeps the copy it has.
  db.built += 60_000;
  const [n1, o, n2] = await Promise.all([store.rowsFor(db.meta({ cols })), store.rowsFor(old), store.rowsFor(db.meta({ cols }))]);
  assert.equal(db.liveReads, 2);
  assert.equal(n1, n2);
  assert.notEqual(n1, fresh);
  assert.equal(o, fresh);
});

test("a snapshot with extra columns is used (a migration that adds a column goes first)", async () => {
  const { db, store } = setup();
  const rows = await store.rowsFor(db.meta({ cols: `${COLS}, surface_type` }));
  assert.equal(rows.length, 1200);
  assert.deepEqual([db.partReads, db.liveReads], [3, 0]);
});

test("column lists: the snapshot must carry every app column, in any order, extras allowed", () => {
  assert.equal(coversColumns("id, rating, name", "name,id ,rating"), true);
  assert.equal(coversColumns("id, rating, name, surface_type", "id, rating, name"), true);
  assert.equal(coversColumns("id, rating", "id, rating, name"), false);
  assert.equal(coversColumns("", "id"), false);
});

test("no snapshot, or a stale one: the table, reused for an hour per version", async () => {
  const clock = { t: 1_000_000 };
  const { db, store, logs } = setup({ clock });
  await store.rowsFor(null);
  await store.rowsFor(null);
  assert.equal(db.liveReads, 1);
  clock.t += 3_599_000;
  await store.rowsFor(null);
  assert.equal(db.liveReads, 1, "within the hour");
  clock.t += 2_000;
  await store.rowsFor(null);
  assert.equal(db.liveReads, 2, "after the hour");
  await store.rowsFor(db.meta({ v: 0 }));
  assert.equal(db.liveReads, 2, "version 0 is no snapshot: the same copy as null");
  await store.rowsFor(db.meta({ age_s: 10_800 }));
  await store.rowsFor(db.meta({ age_s: 11_000 }));
  assert.equal(db.liveReads, 3, "a builder stuck for 3 h: the table, once for that version");
  assert.deepEqual(logs.filter((l) => l.msg === "turf full read").map((l) => l.extra.reason), ["no snapshot", "no snapshot", "snapshot stale"]);
  assert.equal(db.partReads, 0);
});

test("a usable snapshot after table reads: the snapshot", async () => {
  const { db, store } = setup();
  await store.rowsFor(null);
  await store.rowsFor(db.meta());
  assert.deepEqual([db.liveReads, db.partReads], [1, 3]);
});

test("an empty or failed table read throws and stores nothing", async () => {
  const { db, store } = setup({ rows: 0 });
  await assert.rejects(store.rowsFor(null), /no active turfs/);
  db.rows = [{ id: "a", rating: 1 }];
  db.failLive = true;
  await assert.rejects(store.rowsFor(null), /Paged fetch failed/);
  db.failLive = false;
  assert.equal((await store.rowsFor(null)).length, 1, "the next caller reads again");
});

test("kept rows are sorted once and frozen", async () => {
  const f = fakeDb({ rows: 30, size: 10 });
  const store = createRowStore<Row>({
    cols: COLS,
    readPart: f.readPart,
    readLive: f.readLive,
    log: () => {},
    order: (a, b) => (b.rating ?? Infinity) - (a.rating ?? Infinity) || a.id.localeCompare(b.id),
  });
  const rows = await store.rowsFor(f.db.meta());
  assert.ok(Object.isFrozen(rows));
  assert.equal(rows[0].rating, null, "no rating first");
  for (let i = 1; i < rows.length; i++) assert.ok((rows[i - 1].rating ?? Infinity) >= (rows[i].rating ?? Infinity));
  assert.throws(() => (rows as Row[]).sort(), TypeError, "callers cannot sort it in place");
});
