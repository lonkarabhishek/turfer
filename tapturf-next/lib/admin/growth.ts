import { listedPriceAt, nightOf, weekendDate, type PricedTurf } from "../utils/prices";
import type { PriceBand } from "../../types/turf";
import { RATE_MIN, WINDOW_KEYS, WINDOW_LABEL, dayText, turfRef, type TurfRef, type WindowKey } from "./outcomeTotals";

// Relative imports only, so node --test runs this (lib/admin/growth.test.ts, npm run test:outreach).

/**
 * The admin's "People, contacts and bookings" card (the site owner, 28 Nov
 * 2026: "start tracking unique turf contacts, repeat users, completed
 * bookings and revenue. Your current visit tracking explicitly counts
 * returning arrivals as new visits, so visits should not be confused with
 * unique users."; 20261130_growth_numbers.sql,
 * components/admin/GrowthNumbers.tsx). This file reads the two answers
 * (admin_growth, admin_growth_slots), works out the estimate and has every
 * word the card shows.
 *
 * What each number is, and is not:
 * - A person is an account. A unique contact is one account and one turf:
 *   Call and WhatsApp at one turf five times is one contact of that turf.
 *   Only a signed-in tap counts, since a signed-out tap opens the sign-in
 *   and reaches no turf. The account on a tap is the one the browser said
 *   it was, which the card says once.
 * - Visitors who are not signed in are never counted as people: nothing is
 *   kept on their device to tell one from another.
 * - Bookings TapTurf can see are two numbers that are never added up:
 *   booking requests a turf confirmed on TapTurf, and players who answered
 *   "Did you get a slot?" with yes.
 * - TapTurf takes no payment, so its revenue is ₹0. The rupee figures are
 *   an estimate of booking value for turfs at each turf's listed price
 *   (lib/utils/prices.ts listedPriceAt, the turf page's own table), always
 *   called an estimate, with how many slots each stands on.
 * A share is only said from RATE_MIN people. Never the word customers, and
 * "book" never as a verb.
 */

export { RATE_MIN, WINDOW_KEYS, WINDOW_LABEL, type WindowKey };
export const DEFAULT_WINDOW: WindowKey = "d30";

/** The fold's title, and its anchor on /admin (Traffic's line links to it). */
export const GROWTH_TITLE = "People, contacts and bookings";
export const GROWTH_ID = "people-contacts-bookings";
/** The fold's line while it is closed and nothing is read yet. */
export const GROWTH_LINE = "Unique turf contacts, repeat users, the bookings TapTurf can see and an estimate of their value";
export const GROWTH_INTRO = "People here are signed-in accounts, counted from what they already did on TapTurf. Nothing new is collected for this, and nothing here says who anyone is.";

export const ACTION_KEYS = ["contact", "host", "join", "review", "tool", "request"] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export type GrowthWindow = {
  key: WindowKey;
  /** The window's first India day; for all time the day of the first tap. Null when unknown. */
  since: string | null;
  /** Every Call or WhatsApp tap. */
  taps: number;
  /** Signed-in taps: they opened the dialer or WhatsApp. */
  tapsReached: number;
  /** Signed-out taps: they opened the sign-in instead. */
  tapsSignedOut: number;
  /** Signed-in taps with no account that is on TapTurf now: in no count of people. */
  tapsNoAccount: number;
  /** tapsReached three ways: Call, WhatsApp from anywhere but Ask for a slot, and Ask for a slot. */
  call: number;
  whatsapp: number;
  slotAsk: number;
  /** Different accounts with a tap that reached a turf. */
  people: number;
  /** Different (account, turf) pairs. */
  contacts: number;
  /** Different turfs those people contacted. */
  turfs: number;
  /** Of people: contacted a turf on 2 or more different India days. */
  cameBack: number;
  /** Of people: contacted 2 or more turfs. */
  multiTurf: number;
  /** Different accounts with any counted action. */
  active: number;
  /** Of active: an action on 2 or more different India days. */
  active2Days: number;
  /** Of active: accounts with each action. */
  did: Record<ActionKey, number>;
  /** Booking requests sent in the window, and what became of them. */
  requests: number;
  confirmed: number;
  confirmedHours: number;
  confirmedOver: number;
  waiting: number;
  declined: number;
  cancelled: number;
  expired: number;
  /** "Did you get a slot?" answers, and how many said yes. */
  answered: number;
  gotSlot: number;
};

