import { cityInfo, isCitySlug } from "../city";
import { callNumber, contactFieldsOf, contactLinks, whatsAppNumber } from "../utils/contact";
import { turfPath } from "../utils/turfPath";
import { outreachMessage } from "../report/message";

// Relative imports only, so node --test runs this (lib/admin/outreach.test.ts, npm run test:outreach).

/**
 * The admin's Owner outreach section (20261113_owner_outreach.sql,
 * components/admin/OwnerOutreach.tsx): the turfs of one city, most Call
 * and WhatsApp taps first, for the team to phone or WhatsApp their owners
 * with the free report (/report/<token>) and a note of who was contacted.
 * A turf's numbers are picked exactly as its page's Call and WhatsApp
 * buttons pick them (lib/utils/contact.ts: callNumber, whatsAppNumber,
 * contactLinks), so the team rings the number players ring.
 */

export const OUTREACH_STATUSES = ["not_contacted", "contacted", "interested", "not_interested", "wrong_number"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const STATUS_LABEL: Record<OutreachStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
};
export const isOutreachStatus = (v: unknown): v is OutreachStatus => OUTREACH_STATUSES.includes(v as OutreachStatus);

export const OUTREACH_DAYS = [30, 90] as const;
export type OutreachDays = (typeof OUTREACH_DAYS)[number];
export const DEFAULT_CITY = "hyderabad";
export const NOTE_MAX = 200;
export const BY_MAX = 40;
/** Rows shown at first, and added by each "Show more". */
export const PAGE_SIZE = 50;

export type Claim = "active" | "pending" | null;
export const claimLabel = (c: Claim) => (c === "active" ? "Claimed" : c === "pending" ? "Claim waiting" : "Not claimed");

export type OutreachRow = {
  id: string;
  /** The turf's page (lib/utils/turfPath.ts). */
  path: string;
  name: string;
  area: string | null;
  views: number;
  calls: number;
  whatsapp: number;
  claim: Claim;
  /** The page's Call number: tel: link and how it reads; null when the page has no Call button. */
  call: { e164: string; local: string; landline: boolean } | null;
  /** The page's WhatsApp number (wa.me digits and how it reads); null when the page has no WhatsApp button. */
  wa: { digits: string; local: string } | null;
  /** The owner's report link; null when this deployment can't sign one (no ACCOUNT_KEY). */
  report: string | null;
  /** The prefilled WhatsApp message (the last 30 days' numbers, as the report shows); null without a report link. */
  message: string | null;
  status: OutreachStatus;
  note: string | null;
  by: string | null;
  at: string | null;
};

export type OutreachCity = { id: string; label: string; n: number };
export type OutreachList = { city: string; days: OutreachDays; since: string | null; today: string | null; cities: OutreachCity[]; turfs: OutreachRow[] };

export type OutreachAnswer = { ok: true; list: OutreachList } | { ok: false; error: "forbidden" | "not_set_up" | "unavailable" | "bad" };
export type OutreachSaved = { status: OutreachStatus; note: string | null; by: string | null; at: string | null };
export type OutreachSetAnswer = { ok: true; saved: OutreachSaved } | { ok: false; error: "forbidden" | "not_set_up" | "unavailable" | "bad" | "not_found" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The city asked for: a slug-shaped city, else hyderabad. */
export function outreachCity(raw: unknown): string {
  const c = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isCitySlug(c) ? c : DEFAULT_CITY;
}

/** The window asked for: 90, else 30. */
export function outreachDays(raw: unknown): OutreachDays {
  return Number(raw) === 90 ? 90 : 30;
}

/** A saved note as the functions answer it ({status, note, by, at}). */
export function toSaved(raw: unknown): OutreachSaved | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!isOutreachStatus(o.status)) return null;
  return { status: o.status, note: str(o.note), by: str(o.by), at: typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? o.at : null };
}

/**
 * admin_owner_outreach's answer as the section's list; null for anything
 * that isn't one. `reportUrl` signs a turf's report link (null when it
 * can't). The order is the function's: most taps, then most views, then
 * by name; kept here too, so the list is right whatever sent it.
 */
export function toOutreachList(raw: unknown, reportUrl: (turfId: string) => string | null): OutreachList | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.city !== "string" || !Array.isArray(o.turfs)) return null;
  const turfs: OutreachRow[] = [];
  for (const x of o.turfs as Record<string, unknown>[]) {
    if (!x || typeof x.id !== "string" || !UUID.test(x.id)) continue;
    const name = str(x.name);
    if (!name) continue;
    // The page's own rule: the numbers its buttons would use, from the same columns.
    const fields = contactFieldsOf({ owner_phone: x.owner_phone, contact_info: x.contact_phone ? { phone: x.contact_phone } : null, landline_phone: x.landline_phone, whatsapp_phone: x.whatsapp_phone });
    const links = contactLinks(callNumber(fields), whatsAppNumber(fields));
    const claim: Claim = x.claim === "active" || x.claim === "pending" ? x.claim : null;
    const report = reportUrl(x.id);
    const saved = toSaved(x);
    turfs.push({
      id: x.id,
      path: turfPath({ id: x.id, slug: str(x.slug) }),
      name,
      area: str(x.area),
      views: count(x.views),
      calls: count(x.calls),
      whatsapp: count(x.whatsapp),
      claim,
      call: links.call ? { e164: links.call.e164, local: links.call.local, landline: links.call.type === "landline" } : null,
      wa: links.whatsapp ? { digits: links.whatsapp.digits, local: links.whatsapp.local } : null,
      report,
      message: report ? outreachMessage({ name, taps: count(x.taps30), views: count(x.views30), reportUrl: report, claimed: claim === "active" }) : null,
      status: saved?.status ?? "not_contacted",
      note: saved?.note ?? null,
      by: saved?.by ?? null,
      at: saved?.at ?? null,
    });
  }
  turfs.sort((a, b) => b.calls + b.whatsapp - (a.calls + a.whatsapp) || b.views - a.views || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
  const cities: OutreachCity[] = [];
  for (const c of Array.isArray(o.cities) ? (o.cities as Record<string, unknown>[]) : []) {
    if (!c || typeof c.city !== "string" || !isCitySlug(c.city)) continue;
    cities.push({ id: c.city, label: cityInfo(c.city).label, n: count(c.n) });
  }
  cities.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : null);
  return { city: o.city, days: outreachDays(o.days), since: day(o.since), today: day(o.today), cities, turfs };
}

/** The fold's one line: "Hyderabad: 432 turfs, 12 claimed, 30 contacted". */
export function outreachFoldLine(l: OutreachList): string {
  const claimed = l.turfs.filter((t) => t.claim === "active").length;
  const contacted = l.turfs.filter((t) => t.status !== "not_contacted").length;
  const n = l.turfs.length;
  return `${cityInfo(l.city).label}: ${n.toLocaleString("en-IN")} ${n === 1 ? "turf" : "turfs"}, ${claimed} claimed, ${contacted} contacted`;
}

/** A POST body's note: one line, trimmed; null for none; false when over 200 characters or not text. */
export function noteOf(raw: unknown): string | null | false {
  if (raw == null) return null;
  if (typeof raw !== "string") return false;
  const s = raw.replace(/\s+/g, " ").trim();
  return s.length > NOTE_MAX ? false : s || null;
}

/** The team member's typed name: one line, at most 40 characters; null for none. */
export function byOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.replace(/\s+/g, " ").trim().slice(0, BY_MAX).trim() || null;
}
