import { cityInfo } from "../city";
import { turfPath } from "../utils/turfPath";

// Relative imports only, so node --test runs this (lib/admin/outcomeTotals.test.ts, npm run test:outreach).

/**
 * The admin's "Did you get a slot?" card (the site owner, 26 Nov 2026: "In
 * admin can I see responses to the Did you get the slot popup?";
 * 20261127_contact_outcome_totals.sql, components/admin/OutcomeTotals.tsx):
 * what players answered when the site asked them, after a Call or WhatsApp
 * tap, whether they got a slot (lib/outcome/). All turfs, for the last 7
 * India days, the last 30 and all time (admin_contact_outcome_totals), and
 * every answer one by one, newest first (admin_contact_outcome_list).
 * This file reads both answers and has every word the card shows.
 *
 * The words: the headline counts the players who ANSWERED (got a slot, not
 * this time, still deciding), never rows; a card closed without an answer
 * is said apart and is in no rate; a share is only said from RATE_MIN
 * answers, below that the two numbers stand alone. Never a booking, a
 * customer or a name: a row has nothing about who answered. The slot an
 * "Ask for a slot" answer is about is the latest one asked for at that
 * turf before the answer, a match by turf and time and not a stored link,
 * and the card says so (LIST_NOTE).
 */

export const WINDOW_KEYS = ["d7", "d30", "all"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];
export const WINDOW_LABEL: Record<WindowKey, string> = { d7: "7 days", d30: "30 days", all: "All time" };
/** What the list read is asked for each window (0: every answer kept). */
export const WINDOW_DAYS: Record<WindowKey, 7 | 30 | 0> = { d7: 7, d30: 30, all: 0 };
export const DEFAULT_WINDOW: WindowKey = "d30";
/** A share of the answers is only said from this many answers. */
export const RATE_MIN = 10;

export const SAID_KEYS = ["gotSlot", "full", "price", "noReply", "wrongNumber", "justAsking", "noReason", "deciding"] as const;
export type SaidKey = (typeof SAID_KEYS)[number];
/** What a player said, as the card's rows name it. */
export const SAID_LABEL: Record<SaidKey | "dismissed", string> = {
  gotSlot: "Got a slot",
  full: "Slot was full",
  price: "Too costly",
  noReply: "No reply",
  wrongNumber: "Wrong number",
  justAsking: "Just asking",
  noReason: "No reason given",
  deciding: "Still deciding",
  dismissed: "Closed without answering",
};
/** In one answer's row "No reason given" reads as what they tapped. */
export const ROW_SAID_LABEL: Record<SaidKey | "dismissed", string> = { ...SAID_LABEL, noReason: "Not this time" };

export type TapCount = { answered: number; closed: number };
export type OutcomeWindow = Record<SaidKey, number> & {
  key: WindowKey;
  /** The window's first India day; for all time the day of the first answer. Null when unknown. */
  since: string | null;
  /** Players who answered: the eight counts above, added up. */
  answered: number;
  /** Cards closed without an answer. */
  dismissed: number;
  /** Different turfs with an answer. */
  turfsAnswered: number;
  call: TapCount;
  whatsapp: TapCount;
  slotAsk: TapCount;
};

export type TurfRef = {
  id: string;
  /** Null for a turf that is no longer in the list of turfs. */
  name: string | null;
  /** The city's label; null when unknown. */
  city: string | null;
  /** Its page; null for a turf that is switched off or gone (its page is not there). */
  path: string | null;
};
export type TopTurf = TurfRef & Record<SaidKey, number> & { answered: number };
export type WrongTurf = TurfRef & { reports: number; last: string | null };
export type HourCount = { hour: number; n: number };

export type OutcomeTotals = {
  today: string | null;
  windows: Record<WindowKey, OutcomeWindow>;
  /** The last 30 days: the turfs with the most answers, 10 at most. */
  topTurfs: TopTurf[];
  /** The last 30 days: turfs a player said have a wrong number, 20 at most. */
  wrongNumbers: WrongTurf[];
  /** How many such turfs there are in all. */
  wrongNumberTurfs: number;
  /** The last 30 days: the hours players said they got, 5 at most. */
  hours: HourCount[];
};

