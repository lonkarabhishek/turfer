import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { toBands } from "@/lib/queries/turfs";
import { readSportBandRows } from "@/lib/build/reads";
import { buildData, isFailed } from "@/lib/build/data";
import { sportBandMap, type SportBandMap } from "@/lib/utils/cardSport";
import type { Turf } from "@/types/turf";

export type { SportBandMap };

// While building: the rows the build-data step read with this same query,
// or its note that the read failed (a failed read here, no read of our own).
async function readSportBands(): Promise<SportBandMap> {
  const built = buildData("sport-bands");
  if (isFailed(built)) throw new Error("the build-data step could not read them");
  const rows = built ?? (await readSportBandRows(createReadOnlyClient()));
  // The same checked bands as the turf page's Pricing table.
  return sportBandMap(rows.map((r) => ({ ...r, pricing_bands: toBands(r.pricing_bands) })));
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
 * decide without bands, as before bands were read (sportPrice).
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
