import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paged";
import { cacheKeyed } from "@/lib/queries/turfs";
import { memoised } from "@/lib/queries/sportBands";
import { extraFactsOf, filterFactsOf, type ExtraFacts, type FactRow, type TurfFilterFacts } from "@/lib/turfList/facts";
import type { FactsLookup } from "@/lib/turfList/query";

/**
 * What the listing's Filters sheet filters on (lib/turfList/facts.ts), for
 * GET /api/turfs/list only: no page reads it, so no prerender does and the
 * build-data step needs no hook.
 *
 * Most of it is in the list snapshot's rows already (CARD_COLUMNS: the
 * facility columns, amenities, 24x7, start and end), current with every
 * list purge. The rest (researched opening_hours, coaching, surface) the
 * snapshot leaves out, and this needs no database change for it: one
 * paged anon read of every active turf's id and those three columns,
 * cached an hour and untagged (no purge reads it again), kept as compact
 * week spans and flags. A turf's hours here can be an hour or two behind
 * its row; its page is current. A failed read gives the last copy, or
 * none: the toggles from the rows still work, and "Open now" goes by the
 * rows' start and end alone (getSportBands has the rules).
 */

type ExtraRow = { id: string; opening_hours: unknown; coaching_available: unknown; surface_type: unknown };

async function readExtras(): Promise<Record<string, ExtraFacts>> {
  const db = createReadOnlyClient();
  const rows = await fetchAllRows<ExtraRow>(
    (from, to) =>
      db
        .from("turfs")
        .select("id, opening_hours, coaching_available, surface_type")
        .eq("is_active", true)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: ExtraRow[] | null; error: unknown }>,
  );
  const out: Record<string, ExtraFacts> = {};
  for (const r of rows) {
    const e = extraFactsOf(r);
    if (e && typeof r.id === "string") out[r.id] = e;
  }
  return out;
}

export const getListFactExtras = memoised("getListFactExtras", unstable_cache(cacheKeyed("list-fact-extras", readExtras), ["list-fact-extras-v1"], { revalidate: 3600 }));

// One lookup per copy of the rows and copy of the extras (the route ranks
// the same frozen rows until the version moves).
const memo = new WeakMap<readonly object[], { extras: Record<string, ExtraFacts> | null; facts: FactsLookup }>();

/** Every active turf's filter facts by id, from these rows (activeTurfRows: all of India) and the extras. */
export function listFactsFrom(rows: readonly Record<string, unknown>[], extras: Record<string, ExtraFacts> | null): FactsLookup {
  const hit = memo.get(rows);
  if (hit && hit.extras === extras) return hit.facts;
  const facts = new Map<string, TurfFilterFacts>();
  for (const r of rows) {
    const id = r.id;
    if (typeof id === "string") facts.set(id, filterFactsOf(r as FactRow, extras?.[id]));
  }
  memo.set(rows, { extras, facts });
  return facts;
}
