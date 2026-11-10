import { mapsSearchUrl } from "../utils/maps";
import { sportLabel } from "../utils/sport";
import type { EmailGame, EmailVenue } from "./types";

/**
 * Words and escaping for the emails (lib/email/templates.ts). Days and
 * times are a game's own, stored in India time, written as people say
 * them: "Sat 15 Nov, 7 PM". Relative imports only (npm run test:email).
 */

/** Text for HTML: every character a browser or mail app could read as markup is escaped. */
export function escapeHtml(x: unknown): string {
  return String(x ?? "").replace(/[&<>"'`=]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** One line of a person's or a place's words: no control characters, spaces collapsed, at most `max` characters. */
export function oneLine(x: unknown, max = 80): string {
  if (typeof x !== "string") return "";
  const s = x.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 15 Nov" for a YYYY-MM-DD day; "" when it is not one. */
export function dayText(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return "";
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "7 PM", "6:30 AM", "12 AM" for an HH:MM time; "" when it is not one. */
export function clockText(time: string | null | undefined): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(time ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m[2] === "00" ? "" : `:${m[2]}`} ${h < 12 ? "AM" : "PM"}`;
}

/** "Sat 15 Nov, 7 PM" (the day alone when there is no time). */
export function whenText(date: string | null | undefined, time: string | null | undefined): string {
  return [dayText(date), clockText(time)].filter(Boolean).join(", ");
}

/** "Sat 15 Nov, 7 PM to 8 PM". */
export function whenRange(g: Pick<EmailGame, "date" | "start_time" | "end_time">): string {
  const end = clockText(g.end_time);
  const start = whenText(g.date, g.start_time);
  return end && clockText(g.start_time) && end !== clockText(g.start_time) ? `${start} to ${end}` : start;
}

/** A city as people write it: "pune" -> "Pune", "navi-mumbai" -> "Navi Mumbai"; a typed town as typed. */
export function cityText(city: string | null | undefined): string {
  const c = oneLine(city, 60);
  if (!/^[a-z][a-z-]*$/.test(c)) return c;
  return c.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** The place's name, never empty. */
export function venueName(v: EmailVenue | null | undefined): string {
  return oneLine(v?.name, 80) || "the venue";
}

/** "Kings Turf, Baner, Pune". */
export function venueLine(v: EmailVenue | null | undefined): string {
  const parts = [venueName(v), oneLine(v?.area, 60), cityText(v?.city)].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

const MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com"]);

/** A Google Maps link for the place: a typed venue's own link, else the point, else a search for its name and address. */
export function mapsLink(v: EmailVenue | null | undefined): string | null {
  if (!v) return null;
  try {
    if (v.maps_url) {
      const u = new URL(v.maps_url);
      if (u.protocol === "https:" && MAPS_HOSTS.has(u.hostname) && !u.username && !u.password) return u.toString();
    }
  } catch {
    /* not a link: a search instead */
  }
  const address = [v.address, v.area, cityText(v.city)].map((x) => oneLine(x, 200)).filter(Boolean).join(", ");
  return mapsSearchUrl({ lat: v.lat, lng: v.lng, name: v.name, address });
}

/** "₹150 per player", or null when the game is free or has no price. */
export function priceText(p: number | string | null | undefined): string | null {
  const n = typeof p === "number" ? p : typeof p === "string" && p.trim() !== "" ? Number(p) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)} per player`;
}

/** "Ravi", "Ravi and Zoya", "Ravi, Zoya and Priya", "Ravi, Zoya and 3 others". */
export function namesText(names: string[], max = 3): string {
  const clean = names.map((n) => oneLine(n, 60)).filter(Boolean);
  if (clean.length === 0) return "A player";
  if (clean.length === 1) return clean[0];
  if (clean.length <= max) return `${clean.slice(0, -1).join(", ")} and ${clean.at(-1)}`;
  const rest = clean.length - (max - 1);
  return `${clean.slice(0, max - 1).join(", ")} and ${rest} others`;
}

/** The sport as the app says it everywhere a game shows ("cricket" -> "Cricket"; lib/utils/sport.ts), never empty. */
export function sportText(s: string | null | undefined): string {
  const one = oneLine(s, 40);
  return one ? sportLabel(one) : "Your game";
}

/**
 * A game that starts after midnight and before 5 AM: players think of it as
 * the night before, so its "tomorrow" reminder (6 PM the day before) says
 * "tonight, after midnight". The same rule as email_clock in
 * 20261110_email.sql (start_time < 05:00).
 */
export function afterMidnight(time: string | null | undefined): boolean {
  return /^0[0-4]:[0-5]\d/.test(time ?? "");
}