export type ContactTurf = TurfRef & { contacts: number; taps: number };

/** One of the two estimates: the slots it stands on, and the ones it could not price. */
export type EstimatePart = {
  /** Slots with a listed price: confirmed requests, or answers. */
  slots: number;
  /** Their hours: a request's own, one for an answer. */
  hours: number;
  /** The estimate in rupees, lowest and highest (the same when every slot has one price). */
  low: number;
  high: number;
  /** Of slots: the turf lists no price for that time, so its lowest to highest listed price was used. */
  rangeUsed: number;
  /** Of slots: the turf lists more than one price for that time (by format). */
  severalPrices: number;
  /** Not in the estimate: the answer names no day and hour. */
  noTime: number;
  /** Not in the estimate: the turf lists no price per hour (or is gone). */
  noPrice: number;
};
export type Estimate = { confirmed: EstimatePart; gotSlot: EstimatePart };

export type Growth = {
  today: string | null;
  windows: Record<WindowKey, GrowthWindow>;
  /** For each window: the turfs with the most unique contacts, 10 at most. */
  topTurfs: Record<WindowKey, ContactTurf[]>;
  /** Null when the slots could not be read. */
  estimate: Record<WindowKey, Estimate> | null;
  /** The slots read was cut at its cap: older slots are in no estimate. Null when whole. */
  estimateCap: number | null;
};

