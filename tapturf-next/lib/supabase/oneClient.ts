// One cookie-session Supabase client per request.
// No "@/" or next/* imports, so the unit test compiles it on its own (npm run test:cache).
//
// Every @supabase/ssr client refreshes an access token that is within 90 s
// of expiry the first time it needs the session, and auth-js only dedupes
// refreshes inside one client. The admin home made 13 clients a render (and
// each admin API route two), so one expiring session was refreshed 13 to 31
// times at once: Supabase answered "409 Too many concurrent token refresh
// requests" (27 Oct), and a losing refresh signs the owner out. With one
// client per request the first read refreshes once and every later read
// uses the refreshed session the client keeps in memory (a Server
// Component can't write the new cookie, so the next request refreshes once
// again; a Route Handler writes it).

import { createServerClient as createSSRClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The part of Next's cookie store a client needs. */
export type CookieStore = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
};

/** A cookie-session client on this request's cookies; writes are ignored where cookies are read-only (Server Components). */
export function cookieClient(url: string, key: string, store: CookieStore, fetchImpl?: typeof fetch): SupabaseClient {
  return createSSRClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
        }
      },
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

/**
 * make(key), once per key object for as long as the key lives. Keyed on the
 * request's cookie store (the same object for every cookies() call in one
 * request, Server Component or Route Handler), it is per request; a
 * WeakMap, so nothing outlives the request.
 */
export function perKey<K extends object, V>(make: (key: K) => V): (key: K) => V {
  const made = new WeakMap<K, V>();
  return (key: K) => {
    if (made.has(key)) return made.get(key) as V;
    const v = make(key);
    made.set(key, v);
    return v;
  };
}
