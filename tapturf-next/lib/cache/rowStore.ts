// One copy of the active turf rows per server process, keyed by the
// version of the database's list snapshot
// (supabase/migrations/20261026_cache_list_snapshot.sql).
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// 26 Oct import day: the rows used to sit in Next's data cache, but a page
// Vercel regenerates skips every unstable_cache read, so each regeneration
// of a list page read every active turf again: 11 to 100 full reads per
// purge, 8 to 16 s each when they piled up, then 5 s timeouts. Now the
// database builds the list once per purge, a regeneration reads only its
// version (one tiny row), and this store fetches the prebuilt parts once per
// version and keeps them.
//
// 27 Oct: right after a purge, a burst of regenerations on 7 to 30
// processes read all 9 parts (about 9 MB) of the new version at once, part
// reads passed the 5 s guard, and each failed load threw: the render failed
// (a bare 500 in the foreground, an unchanged page in the background), the
// parts already read were thrown away, and the next hit started again at
// part 0. Now a failed load serves the copy this process already has and
// waits before it reads again (see the rules).
//
// Rules:
// - A copy is reused only for the same or an older version, never for a
//   newer one, and never by age: a purge (a new version) is always read.
// - Callers that arrive while a version loads share that load. A load
//   follows part 0's build: callers for that build join it, and a load
//   that a newer version's load overtakes stops and hands its callers to
//   that one.
// - At most maxPartReads part reads are in flight in this process (1 by
//   default), however many loads there are. Parts load one after another,
//   so a failed load counts once on the database breaker
//   (lib/supabase/guard.ts), not once per part.
// - Part 0 is asked for the meta's version and may come from a newer build;
//   every later part is asked for part 0's version. Each must come from that
//   one build (same v, n and parts) and they must add up to n. A partial
//   list is never stored or served, and parts of two builds never mix.
// - The parts of the build being loaded are kept while it loads, so after
//   a failed read the next load starts at the part that failed, not at part
//   0. A newer build replaces them; a part from another build drops them.
// - A load that fails serves the newest copy this process has, marked
//   stale (the caller then shortens the page's life, so it is read again
//   within a minute or two). With no copy at all it looks in the shared
//   cache (readCachedPart, never the database) for the wanted version, whole,
//   then for the few before it, and only then throws. "Wanted" is the
//   newest build the load was asked for or found (part 0 can name a newer
//   one than the meta), so a caller for that build never gets an older copy
//   unmarked. One log line per failed load, never one per caller: a warning
//   while the failures are new, an error once loads have kept failing for
//   escalateAfterMs with no load succeeding in between (a broken RPC or a
//   part that always times out must not go unnoticed behind stale pages).
// - After a failed read (a part or table read that threw), callers wait
//   retryAfterMs (to 1.5 times that, so processes do not retry in step)
//   before this process reads again: meanwhile they get the stale copy (or
//   what the shared cache has), or the error at once, with no database
//   call. Parts that do not fit
//   together (a rebuild between two parts) are retried by the next caller
//   straight away: that costs one part 0 and is no sign of a slow database.
// - A snapshot is used when it carries every column the app selects (extra
//   columns are ignored), so a migration that adds a column can go first.
// - No usable snapshot (none built yet, a column the app needs is missing,
//   or no build for 3 hours) means the table is read directly, as before.
//   That copy is reused for an hour, but never across a build: every list
//   post builds first, so a purge always gets a fresh read. A failed table
//   read serves the last copy, as above.

export type ListMeta = {
  /** Snapshot version; moves only when the rows or the columns changed. */
  v: number;
  /** Rows in it. */
  n: number;
  /** Parts (each well under the 2 MB a Next data cache entry holds). */
  parts: number;
  /** The column list it was built with. */
  cols: string;
  /** Seconds since the last build (changed or not). */
  age_s: number;
  /** The last build (changed or not), epoch ms. Every list post builds first. */
  built?: number;
};

export type ListPart<R> = {
  v: number;
  n: number;
  parts: number;
  rows: R[];
  /** Where the reader got it ("cache", "route", "db"), for the load's log line only. */
  src?: string;
};

