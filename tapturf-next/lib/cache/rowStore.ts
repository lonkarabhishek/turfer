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
// version and keeps them. Rules:
// - A copy is reused only for the same or an older version, never for a
//   newer one, and never by age: a purge (a new version) is never hidden.
// - Callers that arrive while a version loads share that load.
// - Parts load one after another, so a failed load counts once on the
//   database breaker (lib/supabase/guard.ts), not once per part.
// - Part 0 is asked for the meta's version and may come from a newer build;
//   every later part is asked for part 0's version. Each must come from that
//   one build (same v, n and parts) and they must add up to n. Anything else
//   throws and keeps the previous copy: a partial list is never stored or
//   served, and a page that cannot get its version fails its rebuild (the
//   last good page keeps serving).
// - A snapshot is used when it carries every column the app selects (extra
//   columns are ignored), so a migration that adds a column can go first.
// - No usable snapshot (none built yet, a column the app needs is missing,
//   or no build for 3 hours) means the table is read directly, as before.
//   That copy is reused for an hour, but never across a build: every list
//   post builds first, so a purge always gets a fresh read.

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

export type ListPart<R> = { v: number; n: number; parts: number; rows: R[] };

export type RowStoreOptions<R> = {
  /** The columns this app selects (CARD_COLUMNS); a snapshot without one of them is not used. */
  cols: string;
  /**
   * Part i, asked for version v: part 0 with the meta's version (the answer
   * may come from a newer build), later parts with part 0's version. null
   * when the database has no such part.
   */
  readPart: (i: number, v: number) => Promise<ListPart<R> | null>;
  /** Every row straight from the table: the way without a usable snapshot. */
  readLive: () => Promise<R[]>;
  /** Kept rows are sorted once with this. */
  order?: (a: R, b: R) => number;
  /** A snapshot not built for this long is not trusted (the builder is stuck). */
  maxAgeS?: number;
  /** How long a table read is reused while no build happened. */
  liveTtlMs?: number;
  now?: () => number;
  log?: (msg: string, extra: Record<string, unknown>) => void;
};

export type RowStore<R> = {
  /** The rows for this version (or a newer copy). meta is the latest turf_list_version() answer. */
  rowsFor(meta: ListMeta | null): Promise<readonly R[]>;
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

export function createRowStore<R>(opts: RowStoreOptions<R>): RowStore<R> {
  const maxAgeS = opts.maxAgeS ?? 10_800;
  const liveTtlMs = opts.liveTtlMs ?? 3_600_000;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((msg, extra) => console.info(msg, extra));

  // v orders copies; built (live copies only) moves on every build.
  type Slot = { v: number; built: number; p: Promise<readonly R[]> };
  let snap: { v: number; rows: readonly R[] } | null = null;
  let live: { v: number; built: number; at: number; rows: readonly R[] } | null = null;
  // The load in flight, per kind: callers for that version (or an older
  // one) join it; a newer version starts its own.
  const pending: { snapshot: Slot | null; live: Slot | null } = { snapshot: null, live: null };

  const keep = (rows: R[]): readonly R[] => Object.freeze(opts.order ? rows.sort(opts.order) : rows);

  function unusable(meta: ListMeta | null): string | null {
    if (!meta || !(meta.v > 0)) return "no snapshot";
    if (typeof meta.cols !== "string" || !coversColumns(meta.cols, opts.cols)) return "columns missing";
    if (!(meta.age_s < maxAgeS)) return "snapshot stale";
    return null;
  }

  async function loadSnapshot(meta: ListMeta): Promise<readonly R[]> {
    const t0 = now();
    // Part 0 says which build the rest must come from: it can be newer than
    // meta (a route handler's cached meta), never older.
    const first = await opts.readPart(0, meta.v);
    if (!first || !Array.isArray(first.rows)) throw new Error(`turf snapshot: part 0 missing (want v${meta.v})`);
    if (!(first.v >= meta.v)) throw new Error(`turf snapshot: part 0 is v${first.v}, older than v${meta.v}`);
    if (!(first.n > 0) || !Number.isInteger(first.parts) || first.parts < 1 || first.parts > MAX_PARTS) {
      throw new Error(`turf snapshot: v${first.v} has n=${first.n}, parts=${first.parts}`);
    }
    const rows: R[] = [...first.rows];
    for (let i = 1; i < first.parts; i++) {
      const p = await opts.readPart(i, first.v);
      if (!p || !Array.isArray(p.rows) || p.v !== first.v || p.n !== first.n || p.parts !== first.parts) {
        // Rebuilt between two parts (or a part went missing): the next caller starts over.
        throw new Error(`turf snapshot: part ${i} is not from v${first.v}`);
      }
      rows.push(...p.rows);
    }
    if (rows.length !== first.n) throw new Error(`turf snapshot: v${first.v} has ${rows.length} rows, not ${first.n}`);
    const kept = keep(rows);
    // An older load finishing late never replaces a newer copy.
    if (!snap || first.v > snap.v) snap = { v: first.v, rows: kept };
    log("turf snapshot read", { src: "snapshot", v: first.v, rows: kept.length, parts: first.parts, ms: now() - t0 });
    return snap.rows;
  }

  async function loadLive(v: number, built: number, reason: string): Promise<readonly R[]> {
    const t0 = now();
    const rows = await opts.readLive();
    // One line per table read, so the logs show how often it happens (should be never while the snapshot works).
    log("turf full read", { src: "table", reason, v, built, rows: rows.length, ms: now() - t0 });
    // Thousands of turfs are active: none at all is a read that went wrong, and kept it would
    // empty every listing (and 404 every city/sport page). Throwing keeps the last good copy serving.
    if (rows.length === 0) throw new Error("turf full read returned no active turfs");
    // An older read finishing late never replaces a newer copy.
    if (!live || (v >= live.v && built >= live.built)) live = { v, built, at: now(), rows: keep(rows) };
    return live.rows;
  }

  function start(kind: "snapshot" | "live", v: number, built: number, load: () => Promise<readonly R[]>): Promise<readonly R[]> {
    const slot: Slot = {
      v,
      built,
      p: load().finally(() => {
        // A failed load clears only its own slot; the copies stay.
        if (pending[kind] === slot) pending[kind] = null;
      }),
    };
    pending[kind] = slot;
    return slot.p;
  }

  return {
    rowsFor(meta) {
      const why = unusable(meta);
      if (!why && meta) {
        if (snap && snap.v >= meta.v) return Promise.resolve(snap.rows);
        if (pending.snapshot && pending.snapshot.v >= meta.v) return pending.snapshot.p;
        return start("snapshot", meta.v, 0, () => loadSnapshot(meta));
      }
      // Without a usable snapshot the version may not move when the rows do
      // (a column the snapshot lacks), but every list post builds, so the
      // build stamp keys this copy: a newer build always reads again, an
      // older meta (a route handler's cached one) takes the newer copy.
      const v = meta && meta.v > 0 ? meta.v : 0;
      const built = v > 0 && typeof meta?.built === "number" && Number.isFinite(meta.built) ? meta.built : 0;
      if (live && live.v >= v && live.built >= built && now() - live.at < liveTtlMs) return Promise.resolve(live.rows);
      if (pending.live && pending.live.v >= v && pending.live.built >= built) return pending.live.p;
      return start("live", v, built, () => loadLive(v, built, why ?? "no snapshot"));
    },
  };
}
