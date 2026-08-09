import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// SINGLETON. Every call to createClient() in the browser must return the
// SAME instance — Supabase's browser client uses a `navigator.locks`
// exclusive lock (`lock:sb-<project>-auth-token`) to serialize auth-token
// refresh across tabs. If we spin up multiple client instances in the
// same tab (one per query file, one per AuthProvider, etc.) they all
// contend for that same lock and getSession()/refresh calls time out
// after 10s with "Acquiring an exclusive Navigator LockManager lock …
// timed out". That surfaces as "auth feels slow / sometimes doesn't
// pick up my Google sign-in" — the session is fine, we just can't
// read it because the lock is held by a sibling client.
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // Server / edge — never cache; each request gets its own client.
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
