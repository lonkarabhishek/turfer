import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { clientNetwork } from "../limits";
import { bearerToken, identifyToken } from "../account/identity";
import { later } from "../account/route";
import { accountKey, readSmallJson } from "../account/server";
import { isOwnerIdentity } from "../admin/owner";
import { isBotAgent, isPrefetch, viewFromPage } from "../live/views";
import { createTrafficLimiter, parseTrafficBody, type TrafficCount } from "./traffic";

// One page view (lib/traffic/traffic.ts says what counts), for
// app/api/traffic. The answer is 204 at once for anything (400 only for a
// body that isn't a view), so the page never waits and a bot or a script
// learns nothing. Bots, prefetches, other sites' pages and anything past the
// network's limits are not counted. A signed-in browser sends its sign-in
// token with each view (lib/count/send.ts): a phone sign-in's Firebase token
// carries the number, a Google one's Supabase token the email. It is
// verified after the reply as on every account route (identifyToken: the
// Firebase token checked here, a Google one with Supabase Auth, which
// answers with that account's email), only to count the view as a
// signed-in one and to leave the site owner's own views out. No TapTurf
// account row is read, and nothing of the sign-in is stored with the count
// (the checker keeps a verified sign-in in memory for a few minutes, as for
// every account route). Nothing about the visitor is stored: the limits key
// on a hash of the network kept in memory for the window only.
// Relative imports only (npm run test:traffic).

const limit = createTrafficLimiter();
/** A view is {"p":"<at most 120 characters>","s":"other_site","v":1,"h":"<at most 100>","nf":1}. */
const VIEW_MAX_BYTES = 400;
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

const done = () => new Response(null, { status: 204, headers: HEADERS });

/** A one-way hash of the network, keyed with the server key, for this instance's limits only. Never stored. */
const netHash = (req: Request, key: string) => createHash("sha256").update(`${key}|traffic|${clientNetwork(req)}`).digest("hex").slice(0, 32);

/** POST: 204 at once (400 for a body that isn't a view); counted after the reply. */
export async function postTraffic(req: Request): Promise<Response> {
  const key = accountKey();
  if (!key) return done();
  // Only a person in a browser, from this site's own page.
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return done();
  const view = parseTrafficBody(await readSmallJson(req, VIEW_MAX_BYTES));
  if (!view) return new Response(null, { status: 400, headers: HEADERS });
  const take = limit(netHash(req, key), view.path, view.visit);
  if (!take.count) return done();
  const token = bearerToken(req);
  const counted: TrafficCount = { ...view, visit: take.visit };
  // Only the sign-in goes with the work after the reply.
  later(async () => {
    let signed = false;
    if (token) {
      const id = await identifyToken(token);
      if ("ok" in id) {
        // The site owner's own browsing is not traffic.
        if (isOwnerIdentity(id.ok)) return;
        signed = true;
      }
    }
    await recordTraffic(counted, signed);
  });
  return done();
}

// Its own breaker: failing traffic counts must never make sign-ins or page refreshes on this instance fail fast.
const trafficFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;
/** Before 20261104_traffic.sql is applied: asked again a minute later at most, said once per instance. */
let missingUntil = 0;
let missingSaid = false;
const MISSING_WAIT_MS = 60_000;

/** One view into the day's counts (traffic_add). Never throws. */
export async function recordTraffic(v: TrafficCount, signed: boolean): Promise<void> {
  const key = accountKey();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || !url || !anon || Date.now() < missingUntil) return;
  try {
    client ??= createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: trafficFetch } });
    const { data, error } = await client.rpc("traffic_add", {
      p_key: key,
      p_kind: v.kind,
      p_path: v.path,
      p_source: v.source,
      p_host: v.host,
      p_visit: v.visit,
      p_signed: signed,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        missingUntil = Date.now() + MISSING_WAIT_MS;
        if (!missingSaid) console.warn("traffic: traffic_add is not on the database yet (20261104_traffic.sql); not counting for now");
        missingSaid = true;
        return;
      }
      console.warn("traffic: traffic_add failed", error.message);
      return;
    }
    const r = (data as { r?: unknown } | null)?.r;
    if (r !== "ok") console.warn("traffic: traffic_add answered", r);
  } catch (e) {
    console.warn("traffic: traffic_add threw", e);
  }
}
