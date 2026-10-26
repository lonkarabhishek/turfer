import { cityInfo, isCitySlug, type CityCount } from "@/lib/city";

/**
 * The hourly live city list (/api/cities, getLiveCities) for the city
 * picker, fetched once per tab. It is the only source of the picker's
 * numbers ("Search N cities", the per-city counts): the list the server
 * hands the sheet is the footer's daily copy, which can lag a data
 * change by a day, so it supplies rows only. The openers call
 * prefetchLiveCities() on pointer-down, hover and focus, so the list is
 * usually in before the sheet paints.
 */

export type LiveRow = { id: string; label: string; state?: string; n: number };

let cache: LiveRow[] | null = null;
let pending: Promise<LiveRow[] | null> | null = null;

/** Rows labelled from lib/city.ts (title-cased for a city not curated yet). */
export function toRows(list: CityCount[]): LiveRow[] {
  return list
    .filter((c) => isCitySlug(c.id) && typeof c.n === "number")
    .map((c) => {
      const { label, state } = cityInfo(c.id);
      return { id: c.id, label, state, n: c.n };
    });
}

/** The hourly list if this tab already has it. */
export function cachedLiveCities(): LiveRow[] | null {
  return cache;
}

/** The hourly list, fetched at most once at a time; null when it can't be read (the next call tries again). */
export function loadLiveCities(): Promise<LiveRow[] | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/api/cities")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: CityCount[] | null) => {
      const live = Array.isArray(d) ? toRows(d) : [];
      if (!live.length) return null;
      cache = live;
      return live;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** For the picker's openers: start the fetch before the tap lands. */
export function prefetchLiveCities(): void {
  void loadLiveCities();
}