export type GrowthError = "forbidden" | "not_set_up" | "unavailable";
export type GrowthAnswer = { ok: true; growth: Growth } | { ok: false; error: GrowthError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const day = (v: unknown) => (typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (n: number) => n.toLocaleString("en-IN");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const DID_KEY: Record<ActionKey, string> = { contact: "did_contact", host: "did_host", join: "did_join", review: "did_review", tool: "did_tool", request: "did_request" };

function toWindow(key: WindowKey, raw: unknown): GrowthWindow {
  const o = obj(raw) ?? {};
  // Parts can never be more than their whole, whatever was sent.
  const tapsReached = count(o.taps_reached);
  const tapsSignedOut = count(o.taps_signed_out);
  const people = count(o.people);
  const active = Math.max(count(o.active), people);
  const answered = count(o.answered);
  const confirmed = count(o.confirmed);
  const did = {} as Record<ActionKey, number>;
  for (const k of ACTION_KEYS) did[k] = Math.min(count(o[DID_KEY[k]]), active);
  return {
    key,
    since: day(o.since),
    taps: tapsReached + tapsSignedOut,
    tapsReached,
    tapsSignedOut,
    tapsNoAccount: Math.min(count(o.taps_no_account), tapsReached),
    call: count(o.call),
    whatsapp: count(o.whatsapp),
    slotAsk: count(o.slot_ask),
    people,
    contacts: Math.max(count(o.contacts), people),
    turfs: count(o.turfs),
    cameBack: Math.min(count(o.came_back), people),
    multiTurf: Math.min(count(o.multi_turf), people),
    active,
    active2Days: Math.min(count(o.active_2days), active),
    did,
    requests: Math.max(count(o.requests), confirmed),
    confirmed,
    confirmedHours: count(o.confirmed_hours),
    confirmedOver: Math.min(count(o.confirmed_over), confirmed),
    waiting: count(o.waiting),
    declined: count(o.declined),
    cancelled: count(o.cancelled),
    expired: count(o.expired),
    answered,
    gotSlot: Math.min(count(o.got_slot), answered),
  };
}

function toTopTurfs(raw: unknown): ContactTurf[] {
  const out: ContactTurf[] = [];
  for (const x of list(raw)) {
    const t = obj(x);
    const ref = t && turfRef(t, "id");
    if (t && ref && count(t.contacts) > 0 && !out.some((y) => y.id === ref.id)) out.push({ ...ref, contacts: count(t.contacts), taps: Math.max(count(t.taps), count(t.contacts)) });
  }
  // The function's order, kept here too: most contacts, then most taps.
  out.sort((a, b) => b.contacts - a.contacts || b.taps - a.taps);
  return out.slice(0, 10);
}

/** admin_growth's answer as the card's counts (no estimate yet); null for anything that isn't one. */
export function toGrowthCounts(raw: unknown): Omit<Growth, "estimate" | "estimateCap"> | null {
  const o = obj(raw);
  const w = o && obj(o.windows);
  if (!o || !w || o.error !== undefined) return null;
  const top = obj(o.top_turfs) ?? {};
  return {
    today: day(o.today),
    windows: { d7: toWindow("d7", w.d7), d30: toWindow("d30", w.d30), all: toWindow("all", w.all) },
    topTurfs: { d7: toTopTurfs(top.d7), d30: toTopTurfs(top.d30), all: toTopTurfs(top.all) },
  };
}

// ── The estimate ──────────────────────────────────────────

/** A confirmed booking request: the India day it was sent, and its start as India's calendar date and clock. */
export type ConfirmedSlot = { turf: string; at: string; date: string; hour: number; hours: number };
/** A "got a slot" answer: the India day of the answer, and the slot it names (12 am and 1 am under the day whose night it is), null when it names none. */
export type GotSlot = { turf: string; at: string; date: string | null; hour: number | null };
export type SlotRows = {
  today: string | null;
  confirmed: ConfirmedSlot[];
  gotSlot: GotSlot[];
  /** Each turf's price columns, by its id. */
  turfs: Map<string, PricedTurf>;
  /** The read's cap when either list was cut at it; null when both are whole. */
  cap: number | null;
};

const isHour = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
const price = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};
const BANDS = ["morning", "day", "evening", "night"];
const DAYS = ["weekday", "weekend", "all"];

/** A turf's price columns as the page's rules read them; anything that isn't a price is no price. */
function pricedTurf(t: Record<string, unknown>): PricedTurf {
  const bands: PriceBand[] = [];
  for (const x of list(t.pricing_bands)) {
    const b = obj(x);
    const p = b && price(b.price_per_hour);
    if (b && p != null && BANDS.includes(b.band as string) && DAYS.includes(b.days as string)) bands.push({ band: b.band as PriceBand["band"], days: b.days as PriceBand["days"], format: typeof b.format === "string" ? b.format : null, price_per_hour: p });
  }
  return {
    morning_price: price(t.morning_price),
    afternoon_price: price(t.afternoon_price),
    evening_price: price(t.evening_price),
    weekend_morning_price: price(t.weekend_morning_price),
    weekend_afternoon_price: price(t.weekend_afternoon_price),
    weekend_evening_price: price(t.weekend_evening_price),
    pricing_bands: bands.length ? bands : null,
    price_unit: t.price_unit === "per_slot" || t.price_unit === "per_person" || t.price_unit === "per_hour" ? t.price_unit : null,
    slot_minutes: count(t.slot_minutes) || null,
    price_owner_confirmed: t.price_owner_confirmed === true,
  };
}

/** admin_growth_slots' answer as the rows the estimate reads; null for anything that isn't one. A row that isn't a slot is left out. */
export function toSlotRows(raw: unknown): SlotRows | null {
  const o = obj(raw);
  if (!o || o.error !== undefined || !Array.isArray(o.confirmed) || !Array.isArray(o.got_slot)) return null;
  const confirmed: ConfirmedSlot[] = [];
  for (const x of o.confirmed as unknown[]) {
    const r = obj(x);
    const at = r && day(r.at);
    const date = r && day(r.date);
    if (r && at && date && typeof r.turf === "string" && UUID.test(r.turf) && isHour(r.hour) && count(r.hours) >= 1 && count(r.hours) <= 24) confirmed.push({ turf: r.turf.toLowerCase(), at, date, hour: r.hour, hours: count(r.hours) });
  }
  const gotSlot: GotSlot[] = [];
  for (const x of o.got_slot as unknown[]) {
    const r = obj(x);
    const at = r && day(r.at);
    if (r && at && typeof r.turf === "string" && UUID.test(r.turf)) gotSlot.push({ turf: r.turf.toLowerCase(), at, date: day(r.date), hour: isHour(r.hour) ? r.hour : null });
  }
  const turfs = new Map<string, PricedTurf>();
  for (const x of list(o.turfs)) {
    const t = obj(x);
    if (t && typeof t.id === "string" && UUID.test(t.id)) turfs.set(t.id.toLowerCase(), pricedTurf(t));
  }
  const cut = count(o.confirmed_n) > confirmed.length || count(o.got_slot_n) > gotSlot.length;
  return { today: day(o.today), confirmed, gotSlot, turfs, cap: cut && count(o.cap) > 0 ? count(o.cap) : null };
}

const noPart = (): EstimatePart => ({ slots: 0, hours: 0, low: 0, high: 0, rangeUsed: 0, severalPrices: 0, noTime: 0, noPrice: 0 });

/**
 * The estimate of booking value for one window (`since`: its first India
 * day, null for all time), by the day a request was sent or an answer
 * given. A confirmed request is priced hour by hour at the turf's listed
 * price for that day and time (an hour after midnight at the rate of the
 * night it ends); an answer that names a day and an hour is one hour at
 * the listed price for that time. A slot with no time, or at a turf with
 * no listed price per hour, is counted apart and never priced.
 */
export function estimateOf(rows: SlotRows, since: string | null): Estimate {
  const confirmed = noPart();
  const gotSlot = noPart();
  for (const c of rows.confirmed) {
    if (since && c.at < since) continue;
    const turf = rows.turfs.get(c.turf);
    let low = 0;
    let high = 0;
    let range = false;
    let several = false;
    let priced = !!turf;
    for (let i = 0; turf && priced && i < c.hours; i++) {
      // The calendar date and hour of this hour's start.
      const date = addDays(c.date, Math.floor((c.hour + i) / 24));
      const hour = (c.hour + i) % 24;
      const p = listedPriceAt(turf, { weekend: weekendDate(nightOf(date, hour)), hour });
      if (!p) priced = false;
      else {
        low += p.min;
        high += p.max;
        if (p.from === "range") range = true;
        else if (p.min !== p.max) several = true;
      }
    }
    if (!priced) confirmed.noPrice++;
    else {
      confirmed.slots++;
      confirmed.hours += c.hours;
      confirmed.low += low;
      confirmed.high += high;
      if (range) confirmed.rangeUsed++;
      else if (several) confirmed.severalPrices++;
    }
  }
  for (const g of rows.gotSlot) {
    if (since && g.at < since) continue;
    if (!g.date || g.hour === null) {
      gotSlot.noTime++;
      continue;
    }
    const turf = rows.turfs.get(g.turf);
    // An answer already keeps 12 am and 1 am under the day whose night it is.
    const p = turf ? listedPriceAt(turf, { weekend: weekendDate(g.date), hour: g.hour }) : null;
    if (!p) gotSlot.noPrice++;
    else {
      gotSlot.slots++;
      gotSlot.hours++;
      gotSlot.low += p.min;
      gotSlot.high += p.max;
      if (p.from === "range") gotSlot.rangeUsed++;
      else if (p.min !== p.max) gotSlot.severalPrices++;
    }
  }
  return { confirmed, gotSlot };
}

/** The three windows' estimates, by the slots read's own India date (the windows admin_growth counts: today and the 6 or 29 days before). Null without a date. */
export function estimatesOf(rows: SlotRows): Record<WindowKey, Estimate> | null {
  if (!rows.today) return null;
  return { d7: estimateOf(rows, addDays(rows.today, -6)), d30: estimateOf(rows, addDays(rows.today, -29)), all: estimateOf(rows, null) };
}

/** Both answers as the card's numbers. `slots` null (it could not be read): no estimate, everything else stands. */
export function toGrowth(counts: unknown, slots: unknown): Growth | null {
  const c = toGrowthCounts(counts);
  if (!c) return null;
  const rows = slots == null ? null : toSlotRows(slots);
  return { ...c, estimate: rows ? estimatesOf(rows) : null, estimateCap: rows ? rows.cap : null };
}

// ── The words ─────────────────────────────────────────────

const people = (n: number) => (n === 1 ? "1 person" : `${num(n)} people`);
const things = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : undefined);
/** "in the last 30 days", "so far" for all time. */
const span = (k: WindowKey) => (k === "all" ? "so far" : `in the last ${WINDOW_LABEL[k]}`);
/** "3 of 320 (1%)": the share only from RATE_MIN in the whole; below that the two numbers alone. */
export function ofText(part: number, whole: number): string {
  return `${num(part)} of ${num(whole)}${whole >= RATE_MIN ? ` (${Math.round((part / whole) * 100)}%)` : ""}`;
}
/** "₹2,400", or "₹2,400 to ₹3,100" when the lowest and highest differ. */
export function rupeesText(low: number, high: number): string {
  const r = (n: number) => `₹${num(Math.round(n))}`;
  return low === high ? r(low) : `${r(low)} to ${r(high)}`;
}

