import { normalizeIndianMobile, normalizeIndianPhone } from "../utils/phone";

/**
 * The call and WhatsApp numbers in the myTapturf editor. Pure, relative
 * imports only (npm run test:my).
 *
 * owner_update_turf (20261028_owner_call_number.sql) takes owner_phone (a
 * mobile, or a landline with its STD code) and whatsapp_phone (a mobile),
 * stores each as +91 and 10 digits, and writes the call number over every
 * number the turf page's Call button could dial. The database checks it
 * all again; this only says what's wrong before the save.
 */

/** The numbers owner_dashboard returns for a turf. The first three are missing on an older database. */
export type TurfNumbers = {
  owner_phone?: string | null;
  contact_phone?: string | null;
  landline_phone?: string | null;
  whatsapp_phone?: string | null;
};

export type NumberField = "owner_phone" | "whatsapp_phone";

/** The number the turf page's Call button dials: the first one it can (getPhone in lib/utils/seo.ts). */
export function shownCallNumber(t: TurfNumbers): string | null {
  return [t.owner_phone, t.contact_phone, t.landline_phone].find((p) => normalizeIndianPhone(p)) ?? null;
}

/** A stored number as the editor shows it after +91: 10 digits for a mobile, 0 and the STD code and number for a landline. */
export function numberInput(raw: string | null | undefined): string {
  const n = normalizeIndianPhone(raw);
  if (!n) return "";
  return n.type === "mobile" ? n.local : `0${n.local}`;
}

/** What a typed number is: a mobile, a landline with its STD code, or neither (null, also for a blank). */
export function numberKind(typed: string): "mobile" | "landline" | null {
  return normalizeIndianPhone(typed)?.type ?? null;
}

/** A typed call number as it saves: "" clears it; +91 and 10 digits for a mobile or a landline with its STD code; null when it is neither. */
export function readCallNumber(typed: string): string | null {
  if (!typed.trim()) return "";
  return normalizeIndianPhone(typed)?.e164 ?? null;
}

/** A typed WhatsApp number as it saves: "" clears it; +91 and 10 digits for a mobile; null for anything else (a landline can't take WhatsApp). */
export function readWhatsApp(typed: string): string | null {
  if (!typed.trim()) return "";
  return normalizeIndianMobile(typed)?.e164 ?? null;
}

/** The editor's two fields as typed. owner_phone is left out when the database can't save it yet. */
export type NumberForm = { owner_phone?: string; whatsapp_phone: string };
export type SaveError = { error: string; field?: string };

/**
 * The number keys for owner_update_turf: a number is sent only when its
 * saved value changes (the same number typed another way is no change).
 * Checked as the database does: a field that isn't a number, or a change
 * that would leave the page with nothing to call or WhatsApp, is an error
 * and nothing should be sent. The second check needs the call field: on an
 * older database (no owner_phone in the form) the editor can't tell which
 * number the page dials, so owner_update_turf decides, as it did before.
 */
export function numberPatch(base: NumberForm, form: NumberForm): { patch: Partial<Record<NumberField, string>>; error: SaveError | null } {
  const patch: Partial<Record<NumberField, string>> = {};
  const read: Record<NumberField, (s: string) => string | null> = { owner_phone: readCallNumber, whatsapp_phone: readWhatsApp };
  for (const k of ["owner_phone", "whatsapp_phone"] as const) {
    const typed = form[k];
    // Not shown, or not touched (a stored number the editor can't read stays as it is).
    if (typed === undefined || typed === base[k]) continue;
    const v = read[k](typed);
    if (v === null) return { patch: {}, error: { error: "bad_value", field: k } };
    if (v !== read[k](base[k] ?? "")) patch[k] = v;
  }
  if (Object.keys(patch).length > 0 && form.owner_phone !== undefined) {
    const call = patch.owner_phone !== undefined ? patch.owner_phone : readCallNumber(form.owner_phone);
    const wa = patch.whatsapp_phone !== undefined ? patch.whatsapp_phone : readWhatsApp(form.whatsapp_phone);
    if (!call && !wa) return { patch: {}, error: { error: "no_number" } };
  }
  return { patch, error: null };
}

const HELD_TEXT: Record<string, string> = { description: "description", surface_type: "surface", closed_days: "closed days" };

/** What to tell the owner when owner_update_turf (or numberPatch) says no. */
export function saveMessage(r: SaveError): string {
  if (r.error === "bad_value") {
    if (r.field === "owner_phone") return "Check the call number: use a 10-digit mobile, or a landline with its STD code.";
    if (r.field === "whatsapp_phone") return "Check the WhatsApp number: it needs to be a 10-digit mobile.";
    return `Check ${r.field ? r.field.replace(/_/g, " ") : "your changes"}: that value doesn't look right.`;
  }
  if (r.error === "held") {
    // A phone number the description, surface or closed days didn't have before is held as well (the page shows them).
    const text = r.field ? HELD_TEXT[r.field] : undefined;
    if (text) return `You can add a phone number to your ${text} two weeks after you got in. Take the number out to save the rest. If it's urgent, email info@tapturf.in.`;
    return "You can change your numbers two weeks after you got in. Undo the number change to save the rest. If it's urgent, email info@tapturf.in.";
  }
  if (r.error === "no_number") return "Keep at least one number, so players can reach you.";
  return "Couldn't save. Sign in again and retry.";
}
