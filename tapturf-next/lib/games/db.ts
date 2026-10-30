import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";

/**
 * The games routes' anon client, server only: public reads (the game and
 * turf a move notice names) and the fallback's writes (lib/games/legacy.ts).
 * Its own breaker, so a failing database here doesn't make page reads on
 * this instance fail fast too. Relative imports only (npm run test:games).
 */

let client: SupabaseClient | null = null;
const gamesFetch = createGuardedFetch(defaultGuardOptions());

export function anonDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: gamesFetch } });
  return client;
}
