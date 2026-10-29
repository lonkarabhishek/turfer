/**
 * What a search snippet must check before it promises something, but the
 * list rows (CARD_COLUMNS, lib/build/reads.ts) leave out: which turfs a
 * player can call or WhatsApp (the page's buttons), which show timings,
 * and which names two turfs in one city share. Made from one read of the
 * active turfs (lib/queries/turfFacts.ts); only ids and keys are kept.
 *
 * Pure (relative imports only), so node --test runs it.
 */
import type { Turf } from "../../types/turf";
import { isCity } from "../city";
import { cleanVenueName } from "../utils/bookingApps";
import { normaliseOpeningHours } from "../utils/hours";
import { orderPhotos } from "../utils/images";
import { getPhone, getWhatsAppPhone } from "../utils/seo";
import { normPlace, seoName } from "./turfMeta";

/** The columns the facts read selects. */
export const TURF_FACT_COLUMNS =
  "id, name, city, owner_phone, contact_info, landline_phone, whatsapp_phone, opening_hours, start_time, end_time, is_24x7";

export type TurfFactRow = Pick<
  Turf,
  "id" | "name" | "city" | "owner_phone" | "landline_phone" | "whatsapp_phone" | "opening_hours" | "start_time" | "end_time" | "is_24x7"
> & { contact_info: unknown };

export interface TurfFacts {
  /** sharedNameKey()s that two or more active turfs have. */
  sharedNames: string[];
  /** Turfs whose page shows a Call or WhatsApp button. */
  contact: string[];
  /** Turfs whose page shows timings. */
  hours: string[];
}

/** Two turfs in one city with the same key show the same name ("gurgaon|sportyzo sports academy"); "" without a city or a comparable name. */
export function sharedNameKey(name: string, cityId: string | null | undefined): string {
  if (!cityId || !isCity(cityId)) return "";
  const n = normPlace(seoName(cleanVenueName(name ?? ""), cityId, null));
  return n ? `${cityId}|${n}` : "";
}

export function turfFactsFrom(rows: readonly TurfFactRow[]): TurfFacts {
  const seen = new Map<string, number>();
  const contact: string[] = [];
  const hours: string[] = [];
  // The read pages by offset, one statement a page: a turf added mid-read
  // shifts the next page back a row, so a row can come twice. Counted twice,
  // its name would look shared with itself.
  const ids = new Set<string>();
  for (const r of rows) {
    if (ids.has(r.id)) continue;
    ids.add(r.id);
    const key = sharedNameKey(r.name, r.city);
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    let ci = r.contact_info;
    if (typeof ci === "string") {
      try {
        ci = JSON.parse(ci);
      } catch {
        ci = null;
      }
    }
    const t = { ...r, contact_info: ci && typeof ci === "object" ? ci : null } as unknown as Turf;
    if (getPhone(t) || getWhatsAppPhone(t)) contact.push(r.id);
    if (normaliseOpeningHours(r.opening_hours, { start_time: r.start_time, end_time: r.end_time, is_24x7: r.is_24x7 }).length > 0) hours.push(r.id);
  }
  return { sharedNames: [...seen].filter(([, n]) => n >= 2).map(([k]) => k), contact, hours };
}

/** The sets the listing templates count from; null when the read failed (they then promise only what the list rows show). */
export interface TurfReach {
  contact: ReadonlySet<string>;
  hours: ReadonlySet<string>;
}

const reachMemo = new WeakMap<TurfFacts, TurfReach>();
export function reachOf(facts: TurfFacts | null): TurfReach | null {
  if (!facts) return null;
  let r = reachMemo.get(facts);
  if (!r) reachMemo.set(facts, (r = { contact: new Set(facts.contact), hours: new Set(facts.hours) }));
  return r;
}

/** What a listing of these turfs can promise: how many show timings, photos, a Google rating, a way to call or WhatsApp. */
export interface ListingReach {
  withHours: number;
  withPhotos: number;
  rated: number;
  contactable: number;
}

export function listingReach(
  turfs: readonly Pick<Turf, "id" | "images" | "rating" | "total_reviews" | "opening_hours" | "start_time" | "end_time" | "is_24x7">[],
  reach: TurfReach | null,
): ListingReach {
  // The list rows carry start/end/24x7 but not opening_hours or phones: those come from `reach`.
  const timed = (t: (typeof turfs)[number]) =>
    !!reach?.hours.has(t.id) || normaliseOpeningHours(t.opening_hours, { start_time: t.start_time, end_time: t.end_time, is_24x7: t.is_24x7 }).length > 0;
  return {
    withHours: turfs.filter(timed).length,
    withPhotos: turfs.filter((t) => orderPhotos(t.images ?? []).length > 0).length,
    rated: turfs.filter((t) => Number(t.rating) > 0 && Number(t.total_reviews) > 0).length,
    contactable: reach ? turfs.filter((t) => reach.contact.has(t.id)).length : 0,
  };
}