export type OutcomeError = "forbidden" | "not_set_up" | "unavailable";
export type OutcomeTotalsAnswer = { ok: true; totals: OutcomeTotals } | { ok: false; error: OutcomeError };
export type OutcomeListAnswer = { ok: true; list: AnswerList } | { ok: false; error: OutcomeError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const day = (v: unknown) => (typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (n: number) => n.toLocaleString("en-IN");

const SQL_KEY: Record<SaidKey, string> = { gotSlot: "got_slot", full: "full", price: "price", noReply: "no_reply", wrongNumber: "wrong_number", justAsking: "just_asking", noReason: "no_reason", deciding: "deciding" };

function saidCounts(o: Record<string, unknown>): Record<SaidKey, number> {
  const out = {} as Record<SaidKey, number>;
  for (const k of SAID_KEYS) out[k] = count(o[SQL_KEY[k]]);
  return out;
}
const sum = (s: Record<SaidKey, number>) => SAID_KEYS.reduce((n, k) => n + s[k], 0);

/** A tap's rows as answered and closed; answers can never be more than its rows. */
function tapCount(rows: unknown, answered: unknown): TapCount {
  const all = count(rows);
  const a = Math.min(count(answered), all);
  return { answered: a, closed: all - a };
}

function toWindow(key: WindowKey, raw: unknown): OutcomeWindow {
  const o = obj(raw) ?? {};
  const said = saidCounts(o);
  return {
    key,
    since: day(o.since),
    ...said,
    // Worked out from the counts themselves, so the rows always add up to the headline.
    answered: sum(said),
    dismissed: count(o.dismissed),
    turfsAnswered: count(o.turfs_answered),
    call: tapCount(o.call, o.call_answered),
    whatsapp: tapCount(o.whatsapp, o.whatsapp_answered),
    slotAsk: tapCount(o.slot_ask, o.slot_ask_answered),
  };
}

function turfRef(x: Record<string, unknown>, idKey: "id" | "turf"): TurfRef | null {
  const id = x[idKey];
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const name = str(x.name);
  const city = str(x.city);
  return {
    id: id.toLowerCase(),
    name: name ? name.slice(0, 160) : null,
    city: city && /^[a-z0-9][a-z0-9 -]{0,39}$/.test(city) ? cityInfo(city.replace(/\s+/g, "-")).label : null,
    path: x.active === true && name ? turfPath({ id, slug: str(x.slug) }) : null,
  };
}

/** admin_contact_outcome_totals' answer as the card's totals; null for anything that isn't one. */
export function toOutcomeTotals(raw: unknown): OutcomeTotals | null {
  const o = obj(raw);
  const w = o && obj(o.windows);
  if (!o || !w || o.error !== undefined) return null;
  const topTurfs: TopTurf[] = [];
  for (const x of Array.isArray(o.top_turfs) ? (o.top_turfs as unknown[]) : []) {
    const t = obj(x);
    const ref = t && turfRef(t, "id");
    if (!t || !ref) continue;
    const said = saidCounts(t);
    if (sum(said) > 0) topTurfs.push({ ...ref, ...said, answered: sum(said) });
  }
  // The function's order: most answers, then most got a slot; kept here too, so the list is right whatever sent it.
  topTurfs.sort((a, b) => b.answered - a.answered || b.gotSlot - a.gotSlot);
  const wrongNumbers: WrongTurf[] = [];
  for (const x of Array.isArray(o.wrong_numbers) ? (o.wrong_numbers as unknown[]) : []) {
    const t = obj(x);
    const ref = t && turfRef(t, "id");
    if (t && ref && count(t.wrong_number) > 0) wrongNumbers.push({ ...ref, reports: count(t.wrong_number), last: day(t.last) });
  }
  wrongNumbers.sort((a, b) => b.reports - a.reports || (b.last ?? "").localeCompare(a.last ?? ""));
  const hours: HourCount[] = [];
  for (const x of Array.isArray(o.hours) ? (o.hours as unknown[]) : []) {
    const h = obj(x);
    if (h && isHour(h.hour) && count(h.n) > 0 && !hours.some((y) => y.hour === h.hour)) hours.push({ hour: h.hour, n: count(h.n) });
  }
  hours.sort((a, b) => b.n - a.n || a.hour - b.hour);
  return {
    today: day(o.today),
    windows: { d7: toWindow("d7", w.d7), d30: toWindow("d30", w.d30), all: toWindow("all", w.all) },
    topTurfs: topTurfs.slice(0, 10),
    wrongNumbers: wrongNumbers.slice(0, 20),
    wrongNumberTurfs: Math.max(count(o.wrong_number_turfs), wrongNumbers.length),
    hours: hours.slice(0, 5),
  };
}

// ── The words ─────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const IST_MS = 330 * 60_000;
const isHour = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
const players = (n: number) => (n === 1 ? "1 player" : `${num(n)} players`);
const turfs = (n: number) => (n === 1 ? "1 turf" : `${num(n)} turfs`);

/** "7 pm", "12 am", "7:30 pm". */
export function hourText(hour: number, minute = 0): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "am" : "pm"}`;
}

/** "24 Nov" for a YYYY-MM-DD day, with the weekday ("Mon 24 Nov") when asked, and the year when it isn't `year`. */
export function dayText(d: string, o: { weekday?: boolean; year?: number } = {}): string {
  const t = new Date(`${d}T00:00:00Z`);
  const y = t.getUTCFullYear();
  return `${o.weekday ? `${WEEKDAYS[t.getUTCDay()]} ` : ""}${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}${o.year !== undefined && o.year !== y ? ` ${y}` : ""}`;
}

const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : undefined);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The headline: "18 players answered · 7 got a slot (39%)". The share only from RATE_MIN answers; below that the two numbers alone. */
export function headline(w: OutcomeWindow): string {
  if (w.answered === 0) return w.key === "all" ? "Nobody has answered yet." : `Nobody answered in the last ${WINDOW_LABEL[w.key]}.`;
  const got = w.gotSlot === 0 ? "none got a slot" : `${num(w.gotSlot)} got a slot`;
  const share = w.answered >= RATE_MIN && w.gotSlot > 0 ? ` (${Math.round((w.gotSlot / w.answered) * 100)}%)` : "";
  return `${players(w.answered)} answered · ${got}${share}`;
}

/** Under the headline: "20 Nov to 26 Nov · answers about 15 turfs"; for all time "Since 17 Nov · ...". */
export function windowLine(w: OutcomeWindow, today: string | null): string {
  const year = yearOf(today);
  const dates = !w.since ? (w.key === "all" ? "All time" : `Last ${WINDOW_LABEL[w.key]}`) : w.key === "all" ? `Since ${dayText(w.since, { year })}` : today ? `${dayText(w.since, { year })} to ${dayText(today)}` : `From ${dayText(w.since)}`;
  return w.turfsAnswered > 0 ? `${dates} · answers about ${turfs(w.turfsAnswered)}` : dates;
}

export type SaidRow = { key: SaidKey; label: string; n: number; /** Its part of the answers, 0 to 1. */ share: number; /** "7 of the 18 who answered". */ title: string };

/** The eight rows, in the card's order, zeros kept (a 0 is an answer too). */
export function breakdown(w: OutcomeWindow): SaidRow[] {
  return SAID_KEYS.map((key) => ({ key, label: SAID_LABEL[key], n: w[key], share: w.answered > 0 ? w[key] / w.answered : 0, title: w.answered > 0 ? `${num(w[key])} of the ${num(w.answered)} who answered` : "Nobody answered" }));
}

export const CLOSED_LABEL = "Closed the card without answering";
export const CLOSED_NOTE = "Not an answer, so not counted in anything above.";

export type TapRow = { key: "call" | "whatsapp" | "slotAsk"; label: string; line: string };
export const TAPS_NOTE = "Ask for a slot opens WhatsApp, so its answers are in the WhatsApp row too.";

/** "12 answered · 18 closed the card", for a Call tap, a WhatsApp tap and "Ask for a slot". */
export function tapRows(w: OutcomeWindow): TapRow[] {
  const line = (t: TapCount) => `${num(t.answered)} answered · ${num(t.closed)} closed the card`;
  return [
    { key: "call", label: "After a Call tap", line: line(w.call) },
    { key: "whatsapp", label: "After a WhatsApp tap", line: line(w.whatsapp) },
    { key: "slotAsk", label: "After Ask for a slot", line: line(w.slotAsk) },
  ];
}

/** A turf's name as the card says it; a turf that is gone has none. */
export const turfName = (t: TurfRef) => t.name ?? "A turf no longer listed";
/** After the name of a turf whose page is not there: it is switched off. Null for a listed turf, and for one that is gone (its name already says so). */
export const turfState = (t: TurfRef) => (t.name && !t.path ? "not listed now" : null);

/** "2 players said this number is wrong · last on 24 Nov". */
export function wrongLine(t: WrongTurf, today: string | null): string {
  return `${players(t.reports)} said this number is wrong${t.last ? ` · last on ${dayText(t.last, { year: yearOf(today) })}` : ""}`;
}

/** "and 3 more turfs" when the list was cut; null when it is whole. */
export function wrongMore(t: OutcomeTotals): string | null {
  const more = t.wrongNumberTurfs - t.wrongNumbers.length;
  return more > 0 ? `and ${num(more)} more ${more === 1 ? "turf" : "turfs"}` : null;
}

const SHORT: Record<SaidKey, string> = { gotSlot: "got a slot", full: "slot full", price: "too costly", noReply: "no reply", wrongNumber: "wrong number", justAsking: "just asking", noReason: "no reason given", deciding: "still deciding" };

/** "5 answered: 3 got a slot · 1 slot full · 1 still deciding". */
export function topLine(t: TopTurf): string {
  return `${num(t.answered)} answered: ${SAID_KEYS.filter((k) => t[k] > 0)
    .map((k) => `${num(t[k])} ${SHORT[k]}`)
    .join(" · ")}`;
}

/** "7 pm": the hours players said they got, each with how many said it. */
export function hourRows(hours: HourCount[]): { hour: number; label: string; n: number }[] {
  return hours.map((h) => ({ hour: h.hour, label: h.hour < 2 ? `${hourText(h.hour)} (late night)` : hourText(h.hour), n: h.n }));
}

/** The fold's one line: "Last 30 days: 18 players answered, 7 got a slot · 2 turfs with a wrong number". */
export function outcomeFoldLine(t: OutcomeTotals): string {
  const w = t.windows.d30;
  const said = w.answered === 0 ? "nobody answered" : `${players(w.answered)} answered, ${w.gotSlot === 0 ? "none" : num(w.gotSlot)} got a slot`;
  return `Last 30 days: ${said}${t.wrongNumberTurfs > 0 ? ` · ${turfs(t.wrongNumberTurfs)} with a wrong number` : ""}`;
}

/** What the card says when its numbers can't be shown. Before the migration is applied it is one quiet line, not an error. */
export const NOT_SET_UP_TEXT = "Totals aren't available yet.";
export function errorText(e: OutcomeError): string {
  return e === "not_set_up" ? NOT_SET_UP_TEXT : e === "forbidden" ? "Only the site owner can see this." : "Couldn't load the answers.";
}

// ── Every answer ──────────────────────────────────────────

/** Rows shown at first, and added by each "Show more". */
export const LIST_PAGE = 20;
/** The read's own ceiling (admin_contact_outcome_list): the latest 200 are all the list ever shows. */
export const LIST_MAX = 200;
export const LIST_NOTE = "The slot is the latest one asked for at that turf before the answer.";
export const CLOSED_SWITCH = "Show the ones who closed it too";

export type Via = "call" | "whatsapp" | "slot_ask" | "free_slots";
export const VIA_LABEL: Record<Via, string> = { call: "Call", whatsapp: "WhatsApp", slot_ask: "Ask for a slot", free_slots: "Free slots" };

/** The slot asked for with "Ask for a slot": the calendar date and time of its start, how long, and when it was asked. */
export type Ask = { date: string; hour: number; minute: number; minutes: number; sport: string | null; players: number | null; at: number };
export type AnswerRow = {
  id: string;
  /** When it was answered. */
  at: number;
  turf: TurfRef;
  via: Via;
  said: SaidKey | "dismissed";
  /** The slot the answer itself names: a day (0 and 1 o'clock are that day's late night), an hour, or both. Null when neither. */
  slot: { date: string | null; hour: number | null } | null;
  /** The ask this answer most likely answers; null when there is none. */
  ask: Ask | null;
};
export type AnswerList = { days: 7 | 30 | 0; dismissed: boolean; /** How many the window holds, under the same switch. */ n: number; rows: AnswerRow[] };

/** How the player reached the turf: Ask for a slot and the Free slots card's times by where the tap was, else the tap's kind. */
export function viaOf(kind: unknown, source: unknown): Via | null {
  if (source === "slot_ask") return "slot_ask";
  if (source === "turf_slots" || source === "turf_request") return "free_slots";
  return kind === "call" || kind === "whatsapp" ? kind : null;
}

function saidOf(outcome: unknown, reason: unknown): SaidKey | "dismissed" | null {
  if (outcome === "got_slot") return "gotSlot";
  if (outcome === "deciding") return "deciding";
  if (outcome === "dismissed") return "dismissed";
  if (outcome !== "not_this_time") return null;
  if (reason == null) return "noReason";
  return SAID_KEYS.find((k) => SQL_KEY[k] === reason && k !== "gotSlot" && k !== "deciding" && k !== "noReason") ?? null;
}

const instant = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);

function toAsk(raw: unknown): Ask | null {
  const a = obj(raw);
  const date = a && day(a.date);
  const at = a && instant(a.at);
  if (!a || !date || at == null || !isHour(a.hour)) return null;
  const minute = typeof a.minute === "number" && Number.isInteger(a.minute) && a.minute >= 0 && a.minute <= 59 ? a.minute : 0;
  const minutes = typeof a.minutes === "number" && Number.isInteger(a.minutes) && a.minutes >= 30 && a.minutes <= 600 ? a.minutes : 60;
  const sport = str(a.sport);
  return { date, hour: a.hour, minute, minutes, sport: sport ? sport.slice(0, 30) : null, players: count(a.players) > 0 && count(a.players) <= 99 ? count(a.players) : null, at };
}

/** admin_contact_outcome_list's answer as the card's list; null for anything that isn't one. A row that isn't an answer is left out. */
export function toAnswerList(raw: unknown): AnswerList | null {
  const o = obj(raw);
  if (!o || o.error !== undefined || !Array.isArray(o.rows)) return null;
  const rows: AnswerRow[] = [];
  const seen = new Set<string>();
  for (const x of o.rows as unknown[]) {
    const r = obj(x);
    const turf = r && turfRef(r, "turf");
    const at = r && instant(r.at);
    const via = r && viaOf(r.kind, r.source);
    const said = r && saidOf(r.outcome, r.reason);
    const id = r && (typeof r.id === "number" || typeof r.id === "string") ? String(r.id) : null;
    if (!r || !turf || at == null || !via || !said || !id || seen.has(id)) continue;
    seen.add(id);
    const date = day(r.slot_date);
    const hour = isHour(r.slot_hour) ? r.slot_hour : null;
    rows.push({ id, at, turf, via, said, slot: date || hour !== null ? { date, hour } : null, ask: via === "slot_ask" ? toAsk(r.ask) : null });
  }
  rows.sort((a, b) => b.at - a.at);
  const days = o.days === 7 ? 7 : o.days === 0 ? 0 : 30;
  return { days, dismissed: o.dismissed === true, n: Math.max(count(o.n), rows.length), rows: rows.slice(0, LIST_MAX) };
}

/** What the list route is asked: ?days=7|30|0 (else 30), ?limit= 1 to 200 (else 20), ?closed=1. */
export function listQuery(q: URLSearchParams): { days: 7 | 30 | 0; limit: number; dismissed: boolean } {
  const d = q.get("days");
  const l = Number(q.get("limit"));
  return { days: d === "7" ? 7 : d === "0" ? 0 : 30, limit: Number.isInteger(l) && l >= 1 ? Math.min(l, LIST_MAX) : LIST_PAGE, dismissed: q.get("closed") === "1" };
}

/** How many to ask for after another "Show more". */
export const listNext = (want: number) => Math.min(Math.max(want, 0) + LIST_PAGE, LIST_MAX);

/** Whether "Show more" is offered, how many are left, and whether the list is at its ceiling with older answers it can't show. */
export function listPage(l: AnswerList, want: number): { more: boolean; left: number; capped: boolean } {
  const left = Math.max(0, l.n - l.rows.length);
  return { more: left > 0 && want < LIST_MAX, left, capped: left > 0 && want >= LIST_MAX };
}

export const LIST_CAP_LINE = `These are the latest ${LIST_MAX} answers.`;

/** "18 answers" over the list; with closed cards shown, "45 answers and closed cards". */
export function listCountLine(l: AnswerList): string {
  if (l.n === 0) return l.dismissed ? "No answers or closed cards here." : "No answers here.";
  if (l.dismissed) return `${num(l.n)} ${l.n === 1 ? "answer or closed card" : "answers and closed cards"}`;
  return `${num(l.n)} ${l.n === 1 ? "answer" : "answers"}`;
}

/** "26 Nov, 7:27 pm": when it was answered, in India time; the year when it isn't this one. */
export function whenText(at: number, now: number): string {
  const d = new Date(at + IST_MS);
  const year = new Date(now + IST_MS).getUTCFullYear();
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() !== year ? ` ${d.getUTCFullYear()}` : ""}, ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** The slot an answer names: "Mon 24 Nov, 1 pm"; an hour with no day is just the hour; a day with no hour just the day. 0 and 1 o'clock are that day's late night. */
export function slotText(s: { date: string | null; hour: number | null }): string {
  const h = s.hour === null ? null : s.hour < 2 && s.date ? `${hourText(s.hour)} (late night)` : hourText(s.hour);
  return [s.date ? dayText(s.date, { weekday: true }) : null, h].filter(Boolean).join(", ");
}

/** The slot asked for: "Sat 28 Nov, 3 pm to 5 pm, football, 8 players". */
export function askText(a: Ask): string {
  const end = a.hour * 60 + a.minute + a.minutes;
  const range = `${hourText(a.hour, a.minute)} to ${hourText(Math.floor(end / 60) % 24, end % 60)}`;
  return [`${dayText(a.date, { weekday: true })}, ${range}`, a.sport, a.players ? players(a.players) : null].filter(Boolean).join(", ");
}

/** "answered 1 min after asking": how long after the ask the answer came. Just the gap. Null when the ask is not before the answer. */
export function gapText(askedAt: number, answeredAt: number): string | null {
  const ms = answeredAt - askedAt;
  if (!(ms >= 0)) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "answered less than a minute after asking";
  if (min < 60) return `answered ${min} min after asking`;
  const h = Math.floor(min / 60);
  return `answered ${h} h${min % 60 ? ` ${min % 60} min` : ""} after asking`;
}

/** The answer's own slot and the ask name the same start: the same calendar day and, where the answer names one, the same hour. */
function sameSlot(slot: { date: string | null; hour: number | null }, ask: Ask): boolean {
  // An answer keeps 0 and 1 o'clock under the day whose night it is; an ask keeps the calendar date of the start.
  const date = slot.date && slot.hour !== null && slot.hour < 2 ? addDays(slot.date, 1) : slot.date;
  return (date === null || date === ask.date) && (slot.hour === null || slot.hour === ask.hour);
}

export type RowWords = {
  when: string;
  via: string;
  said: string;
  /** After what they said, when no ask was matched: "for Mon 24 Nov, 1 pm". */
  named: string | null;
  /** "Asked for Sat 28 Nov, 3 pm to 5 pm, football". */
  asked: string | null;
  /** "Said: Tue 24 Nov, 1 pm", only when the answer names a slot other than the one asked for. */
  saidSlot: string | null;
  /** "answered 1 min after asking". */
  gap: string | null;
};

/** Every word of one answer's row. */
export function rowWords(r: AnswerRow, now: number): RowWords {
  const base = { when: whenText(r.at, now), via: VIA_LABEL[r.via], said: ROW_SAID_LABEL[r.said] };
  if (!r.ask) return { ...base, named: r.slot ? `for ${slotText(r.slot)}` : null, asked: null, saidSlot: null, gap: null };
  return { ...base, named: null, asked: `Asked for ${askText(r.ask)}`, saidSlot: r.slot && !sameSlot(r.slot, r.ask) ? `Said: ${slotText(r.slot)}` : null, gap: gapText(r.ask.at, r.at) };
}
