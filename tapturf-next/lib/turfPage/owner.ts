// The words a claimed turf page shows about its owner: the
// dated "from the owner" price label, and who leads the "by @name" line
// under the name. Pure: no database, no clock of its own (the caller
// passes the render time), so the page stays one cached render.
// No "@/" imports at runtime so the unit test compiles it on its own
// (npm run test:turf).
import type { Turf } from "@/types/turf";
import { ownerSetPrices } from "../utils/prices";
import type { TurfManager, TurfManagers } from "./managers";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** India is UTC+5:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** Owner prices older than this read "last set on", not "set on": about six months. */
export const OWNER_PRICE_STALE_DAYS = 183;

/**
 * "21 Oct 2026": the day in India a timestamp falls on. The same on the
 * server and in any browser (no locale or time zone of the machine).
 * Null for a missing or unreadable date, or one more than a day after
 * `nowMs` (a clock gone wrong; a page never shows a date in the future).
 */
export function istDate(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  const t = pastTime(iso, nowMs);
  if (t == null) return null;
  const d = new Date(t + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The timestamp in ms, or null when missing, unreadable or more than a day after nowMs. */
function pastTime(iso: string | null | undefined, nowMs: number): number | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const t = Date.parse(iso.trim());
  return Number.isFinite(t) && t - nowMs <= DAY_MS ? t : null;
}

/** The owner's own prices on a claimed turf: when they last set them (null: not known), and whether that is long ago. */
export type OwnerPriceNote = { date: string | null; stale: boolean };

/**
 * Null unless the turf is claimed and its listed prices are the owner's
 * (price_owner_confirmed with real prices). A turf whose claim ended keeps
 * the owner's prices but not this label: the page says "Prices confirmed
 * by the turf" for it instead.
 */
export function ownerPriceNote(turf: Turf, claimed: boolean, nowMs: number): OwnerPriceNote | null {
  if (!claimed || !ownerSetPrices(turf)) return null;
  const t = pastTime(turf.price_verified_at, nowMs);
  if (t == null) return { date: null, stale: false };
  return { date: istDate(turf.price_verified_at, nowMs), stale: nowMs - t > OWNER_PRICE_STALE_DAYS * DAY_MS };
}

/**
 * The label beside owner prices. long (Pricing): "From the owner, set on
 * 21 Oct 2026", or "From the owner, last set on 3 Mar 2026" when stale;
 * short (the sidebar): "From the owner · 21 Oct 2026" ("· last set …"
 * when stale). With no date either way: "Prices from the owner".
 */
export function ownerPriceText(note: OwnerPriceNote, form: "long" | "short"): string {
  if (!note.date) return "Prices from the owner";
  if (form === "short") return `From the owner · ${note.stale ? "last set " : ""}${note.date}`;
  return `From the owner, ${note.stale ? "last set" : "set"} on ${note.date}`;
}

/** The second line of the owner panel's price row: "Set on 21 Oct 2026", "Last set on 3 Mar 2026", or null (no date). */
export function ownerPriceSetOn(note: OwnerPriceNote): string | null {
  if (!note.date) return null;
  return `${note.stale ? "Last set" : "Set"} on ${note.date}`;
}

/**
 * Who the "by @name" line under a claimed turf's name leads with, and how
 * many others run it ("by @a and 2 more"). Null: nobody to name (no
 * username, tagging off, or the read failed), so the badge stands alone.
 */
export function managedByLead(m: TurfManagers): { first: TurfManager; more: number } | null {
  const first = m.list[0];
  if (!first) return null;
  return { first, more: m.list.length - 1 + Math.max(m.more, 0) };
}
