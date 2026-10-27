import { cookies } from "next/headers";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardedFetch } from "./guard";
import { cookieClient, perKey, type CookieStore } from "./oneClient";

/**
 * Server-side Supabase client with cookie-based auth (for Route Handlers, Server Components).
 * This properly reads/writes auth cookies so sessions persist across requests.
 * A new client each call: code that reads many times in one request (the
 * admin pages and routes) uses requestServerClient instead.
 */
export async function createServerClient() {
  return cookieClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, await cookies());
}

const perRequest = perKey((store: CookieStore) => cookieClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, store));

/**
 * The one cookie-session client of this request (lib/supabase/oneClient.ts):
 * every caller in the same Server Component render or Route Handler gets the
 * same client, so an expiring session is refreshed once, not once per read.
 */
export async function requestServerClient(): Promise<SupabaseClient> {
  return perRequest(await cookies());
}

/**
 * Read-only Supabase client for SSG/ISR (no auth, no cookies).
 * Use this for static page generation and revalidation.
 *
 * Requests go through guardedFetch (lib/supabase/guard.ts): abandoned
 * after 5 s, and failed at once for 30 s after repeated failures, so a
 * slow database (20 Oct) gets less traffic instead of a queue of waiting
 * renders. Cached pages keep their last copy while it is open.
 */
export function createReadOnlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createPlainClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: guardedFetch },
  });
}