/** What a read hands out. */
export type RowsRead<R> = {
  rows: readonly R[];
  /** The copy's version (0 for a table read without a snapshot). */
  v: number;
  /**
   * An older copy than the one asked for, served because the newer one could
   * not be read. The page should not be kept as long as usual.
   */
  stale: boolean;
};

export type LogLevel = "info" | "warn" | "error";

export type RowStoreOptions<R> = {
  /** The columns this app selects (CARD_COLUMNS); a snapshot without one of them is not used. */
  cols: string;
  /**
   * Part i, asked for version v: part 0 with the meta's version (the answer
   * may come from a newer build), later parts with part 0's version. null
   * when the database has no such part.
   */
  readPart: (i: number, v: number) => Promise<ListPart<R> | null>;
  /**
   * Part i of exactly version v when a shared cache already holds it, else
   * null. Never the database: only for a process with no copy of its own
   * whose load failed.
   */
  readCachedPart?: (i: number, v: number) => Promise<ListPart<R> | null>;
  /** Every row straight from the table: the way without a usable snapshot. */
  readLive: () => Promise<R[]>;
  /** Kept rows are sorted once with this. */
  order?: (a: R, b: R) => number;
  /** A snapshot not built for this long is not trusted (the builder is stuck). */
  maxAgeS?: number;
  /** How long a table read is reused while no build happened. */
  liveTtlMs?: number;
  /** After a failed read, no new read for this long (times 1 to 1.5). 0 retries at once (next build). */
  retryAfterMs?: number;
  /** Part reads in flight at once in this process. */
  maxPartReads?: number;
  /** Versions below the wanted one also tried in the shared cache when this process has no copy. */
  olderVersions?: number;
  /** Loads failing for this long with none succeeding: the failed-load line is logged as an error, not a warning. */
  escalateAfterMs?: number;
  random?: () => number;
  now?: () => number;
  log?: (msg: string, extra: Record<string, unknown>, level?: LogLevel) => void;
};

export type RowStore<R> = {
  /** The rows for this version (or a newer copy, or a stale one when the read failed). meta is the latest turf_list_version() answer. */
  read(meta: ListMeta | null): Promise<RowsRead<R>>;
  /** read(meta), rows only. */
  rowsFor(meta: ListMeta | null): Promise<readonly R[]>;
  /**
   * The version read itself failed: the newest copy this process has,
   * marked stale, or `err` thrown when it has none. Logs at most once per
   * retryAfterMs.
   */
  orKept(err: unknown): RowsRead<R>;
};

const columnList = (s: string) => s.split(",").map((c) => c.trim()).filter(Boolean);

/**
 * True when a snapshot built with the columns `have` carries every column
 * in `need`. Order, spacing and extra columns do not matter: the pages pick
 * the fields they use.
 */
export function coversColumns(have: string, need: string): boolean {
  const got = new Set(columnList(have));
  return columnList(need).every((c) => got.has(c));
}

const MAX_PARTS = 200;

/** A snapshot not built for this long (seconds) is not trusted: the builder is stuck. */
export const SNAPSHOT_MAX_AGE_S = 10_800;

/**
 * Why no snapshot is usable for an app that selects `cols` ("no snapshot",
 * "columns missing", "snapshot stale"), or null when one is. Exported for
 * the build-data step (scripts/build-data.ts), which records the table's
 * rows exactly when the store would read them.
 */
export function unusable(meta: ListMeta | null, cols: string, maxAgeS = SNAPSHOT_MAX_AGE_S): string | null {
  if (!meta || !(meta.v > 0)) return "no snapshot";
  if (typeof meta.cols !== "string" || !coversColumns(meta.cols, cols)) return "columns missing";
  if (!(meta.age_s < maxAgeS)) return "snapshot stale";
  return null;
}

/** Part 0's numbers make sense: some rows, 1 to MAX_PARTS parts. */
export const headerOk = <R>(p: ListPart<R>) => p.n > 0 && Number.isInteger(p.parts) && p.parts >= 1 && p.parts <= MAX_PARTS;

