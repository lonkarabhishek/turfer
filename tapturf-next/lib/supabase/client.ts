import { createBrowserClient } from "@supabase/ssr";
import { processLock } from "@supabase/auth-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// SINGLETON + in-process lock.
//
// Why singleton: Supabase's browser client serialises auth-token refresh
// on a lock keyed by the project ref (`lock:sb-<ref>-auth-token`). If we
// spin up multiple client instances in the same tab (one per query file,
// one per AuthProvider) they contend for the same lock and getSession()
// / refresh calls stall for the full 10s timeout. All of TapTurf's
// browser callers must therefore share one client — that's the module
// scoped `browserClient` below.
//
// Why swap the lock: the default lock uses `navigator.locks`, which is
// scoped to the ORIGIN, not just the tab. That means a second TapTurf
// tab (or a stuck iOS PWA) can hold the auth lock and make the current
// tab's `signInWithOAuth` throw:
//   "Acquiring an exclusive Navigator LockManager lock \"lock:sb-…-auth-
//   token\" timed out waiting 10000ms"
// We don't rely on cross-tab session sync (we hydrate on visibility +
// storage events + a hard reload on iOS PWA return), so switching to
// the in-process `processLock` is safe and eliminates the entire class
// of cross-tab timeouts.
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (typeof window === "undefined") {
    // Server / edge — never cache; each request gets its own client.
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { lock: processLock },
      },
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { lock: processLock },
      },
    );
  }
  return browserClient;
}
