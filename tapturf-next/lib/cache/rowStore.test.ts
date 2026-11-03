import { test } from "node:test";
import assert from "node:assert/strict";
import { coversColumns, createRowStore, MAX_COPY_AGE_MS, type ListMeta, type ListPart } from "./rowStore";
import { isUnavailable, RETRY_AFTER_S, Unavailable, UNAVAILABLE_HEADERS, UNAVAILABLE_HTML } from "./unavailable";

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

/** A point a load reaches: `hit()` marks it, `reached` resolves once it has (no fixed sleeps, so a busy machine can't reorder the steps). */
function mark() {
  let hit: () => void = () => {};
  const reached = new Promise<void>((r) => (hit = r));
  return { hit, reached };
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

test("no copy in this process: an older version in the shared cache is never served (its age is unknown), nor read from the database", async () => {
  // The shared cache holds v1 and v2 whole; the database is at v3 and failing.
  const cached = new Map<string, ListPart<Row>>();
  for (const v of [1, 2]) {
    const f = fakeDb();
    f.db.v = v;
    for (let i = 0; i < 3; i++) cached.set(`${v}/${i}`, (await f.readPart(i, v))!);
  }
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
  const e = await store.read(db.meta()).then(() => null, (x: unknown) => x);
  assert.ok(isUnavailable(e), "Unavailable, not v2 or v1");
  assert.match((e as Error).message, /TimeoutError/, "the read's error is in it");
  assert.deepEqual(cacheAsks, [[0, 3]], "only the wanted version is asked for");
  assert.equal(failures(logs)[0].msg, "turf rows: read failed, no copy to serve");
  // While waiting: Unavailable at once, no database read.
  const reads = db.partReads;
  await assert.rejects(store.read(db.meta()), (x: unknown) => isUnavailable(x));
  assert.equal(db.partReads, reads);
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

test("a load that part 0 moved to a newer build judges its fallback by that build: no older copy goes out unmarked", async () => {
  // The shared cache holds v1 whole; this process has no copy.
  const cachedV1 = fakeDb();
  const cached = new Map<string, ListPart<Row>>();
  for (let i = 0; i < 3; i++) cached.set(`1/${i}`, (await cachedV1.readPart(i, 1))!);
  const cacheAsks: [number, number][] = [];
  const { db, store } = setup({
    readCachedPart: async (i, v) => {
      cacheAsks.push([i, v]);
      return cached.get(`${v}/${i}`) ?? null;
    },
  });
  const old = db.meta(); // v1
  db.v = 2; // part 0 will say v2
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const atPart1 = mark();
  db.onPart = async (i) => {
    if (i === 1) {
      atPart1.hit();
      await gate;
      throw new Error("TimeoutError");
    }
  };
  const a = store.read(old);
  await atPart1.reached;
  const b = store.read(db.meta()); // a v2 render joins the load part 0 moved to v2
  release();
  const [ra, rb] = await Promise.allSettled([a, b]);
  assert.equal(db.partReads, 2, "one load for both");
  assert.ok(rb.status === "rejected" && isUnavailable(rb.reason), "the v2 caller never gets v1");
  assert.ok(ra.status === "rejected" && isUnavailable(ra.reason), "nor the v1 caller (v1 in the cache is of unknown age too)");
  assert.deepEqual(cacheAsks, [[0, 2]], "the shared cache is asked for v2, part 0 named it");
});

test("loads that keep failing are logged as errors once they have lasted escalateAfterMs; a load that succeeds starts over", async () => {
  const { db, store, logs, clock } = setup();
  await store.rowsFor(db.meta());
  db.v = 2;
  let fail = true;
  db.onPart = () => {
    if (fail) throw new Error("Turf list part 0 read failed: permission denied for function turf_list_part (42501)");
  };
  const levels = () => failures(logs).map((l) => l.level);
  // One failed load a minute for ten minutes, each serving v1 stale.
  for (let k = 0; k <= 10; k++) {
    const r = await store.read(db.meta());
    assert.deepEqual([r.v, r.stale], [1, true]);
    clock.t += 60_000;
  }
  assert.deepEqual(levels(), [...Array(10).fill("warn"), "error"], "warnings for ten minutes, then an error");
  assert.equal(failures(logs).at(-1)?.extra.failingForMs, 600_000);
  fail = false;
  assert.equal((await store.read(db.meta())).v, 2);
  db.v = 3;
  fail = true;
  await store.read(db.meta());
  assert.equal(levels().at(-1), "warn", "a new failure after a success is a warning again");
  assert.equal(failures(logs).at(-1)?.extra.failingForMs, 0);
});

test("no copy anywhere: the error, then the same error at once while waiting (no database call)", async () => {
  const { db, store, logs, clock } = setup({ readCachedPart: async () => null });
  db.onPart = () => {
    throw new Error("TimeoutError: The operation was aborted due to timeout");
  };
  await assert.rejects(store.read(db.meta()), (e: unknown) => isUnavailable(e) && /TimeoutError/.test((e as Error).message));
  assert.equal(failures(logs)[0].level, "error");
  const reads = db.partReads;
  await assert.rejects(store.read(db.meta()), (e: unknown) => isUnavailable(e) && /TimeoutError/.test((e as Error).message));
  assert.equal(db.partReads, reads, "no read while waiting");
  assert.equal(failures(logs).length, 1);
  clock.t += 20_000;
  db.onPart = null;
  assert.equal((await store.read(db.meta())).rows.length, 1200);
});

/** The shared cache holding the given versions whole (each the fake database's rows at that version), and every ask of it. */
async function sharedCacheOf(versions: number[]) {
  const cached = new Map<string, ListPart<Row>>();
  for (const v of versions) {
    const f = fakeDb();
    f.db.v = v;
    for (let i = 0; i < 3; i++) cached.set(`${v}/${i}`, (await f.readPart(i, v))!);
  }
  const asks: [number, number][] = [];
  const readCachedPart = async (i: number, v: number) => {
    asks.push([i, v]);
    return cached.get(`${v}/${i}`) ?? null;
  };
  return { cached, asks, readCachedPart };
}

test("a copy stands in for a failed read only while young: at most an hour since this process knew it current", async () => {
  const HOUR = 3_600_000;
  assert.equal(MAX_COPY_AGE_MS, HOUR);
  const { db, store, logs, clock } = setup();
  const v1 = await store.read(db.meta());
  assert.deepEqual([v1.stale, v1.asOf], [false, clock.t], "a fresh read is current as of now");
  // An idle hour, then the list moves and its parts time out.
  clock.t += HOUR;
  db.v = 2;
  db.onPart = () => {
    throw new Error("TimeoutError: The operation was aborted due to timeout");
  };
  const r = await store.read(db.meta());
  assert.deepEqual([r.rows === v1.rows, r.v, r.stale, r.asOf], [true, 1, true, v1.asOf], "exactly an hour: still served, marked stale, its age kept");
  assert.equal(failures(logs).at(-1)?.extra.ageMs, HOUR);
  // A millisecond past the hour (after the wait), the same copy is too old.
  clock.t += 30_001;
  const e = await store.read(db.meta()).then(() => null, (x: unknown) => x);
  assert.ok(isUnavailable(e), "too old: Unavailable, not the hour-old prices and hours");
  const line = failures(logs).at(-1)!;
  assert.deepEqual([line.msg, line.level, line.extra.kept, line.extra.keptAgeMs], ["turf rows: read failed, no copy to serve", "error", 1, HOUR + 30_001]);
  // While waiting: the same, at once, with no database read.
  const reads = db.partReads;
  await assert.rejects(store.read(db.meta()), (x: unknown) => isUnavailable(x));
  assert.equal(db.partReads, reads);
  // The database is back: the new version, fresh.
  clock.t += 30_000;
  db.onPart = null;
  const v2 = await store.read(db.meta());
  assert.deepEqual([v2.v, v2.stale, v2.asOf], [2, false, clock.t]);
});

test("every read that finds the copy current keeps it young: a busy process serves it through a failure much later", async () => {
  const { db, store, clock } = setup();
  const v1 = await store.rowsFor(db.meta());
  // Six hours of renders, each finding v1 still the current version.
  for (let k = 0; k < 36; k++) {
    clock.t += 600_000;
    assert.equal((await store.read(db.meta())).asOf, clock.t);
  }
  db.v = 2;
  db.onPart = () => {
    throw new Error("TimeoutError");
  };
  clock.t += 59 * 60_000;
  const r = await store.read(db.meta());
  assert.deepEqual([r.rows === v1, r.stale, clock.t - r.asOf], [true, true, 59 * 60_000], "known current 59 minutes ago: served");
});

test("orKept and a failed table read follow the same bound", async () => {
  const HOUR = 3_600_000;
  const err = new Error("Turf list version read failed");
  const a = setup();
  await a.store.rowsFor(a.db.meta());
  a.clock.t += HOUR;
  assert.equal(a.store.orKept(err).stale, true, "an hour old: served");
  a.clock.t += 1;
  assert.throws(() => a.store.orKept(err), (x: unknown) => isUnavailable(x) && /version read failed/.test((x as Error).message));
  // The table (a snapshot missing a column), its copy, then a failed read.
  const b = setup();
  const cols = "id, rating";
  const first = await b.store.rowsFor(b.db.meta({ cols }));
  b.db.built += 60_000;
  b.db.failLive = true;
  b.clock.t += HOUR;
  assert.equal((await b.store.read(b.db.meta({ cols }))).rows, first, "an hour old: served");
  b.clock.t += 30_001;
  b.db.built += 60_000;
  await assert.rejects(b.store.read(b.db.meta({ cols })), (x: unknown) => isUnavailable(x) && /Paged fetch failed/.test((x as Error).message));
});

test("the wanted version from the shared cache is served (it is current); no older one, near or far (3 Nov's far search is gone)", async () => {
  const sc = await sharedCacheOf([5, 12, 29]);
  const { db, store } = setup({ readCachedPart: sc.readCachedPart });
  db.v = 30;
  db.onPart = () => {
    throw new Error("Turf list part 1 read failed: TimeoutError: The operation was aborted due to timeout");
  };
  await assert.rejects(store.read(db.meta()), (x: unknown) => isUnavailable(x));
  assert.deepEqual(sc.asks, [[0, 30]], "v29, v12 and v5 are never asked for");
  // The list post's warm-up puts v30 there: served, fresh.
  const whole = await sharedCacheOf([30]);
  for (const [k, p] of whole.cached) sc.cached.set(k, p);
  const r = await store.read(db.meta());
  assert.deepEqual([r.v, r.stale, r.rows.length], [30, false, 1200]);
});

test("a failed table read with no young copy here: Unavailable; a stale snapshot in the shared cache is never served", async () => {
  const sc = await sharedCacheOf([7]);
  const { db, store } = setup({ readCachedPart: sc.readCachedPart });
  db.v = 7;
  db.failLive = true;
  // The builder is stuck (not built for 3 hours): the table is read, and fails.
  await assert.rejects(store.read(db.meta({ age_s: 20_000 })), (x: unknown) => isUnavailable(x) && /Paged fetch failed/.test((x as Error).message));
  assert.equal(db.partReads, 0, "never the snapshot from the database");
  assert.equal(sc.asks.length, 0, "nor from the shared cache");
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
  const held = mark();
  db.hold = async (i, v) => {
    if (i === 1 && v === 1) {
      held.hit();
      await gate; // v1's part 1, answered late
    }
    inFlight--;
  };
  const old = store.read(db.meta()); // v1: part 0, then part 1 held
  await held.reached; // v1's part 1 is read before the rebuild
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
  const atPart1 = mark();
  db.onPart = async (i) => {
    if (i === 1) {
      atPart1.hit();
      await gate;
    }
  };
  const a = store.read(old);
  await atPart1.reached;
  const b = store.read(db.meta());
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.rows, rb.rows);
  assert.equal(db.partReads, 3, "one load for both");
});

test("orKept: a failed version read serves this process's copy (logged once per wait), or Unavailable", async () => {
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
  const held = mark();
  db.hold = async (_i, v) => {
    if (v === 1) {
      held.hit();
      await gate;
    }
  };
  const slow = store.rowsFor(db.meta()); // reads v1's part, answer held back
  await held.reached;
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

test("Unavailable: known by name or message across bundles (never instanceof), with the 503's headers and page", () => {
  const e = new Unavailable("turf rows", new Error("TimeoutError: The operation was aborted due to timeout"));
  assert.ok(isUnavailable(e));
  assert.equal(e.name, "TapTurfUnavailable");
  assert.match(e.message, /^TapTurf unavailable: turf rows: TimeoutError/);
  assert.ok(e.cause instanceof Error);
  // As another bundle (or Next, passing it on) may hand it over: a plain object, or the message alone.
  assert.ok(isUnavailable({ name: e.name, message: "x" }));
  assert.ok(isUnavailable({ name: "Error", message: e.message }));
  assert.ok(isUnavailable(new Unavailable("turf facts")));
  for (const other of [new Error("Turf list part 1 read failed: TimeoutError"), null, undefined, "TapTurf unavailable: x", { message: 5 }]) {
    assert.equal(isUnavailable(other), false, String(other));
  }
  assert.equal(RETRY_AFTER_S, 30);
  assert.deepEqual(UNAVAILABLE_HEADERS, {
    "Retry-After": "30",
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    "X-Robots-Tag": "noindex",
    "Content-Type": "text/html; charset=utf-8",
  });
  assert.ok(Object.isFrozen(UNAVAILABLE_HEADERS));
  assert.match(UNAVAILABLE_HTML, /<meta name="robots" content="noindex, follow">/);
  assert.match(UNAVAILABLE_HTML, /<a href="\/"/);
  assert.doesNotMatch(UNAVAILABLE_HTML, /<script/i, "nothing that runs or reads data");
});