/** The part is of that one build (same v, n and parts) and has rows. */
export const sameBuild = <R>(p: ListPart<R> | null, b: { v: number; n: number; parts: number }) =>
  !!p && Array.isArray(p.rows) && p.v === b.v && p.n === b.n && p.parts === b.parts;

/** Parts that do not fit together. Retried at once: no sign of a slow database. */
class Mismatch extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createRowStore<R>(opts: RowStoreOptions<R>): RowStore<R> {
  const maxAgeS = opts.maxAgeS ?? SNAPSHOT_MAX_AGE_S;
  const liveTtlMs = opts.liveTtlMs ?? 3_600_000;
  const retryAfterMs = Math.max(0, opts.retryAfterMs ?? 20_000);
  const maxPartReads = Math.max(1, Math.floor(opts.maxPartReads ?? 1));
  const olderVersions = Math.max(0, Math.floor(opts.olderVersions ?? 3));
  const escalateAfterMs = Math.max(0, opts.escalateAfterMs ?? 600_000);
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((msg, extra, level = "info") => console[level](msg, extra));

  type Copy = { v: number; rows: readonly R[] };
  // v orders copies; built (live copies only) moves on every build.
  type Slot = { v: number; built: number; p: Promise<RowsRead<R>> };
  // The build a load is putting together: its numbers and the parts read so far.
  type Build = { v: number; n: number; parts: number; got: (R[] | undefined)[] };
  type HandOver = { handOver: Slot };

  let snap: Copy | null = null;
  let live: (Copy & { built: number; at: number }) | null = null;
  // The copy handed out last as fresh (snapshot or table): what orKept serves.
  let latest: Copy | null = null;
  let partial: Build | null = null;
  // After a failed read: no new read until `until`.
  let cool: { until: number; err: unknown } | null = null;
  let cachePending: { want: number; p: Promise<Copy | null> } | null = null;
  let metaLoggedAt = -Infinity;
  // The first failed load since the last load that succeeded.
  let failingSince: number | null = null;
  // The load in flight, per kind: callers for that version (or an older
  // one) join it; a newer version starts its own.
  const pending: { snapshot: Slot | null; live: Slot | null } = { snapshot: null, live: null };

  const keep = (rows: R[]): readonly R[] => Object.freeze(opts.order ? rows.sort(opts.order) : rows);
  const fresh = (c: Copy): RowsRead<R> => ({ rows: c.rows, v: c.v, stale: false });
  const stale = (c: Copy): RowsRead<R> => ({ rows: c.rows, v: c.v, stale: true });
  const cooling = () => cool !== null && now() < cool.until;

  function setSnap(c: Copy) {
    snap = c;
    if (!latest || c.v >= latest.v) latest = c;
  }

  // At most maxPartReads part reads at once in this process.
  let reading = 0;
  const waiting: (() => void)[] = [];
  async function readOne(i: number, v: number): Promise<ListPart<R> | null> {
    while (reading >= maxPartReads) await new Promise<void>((r) => waiting.push(r));
    reading++;
    try {
      return await opts.readPart(i, v);
    } finally {
      reading--;
      waiting.shift()?.();
    }
  }

