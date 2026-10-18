import { NextResponse, type NextRequest } from "next/server";
import { CITY_COOKIE, CITY_COOKIE_MAX_AGE } from "./lib/city";
import { decide } from "./lib/cityRouting";

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
 * So this file must never touch Supabase auth.
 */

/**
 * City personalisation (lib/cityRouting.ts decide() has the rules).
 * Pure CPU: reads headers and the tt_city cookie, may set that cookie,
 * then rewrites or passes through. No network, no Supabase, no route
 * segment config (Next fails the build on it in the proxy file).
 *
 * - A visitor with a city (cookie, or detected from Vercel's IP headers
 *   on this request) is rewritten from /, /turfs (without ?q=) and
 *   /games to that city's static ISR twin under app/c/[city]. The URL in
 *   the browser, the metadata and the canonical stay the public ones.
 * - Crawlers (no cookie) get no detection, no cookie and no rewrite: the
 *   all-India page at the canonical URL.
 * - Direct hits on /c are 308'd to the public URL.
 *
 * Matcher:
 * - "/", "/turfs", "/games" match every request kind (document, RSC
 *   navigation, prefetch). If their RSC or prefetch requests were
 *   skipped, the client router would cache the all-India payload and
 *   lose the city after the first client navigation. The cookie is still
 *   written only on documents: a prefetch sent before a pick but answered
 *   after it must not overwrite the pick; clients that block cookies
 *   would otherwise get Set-Cookie on every prefetch; and the first
 *   request of every visit is a document anyway.
 * - "/c/:path*" always matches, so RSC hits on internal paths also 308.
 * - Every other page path runs only for real document loads: `missing`
 *   is evaluated on the raw headers before Next strips the flight
 *   headers, so the dozens of /turf/[id] card prefetches on a listing
 *   never invoke the proxy, while a visitor who lands on /turf/x from
 *   Google still gets the cookie.
 * - Excluded entirely: /api (including auth/callback, geo, city,
 *   cities), /admin, /_next, any path with a file extension (images,
 *   icons, the Google verification html), robots.txt, sitemap.xml and
 *   manifest.webmanifest.
 */
export function proxy(req: NextRequest) {
  try {
    const d = decide({
      method: req.method,
      pathname: req.nextUrl.pathname,
      search: req.nextUrl.search,
      header: (n) => req.headers.get(n),
      cookie: req.cookies.get(CITY_COOKIE)?.value,
    });
    if (d.action === "redirect") {
      const url = req.nextUrl.clone();
      const [p, q = ""] = d.location.split("?");
      url.pathname = p;
      url.search = q ? `?${q}` : "";
      return NextResponse.redirect(url, 308);
    }
    let res: NextResponse;
    if (d.action === "rewrite") {
      const url = req.nextUrl.clone();
      url.pathname = d.pathname;
      res = NextResponse.rewrite(url);
    } else {
      // Plain next(), never next({ request }): no request headers change.
      res = NextResponse.next();
    }
    if (d.setCookie) {
      res.cookies.set(CITY_COOKIE, d.setCookie, {
        path: "/",
        maxAge: CITY_COOKIE_MAX_AGE,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        httpOnly: false,
      });
    }
    if (process.env.VERCEL_ENV !== "production") res.headers.set("x-tt-city", d.debug);
    return res;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/",
    "/turfs",
    "/games",
    "/c/:path*",
    {
      source:
        "/((?!api(?:/|$)|admin(?:/|$)|_next/|c/|favicon\\.ico|images/|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.[a-zA-Z0-9]+$).*)",
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-router-prefetch" },
      ],
    },
  ],
};