/** Under the switch: "30 Oct to 28 Nov, India days"; for all time "Since 30 Sep". */
export function windowLine(w: GrowthWindow, today: string | null): string {
  const year = yearOf(today);
  if (w.key === "all") return w.since ? `Since ${dayText(w.since, { year })}, the first tap kept` : "All time";
  if (!w.since) return `Last ${WINDOW_LABEL[w.key]}`;
  return today ? `${dayText(w.since, { year })} to ${dayText(today)}, India days` : `From ${dayText(w.since)}`;
}

// 1. Unique turf contacts

export const CONTACTS_TITLE = "Unique turf contacts";
/** "320 people contacted a turf · 371 unique contacts". */
export function contactsHeadline(w: GrowthWindow): string {
  if (w.people === 0) return w.key === "all" ? "Nobody has contacted a turf yet." : `Nobody contacted a turf ${span(w.key)}.`;
  return `${people(w.people)} contacted a turf · ${things(w.contacts, "unique contact")}`;
}
/** "At 212 turfs."; null with none. */
export const contactsTurfsLine = (w: GrowthWindow) => (w.turfs > 0 ? `At ${things(w.turfs, "turf")}.` : null);
export const CONTACT_MEANING = "A unique contact is one person and one turf. Someone who taps Call and WhatsApp at one turf five times is one contact of that turf.";

