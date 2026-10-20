import { cache } from "react";
import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createReadOnlyClient } from "../supabase/server";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { derive, publicMatch, sanitizeMatch, type Match } from "../cricket/scoring";
import {
  LIVE_MAX_MATCH_CHARS,
  LIVE_MAX_REV,
  LIVE_SECRET_RE,
  type LiveError,
  type LivePutBody,
  type LiveStatus,
  type LiveStopBody,
} from "./types";

/**
 * Server side of live scorecard links: the write key, the network hash
 * the limits count by, the cached read followers share, and the checks
 * the /api/live routes run before any database call.
 * Relative imports only, so the unit test compiles it on its own
 * (npm run test:live).
 */

/**
 * The key the write RPCs check (private.app_secrets 'live_write'),
 * server only. Unset means live links are off: writes answer 503 and
 * every code 404s. Codes are tagged with it too, so rotating it ends
 * every existing link (the migration says how).
 */
export function liveWriteKey(): string | null {
  return process.env.LIVE_WRITE_KEY?.trim() || null;
}

/* ------------------------------------------------------------------ */
/* Network hash                                                        */
/* ------------------------------------------------------------------ */

/** The eight groups of an IPv6 address, leading zeros dropped; null when it does not read as one. */
function ipv6Groups(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const parts = halves.map((h) => (h ? h.split(":") : []));
  // A dotted IPv4 ending (::ffff:1.2.3.4) is the last two groups.
  const last = parts[parts.length - 1];
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(last[last.length - 1] ?? "");
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    last.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  const zeros = 8 - parts[0].length - (parts[1]?.length ?? 0);
  if (parts.length === 2 ? zeros < 1 : zeros !== 0) return null;
  const groups = [...parts[0], ...Array<string>(parts.length === 2 ? zeros : 0).fill("0"), ...(parts[1] ?? [])];
  return groups.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? groups.map((g) => parseInt(g, 16).toString(16)) : null;
}

/**
 * The network the limits count by: the first x-forwarded-for hop
 * (Vercel overwrites the header, so it cannot be spoofed). For IPv6 only
 * the /64, since one phone or home router can use any address inside its
 * /64 and would otherwise get a fresh limit per address.
 */
function clientNetwork(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().toLowerCase();
  // A port or brackets, in case a proxy adds them: "1.2.3.4:5678", "[2001:db8::1]:443".
  const ip = first.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/^([\d.]+):\d+$/, "$1").split("%")[0];
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const g = ipv6Groups(ip);
  if (!g) return ip;
  // IPv4-mapped (::ffff:1.2.3.4) is an IPv4 client.
  if (g.slice(0, 5).every((x) => x === "0") && g[5] === "ffff") {
    const [hi, lo] = [parseInt(g[6], 16), parseInt(g[7], 16)];
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return `${g.slice(0, 4).join(":")}::/64`;
}

/**
 * A one-way hash of the client's network, keyed with the write key so
 * nobody without it can test addresses against stored hashes. Kept for
 * the create limits until the hourly job clears it at 47 hours.
 */
export function liveIpHash(req: Request, key: string): string {
  return createHash("sha256").update(`${key}|${clientNetwork(req)}`).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

// Writes get their own breaker: a run of failed live writes must not
// make turf and game page refreshes on this instance fail fast too
// (createReadOnlyClient shares one breaker per instance).
const liveFetch = createGuardedFetch(defaultGuardOptions());
let writeClient: SupabaseClient | null = null;

/** Anon client for the live write RPCs, which check the write key themselves. */
export function liveWriteClient(): SupabaseClient {
  if (writeClient) return writeClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  writeClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: liveFetch },
  });
  return writeClient;
}

/** live_match_get's row. match is as stored (sanitised on the way in); null once stopped or expired. */
export type LiveRow = { match: unknown | null; rev: number; status: LiveStatus; updated_at: string };

const STATUSES: readonly LiveStatus[] = ["live", "done", "stopped", "expired"];

/**
 * Throws on anything but a well formed row, so a bad read is never
 * cached as "not found". Any whole rev is taken, even past
 * MAX_SAFE_INTEGER: a rev the database holds must never turn every read
 * of that link into a 503 that reaches the database again.
 */
