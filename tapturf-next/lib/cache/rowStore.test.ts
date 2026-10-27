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

type Log = { msg: string; extra: Record<string, unknown>; level: string };

/** A store on the fake database, with a fake clock and a fixed random (so waits are exact). */
function setup(
  o: {
    rows?: number;
    size?: number;
    clock?: { t: number };
    random?: number;
    maxPartReads?: number;
    readCachedPart?: (i: number, v: number) => Promise<ListPart<Row> | null>;
  } = {},
) {
  const f = fakeDb(o);
  const logs: Log[] = [];
  const clock = o.clock ?? { t: 1_000_000 };
  const store = createRowStore<Row>({
    cols: COLS,
    readPart: f.readPart,
    readLive: f.readLive,
    readCachedPart: o.readCachedPart,
    maxPartReads: o.maxPartReads,
    now: () => clock.t,
    random: () => o.random ?? 0,
    log: (msg, extra, level = "info") => logs.push({ msg, extra, level }),
  });
  return { ...f, store, logs, clock };
}

const failures = (logs: Log[]) => logs.filter((l) => l.msg.startsWith("turf rows: read failed"));

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

test("parts from two builds are never mixed: the previous copy serves, and the next caller loads the current build at once", async () => {
  const { db, store, logs } = setup();
  const v1 = await store.rowsFor(db.meta());
  db.v = 2;
  db.onPart = (i) => {
    if (i === 1) db.v = 3; // rebuilt between part 0 and part 1
  };
  const got = await store.read(db.meta({ v: 2 }));
  assert.deepEqual([got.rows === v1, got.v, got.stale], [true, 1, true], "v1, marked stale");
  assert.match(String(failures(logs)[0]?.extra.error), /part 1 is not from v2/);
  assert.equal(failures(logs)[0]?.extra.retryInMs, 0, "no wait: a rebuild is no sign of a slow database");
  db.onPart = null;
  assert.equal(await store.rowsFor(db.meta({ v: 1 })), v1, "the old copy still serves an old meta");
  const v3 = await store.read(db.meta());
  assert.deepEqual([v3.rows.length, v3.v, v3.stale], [1200, 3, false], "the next caller loads the current build");
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

test("a failed read serves the old copy, logs once, and this process waits before reading again", async () => {
  const { db, store, logs, clock } = setup();
  const v1 = await store.rowsFor(db.meta());
  db.v = 2;
  let fail = true;
  db.onPart = () => {
    if (fail) throw new Error("TimeoutError: The operation was aborted due to timeout");
  };
  // A burst: every caller gets v1, from one failed load.
  const burst = await Promise.all(Array.from({ length: 10 }, () => store.read(db.meta())));
  assert.ok(burst.every((r) => r.rows === v1 && r.v === 1 && r.stale), "v1, stale, for everyone");
  assert.equal(db.partReads, 4, "the failed load stopped at its first part (one failure on the breaker)");
  assert.equal(failures(logs).length, 1, "one log line for the burst");
  const line = failures(logs)[0];
  assert.deepEqual([line.level, line.extra.want, line.extra.have, line.extra.retryInMs], ["warn", 2, 1, 20_000]);
  // Within the wait: the old copy at once, no read, no new log line.
  clock.t += 19_000;
  fail = false;
  assert.equal((await store.read(db.meta())).rows, v1);
  assert.equal(db.partReads, 4, "no read while waiting");
  assert.equal(failures(logs).length, 1);
  assert.equal(await store.rowsFor(db.meta({ v: 1 })), v1, "v1 is still fresh for a v1 meta");
  clock.t += 1_000;
  const v2 = await store.read(db.meta());
  assert.deepEqual([v2.v, v2.stale], [2, false], "after the wait: the new version");
  assert.notEqual(v2.rows, v1);
});

test("the wait is 1 to 1.5 times retryAfterMs, so processes do not retry in step", async () => {
  const { db, store, logs, clock } = setup({ random: 1 });
  await store.rowsFor(db.meta());
  db.v = 2;
  db.onPart = () => {
    throw new Error("TimeoutError");
  };
  await store.read(db.meta());
  assert.equal(failures(logs)[0].extra.retryInMs, 30_000);
  db.onPart = null;
  clock.t += 29_999;
  assert.equal((await store.read(db.meta())).v, 1, "still waiting");
  clock.t += 1;
  assert.equal((await store.read(db.meta())).v, 2);
});

test("a retry starts at the part that failed: parts already read are not read again", async () => {
  const { db, store, clock, logs } = setup();
  await store.rowsFor(db.meta());
  db.v = 2;
  db.asked = [];
  let fail = true;
  db.onPart = (i) => {
    if (fail && i === 2) throw new Error("TimeoutError");
  };
  assert.equal((await store.read(db.meta())).stale, true);
  assert.deepEqual(db.asked, [[0, 2], [1, 2], [2, 2]]);
  fail = false;
  clock.t += 20_000;
  const v2 = await store.read(db.meta());
  assert.deepEqual([v2.v, v2.stale, v2.rows.length], [2, false, 1200]);
  assert.deepEqual(db.asked.slice(3), [[2, 2]], "only part 2 again");
  const read = logs.find((l) => l.msg === "turf snapshot read" && l.extra.v === 2);
  assert.equal(read?.extra.reused, 2, "the log says two parts were reused");
});

test("a resumed load never mixes builds", async () => {
  const { db, store, clock } = setup();
  const v1 = await store.rowsFor(db.meta());
  db.v = 2;
  let fail = true;
  db.onPart = (i) => {
    if (fail && i === 2) throw new Error("TimeoutError");
  };
  await store.read(db.meta()); // parts 0 and 1 of v2 kept
  fail = false;
  // Rebuilt to v3 with other rows; a caller still holding the v2 meta resumes v2.
  db.v = 3;
  db.rows = db.rows.map((r) => ({ ...r, rating: 1 }));
  clock.t += 20_000;
  db.asked = [];
  const r = await store.read(db.meta({ v: 2 }));
  assert.deepEqual([r.rows === v1, r.stale], [true, true], "part 2 came from v3: the v2 parts are dropped, v1 serves");
  assert.deepEqual(db.asked, [[2, 2]]);
  // The next caller starts over at part 0 (no wait after a mismatch) and gets v3 whole.
  const v3 = await store.read(db.meta());
  assert.deepEqual([v3.v, v3.stale], [3, false]);
  assert.ok(v3.rows.every((x) => x.rating === 1), "every row from v3");
  assert.deepEqual(db.asked.slice(1), [[0, 3], [1, 3], [2, 3]]);
});

test("a newer meta does not resume an older build's parts", async () => {
  const { db, store, clock } = setup();
  await store.rowsFor(db.meta());
  db.v = 2;
  let fail = true;
  db.onPart = (i) => {
    if (fail && i === 2) throw new Error("TimeoutError");
  };
  await store.read(db.meta());
  fail = false;
  db.v = 3;
  clock.t += 20_000;
  db.asked = [];
  const v3 = await store.read(db.meta());
  assert.equal(v3.v, 3);
  assert.deepEqual(db.asked, [[0, 3], [1, 3], [2, 3]]);
});

test("no copy in this process: an older version from the shared cache, never the database", async () => {
  // The shared cache holds v1 whole; the database is at v3 and failing.
  const cachedV1 = fakeDb();
  const cached = new Map<string, ListPart<Row>>();
  for (let i = 0; i < 3; i++) cached.set(`1/${i}`, (await cachedV1.readPart(i, 1))!);
  const cacheAsks: [number, number][] = [];
  const { db, store, logs, clock } = setup({
    readCachedPart: async (i, v) => {
      cacheAsks.push([i, v]);
      return cached.get(`${v}/${i}`) ?? null;
    },
  });
  db.v = 3;
  db.onPart = () => {
    throw new Error("TimeoutError");
  };
  const r = await store.read(db.meta());
  assert.deepEqual([r.v, r.stale, r.rows.length], [1, true, 1200], "v1 from the cache, stale");
  assert.deepEqual(cacheAsks, [[0, 3], [0, 2], [0, 1], [1, 1], [2, 1]], "v3 and v2 missing, then v1 whole");
  assert.equal(failures(logs)[0].extra.have, 1);
  // While waiting, the kept v1 serves with no read at all.
  const reads = db.partReads;
  assert.equal((await store.read(db.meta())).rows, r.rows);
  assert.equal(db.partReads, reads);
  assert.equal(cacheAsks.length, 5, "kept: the cache is not read again");
  clock.t += 20_000;
  db.onPart = null;
  assert.equal((await store.read(db.meta())).v, 3);
});

test("while this process waits, a render that can read the shared cache still gets the wanted version (fresh)", async () => {
  // A regeneration's read failed (it cannot read the shared cache); the
  // list post's warm-up has since put v2 there; a page's first render can.
  const cached = new Map<string, ListPart<Row>>();
  let cacheReadable = false;
  const { db, store, logs } = setup({
    readCachedPart: async (i, v) => (cacheReadable ? (cached.get(`${v}/${i}`) ?? null) : null),
  });
  db.v = 2;
  db.onPart = () => {
    throw new Error("TimeoutError");
  };
  await assert.rejects(store.read(db.meta()), /TimeoutError/);
  const reads = db.partReads;
  const whole = fakeDb();
  whole.db.v = 2;
  for (let i = 0; i < 3; i++) cached.set(`2/${i}`, (await whole.readPart(i, 2))!);
  cacheReadable = true;
  const r = await store.read(db.meta());
  assert.deepEqual([r.v, r.stale, r.rows.length], [2, false, 1200], "v2 from the cache, fresh");
  assert.equal(db.partReads, reads, "still no database read while waiting");
  assert.equal((await store.read(db.meta())).rows, r.rows, "kept");
  assert.equal(failures(logs).length, 1);
});

test("no copy anywhere: the error, then the same error at once while waiting (no database call)", async () => {
  const { db, store, logs, clock } = setup({ readCachedPart: async () => null });
  db.onPart = () => {
    throw new Error("TimeoutError: The operation was aborted due to timeout");
  };
  await assert.rejects(store.read(db.meta()), /TimeoutError/);
  assert.equal(failures(logs)[0].level, "error");
  const reads = db.partReads;
  await assert.rejects(store.read(db.meta()), /TimeoutError/);
  assert.equal(db.partReads, reads, "no read while waiting");
  assert.equal(failures(logs).length, 1);
  clock.t += 20_000;
  db.onPart = null;
  assert.equal((await store.read(db.meta())).rows.length, 1200);
});

test("at most one part read in flight, and a load a newer version overtakes hands its callers over", async () => {
  const { db, store } = setup();
  let inFlight = 0;
  let most = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  db.onPart = () => {
    inFlight++;
    most = Math.max(most, inFlight);
  };
  db.hold = async (i, v) => {
    if (i === 1 && v === 1) await gate; // v1's part 1, answered late
    inFlight--;
  };
  const old = store.read(db.meta()); // v1: part 0, then part 1 held
  await new Promise((r) => setTimeout(r, 20));
  db.v = 2;
  const newer = store.read(db.meta()); // v2 waits for the one read slot
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(inFlight, 1, "v2's part 0 waits while v1's part 1 is out");
  release();
  const [a, b] = await Promise.all([old, newer]);
  assert.equal(most, 1, "never two part reads at once");
  assert.equal(a.rows, b.rows, "the v1 callers get v2");
  assert.equal(b.v, 2);
  assert.ok(!db.asked.some(([i, v]) => i === 2 && v === 1), "v1's part 2 was never read");
});

test("callers for the build part 0 named join the load in flight", async () => {
  const { db, store } = setup();
  const old = db.meta();
  db.v = 2; // part 0 will say v2
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  db.onPart = async (i) => {
    if (i === 1) await gate;
  };
  const a = store.read(old);
  await new Promise((r) => setTimeout(r, 20));
  const b = store.read(db.meta());
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.rows, rb.rows);
  assert.equal(db.partReads, 3, "one load for both");
});

test("orKept: a failed version read serves this process's copy (logged once per wait), or rethrows", async () => {
  const { db, store, logs, clock } = setup();
  const err = new Error("Turf list version read failed");
  assert.throws(() => store.orKept(err), /version read failed/, "nothing kept yet");
  const v1 = await store.rowsFor(db.meta());
  const k = store.orKept(err);
  assert.deepEqual([k.rows === v1, k.v, k.stale], [true, 1, true]);
  store.orKept(err);
  const lines = () => logs.filter((l) => l.msg.includes("version read failed")).length;
  assert.equal(lines(), 1);
  clock.t += 20_000;
  store.orKept(err);
  assert.equal(lines(), 2);
});

test("an older load that ends after a newer one does not replace it", async () => {
  const { db, store } = setup({ rows: 300, maxPartReads: 2 }); // one part; the held read and v2's both out
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
  const { db, store, clock } = setup({ rows: 0 });
  await assert.rejects(store.rowsFor(null), /no active turfs/);
  db.rows = [{ id: "a", rating: 1 }];
  await assert.rejects(store.rowsFor(null), /no active turfs/, "while waiting: the same error, no read");
  assert.equal(db.liveReads, 1);
  clock.t += 20_000;
  db.failLive = true;
  await assert.rejects(store.rowsFor(null), /Paged fetch failed/);
  db.failLive = false;
  clock.t += 20_000;
  assert.equal((await store.rowsFor(null)).length, 1, "after the wait the next caller reads again");
});

test("a failed table read serves the last table copy, stale", async () => {
  const { db, store } = setup();
  const cols = "id, rating";
  const a = await store.rowsFor(db.meta({ cols }));
  db.built += 60_000;
  db.failLive = true;
  const r = await store.read(db.meta({ cols }));
  assert.deepEqual([r.rows === a, r.stale], [true, true]);
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
