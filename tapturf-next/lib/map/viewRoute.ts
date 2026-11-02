import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { MAX_TRACKED, clientNetwork } from "../limits";
import { bearerToken } from "../account/identity";
import { later } from "../account/route";
import { accountKey, readSmallJson } from "../account/server";
import { verifiedAccount } from "../account/toolRoutes";
import { isPrefetch, viewFromPage, isBotAgent } from "../live/views";
import { createMapLimiter, parseMapUse, type MapKind } from "./views";

// One view of /map, one card opened from it, or one turf page's map opened
// (lib/map/views.ts says what counts), for app/api/map/views. The answer is
// 204 at once for anything (400 only for a body that isn't a use), so the
// page never waits and a bot or a script learns nothing. Bots, prefetches,
// other sites' pages, the same event again within seconds and anything past
// the network's limits are not counted. A sign-in sent with it is verified
// after the reply as on every account route (identify, then the account it
// opens, never one made for it, reused for a few minutes); anything else is
// a guest's. Nothing about
// the visitor is stored: the limits key on hashes kept in memory only.
// Relative imports only (npm run test:list).

const limit = createMapLimiter();
/** A use is {"k":"view","u":true,"v":"<16 hex>"}. */
const USE_MAX_BYTES = 200;
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

const done = () => new Response(null, { status: 204, headers: HEADERS });

/** A one-way hash of the network, keyed with the server key, for this instance's limits only. */
const netHash = (req: Request, key: string) => createHash("sha256").update(`${key}|map|${clientNetwork(req)}`).digest("hex").slice(0, 32);

/** The event's own random tag, else the network and agent, hashed the same way: what "the same event again" means. */
function whoHash(req: Request, key: string, tag: string | null): string {
  const who = tag ? `tag|${tag}` : `${clientNetwork(req)}|${req.headers.get("user-agent") ?? ""}`;
  return createHash("sha256").update(`${key}|map-who|${who}`).digest("hex").slice(0, 32);
}

/** POST: 204 at once (400 for a body that isn't a use); counted after the reply. */
export async function postMapUse(req: Request): Promise<Response> {
  const key = accountKey();
  if (!key) return done();
  // Only a person in a browser, from this site's own page.
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return done();
  const use = parseMapUse(await readSmallJson(req, USE_MAX_BYTES));
  if (!use) return new Response(null, { status: 400, headers: HEADERS });
  const take = limit(netHash(req, key), whoHash(req, key, use.tag), use.kind, use.unique);
  if (!take.count) return done();
  const token = bearerToken(req);
  // Only the sign-in goes with the work after the reply.
  later(async () => {
    const userId = token ? await accountOf(token, req.url) : null;
    await recordMapUse(use.kind, take.unique, userId);
  });
  return done();
}

/** How long this instance reuses the account a sign-in opened (identify keeps its own, shorter, cache of the check). */
const ACCOUNT_REUSE_MS = 5 * 60_000;
/** By a hash of the token (never the token itself): the account it opened, and until when. Only accounts are kept. */
const accounts = new Map<string, { id: string; until: number }>();

/**
 * The account a sign-in opens (verifiedAccount: identify, then the account,
 * never one made), reused for a few minutes: a signed-in browser sends a
 * view, then a tap or two, and each needs only its count, not another
 * account lookup. A sign-in that opens none is asked again next time.
 */
async function accountOf(token: string, url: string): Promise<string | null> {
  const k = createHash("sha256").update(token).digest("hex");
  const t = Date.now();
  const hit = accounts.get(k);
  if (hit && hit.until > t) return hit.id;
  const id = await verifiedAccount(new Request(url, { headers: { authorization: `Bearer ${token}` } }));
  if (!id) return null;
  if (accounts.size >= MAX_TRACKED) accounts.delete(accounts.keys().next().value as string);
  accounts.set(k, { id, until: t + ACCOUNT_REUSE_MS });
  return id;
}

// Its own breaker: failing map counts must never make sign-ins or page refreshes on this instance fail fast.
const mapFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;
/** Before 20261102_map_views.sql is applied: asked again a minute later at most, said once per instance. */
let missingUntil = 0;
let missingSaid = false;
const MISSING_WAIT_MS = 60_000;

/** One use into the day's counts (map_view_add), with the account when one was verified. Never throws. */
export async function recordMapUse(kind: MapKind, unique: boolean, userId: string | null): Promise<void> {
  const key = accountKey();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || !url || !anon || Date.now() < missingUntil) return;
  try {
    client ??= createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: mapFetch } });
    const { data, error } = await client.rpc("map_view_add", { p_key: key, p_kind: kind, p_unique: unique, p_user_id: userId });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        missingUntil = Date.now() + MISSING_WAIT_MS;
        if (!missingSaid) console.warn("map: map_view_add is not on the database yet (20261102_map_views.sql); not counting for now");
        missingSaid = true;
        return;
      }
      console.warn("map: map_view_add failed", error.message);
      return;
    }
    const r = (data as { r?: unknown } | null)?.r;
    if (r !== "ok") console.warn("map: map_view_add answered", r);
  } catch (e) {
    console.warn("map: map_view_add threw", e);
  }
}
