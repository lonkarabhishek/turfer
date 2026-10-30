import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { cacheKeyed, toBands } from "@/lib/queries/turfs";
import { readSportBandRows } from "@/lib/build/reads";
import { buildData, isFailed } from "@/lib/build/data";
import { sportBandMap, sportBandTimeMap, type SportBandMap, type SportBandTimeMap } from "@/lib/utils/cardSport";
import type { Turf } from "@/types/turf";

export type { SportBandMap, SportBandTimeMap };

// While building: the rows the build-data step read with this same query,
// or its note that the read failed (a failed read here, no read of our own).
async function readBandRows() {
  const built = buildData("sport-bands");
  if (isFailed(built)) throw new Error("the build-data step could not read them");
  const rows = built ?? (await readSportBandRows(createReadOnlyClient()));
  // The same checked bands as the turf page's Pricing table.
  return rows.map((r) => ({ ...r, pricing_bands: toBands(r.pricing_bands) }));
}

async function readSportBands(): Promise<SportBandMap> {
  return sportBandMap(await readBandRows());
}

async function readSportBandTimes(): Promise<SportBandTimeMap> {
  return sportBandTimeMap(await readBandRows());
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
 * decide without bands, as before bands were read (sportPrice). For a
 * minute after one the instance answers that way without reading again:
 * the /turfs chips ask on every request, and each read of a database that
 * is down waits out the guard's timeout and counts toward its breaker,
 * which then refuses every other read too. Never throws.
 *
 * Keyed by name (cacheKeyed), so the pages, the list route and the entry
 * the build wrote are one entry.
 */
export const getSportBands = memoised("getSportBands", unstable_cache(cacheKeyed("sport-bands", readSportBands), ["sport-bands-v1"], { revalidate: 86400 }));

/**
 * The same bands by time band and day type (cardSport.ts sportBandTimesOf),
 * for Ask's price-by-time chart: a venue whose card shows the range its
 * bands give a sport is charted at that sport's band for the time asked.
 * Its own entry and its own read (once a day), so the sport pages and the
 * list route, which never need it, keep reading the small one. Kept, and
 * failing, as getSportBands.
 */
export const getSportBandTimes = memoised("getSportBandTimes", unstable_cache(cacheKeyed("sport-band-times", readSportBandTimes), ["sport-band-times-v1"], { revalidate: 86400 }));

/** A cached read kept in memory and shared, as getSportBands says. Never throws. */
function memoised<T>(name: string, cached: () => Promise<T>): () => Promise<T | null> {
  const MEMO_MS = 3_600_000;
  const RETRY_MS = 60_000;
  let memo: { at: number; value: T } | null = null;
  let pending: Promise<T | null> | null = null;
  let failedAt = -Infinity;
  return () => {
    if (memo && Date.now() - memo.at < MEMO_MS) return Promise.resolve(memo.value);
    if (Date.now() - failedAt < RETRY_MS) return Promise.resolve(memo?.value ?? null);
    pending ??= cached()
      .then((value) => {
        memo = { at: Date.now(), value };
        return value;
      })
      .catch((e) => {
        failedAt = Date.now();
        console.warn(`${name}: read failed`, e instanceof Error ? e.message : e);
        return memo?.value ?? null;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
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
