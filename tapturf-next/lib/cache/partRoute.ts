// The turf list's parts over HTTP, so a regenerating page can use the
// copies other processes already put in Next's data cache.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// A page that Vercel regenerates skips every data cache read (next's
// unstable-cache.js: isOnDemandRevalidate), so each process read all 9
// parts of a new version from the database itself, and a burst after a
// purge put 7 to 30 processes on Supabase at once (27 Oct). A route handler
// is not a regeneration: GET /api/turf-list/<db>/<v>/<i> reads part i of
// version v from the data cache only (never the database) and answers it
// with a year of CDN caching, since a version's parts never change. The
// list post warms the data cache with the new version before it marks the
// pages stale (/api/revalidate), so a regeneration's part read is a CDN or
// data cache hit, and only a miss goes to the database.
//
// <db> is a hash of the Supabase URL: a part is only ever answered for the
// database it came from.

import type { ListPart } from "./rowStore";

export const PART_ROUTE = "/api/turf-list";

/** A short, stable tag for a Supabase URL (FNV-1a, 8 hex digits). */
export function dbTag(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function partPath(db: string, v: number, i: number): string {
  return `${PART_ROUTE}/${db}/${v}/${i}`;
}

/** The route's params, or null when they are not this database's part of a version. */
export function parsePartParams(p: { db?: string; v?: string; i?: string }, ownDb: string): { v: number; i: number } | null {
  if (!ownDb || p.db !== ownDb) return null;
  if (!/^[1-9]\d{0,11}$/.test(p.v ?? "") || !/^(0|[1-9]\d{0,2})$/.test(p.i ?? "")) return null;
  const v = Number(p.v);
  const i = Number(p.i);
  return i < 200 ? { v, i } : null;
}

/** A part of exactly version v, as the RPC returns it. */
export function isPartOf<R>(x: unknown, v: number): x is ListPart<R> {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return p.v === v && Number.isInteger(p.n) && Number.isInteger(p.parts) && Array.isArray(p.rows);
}

/** A part: the same bytes for a year, for everyone. */
export const HIT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=0, s-maxage=31536000",
  "X-Robots-Tag": "noindex",
  "X-Turf-List": "hit",
};
/** Not in the data cache (yet): never cached, so the next ask looks again. */
export const MISS_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "X-Turf-List": "miss",
};

export type PartReaderOptions = {
  /** https://host of the deployment that serves the route, or null for none (previews, builds, local). */
  origin: string | null;
  db: string;
  fetchImpl?: typeof fetch;
  /** Give up on one part after this long (the database read is the fallback). */
  timeoutMs?: number;
  /** After the route fails (not a miss), do not ask it again for this long. */
  offMs?: number;
  now?: () => number;
  log?: (msg: string, extra: Record<string, unknown>) => void;
};

/**
 * Next's signal that a page used something dynamic (a no-store fetch in
 * the page itself). It must never be swallowed: the page is already marked
 * revalidate 0 by then. Callers ask the route only inside unstable_cache,
 * where it does not happen; this keeps a mistake loud.
 */
const isNextDynamicUsage = (e: unknown) => !!e && typeof e === "object" && (e as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE";

/**
 * Part i of version v through the route: the part, or null when the route
 * has none (a miss), is off, or failed. A failure (timeout, an error page,
 * a body that is not the part) turns the route off for this process for
 * offMs and logs once, so a broken route costs one wait, not one per part.
 * Call it inside unstable_cache only (see isNextDynamicUsage).
 */
export function createPartReader<R>(o: PartReaderOptions): (v: number, i: number) => Promise<ListPart<R> | null> {
  const timeoutMs = o.timeoutMs ?? 4_000;
  const offMs = o.offMs ?? 300_000;
  const now = o.now ?? Date.now;
  const log = o.log ?? ((msg, extra) => console.warn(msg, extra));
  let offUntil = -Infinity;
  return async (v, i) => {
    if (!o.origin || now() < offUntil) return null;
    try {
      // Resolved per call so Next's patched fetch is the one used (no-store inside unstable_cache).
      const res = await (o.fetchImpl ?? globalThis.fetch)(`${o.origin}${partPath(o.db, v, i)}`, {
        headers: { accept: "application/json", "user-agent": "tapturf-turf-list" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 && res.headers.get("x-turf-list") === "miss") {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      if (!isPartOf<R>(body, v)) throw new Error(`not part ${i} of v${v}`);
      return body;
    } catch (e) {
      if (isNextDynamicUsage(e)) throw e;
      offUntil = now() + offMs;
      log("turf list route failed, reading parts from the database", { v, i, error: e instanceof Error ? e.message : String(e), offForMs: offMs });
      return null;
    }
  };
}