  async function loadSnapshot(meta: ListMeta, slot: Slot): Promise<RowsRead<R> | HandOver> {
    const t0 = now();
    const from: Record<string, number> = {};
    const count = (p: ListPart<R>) => {
      const s = p.src ?? "read";
      from[s] = (from[s] ?? 0) + 1;
    };
    // Resume the build a failed load left half read, when it is the one wanted (or newer).
    let build = partial && partial.v >= meta.v ? partial : null;
    const reused = build ? build.got.filter(Boolean).length : 0;
    if (!build) {
      // Part 0 says which build the rest must come from: it can be newer
      // than meta (a route handler's cached meta), never older.
      const first = await readOne(0, meta.v);
      if (!first || !Array.isArray(first.rows)) throw new Mismatch(`turf snapshot: part 0 missing (want v${meta.v})`);
      if (!(first.v >= meta.v)) throw new Mismatch(`turf snapshot: part 0 is v${first.v}, older than v${meta.v}`);
      if (!headerOk(first)) throw new Mismatch(`turf snapshot: v${first.v} has n=${first.n}, parts=${first.parts}`);
      count(first);
      build = { v: first.v, n: first.n, parts: first.parts, got: [first.rows] };
      if (!partial || build.v >= partial.v) partial = build;
    }
    const b = build;
    const drop = () => {
      if (partial === b) partial = null;
    };
    if (b.v > slot.v) slot.v = b.v;
    for (let i = 1; i < b.parts; i++) {
      if (b.got[i]) continue;
      // A newer version's load started meanwhile: it serves these callers too.
      const newer = pending.snapshot;
      if (newer && newer !== slot && newer.v > b.v) return { handOver: newer };
      const p = await readOne(i, b.v);
      if (!sameBuild(p, b)) {
        // Rebuilt between two parts (or a part went missing): the next caller starts over.
        drop();
        throw new Mismatch(`turf snapshot: part ${i} is not from v${b.v}`);
      }
      count(p!);
      b.got[i] = p!.rows;
    }
    drop();
    const rows: R[] = [];
    for (const part of b.got) if (part) rows.push(...part);
    if (rows.length !== b.n) throw new Mismatch(`turf snapshot: v${b.v} has ${rows.length} rows, not ${b.n}`);
    const kept = keep(rows);
    // An older load finishing late never replaces a newer copy.
    if (!snap || b.v > snap.v) setSnap({ v: b.v, rows: kept });
    log("turf snapshot read", { src: "snapshot", v: b.v, rows: kept.length, parts: b.parts, reused, from, ms: now() - t0 });
    return fresh(snap!);
  }

  // Version v, complete, from the shared cache only.
  async function cachedCopy(read: NonNullable<RowStoreOptions<R>["readCachedPart"]>, v: number): Promise<Copy | null> {
    const first = await read(0, v);
    if (!first || first.v !== v || !Array.isArray(first.rows) || !headerOk(first)) return null;
    const rows: R[] = [...first.rows];
    for (let i = 1; i < first.parts; i++) {
      const p = await read(i, v);
      if (!sameBuild(p, first)) return null;
      rows.push(...p!.rows);
    }
    return rows.length === first.n ? { v, rows: keep(rows) } : null;
  }

  // The newest of `want` and the few versions below it that the shared
  // cache holds whole (`want` itself too: while this process waits after a
  // failed read, a render that can read that cache still gets the version).
  function fromCache(want: number): Promise<Copy | null> {
    const read = opts.readCachedPart;
    if (!read) return Promise.resolve(null);
    if (cachePending && cachePending.want === want) return cachePending.p;
    const p = (async () => {
      for (let v = want; v >= Math.max(1, want - olderVersions); v--) {
        const c = await cachedCopy(read, v).catch(() => null);
        if (!c) continue;
        if (!snap || c.v > snap.v) setSnap(c);
        return snap;
      }
      return null;
    })().finally(() => {
      if (cachePending?.p === p) cachePending = null;
    });
    cachePending = { want, p };
    return p;
  }

  async function snapshotFallback(want: number, err: unknown): Promise<RowsRead<R>> {
    // A load that ended meanwhile may have the version after all.
    if (snap && snap.v >= want) return fresh(snap);
    if (latest) return stale(latest);
    const c = await fromCache(want);
    if (c) return c.v >= want ? fresh(c) : stale(c);
    throw err;
  }

  async function loadLive(v: number, built: number, reason: string): Promise<RowsRead<R>> {
    const t0 = now();
    const rows = await opts.readLive();
    // One line per table read, so the logs show how often it happens (should be never while the snapshot works).
    log("turf full read", { src: "table", reason, v, built, rows: rows.length, ms: now() - t0 });
    // Thousands of turfs are active: none at all is a read that went wrong, and kept it would
    // empty every listing (and 404 every city/sport page). Throwing keeps the last good copy serving.
    if (rows.length === 0) throw new Error("turf full read returned no active turfs");
    // An older read finishing late never replaces a newer copy.
    if (!live || (v >= live.v && built >= live.built)) {
      live = { v, built, at: now(), rows: keep(rows) };
      if (!latest || live.v >= latest.v) latest = live;
    }
    return fresh(live);
  }

