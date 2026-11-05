import type { Turf } from "../../types/turf";
import { normalizeIndianMobile, normalizeIndianPhone } from "./phone";

// Relative imports only, so node --test runs this (lib/turfPage/noContact.test.ts, lib/admin/noPhone.test.ts).

/**
 * The one rule for "can a player reach this turf": the turf page's Call
 * and WhatsApp buttons (getPhone, getWhatsAppPhone in lib/utils/seo.ts
 * are these), its title and description (turfContact) and the admin's
 * No phone list (lib/admin/noPhone.ts) all read it, so the list counts
 * exactly the pages that show no Call or WhatsApp.
 */
export type ContactFields = Pick<Turf, "owner_phone" | "contact_info" | "landline_phone" | "whatsapp_phone">;

/** contact_info as a turfs row stores it (an object, or the same as JSON text), as the page reads it; null for anything else. */
export function parseContactInfo(raw: unknown): Turf["contact_info"] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  return (v || null) as Turf["contact_info"];
}

/** A raw turfs row's contact columns, mapped as transformTurf (lib/queries/turfs.ts) maps them for the page. */
export function contactFieldsOf(raw: {
  owner_phone?: unknown;
  contact_info?: unknown;
  landline_phone?: unknown;
  whatsapp_phone?: unknown;
}): ContactFields {
  return {
    owner_phone: (raw.owner_phone || null) as string | null,
    contact_info: parseContactInfo(raw.contact_info),
    landline_phone: (raw.landline_phone || null) as string | null,
    whatsapp_phone: (raw.whatsapp_phone || null) as string | null,
  };
}

/**
 * The first phone number on the turf that is actually dialable
 * (mobile or STD landline). A column holding junk counts as no phone,
 * so the page shows the no-number card instead of an empty button bar.
 */
export function callNumber(turf: ContactFields): string | null {
  return [turf.owner_phone, turf.contact_info?.phone, turf.landline_phone].find((p) => normalizeIndianPhone(p)) ?? null;
}

/** Number for the WhatsApp button: whatsapp_phone if set, else the call number when it is a mobile. */
export function whatsAppNumber(turf: ContactFields): string | null {
  return [turf.whatsapp_phone, turf.owner_phone, turf.contact_info?.phone].find((p) => normalizeIndianMobile(p)) ?? null;
}

/** True when the page shows Call or WhatsApp. A WhatsApp number alone is a way to reach the turf too. */
export function hasUsableContact(turf: ContactFields): boolean {
  return !!(callNumber(turf) || whatsAppNumber(turf));
}
