import { NextResponse } from "next/server";
import { toGrowth, type GrowthAnswer, type GrowthError } from "./growth";
import type { AdminRpc } from "./outreach.server";

/**
 * The admin's "People, contacts and bookings" card on the server
 * (20261130_growth_numbers.sql; the words, the parse and the estimate in
 * lib/admin/growth.ts). The route (app/api/admin/growth) checks the site
 * owner first, as every admin route does (lib/admin/auth.ts isAdmin), then
 * calls this with `rpc`: the owner functions called with the owner's own
 * session and Firebase token as p_token, which check the site owner again
 * (public._caller_key and public._is_admin_key). Two reads at once:
 * admin_growth (the counts) and admin_growth_slots (the slots an estimate
 * of booking value stands on, with each turf's price columns). The price
 * for each slot is picked here, by the turf page's own rule
 * (lib/utils/prices.ts listedPriceAt), and only the totals go to the
 * browser: no price column, no slot. Counts, turfs and rupee totals only,
 * nothing about a person; private, no-store all the same, and a failure
 * logs the function's name and the error code only.
 *
 * Before the file is applied the database has neither function: that is
 * not an error. The route answers 200 { ok: false, error: "not_set_up" },
 * the card says "These numbers aren't available yet.", and this server
 * instance does not ask the database again for a minute (MISSING_FOR_MS).
 * When only the slots read fails the counts are shown and the card says
 * the estimate could not be worked out. Relative imports only (npm run
 * test:outreach).
 */

/** A database without the functions (before the migration) is asked again only after this long, per instance. */
export const MISSING_FOR_MS = 60_000;

const HEADERS = { "Cache-Control": "private, no-store" };
const json = (body: GrowthAnswer, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
/** Not there yet is a plain 200: nothing went wrong. */
const statusOf = (e: GrowthError) => (e === "forbidden" ? 403 : e === "not_set_up" ? 200 : 503);
/** The function isn't on the database yet (before 20261130_growth_numbers.sql). */
const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

/** The card's read, with its "not there yet" mark. One per server instance (growthReads); tests make their own. */
export function createGrowthReads(wait = MISSING_FOR_MS) {
  let missingUntil = 0;

  async function call(rpc: AdminRpc, fn: string, now: number): Promise<{ data: unknown } | { error: GrowthError }> {
    try {
      const { data, error } = await rpc(fn, {});
      if (error) {
        if (missingFn(error.code)) {
          missingUntil = now + wait;
          return { error: "not_set_up" };
        }
        console.warn(`growth admin: ${fn} failed`, error.code);
        return { error: "unavailable" };
      }
      if (data && typeof data === "object" && (data as { error?: unknown }).error === "forbidden") return { error: "forbidden" };
      return { data };
    } catch (e) {
      console.warn(`growth admin: ${fn} failed`, e instanceof Error ? e.name : "error");
      return { error: "unavailable" };
    }
  }

  return {
    /** GET /api/admin/growth: people, contacts, repeat users, bookings and the estimate, for the last 7 days, the last 30 and all time. */
    async numbers(rpc: AdminRpc, now = Date.now()): Promise<NextResponse> {
      if (now < missingUntil) return json({ ok: false, error: "not_set_up" });
      const [counts, slots] = await Promise.all([call(rpc, "admin_growth", now), call(rpc, "admin_growth_slots", now)]);
      if ("error" in counts) return json({ ok: false, error: counts.error }, statusOf(counts.error));
      // The counts stand without the slots: the card then says the estimate could not be worked out.
      const growth = toGrowth(counts.data, "error" in slots ? null : slots.data);
      return growth ? json({ ok: true, growth }) : json({ ok: false, error: "unavailable" }, 502);
    },
  };
}

export const growthReads = createGrowthReads();