export type TapRow = { key: "reached" | "call" | "whatsapp" | "slotAsk" | "signedOut"; label: string; n: number; /** A part of the row above it. */ part: boolean; note?: string };
/** The raw taps: the ones that reached a turf (signed in) three ways, then the signed-out ones, said plainly. */
export function tapRows(w: GrowthWindow): TapRow[] {
  return [
    { key: "reached", label: "Taps that reached a turf", n: w.tapsReached, part: false, note: "Signed in, so the tap opened the dialer or WhatsApp." },
    { key: "call", label: "Call", n: w.call, part: true },
    { key: "whatsapp", label: "WhatsApp", n: w.whatsapp, part: true },
    { key: "slotAsk", label: "Ask for a slot", n: w.slotAsk, part: true },
    { key: "signedOut", label: "Taps while signed out", n: w.tapsSignedOut, part: false, note: "These opened the sign-in instead, so they reached no turf and are not contacts." },
  ];
}
export const TOP_TURFS_TITLE = "Turfs with the most unique contacts";
export const TOP_TURFS_NONE = "No turf was contacted in these days.";
/** "12 contacts · 31 taps". */
export const topTurfLine = (t: ContactTurf) => `${things(t.contacts, "contact")} · ${things(t.taps, "tap")}`;
export const TAP_ACCOUNT_NOTE = "The account on a tap is the one the browser said it was. The server does not check it, which is fine for counting.";
export const REQUEST_SHEET_NOTE = "One exception to signed out: on a turf that takes booking requests, the Call or WhatsApp link inside the request sheet opens for someone signed out too. Those taps carry no account, so they are counted as signed out.";
/** "3 signed-in taps carry no account that is on TapTurf now, so they are in no count of people."; null with none. */
export function noAccountLine(w: GrowthWindow): string | null {
  if (w.tapsNoAccount === 0) return null;
  return `${things(w.tapsNoAccount, "signed-in tap")} ${w.tapsNoAccount === 1 ? "carries" : "carry"} no account that is on TapTurf now, so ${w.tapsNoAccount === 1 ? "it is" : "they are"} in no count of people.`;
}

// 2. Repeat users

