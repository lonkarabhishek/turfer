import { NextResponse } from "next/server";
import { CITY_COOKIE, CITY_COOKIE_MAX_AGE, isCitySlug, isKnownCity, serializeCityChoice } from "@/lib/city";
import { detectCityFromHeaders } from "@/lib/cityRouting";
import { isLiveCity } from "@/lib/queries/cities";

/**
 * POST /api/city: store the visitor's city choice in the tt_city cookie.
 *
 * Two callers:
 * - Native <form method="post"> buttons (the city-first pick screen and
 *   "Make this my city") before the page hydrates: form fields choice
 *   and next, answered with a 303 back to next so the proxy serves the
 *   city.
 * - setCityPref on the client (JSON { choice }, keepalive): the server
 *   re-issues the cookie so Safari's 7-day cap on script-written
 *   cookies does not drop it. Answered with { value }.
 *
 * choice is a confirmed pick: a curated city id, or any other city slug
 * with active turfs (the hourly cached live list, so a city the data
 * team added since the last deploy can be chosen), or "reset" (detect
 * again from the IP headers, giving geo.<id> or unknown; only tabs on an
 * old bundle still send it). Anything else, and the retired "all", is
 * never written: a form post goes back to next unchanged (the page asks
 * again), JSON gets a 400, which CitySync answers by forgetting a cookie
 * that holds it. If the live list cannot be read, an uncurated city gets
 * a 503 (JSON) or goes back unchanged (form): never a 400 for a city that
 * may well be live. Same-origin only.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Only same-site paths: a leading "/", no "//" or "/\\" (protocol-relative),
 * and no backslash or control character anywhere, since browsers strip
 * tabs and newlines from a Location ("/\t/evil.com" would become
 * "//evil.com").
 */
function safeNext(next: string | null): string {
  if (!next || next.length > 200) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.headers.get("host")) {
      return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE });
    }
  }

  const type = req.headers.get("content-type") ?? "";
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  let choice: string | null = null;
  let next: string | null = null;
  try {
    if (isForm) {
      const f = await req.formData();
      choice = typeof f.get("choice") === "string" ? (f.get("choice") as string) : null;
      next = typeof f.get("next") === "string" ? (f.get("next") as string) : null;
    } else {
      const b = (await req.json()) as { choice?: unknown };
      choice = typeof b?.choice === "string" ? b.choice : null;
    }
  } catch {
    choice = null;
  }

  // Nothing stored: a form goes back where it came from (a cached page
  // from before 20 Oct may still post "Show all of India"), JSON gets status.
  const unchanged = (status: number) =>
    isForm
      ? new NextResponse(null, { status: 303, headers: { Location: safeNext(next), ...NO_STORE } })
      : NextResponse.json({ ok: false }, { status, headers: NO_STORE });

  let value: string;
  if (isKnownCity(choice)) value = choice;
  else if (choice === "reset") {
    const city = detectCityFromHeaders((n) => req.headers.get(n));
    value = serializeCityChoice(city ? { kind: "city", city, src: "geo" } : { kind: "unknown" });
  } else if (isCitySlug(choice)) {
    let live: boolean;
    try {
      live = await isLiveCity(choice);
    } catch {
      return unchanged(503);
    }
    if (!live) return unchanged(400);
    value = choice;
  } else {
    return unchanged(400);
  }

  const res = isForm
    ? new NextResponse(null, { status: 303, headers: { Location: safeNext(next), ...NO_STORE } })
    : NextResponse.json({ value }, { headers: NO_STORE });
  res.cookies.set(CITY_COOKIE, value, {
    path: "/",
    maxAge: CITY_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    httpOnly: false,
  });
  return res;
}