export function toLiveRow(data: unknown): LiveRow {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rev = Number(d.rev);
  const at = typeof d.updated_at === "string" ? Date.parse(d.updated_at) : NaN;
  if (!STATUSES.includes(d.status as LiveStatus) || !Number.isInteger(rev) || !Number.isFinite(at)) {
    throw new Error("live read: unexpected row");
  }
  // Postgres gives microseconds and +00:00; some browsers misread that.
  return { match: d.match ?? null, rev, status: d.status as LiveStatus, updated_at: new Date(at).toISOString() };
}

async function readLive(code: string): Promise<LiveRow | null> {
  const { data, error } = await createReadOnlyClient().rpc("live_match_get", { p_code: code });
  // supabase-js returns errors (timeouts, the open breaker) instead of
  // throwing. Throw them: unstable_cache then stores nothing and keeps
  // serving its last copy, where returning null would cache "waiting"
  // for a match that is live (the lib/home/data.ts lesson).
  if (error) throw new Error(`live read failed: ${error.message}`);
  return data == null ? null : toLiveRow(data);
}

// Polls that miss the cache together share one lookup per instance.
// Only reads in flight are shared, never a finished one.
const inflight = new Map<string, Promise<LiveRow | null>>();

/**
 * One match as followers see it, from Next's data cache. Each accepted
 * write purges the tag (purgeLive), so the database sees about one read
 * per write per region however many people follow; 10 s caps how long a
 * copy read just before a write can outlive the purge. Throws when the
 * database could not be read; null means no write has arrived yet.
 */
export function getLive(code: string): Promise<LiveRow | null> {
  let p = inflight.get(code);
  if (!p) {
    p = unstable_cache(() => readLive(code), ["live", code], { revalidate: 10, tags: [`live:${code}`] })().finally(() => {
      inflight.delete(code);
    });
    inflight.set(code, p);
  }
  return p;
}

/** The same, once per render: generateMetadata and the page share one call. */
export const getLiveForPage = cache(getLive);

/**
 * After an accepted write or stop. { expire: 0 } is a hard expiry: the
 * next read refills in the foreground, where 'max' would serve the old
 * score once more. It clears the data cache only; the CDN copy of
 * GET /api/live/<code> (s-maxage 2) carries no tag and runs out by itself.
 */
export function purgeLive(code: string): void {
  try {
    revalidateTag(`live:${code}`, { expire: 0 });
  } catch (e) {
    console.warn(`revalidateTag(live:${code}) failed`, e);
  }
}

/* ------------------------------------------------------------------ */
/* Route checks                                                        */
/* ------------------------------------------------------------------ */

/** HTTP status per write result, as documented on LiveError. Anything unknown is treated as the database being down. */
const HTTP_STATUS: Record<"ok" | LiveError, number> = {
  ok: 200,
  stale: 409,
  slow: 429,
  forbidden: 403,
  gone: 410,
  limit: 429,
  busy: 503,
  too_big: 413,
  bad: 400,
  unavailable: 503,
};

export function liveHttpStatus(r: string): number {
  return Object.hasOwn(HTTP_STATUS, r) ? HTTP_STATUS[r as keyof typeof HTTP_STATUS] : 503;
}

/** An RPC's r, or 'unavailable' when it is not one we know. */
export function liveResult(r: unknown): "ok" | LiveError {
  return typeof r === "string" && r !== "unavailable" && Object.hasOwn(HTTP_STATUS, r) ? (r as "ok" | LiveError) : "unavailable";
}

/**
 * The request body as JSON. Refused as too_big past max bytes, from the
 * Content-Length before reading and by counting while reading (a
 * chunked body has none), so a huge body is never held in memory.
 */
export async function readLiveBody(req: Request, max: number): Promise<{ body: unknown } | { error: "too_big" | "bad" }> {
  if (Number(req.headers.get("content-length")) > max) return { error: "too_big" };
  if (!req.body) return { error: "bad" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { error: "too_big" };
    }
    chunks.push(value);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: "bad" };
  }
}

function secretOf(raw: unknown): string | null {
  const s = raw && typeof raw === "object" ? (raw as { secret?: unknown }).secret : null;
  return typeof s === "string" && LIVE_SECRET_RE.test(s) ? s : null;
}

