import { parsePublic } from "./slots";
import { freeCards, type FreeAnswer, type FreeCard, type FreeRow } from "./free";

// Relative imports only, so node --test runs this (lib/availability/route.test.ts).

/**
 * GET /api/availability/<turf id> (app/api/availability/[id]/route.ts): a
 * claimed turf's free slots for its page's card, read in the browser, never
 * baked into the page (turf pages are kept a day). The CDN keeps an answer
 * a minute and serves it stale a minute more while one request refreshes it,
 * so the database sees about one read per turf a minute however many
 * players look, and an owner's tap reaches players within about 2 minutes.
 *
 * The body is the database's own shape (turf_availability,
 * 20261105_turf_availability.sql), checked again here with the same parser
 * the page uses: {"fresh":true,"updated_at","now","booked":[slot keys],
 * "requests":true|false} (requests: the turf takes booking requests on
 * TapTurf, turf_takes_requests, read in parallel), or
 * {"fresh":false} for a turf with nothing fresh to show, before the
 * migration, and when the read fails. Never 503, never a stale copy: a card
 * that cannot be read is no card.
 *
 * Each turf has one URL, availabilityPath(id): its id in lowercase, as
 * the card asks for it. Any other spelling of the path (capital letters,
 * percent-escapes) is 404 and a query string is 400, both without a
 * database read and kept a day, so neither ?x=1 nor /CCCC... can get past
 * the CDN's copy to the database.
 */

const JSON_TYPE = "application/json; charset=utf-8";
export const OK_HEADERS: Record<string, string> = {
  "Content-Type": JSON_TYPE,
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
  "X-Robots-Tag": "noindex",
};
/** A read that failed: kept 15 s, so a struggling database is not asked again by every player at once. */
export const FAILED_HEADERS: Record<string, string> = { ...OK_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=15" };
/** Never a turf (a bad id, a query string): a day. */
export const BAD_HEADERS: Record<string, string> = { ...OK_HEADERS, "Cache-Control": "public, max-age=0, s-maxage=86400" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX = "/api/availability/";

/** The one URL of a turf's free slots (lowercase id), which the card fetches. */
export function availabilityPath(turfId: string): string {
  return `${PREFIX}${turfId}`;
}
/** The database has no turf_availability yet (before the migration): nothing to show, as for any turf without slots. */
const MISSING = new Set(["PGRST202", "42883"]);
const NOT_FRESH = JSON.stringify({ fresh: false });

export type Reader = (turfId: string) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
export type AvailabilityResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Why the read failed, for the server log; never in the body. */
  failed?: string;
};

/**
 * Whether the turf takes booking requests now (turf_takes_requests,
 * 20261106_booking_requests.sql): only a plain `true` without an error
 * counts. Before that migration, on an error or a throw: no, quietly; the
 * card then keeps its Call and WhatsApp times.
 */
async function takesRequests(readRequests: Reader | undefined, id: string): Promise<boolean> {
  if (!readRequests) return false;
  try {
    const { data, error } = await readRequests(id);
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * `id`: the route's param as Next gives it (decoded); `pathname` and `search`: the request URL's own, undecoded.
 * readRequests: the booking requests flag, read alongside; a fresh body says `requests: true` only when it answers true.
 */
export async function availabilityResponse(
  req: { id: string; pathname: string; search: string },
  read: Reader,
  nowMs: number,
  readRequests?: Reader,
): Promise<AvailabilityResponse> {
  const { id, pathname, search } = req;
  if (!UUID.test(id) || pathname !== availabilityPath(id)) return { status: 404, headers: BAD_HEADERS, body: JSON.stringify({ error: "not_found" }) };
  if (search) return { status: 400, headers: BAD_HEADERS, body: JSON.stringify({ error: "bad_request" }) };
  try {
    const [{ data, error }, requests] = await Promise.all([read(id), takesRequests(readRequests, id)]);
    if (error) {
      if (error.code && MISSING.has(error.code)) return { status: 200, headers: OK_HEADERS, body: NOT_FRESH };
      return { status: 200, headers: FAILED_HEADERS, body: NOT_FRESH, failed: `${error.code ?? ""} ${error.message ?? ""}`.trim() || "error" };
    }
    const a = parsePublic(data, nowMs);
    if (!a) return { status: 200, headers: OK_HEADERS, body: NOT_FRESH };
    return { status: 200, headers: OK_HEADERS, body: JSON.stringify({ fresh: true, updated_at: a.updatedAt, now: a.now, booked: a.booked, requests }) };
  } catch (e) {
    return { status: 200, headers: FAILED_HEADERS, body: NOT_FRESH, failed: e instanceof Error ? e.message : String(e) };
  }
}

// ── GET /api/availability/free/<city or india> ──

/**
 * Free hours nearby, public (app/api/availability/free/[scope]/route.ts):
 * the turfs whose free slots players see now in one city (its id) or all of
 * India ("india"), each with its free start times in the next 36 hours
 * (lib/availability/free.ts freeCards), from the one cached reader
 * (lib/queries/freeSlots.ts). Same CDN rules as a turf's: kept a minute,
 * served stale a minute more, so the database sees at most one read a
 * minute however many ask; any other spelling of the path is 404 and a
 * query string 400, kept a day, with no read. A failed read is 503, kept
 * 15 s: never "none marked" when we could not tell.
 */
const FREE_PREFIX = "/api/availability/free/";
const SCOPE = /^[a-z][a-z-]{1,30}$/;
export const ALL_INDIA = "india";

/** The one URL of a city's free hours ("india" for all of India). */
export function freePath(city: string | null): string {
  return `${FREE_PREFIX}${city ?? ALL_INDIA}`;
}

export type FreeTurfOut = Pick<FreeRow, "id" | "slug" | "name" | "area" | "city" | "lat" | "lng"> & FreeCard;

/** `scope`: the route's param as Next gives it; `pathname` and `search`: the request URL's own. read: the cached reader (all of India). */
export async function freeResponse(
  req: { scope: string; pathname: string; search: string },
  read: () => Promise<FreeAnswer>,
  nowMs: number,
): Promise<AvailabilityResponse> {
  const { scope, pathname, search } = req;
  if (!SCOPE.test(scope) || pathname !== `${FREE_PREFIX}${scope}`) return { status: 404, headers: BAD_HEADERS, body: JSON.stringify({ error: "not_found" }) };
  if (search) return { status: 400, headers: BAD_HEADERS, body: JSON.stringify({ error: "bad_request" }) };
  const city = scope === ALL_INDIA ? null : scope;
  try {
    const answer = await read();
    const rows = answer.rows.filter((r) => !city || r.city === city);
    const cards = freeCards(rows, nowMs);
    const turfs: FreeTurfOut[] = rows.flatMap((r) => {
      const c = cards.get(r.id);
      return c ? [{ id: r.id, slug: r.slug, name: r.name, area: r.area, city: r.city, lat: r.lat, lng: r.lng, ...c }] : [];
    });
    return { status: 200, headers: OK_HEADERS, body: JSON.stringify({ now: new Date(nowMs).toISOString(), turfs }) };
  } catch (e) {
    return { status: 503, headers: FAILED_HEADERS, body: JSON.stringify({ error: "unavailable" }), failed: e instanceof Error ? e.message : String(e) };
  }
}