  async function liveFallback(err: unknown): Promise<RowsRead<R>> {
    if (!latest) throw err;
    return stale(latest);
  }

  function start(
    kind: "snapshot" | "live",
    v: number,
    built: number,
    load: (slot: Slot) => Promise<RowsRead<R> | HandOver>,
    fallback: (err: unknown, slot: Slot) => Promise<RowsRead<R>>,
    what: Record<string, unknown>,
  ): Promise<RowsRead<R>> {
    const t0 = now();
    // p is set right below; the load reads pending (not p) before its first await.
    const slot: Slot = { v, built, p: undefined as unknown as Promise<RowsRead<R>> };
    pending[kind] = slot;
    const failed = async (err: unknown): Promise<RowsRead<R>> => {
      // A slow or failing read waits before the next one; parts that do not fit together do not.
      let retryInMs = 0;
      if (!(err instanceof Mismatch) && retryAfterMs > 0) {
        retryInMs = Math.round(retryAfterMs * (1 + Math.min(1, Math.max(0, random())) / 2));
        cool = { until: now() + retryInMs, err };
      }
      failingSince ??= now();
      const failingForMs = now() - failingSince;
      const line = { ...what, error: message(err), ms: now() - t0, retryInMs, failingForMs };
      let got: RowsRead<R>;
      try {
        got = await fallback(err, slot);
      } catch {
        log("turf rows: read failed, no copy to serve", line, "error");
        throw err;
      }
      // A warning for a burst that clears in a retry or two; an error (a
      // runtime-error group) once it has lasted, so a fault that only ever
      // serves stale rows is still seen.
      log("turf rows: read failed, serving an older copy", { ...line, have: got.v }, failingForMs >= escalateAfterMs ? "error" : "warn");
      return got;
    };
    slot.p = load(slot)
      .then(
        (r) => {
          if (!("handOver" in r)) failingSince = null;
          return r;
        },
        (err) => failed(err),
      )
      .then((r) => ("handOver" in r ? r.handOver.p : r))
      .finally(() => {
        // A failed load clears only its own slot; the copies stay.
        if (pending[kind] === slot) pending[kind] = null;
      });
    return slot.p;
  }

  function read(meta: ListMeta | null): Promise<RowsRead<R>> {
    const why = unusable(meta, opts.cols, maxAgeS);
    if (!why && meta) {
      if (snap && snap.v >= meta.v) return Promise.resolve(fresh(snap));
      if (pending.snapshot && pending.snapshot.v >= meta.v) return pending.snapshot.p;
      // Waiting after a failed read: the last copy, no database call.
      if (cooling()) return snapshotFallback(meta.v, cool!.err);
      // The fallback judges against slot.v: part 0 may have named a newer build, whose callers joined this load.
      return start("snapshot", meta.v, 0, (slot) => loadSnapshot(meta, slot), (err, slot) => snapshotFallback(slot.v, err), { want: meta.v });
    }
    // Without a usable snapshot the version may not move when the rows do
    // (a column the snapshot lacks), but every list post builds, so the
    // build stamp keys this copy: a newer build always reads again, an
    // older meta (a route handler's cached one) takes the newer copy.
    const v = meta && meta.v > 0 ? meta.v : 0;
    const built = v > 0 && typeof meta?.built === "number" && Number.isFinite(meta.built) ? meta.built : 0;
    if (live && live.v >= v && live.built >= built && now() - live.at < liveTtlMs) return Promise.resolve(fresh(live));
    if (pending.live && pending.live.v >= v && pending.live.built >= built) return pending.live.p;
    if (cooling()) return liveFallback(cool!.err);
    const reason = why ?? "no snapshot";
    return start("live", v, built, () => loadLive(v, built, reason), liveFallback, { src: "table", reason, v, built });
  }

  return {
    read,
    rowsFor: (meta) => read(meta).then((r) => r.rows),
    orKept(err) {
      if (!latest) throw err;
      if (now() - metaLoggedAt >= Math.max(retryAfterMs, 1)) {
        metaLoggedAt = now();
        log("turf rows: version read failed, serving this process's copy", { have: latest.v, error: message(err) }, "warn");
      }
      return stale(latest);
    },
  };
}
