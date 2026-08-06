import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase session refresh proxy (Next.js 16 "proxy" convention).
 *
 * Guard against refresh-token reuse: Next.js fires speculative RSC /
 * prefetch requests that also hit this middleware. If two of those land
 * concurrently, both try to consume the same refresh_token in
 * getUser() → Supabase detects reuse → revokes the entire session →
 * user is silently logged out. Symptom: "auth is failing / redirected
 * home not logged in" a few seconds after sign-in.
 *
 * We only call getUser() on real navigations (no `rsc` /
 * `next-router-prefetch` header, no GET-w/ RSC accept). Prefetches
 * still get their cookies forwarded so hydration is correct.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  const isRsc = request.headers.get("rsc") === "1";

  if (isPrefetch || isRsc) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session so cookies stay alive. On the boundary of a
  // proper page navigation this only happens once per request, so
  // token rotation is safe.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all routes except static files, images, and auth callback
    "/((?!_next/static|_next/image|favicon.ico|images/|api/auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
