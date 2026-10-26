/**
 * How the account pages write numbers, dates and times: India time, the
 * way people here read them. Browser and server alike; no secrets.
 */

/** Where the profile is: every add or remove there comes back to it. */
export const PROFILE_PATH = "/dashboard?tab=profile";

/** The 10 digits of an Indian number ("+919876543210" -> "9876543210"), or "". */
export function phone10(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/** "+91 98765 43210". */
export function spacedPhone(p: string | null | undefined): string {
  const d = phone10(p);
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : (p ?? "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 5.5 * 3_600_000;

/** A time or a date ("2026-10-21") as India's calendar day; null when it isn't one. */
function istParts(x: string | null | undefined): { y: number; m: number; d: number; h: number; min: number; dateOnly: boolean } | null {
  if (!x) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(x);
  const t = dateOnly ? Date.parse(`${x}T00:00:00Z`) : Date.parse(x);
  if (!Number.isFinite(t)) return null;
  const v = new Date(dateOnly ? t : t + IST_MS);
  return { y: v.getUTCFullYear(), m: v.getUTCMonth(), d: v.getUTCDate(), h: v.getUTCHours(), min: v.getUTCMinutes(), dateOnly };
}

/** "21 Oct 2026". */
export function istDate(x: string | null | undefined): string {
  const p = istParts(x);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : "";
}

/** "4:30 pm" today, else "27 Oct, 4:30 pm" (India time). */
export function istWhen(x: string | null | undefined, now = Date.now()): string {
  const p = istParts(x);
  if (!p) return "";
  const time = `${((p.h + 11) % 12) + 1}:${String(p.min).padStart(2, "0")} ${p.h >= 12 ? "pm" : "am"}`;
  const today = istParts(new Date(now).toISOString());
  const sameDay = today && today.y === p.y && today.m === p.m && today.d === p.d;
  return sameDay ? time : `${p.d} ${MONTHS[p.m]}, ${time}`;
}
