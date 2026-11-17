import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { accountKey } from "../account/server";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { confirmedIn, shownTagViews, type ShownTag } from "./confirmed";

/**
 * The tagged players a game's page names (public.game_tags_shown,
 * 20261118_game_tags_shown.sql: waiting, with "Let others find and tag me"
 * still on), read by the page's server render and kept with the page: its
 * ISR copy (10 minutes, purged by the games key within about a minute of a
 * tag being made, answered, removed or untagged, since each changes the
 * game's row; and of a tagged player changing that setting, by the trigger
 * that file adds). So no read per page view, and none at all for a game
 * with nobody tagged. The browser never calls this: it gets the names with
 * the page and checks them against the row it reads itself
 * (lib/games/confirmed.ts namedTags). Behind ACCOUNT_KEY, on a client with
 * its own breaker (as lib/games/hostProfile.server.ts). Nothing while
 * `next build` prerenders, without the key (previews), before the file, or
 * when the read fails: the page then says "+N more", as it did before.
 */

const tagsFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: tagsFetch } });
  return client;
}

/** The players to name on this game's page; [] when nobody is tagged (no read) or it can't be said. Never throws. */
export async function shownTagsFor(game: { id: string; status?: string | null; confirmed_tagged?: unknown }): Promise<ShownTag[]> {
  if (confirmedIn(game).tagged === 0 || game.status === "cancelled") return [];
  const key = accountKey();
  if (process.env.NEXT_PHASE === "phase-production-build" || !key) return [];
  try {
    const { data, error } = await db().rpc("game_tags_shown", { p_key: key, p_game_id: game.id });
    if (error || !data || typeof data !== "object" || (data as { r?: unknown }).r !== "ok") return [];
    return shownTagViews((data as { tags?: unknown }).tags);
  } catch {
    return [];
  }
}
