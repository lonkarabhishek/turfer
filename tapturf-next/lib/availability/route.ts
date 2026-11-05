import { parsePublic } from "./slots";

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
 * the page uses: {"fresh":true,"updated_at","now","booked":[slot keys]}, or
 * {"fresh":false} for a turf with nothing fresh to show, before the
 * migration, and when the read fails. Never 503, never a stale copy: a card
 * that cannot be read is no card.
 *
 * A query string is refused (400) without a database read, so ?x=1 cannot
 * get past the CDN's copy to the database.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export async function availabilityResponse(id: string, search: string, read: Reader, nowMs: number): Promise<AvailabilityResponse> {
  if (!UUID.test(id)) return { status: 404, headers: BAD_HEADERS, body: JSON.stringify({ error: "not_found" }) };
  if (search) return { status: 400, headers: BAD_HEADERS, body: JSON.stringify({ error: "bad_request" }) };
  try {
    const { data, error } = await read(id);
    if (error) {
      if (error.code && MISSING.has(error.code)) return { status: 200, headers: OK_HEADERS, body: NOT_FRESH };
      return { status: 200, headers: FAILED_HEADERS, body: NOT_FRESH, failed: `${error.code ?? ""} ${error.message ?? ""}`.trim() || "error" };
    }
    const a = parsePublic(data, nowMs);
    if (!a) return { status: 200, headers: OK_HEADERS, body: NOT_FRESH };
    return { status: 200, headers: OK_HEADERS, body: JSON.stringify({ fresh: true, updated_at: a.updatedAt, now: a.now, booked: a.booked }) };
  } catch (e) {
    return { status: 200, headers: FAILED_HEADERS, body: NOT_FRESH, failed: e instanceof Error ? e.message : String(e) };
  }
}
