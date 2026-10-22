import { CITY_COOKIE, confirmedCity, parseCityCookie } from "../city";
import { detectCityFromHeaders } from "../cityRouting";

/**
 * The city to record for a signed-in person (admin's users by city),
 * worked out on the server from their request alone. Relative imports
 * only (npm run test:account).
 *
 * In order:
 * 1. A city they confirmed (the tt_city cookie without "geo."): picked
 *    in the city menu or pick screen, or found by GPS. The browser tells
 *    which (CITY_SRC_HEADER, saved by setCityPref); without that, or
 *    when it names another city, it counts as picked.
 * 2. The city of their internet connection on this request (Vercel's IP
 *    headers), then the one the proxy guessed on their last page load
 *    (tt_city "geo.<city>"). Approximate.
 * 3. Nothing: unknown.
 * The internet connection's own city name is kept too (ipCity), even
 * when a pick wins: it can name places outside the curated cities.
 */

export type CitySourceKind = "picked" | "gps" | "ip" | "unknown";
export type CityNote = { city: string | null; source: CitySourceKind; ipCity: string | null };

/** Sent by the browser with account calls: "<city>|<how it was chosen>", from setCityPref. */
export const CITY_SRC_HEADER = "x-tt-city-src";

const GPS = new Set(["gps", "near_me"]);
const HINT = /^([a-z][a-z-]{1,30})\|(ask|picker|gps|make_my_city|near_me|reset)$/;

type Get = (name: string) => string | null;

function cookieValue(cookie: string | null): string | null {
  return new RegExp(`(?:^|;\\s*)${CITY_COOKIE}=([^;]*)`).exec(cookie ?? "")?.[1] ?? null;
}

/** The internet connection's city name, decoded and capped, with the country when it is not India. */
function ipCityName(get: Get): string | null {
  let name = "";
  try {
    name = decodeURIComponent(get("x-vercel-ip-city") ?? "");
  } catch {
    return null;
  }
  // Only letters, marks, spaces and simple punctuation: it is shown to the owner as text.
  name = name.replace(/[^\p{L}\p{M}\s.'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 50);
  if (!name) return null;
  const country = (get("x-vercel-ip-country") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== "IN" ? `${name} (${country})` : name;
}

export function cityNote(get: Get): CityNote {
  const ipCity = ipCityName(get);
  const choice = parseCityCookie(cookieValue(get("cookie")));
  const picked = confirmedCity(choice);
  if (picked) {
    const hint = HINT.exec((get(CITY_SRC_HEADER) ?? "").trim());
    const gps = !!hint && hint[1] === picked && GPS.has(hint[2]);
    return { city: picked, source: gps ? "gps" : "picked", ipCity };
  }
  const fromIp = detectCityFromHeaders(get);
  if (fromIp) return { city: fromIp, source: "ip", ipCity };
  if (choice?.kind === "city") return { city: choice.city, source: "ip", ipCity };
  return { city: null, source: "unknown", ipCity };
}
