import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy (formerly middleware).
 *
 * This app resolves the user session entirely on the client:
 * - Phone auth stores its token in localStorage (see PhoneOTPForm).
 * - Supabase OAuth is handled by the browser client and Supabase's
 *   own multi-tab sync (BroadcastChannel).
 * - No Server Component or Route Handler needs the cookie session
 *   right now (sitemap.ts, turfs.ts, sport pages all use the
 *   read-only client), so there is nothing for middleware to
 *   "keep fresh".
 *
 * The previous version called supabase.auth.getUser() here. When
 * Next fired concurrent RSC / prefetch requests, two of them raced
 * on the same refresh_token, Supabase's reuse detector kicked in,
 * and the entire session was revoked mid-navigation — the "auth is
 * failing / redirected home not logged in" symptom.
 *
 * Keeping this file as a no-op passthrough so we can re-add
 * targeted logic later without another convention shuffle.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|api/auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