export const REPEAT_TITLE = "Repeat users";
/** "Of the 320 people who contacted a turf:"; null with nobody. */
export const repeatIntro = (w: GrowthWindow) => (w.people === 0 ? null : w.people === 1 ? "Of the 1 person who contacted a turf:" : `Of the ${num(w.people)} people who contacted a turf:`);
export type RepeatRow = { key: "cameBack" | "multiTurf"; label: string; value: string; note: string };
export function repeatRows(w: GrowthWindow): RepeatRow[] {
  return [
    { key: "cameBack", label: "Came back on another day", value: ofText(w.cameBack, w.people), note: "Contacted a turf on 2 or more different India days." },
    { key: "multiTurf", label: "Contacted 2 or more turfs", value: ofText(w.multiTurf, w.people), note: "Different turfs, on any days." },
  ];
}
export const ACTIVE_LABEL = "Active on 2 or more days";
/** "41 of 512 signed-in people (8%)". */
export function activeValue(w: GrowthWindow): string {
  if (w.active === 0) return "Nobody yet";
  const share = w.active >= RATE_MIN ? ` (${Math.round((w.active2Days / w.active) * 100)}%)` : "";
  return `${num(w.active2Days)} of ${num(w.active)} signed-in ${w.active === 1 ? "person" : "people"}${share}`;
}
export const ACTIVE_NOTE = "Signed-in people who did any of the things below on 2 or more different India days.";
export const ACTION_LABEL: Record<ActionKey, string> = {
  contact: "Contacted a turf (a Call, WhatsApp or Ask for a slot tap that reached it)",
  host: "Hosted a game",
  join: "Joined a game",
  review: "Wrote a review",
  tool: "Used a free tool while signed in",
  request: "Sent a booking request",
};
export const ACTIONS_TITLE = "What counts, and how many people did each";
export type ActionRow = { key: ActionKey; label: string; value: string };
export function actionRows(w: GrowthWindow): ActionRow[] {
  return ACTION_KEYS.map((key) => ({ key, label: ACTION_LABEL[key], value: people(w.did[key]) }));
}
export const ACTIONS_NOTE = "Someone who did two of these is in both rows. A repeat game counts once, on the day its host set it up, and a host is not counted as joining their own game.";
export const SIGNED_OUT_NOTE =
  "Visitors who are not signed in cannot be counted as people at all: TapTurf keeps no identifier on their device unless they tap Accept on the cookie banner. So visits in Traffic are arrivals, not people, and Google Analytics, which sees accepted cookies only, is the only place that estimates returning visitors.";

// 3. Completed bookings

export const BOOKINGS_TITLE = "Completed bookings";
export const BOOKINGS_LEAD = "Two numbers, never added together. Each is only what its label says.";
export const CONFIRMED_LABEL = "Confirmed by the turf on TapTurf";
/** "3 requests · 6 hours"; "0" with none. */
export const confirmedValue = (w: GrowthWindow) => (w.confirmed === 0 ? "0" : `${things(w.confirmed, "request")} · ${things(w.confirmedHours, "hour")}`);
/** "2 are over, 1 is still to come."; null with none confirmed. */
export function confirmedWhen(w: GrowthWindow): string | null {
  if (w.confirmed === 0) return null;
  const ahead = w.confirmed - w.confirmedOver;
  const over = w.confirmedOver === 0 ? null : `${num(w.confirmedOver)} ${w.confirmedOver === 1 ? "is" : "are"} over`;
  const still = ahead === 0 ? null : `${num(ahead)} ${ahead === 1 ? "is" : "are"} still to come`;
  return `${[over, still].filter(Boolean).join(", ")}.`;
}
/** "Of 8 booking requests sent in these days: 3 confirmed · 1 waiting · 2 expired." */
export function requestsLine(w: GrowthWindow): string {
  if (w.requests === 0) return w.key === "all" ? "No booking request has been sent yet." : "No booking request was sent in these days.";
  const parts = [
    [w.confirmed, "confirmed"],
    [w.waiting, "waiting"],
    [w.declined, "declined"],
    [w.cancelled, "cancelled"],
    [w.expired, "expired"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, what]) => `${num(n)} ${what}`);
  return `Of ${things(w.requests, "booking request")} sent ${w.key === "all" ? "so far" : "in these days"}: ${said.join(" · ")}.`;
}
export const CONFIRMED_NOTE = "Booking requests are a pilot. A turf's owner turns them on, then confirms each request on myTapturf. Nothing is paid on TapTurf.";
export const GOT_SLOT_LABEL = "Players who told us they got a slot";
/** "7 of 18 who answered (39%)". */
export function gotSlotValue(w: GrowthWindow): string {
  if (w.answered === 0) return "0";
  return `${num(w.gotSlot)} of ${num(w.answered)} who answered${w.answered >= RATE_MIN ? ` (${Math.round((w.gotSlot / w.answered) * 100)}%)` : ""}`;
}
export const GOT_SLOT_NOTE = "Their answers to “Did you get a slot?” after a Call or WhatsApp tap. An answer has no account on it, so these are answers, not people.";
export const BOOKINGS_NOTE = "One player could be in both, which is why they are never added together. TapTurf sees no other bookings: most are made on a call or WhatsApp with the turf.";

// 4. Revenue

