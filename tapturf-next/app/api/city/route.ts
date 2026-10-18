import { NextResponse } from "next/server";
import { CITY_COOKIE, CITY_COOKIE_MAX_AGE, isKnownCity, serializeCityChoice } from "@/lib/city";
import { detectCityFromHeaders } from "@/lib/cityRouting";

/**
 * POST /api/city: store the visitor's city choice in the tt_city cookie.
 *
 * Two callers:
 * - Native <form method="post"> buttons (the first-visit ask and "Make
 *   this my city") before the page hydrates: form fields choice and
 *   next, answered with a 303 back to next so the proxy serves the city.
 * - setCityPref on the client (JSON { choice }, keepalive): the server
 *   re-issues the cookie so Safari's 7-day cap on script-written
 *   cookies does not drop it. Answered with { value }.
 *
 * choice is "all", a curated city id, or "reset" (detect again from the
 * IP headers, giving geo.<id> or unknown). Same-origin only.
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

  let value: string;
  if (choice === "all" || isKnownCity(choice)) value = choice as string;
  else if (choice === "reset") {
    const city = detectCityFromHeaders((n) => req.headers.get(n));
    value = serializeCityChoice(city ? { kind: "city", city, src: "geo" } : { kind: "unknown" });
  } else {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
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
