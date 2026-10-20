import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { guardedFetch } from "./guard";

/**
 * Server-side Supabase client with cookie-based auth (for Route Handlers, Server Components).
 * This properly reads/writes auth cookies so sessions persist across requests.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore (cookies are read-only there)
          }
        },
      },
    }
  );
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