/** PUT body: a 64 hex secret and a whole rev from 1 to LIVE_MAX_REV. The match is checked by liveMatchToStore. */
export function parsePutBody(raw: unknown): LivePutBody | null {
  const secret = secretOf(raw);
  if (!secret) return null;
  const { match, rev } = raw as { match?: unknown; rev?: unknown };
  if (typeof rev !== "number" || !Number.isSafeInteger(rev) || rev <= 0 || rev > LIVE_MAX_REV) return null;
  return { secret, match, rev };
}

/**
 * The match a PUT stores and followers are served. Rebuilt from the
 * engine's whitelist (sanitizeMatch), so only what the engine makes is
 * kept, never the client's objects; then every player name is folded to
 * its latest value (publicMatch), so a player renamed mid-match is not
 * served under the old name. Size is checked on that, what is stored.
 */
export function liveMatchToStore(raw: unknown): { match: Match; status: "live" | "done" } | { error: "bad" | "too_big" } {
  const clean = sanitizeMatch(raw);
  if (!clean) return { error: "bad" };
  const match = publicMatch(clean);
  if (JSON.stringify(match).length > LIVE_MAX_MATCH_CHARS) return { error: "too_big" };
  return { match, status: derive(match).status };
}

export function parseStopBody(raw: unknown): LiveStopBody | null {
  const secret = secretOf(raw);
  return secret ? { secret } : null;
}

/** Writes for the same link from the same network closer than this are refused here. The RPC's own gap is 500 ms. */
export const LIVE_MIN_GAP_MS = 400;
/** Writes and stops per network per minute, per instance. The scorer sends at most about 24. */
export const LIVE_WRITES_PER_MIN = 60;
/** New codes per network per 10 minutes, per instance. The database allows 8 new links an hour and 30 a day per network. */
export const LIVE_MINTS_PER_10_MIN = 20;

/** Keys tracked per window at most: a soft limit must not grow memory without end under a flood of networks. */
const MAX_TRACKED = 5_000;

/** Counts per key in fixed windows. All counts go when the window turns, so nothing needs sweeping. */
function windowCounter(limit: number, windowMs: number, now: () => number) {
  let hits = new Map<string, number>();
  let since = now();
  return (key: string): boolean => {
    const t = now();
    if (t - since >= windowMs) {
      hits = new Map();
      since = t;
    }
    const n = hits.get(key) ?? 0;
    if (n >= limit) return false;
    if (n > 0 || hits.size < MAX_TRACKED) hits.set(key, n + 1);
    return true;
  };
}

/**
 * Per-instance soft limits, checked before any database call, so a
 * looping or hostile client costs this function and not the database.
 * The real limits are in the RPCs; these only shed load early.
 */
export function createLiveLimiter(now: () => number = Date.now) {
  const writes = windowCounter(LIVE_WRITES_PER_MIN, 60_000, now);
  const mints = windowCounter(LIVE_MINTS_PER_10_MIN, 10 * 60_000, now);
  // Last write per link and network, in two 5 s generations, so old
  // entries go without a sweep.
  let recent = new Map<string, number>();
  let older = new Map<string, number>();
  let since = now();
  return {
    /** POST /api/live/new. false: answer limit. */
    mint: (ip: string): boolean => mints(ip),
    /**
     * PUT. null to go ahead. The gap is per link and network, so a
     * follower who knows the code cannot slow the scorer down. Over the
     * minute's budget is 'slow' too, not 'limit': the scorer retries in
     * a moment instead of turning the link off for good.
     */
    write: (code: string, ip: string): "slow" | null => {
      const t = now();
      if (t - since >= 5_000) {
        older = recent;
        recent = new Map();
        since = t;
      }
      const k = `${code}|${ip}`;
      const last = recent.get(k) ?? older.get(k);
      if (last !== undefined && t - last < LIVE_MIN_GAP_MS) return "slow";
      if (!writes(ip)) return "slow";
      if (recent.size < MAX_TRACKED) recent.set(k, t);
      return null;
    },
    /** DELETE. Shares the per-minute budget with writes. */
    stop: (ip: string): boolean => writes(ip),
  };
}
