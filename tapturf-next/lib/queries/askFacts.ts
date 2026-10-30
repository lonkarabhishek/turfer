import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paged";
import { cacheKeyed } from "@/lib/queries/turfs";
import { memoised } from "@/lib/queries/sportBands";
import { askTurfFacts, hoursCopyFrom, reportsCopyFrom, type HourRow, type HoursCopy, type ReportRow } from "@/lib/ai/askFacts";
import type { AskTurfFacts } from "@/lib/ai/ask";

/**
 * Router v10's data that Ask's turf rows (CARD_COLUMNS, the list snapshot)
 * leave out, for its open_at, owner_prices and player_reviews filters.
 * Claimed is in the rows already (turfs.claimed, 20261025_turf_claimed.sql),
 * as are photos: neither needs a read here.
 *
 * Two anon reads of public rows, no database change: every active turf's
 * hours and whether its owner set its prices (3,756 turfs on 30 Oct), and
 * the live TapTurf player reports (reviews_public_read: live rows only;
 * 13 on 30 Oct), ids only. Only the Ask route reads them, and only for a
 * v10 reading that asks: no page renders them, so the build reads nothing
 * new (CLAUDE.md, Build & Run).
 *
 * Cached as getSportBands is (keyed by name, kept an hour in memory,
 * shared, a failed read gives the last copy or null and is not tried
 * again for a minute). Hours for a day: a page a day behind its hours is
 * fine for "open now", and the turf page itself is current. Reports for
 * an hour, so a report a player just left counts soon. Never throws: a
 * null part leaves its filter out, and the reply says so.
 */

async function readHours(): Promise<HoursCopy> {
  const rows = await fetchAllRows<HourRow>(
    (from, to) =>
      createReadOnlyClient()
        .from("turfs")
        .select("id, opening_hours, start_time, end_time, is_24x7, price_owner_confirmed")
        .eq("is_active", true)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: HourRow[] | null; error: unknown }>,
  );
  return hoursCopyFrom(rows);
}

async function readReports(): Promise<Record<string, number>> {
  const rows = await fetchAllRows<ReportRow>(
    (from, to) =>
      createReadOnlyClient()
        .from("reviews")
        .select("id, turf_id")
        .is("source", null)
        .eq("status", "live")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: ReportRow[] | null; error: unknown }>,
  );
  return reportsCopyFrom(rows);
}

const getAskHours = memoised("getAskHours", unstable_cache(cacheKeyed("ask-hours", readHours), ["ask-hours-v1"], { revalidate: 86400 }));
const getPlayerReports = memoised("getPlayerReports", unstable_cache(cacheKeyed("ask-player-reports", readReports), ["ask-player-reports-v1"], { revalidate: 3600 }));

/** The parts a reading needs: hours (open_at) and owner prices come from one read, players' reports from the other. */
export async function getAskTurfFacts(need: { hours: boolean; reports: boolean }): Promise<AskTurfFacts> {
  const [hours, reports] = await Promise.all([need.hours ? getAskHours() : null, need.reports ? getPlayerReports() : null]);
  return askTurfFacts(hours, reports);
}
