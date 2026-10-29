import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { toBands } from "@/lib/queries/turfs";
import { fetchAllRows } from "@/lib/supabase/paged";
import { sportBandsOf } from "@/lib/utils/cardSport";
import type { SportBands, Turf } from "@/types/turf";

type BandRow = { id: string; pricing_bands: unknown; price_owner_confirmed: boolean | null };

/** Venue id -> the range of each sport its price bands name. Plain JSON, for the data cache. */
export type SportBandMap = Record<string, SportBands>;

async function readSportBands(): Promise<SportBandMap> {
  const supabase = createReadOnlyClient();
  const rows = await fetchAllRows<BandRow>((from, to) =>
    supabase
      .from("turfs")
      .select("id, pricing_bands, price_owner_confirmed")
      .eq("is_active", true)
      .not("pricing_bands", "is", null)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: BandRow[] | null; error: unknown }>,
  );
  const out: SportBandMap = {};
  for (const r of rows) {
    // The owner's own prices win over the bands, as on the turf page (showsPriceBands).
    if (r.price_owner_confirmed === true) continue;
    const bands = sportBandsOf(toBands(r.pricing_bands));
    if (bands) out[r.id] = bands;
  }
  return out;
}

/**
 * Which sport each active venue's listed price bands are for, and at what
 * range (lib/utils/cardSport.ts sportBandsOf), so a card on a
 * sport-filtered list shows a price only when it is that sport's
 * (cardPrice). List rows (CARD_COLUMNS and the list snapshot) carry no
 * pricing_bands, and this needs no database change: one paged anon read
 * of the 838 venues with bands (29 Oct), ids and ranges kept.
 *
 * Cached for a day and untagged, as getTurfFacts: a card a day behind a
 * band the data team changed is fine (the turf page itself is current). A
 * warm instance keeps it an hour in memory, and concurrent renders share
 * one read. A failed read gives the last copy, or null: the cards then
 * decide without bands, as before bands were read (priceIsForSport).
 * Never throws.
 */
const getSportBandsCached = unstable_cache(readSportBands, ["sport-bands-v1"], { revalidate: 86400 });
const MEMO_MS = 3_600_000;
let memo: { at: number; bands: SportBandMap } | null = null;
let pending: Promise<SportBandMap | null> | null = null;
let failLoggedAt = -Infinity;

export function getSportBands(): Promise<SportBandMap | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return Promise.resolve(memo.bands);
  pending ??= getSportBandsCached()
    .then((bands) => {
      memo = { at: Date.now(), bands };
      return bands;
    })
    .catch((e) => {
      if (Date.now() - failLoggedAt >= 30_000) {
        failLoggedAt = Date.now();
        console.warn("getSportBands: read failed", e instanceof Error ? e.message : e);
      }
      return memo?.bands ?? null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** A card row with its venue's sport bands, when it has any (the row itself is never changed). */
export function withSportBands<T extends Turf>(turf: T, bands: SportBandMap | null): T {
  const b = bands?.[turf.id];
  return b ? { ...turf, sport_bands: b } : turf;
}

// One copy per list of rows and copy of the bands (the route ranks the same
// frozen rows for every chip request until the version moves).
const listMemo = new WeakMap<readonly Turf[], { bands: SportBandMap; rows: readonly Turf[] }>();

/** Every row of a list with its sport bands (withSportBands), built once per rows and bands. */
export function listWithSportBands<T extends Turf>(turfs: readonly T[], bands: SportBandMap | null): readonly T[] {
  if (!bands) return turfs;
  const hit = listMemo.get(turfs);
  if (hit && hit.bands === bands) return hit.rows as readonly T[];
  const rows = Object.freeze(turfs.map((t) => withSportBands(t, bands)));
  listMemo.set(turfs, { bands, rows });
  return rows;
}