export const REVENUE_TITLE = "Revenue";
export const REVENUE_FACT = "TapTurf takes no payment, so its revenue is ₹0.";
export const ESTIMATE_TITLE = "Estimate of booking value for turfs";
export const ESTIMATE_NOTE = "An estimate at each turf's listed price for that day and time. It is what players would pay the turfs, never TapTurf's revenue, and the two figures are never added together.";
export const ESTIMATE_OFF = "The estimate could not be worked out just now.";
export type EstimateRow = {
  key: "confirmed" | "gotSlot";
  label: string;
  /** "Estimate: ₹2,400", "Estimate: ₹2,400 to ₹3,100", or "No estimate". */
  value: string;
  /** What it stands on. */
  stands: string;
  /** How a range came about; null when every slot had one price. */
  ranged: string | null;
  /** The slots with no price to go by; null with none. */
  unpriced: string | null;
};
function rangedText(p: EstimatePart): string | null {
  const parts: string[] = [];
  if (p.rangeUsed > 0) parts.push(`For ${num(p.rangeUsed)} of them the turf lists no price for that time, so its lowest to highest listed price is used.`);
  if (p.severalPrices > 0) parts.push(`For ${num(p.severalPrices)} of them the turf lists more than one price for that time, one for each format, so the lowest and the highest are both counted.`);
  return parts.length ? parts.join(" ") : null;
}
/** The two estimates, each a figure of its own with how many slots it stands on. */
export function estimateRows(e: Estimate): EstimateRow[] {
  const c = e.confirmed;
  const g = e.gotSlot;
  const gWhy = [g.noTime > 0 ? `${num(g.noTime)} ${g.noTime === 1 ? "names" : "name"} no day and hour` : null, g.noPrice > 0 ? `${num(g.noPrice)} ${g.noPrice === 1 ? "is" : "are"} at a turf with no listed price per hour` : null].filter(Boolean);
  return [
    {
      key: "confirmed",
      label: CONFIRMED_LABEL,
      value: c.slots > 0 ? `Estimate: ${rupeesText(c.low, c.high)}` : "No estimate",
      stands: c.slots > 0 ? `Stands on ${things(c.slots, "confirmed request")}, ${things(c.hours, "hour")} in all, each hour at the listed price for its time.` : c.noPrice > 0 ? "No confirmed request has a price to go by." : "No confirmed request to stand on.",
      ranged: c.slots > 0 ? rangedText(c) : null,
      unpriced: c.noPrice > 0 ? `${num(c.noPrice)} ${c.slots > 0 ? "more " : ""}${c.noPrice === 1 ? "has" : "have"} no price to go by: the turf lists no price per hour.` : null,
    },
    {
      key: "gotSlot",
      label: GOT_SLOT_LABEL,
      value: g.slots > 0 ? `Estimate: ${rupeesText(g.low, g.high)}` : "No estimate",
      stands: g.slots > 0 ? `Stands on ${things(g.slots, "answer")}, counted as one hour each: the answer doesn't say how long.` : g.noTime + g.noPrice > 0 ? "No answer has a price to go by." : "No answer to stand on.",
      ranged: g.slots > 0 ? rangedText(g) : null,
      unpriced: gWhy.length ? `${num(g.noTime + g.noPrice)} ${g.slots > 0 ? "more " : ""}${g.noTime + g.noPrice === 1 ? "has" : "have"} no price to go by: ${gWhy.join(", ")}.` : null,
    },
  ];
}
/** "Only the latest 2,000 of each are read, so older ones are in no estimate."; null when everything was read. */
export const estimateCapLine = (cap: number | null) => (cap ? `Only the latest ${num(cap)} of each are read, so older ones are in no estimate.` : null);

/** The fold's one line once read: "Last 30 days: 320 people contacted a turf, 371 unique contacts · 7 said they got a slot · 0 confirmed on TapTurf". */
export function growthFoldLine(g: Growth): string {
  const w = g.windows.d30;
  const contacted = w.people === 0 ? "nobody contacted a turf" : `${people(w.people)} contacted a turf, ${things(w.contacts, "unique contact")}`;
  return `Last 30 days: ${contacted} · ${num(w.gotSlot)} said they got a slot · ${num(w.confirmed)} confirmed on TapTurf`;
}

/** What the card says when its numbers can't be shown. Before the migration is applied it is one quiet line, not an error. */
export const NOT_SET_UP_TEXT = "These numbers aren't available yet.";
export function errorText(e: GrowthError): string {
  return e === "not_set_up" ? NOT_SET_UP_TEXT : e === "forbidden" ? "Only the site owner can see this." : "Couldn't load the numbers.";
}
