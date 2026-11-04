import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { accountKey } from "../account/server";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { createHostLookup, type HostRef, type PlayerHit } from "./hostProfile";

/**
 * The real database behind lib/games/hostProfile.ts: players_search and
 * profile_owner (both behind ACCOUNT_KEY, both read-only, both answering
 * only for a shown profile), on a client with its own breaker, so slow
 * lookups from page renders never make sign-ins on this instance fail
 * fast. Ids stay here: the pages get usernames only. Nothing while
 * `next build` prerenders (the pages then read nothing from the database;
 * /games gets the profile links on its first refresh, a minute later), or
 * without ACCOUNT_KEY (previews): the organizer url is the game page then.
 */

const hostFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: hostFetch } });
  return client;
}

const missingFunction = (code: string | undefined) => code === "PGRST202" || code === "42883";

/** A server-key RPC's answer when it says r: ok; "missing" before its migration; "unavailable" otherwise. */
async function rpc(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | "missing" | "unavailable"> {
  const key = accountKey();
  if (!key) return "unavailable";
  try {
    const { data, error } = await db().rpc(fn, { p_key: key, ...args });
    if (error) return missingFunction(error.code) ? "missing" : "unavailable";
    if (!data || typeof data !== "object" || (data as { r?: unknown }).r !== "ok") return "unavailable";
    return data as Record<string, unknown>;
  } catch {
    return "unavailable";
  }
}

const lookup = createHostLookup({
  async search(q) {
    const d = await rpc("players_search", { p_q: q });
    if (d === "missing") return [];
    if (d === "unavailable") return "unavailable";
    const hits: PlayerHit[] = [];
    for (const p of Array.isArray(d.players) ? (d.players as unknown[]) : []) {
      const o = (p ?? {}) as Record<string, unknown>;
      if (typeof o.u === "string" && typeof o.name === "string") hits.push({ u: o.u, name: o.name });
    }
    return hits;
  },
  async owner(username) {
    const d = await rpc("profile_owner", { p_username: username });
    if (d === "missing") return null;
    if (d === "unavailable") return "unavailable";
    return typeof d.id === "string" && d.id ? d.id : null;
  },
});

/** Host account id -> shown username, for the games' hosts that have one (see lib/games/hostProfile.ts). Never throws. */
export async function hostUsernames(hosts: readonly HostRef[]): Promise<Map<string, string>> {
  if (process.env.NEXT_PHASE === "phase-production-build" || !accountKey()) return new Map();
  try {
    return await lookup(hosts);
  } catch {
    return new Map();
  }
}
