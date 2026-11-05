import { contactFieldsOf, hasUsableContact } from "../utils/contact";

// Relative imports only, so node --test runs this (lib/admin/noPhone.test.ts, npm run test:trend).

/**
 * The admin's "No phone" list: exactly the active turfs whose page shows no
 * Call and no WhatsApp (lib/utils/contact.ts hasUsableContact, the rule the
 * page's buttons read through getPhone and getWhatsAppPhone), most viewed
 * first, so the numbers worth finding first are on top.
 */

/** The contact columns of a turfs row as stored (contact_info may be JSON text). */
export type RawContactRow = { owner_phone?: unknown; contact_info?: unknown; landline_phone?: unknown; whatsapp_phone?: unknown };

/** Why a page has no number: nothing stored at all, or what is stored fails the format check. */
export type NoPhoneWhy = "none" | "bad";

// Something in a phone column: text (a number stored as a JSON number counts too, though the page can't read it).
const stored = (v: unknown) => (typeof v === "string" && v.trim() !== "") || typeof v === "number";

/** Null when the page shows Call or WhatsApp; else why it doesn't. */
export function noPhoneWhy(row: RawContactRow): NoPhoneWhy | null {
  const f = contactFieldsOf(row);
  if (hasUsableContact(f)) return null;
  return [f.owner_phone, f.contact_info?.phone, f.landline_phone, f.whatsapp_phone].some(stored) ? "bad" : "none";
}

/** Turf page views over the window admin_turf_views counts: today and the days before it, India days. */
export type TurfViews = { days: number; since: string | null; byTurf: Map<string, number> };

/** admin_turf_views' answer ({days, since, views: {turf_id: n}}); null for anything that isn't one. */
export function turfViewsOf(raw: unknown): TurfViews | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { days?: unknown; since?: unknown; views?: unknown };
  const days = Number(o.days);
  if (!Number.isInteger(days) || days < 1) return null;
  if (!o.views || typeof o.views !== "object" || Array.isArray(o.views)) return null;
  const byTurf = new Map<string, number>();
  for (const [id, n] of Object.entries(o.views as Record<string, unknown>)) {
    const v = Number(n);
    if (Number.isFinite(v) && v > 0) byTurf.set(id, Math.round(v));
  }
  return { days, since: typeof o.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.since) ? o.since : null, byTurf };
}

/**
 * The rows the page shows no number for, with why and their views (null
 * when the views could not be read): most viewed first, a turf with no
 * view in the window counting 0; ties, and every row when there are no
 * views to go by, keep the order they came in (by name).
 */
export function noPhoneList<T extends RawContactRow & { id: string }>(
  rows: readonly T[],
  views: TurfViews | null,
): (T & { why: NoPhoneWhy; views: number | null })[] {
  const out: (T & { why: NoPhoneWhy; views: number | null })[] = [];
  for (const r of rows) {
    const why = noPhoneWhy(r);
    if (why) out.push({ ...r, why, views: views ? (views.byTurf.get(r.id) ?? 0) : null });
  }
  // Array sort is stable, so equal views stay by name.
  if (views) out.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return out;
}
