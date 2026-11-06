import { clockLabel, isSlotKey, keyTime, shortDate, slotDays, type SlotDay, type SlotHours, type SlotKey } from "../availability/slots";
import type { BookingStatus, ChangedBy, MyBookingRequest, OwnerBookingRequest, OwnerBookings } from "./types";

// Relative imports only, so node --test runs this (lib/booking/requests.test.ts, npm run test:booking).

/**
 * Booking requests' rules and words, shared by the turf page's sheet
 * (components/turf/RequestSheet.tsx), the Me tab (components/dashboard/
 * MyBookingRequests.tsx), the owner's list on myTapturf (components/my/
 * BookingRequests.tsx) and the routes (lib/booking/server.ts). The database
 * (supabase/migrations/20261106_booking_requests.sql) checks every rule
 * again; the constants are its constants (a test reads them from the SQL).
 */

/** The most hours one request asks for (= private.booking_max_hours()). */
export const MAX_HOURS = 3;
/** A player's requests waiting for an answer, across all turfs (= private.booking_max_waiting()). */
export const MAX_WAITING = 3;
/** A player's waiting requests at one turf for one India date (= private.booking_max_per_turf_day()). */
export const MAX_PER_TURF_DAY = 1;
/** Requests a player sends in 24 hours, cancelled ones too (= private.booking_max_sends()). */
export const MAX_SENDS_PER_DAY = 10;
/** The most rows one list gives (= private.booking_list_max()). */
export const LIST_MAX = 50;
/** A note for the turf, at most (= the note check in private.booking_requests). */
export const NOTE_MAX = 140;
/** The owner's reason, at most (= the reason check in private.booking_requests). */
export const REASON_MAX = 140;

const HOUR_MS = 3_600_000;
const STATUSES: readonly BookingStatus[] = ["waiting", "confirmed", "declined", "cancelled", "expired"];
const CHANGED: readonly ChangedBy[] = ["owner", "player", "taken", "clock"];

// ── Times ──

/** "Sun 8 Nov, 7 PM to 9 PM": the start's India date, and the hours (= private.booking_when; lib/booking/when.cases.json). */
export function whenText(at: SlotKey, hours: number): string {
  if (!isSlotKey(at)) return "";
  const start = Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
  return `${shortDate(at.slice(0, 10))}, ${clockLabel(start)} to ${clockLabel(start + hours * 60)}`;
}

/** The start's India date: "Sat 7 Nov". */
export function whenDay(at: SlotKey): string {
  return isSlotKey(at) ? shortDate(at.slice(0, 10)) : "";
}

export type HourChoice = { hours: number; /** "8 PM" */ until: string; /** "7 PM to 8 PM" */ range: string };

/**
 * How long a player may ask for from the hour they tapped: 1 hour, then each
 * next hour of that day while it is free and starts exactly an hour after
 * the one before, MAX_HOURS at most. Nothing when the tapped hour is booked
 * or isn't one of the day's.
 */
export function hourChoices(day: SlotDay, booked: ReadonlySet<SlotKey>, at: SlotKey): HourChoice[] {
  const i = day.slots.findIndex((s) => s.key === at);
  if (i < 0 || booked.has(at)) return [];
  const first = day.slots[i];
  const start = Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
  const out: HourChoice[] = [];
  for (let k = 0; k < MAX_HOURS; k++) {
    const s = day.slots[i + k];
    if (!s || booked.has(s.key) || s.ms !== first.ms + k * HOUR_MS) break;
    out.push({ hours: k + 1, until: clockLabel(start + (k + 1) * 60), range: `${clockLabel(start)} to ${clockLabel(start + (k + 1) * 60)}` });
  }
  return out;
}

/**
 * The route's check before it asks the database: `at` is an hour still to
 * come of one of the days the card shows (the turf's own opening hours,
 * lib/availability/slots.ts slotDays), and the n - 1 hours after it are that
 * day's next hours, each an hour after the one before. No off-grid start, no
 * run past closing.
 */
export function requestFits(hours: SlotHours, nowMs: number, at: SlotKey, n: number): boolean {
  if (!isSlotKey(at) || !Number.isInteger(n) || n < 1 || n > MAX_HOURS) return false;
  for (const day of slotDays(hours, nowMs)) {
    const i = day.slots.findIndex((s) => s.key === at);
    if (i < 0) continue;
    for (let k = 1; k < n; k++) {
      const s = day.slots[i + k];
      if (!s || s.ms !== day.slots[i].ms + k * HOUR_MS) return false;
    }
    return true;
  }
  return false;
}

/** A request's state as the database works it out: a waiting one whose start has come is expired. */
export function effectiveStatus(status: BookingStatus, at: SlotKey, nowMs: number): BookingStatus {
  return status === "waiting" && !(keyTime(at) > nowMs) ? "expired" : status;
}

/** The player may still cancel it: waiting or confirmed, not started. */
export function canCancel(r: Pick<MyBookingRequest, "status" | "at">, nowMs: number): boolean {
  const s = effectiveStatus(r.status, r.at, nowMs);
  return (s === "waiting" || s === "confirmed") && keyTime(r.at) > nowMs;
}

/** The Me tab's order: waiting and confirmed ones still to come first, then the rest; newest sent first in each. */
export function sortMine(list: readonly MyBookingRequest[], nowMs: number): MyBookingRequest[] {
  const open = (r: MyBookingRequest) => canCancel(r, nowMs);
  return [...list].sort((a, b) => Number(open(b)) - Number(open(a)) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** How many wait for the turf's answer (the Me tab's Requests count). */
export function waitingCount(list: readonly MyBookingRequest[], nowMs: number): number {
  return list.filter((r) => effectiveStatus(r.status, r.at, nowMs) === "waiting").length;
}

// ── The sheet ──

export type SheetOutcome = "sent" | "off" | "own" | "no_phone" | "taken" | "limit_waiting" | "limit_day" | "limit_sends" | "sign_in" | "failed";

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** What the sheet shows after Send, from the route's answer (status 0: no answer). A start that has passed counts as taken. */
export function sendOutcome(status: number, body: unknown): SheetOutcome {
  const b = isObj(body) ? body : {};
  if (status >= 200 && status < 300 && b.r === "ok") return "sent";
  if (status === 401 || b.error === "sign_in") return "sign_in";
  switch (b.reason) {
    case "off":
      return "off";
    case "own":
      return "own";
    case "no_phone":
      return "no_phone";
    case "taken":
    case "past":
    case "started":
      return "taken";
    case "waiting":
      return "limit_waiting";
    case "day":
      return "limit_day";
    case "sends":
      return "limit_sends";
  }
  if (b.error === "bad" && b.field === "at") return "taken";
  return "failed";
}

/** The WhatsApp the sent sheet offers: it says it was sent on TapTurf, names the day and hours, asks the turf to confirm. No emoji. */
export function requestWhatsAppText(a: { turfName: string; when: string }): string {
  return `Hi! I just sent a request on TapTurf for *${a.turfName}*: ${a.when}. Please confirm it on myTapturf: https://www.tapturf.in/my`;
}

// ── Answers ──

const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hoursOk = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= MAX_HOURS;

/** One of the player's requests, or null when it is not well formed. */
export function parseMineRow(x: unknown): MyBookingRequest | null {
  if (!isObj(x)) return null;
  const id = str(x.id);
  const turf = str(x.turf_id);
  if (!id || !UUID.test(id) || !turf || !UUID.test(turf) || !isSlotKey(x.at) || !hoursOk(x.hours)) return null;
  if (!STATUSES.includes(x.status as BookingStatus) || typeof x.created_at !== "string") return null;
  const changed = CHANGED.includes(x.changed_by as ChangedBy) ? (x.changed_by as ChangedBy) : null;
  return {
    id,
    turf_id: turf,
    turf_name: str(x.turf_name),
    turf_slug: typeof x.turf_slug === "string" && /^[a-z0-9-]{1,120}$/.test(x.turf_slug) ? x.turf_slug : null,
    at: x.at,
    hours: x.hours,
    when: str(x.when) ?? whenText(x.at, x.hours),
    note: str(x.note),
    status: x.status as BookingStatus,
    changed_by: changed,
    reason: str(x.reason),
    created_at: x.created_at,
    changed_at: str(x.changed_at),
    can_cancel: x.can_cancel === true,
  };
}

/** GET /api/booking-requests: whether the database has requests yet, and mine. Null for anything malformed. */
export function parseMine(json: unknown): { ready: boolean; requests: MyBookingRequest[] } | null {
  if (!isObj(json) || typeof json.ready !== "boolean" || !Array.isArray(json.requests)) return null;
  return { ready: json.ready, requests: json.requests.map(parseMineRow).filter((r): r is MyBookingRequest => !!r) };
}

function ownerRow(x: unknown): OwnerBookingRequest | null {
  if (!isObj(x)) return null;
  const id = str(x.id);
  const name = str(x.name);
  const phone = str(x.phone);
  if (!id || !UUID.test(id) || !isSlotKey(x.at) || !hoursOk(x.hours) || !name || !phone || !/^\+91[0-9]{10}$/.test(phone) || typeof x.created_at !== "string") return null;
  return { id, at: x.at, hours: x.hours, when: str(x.when) ?? whenText(x.at, x.hours), name, phone, note: str(x.note), created_at: x.created_at };
}

/** An owner function's answer: the owner's list, an error, or null for anything malformed. */
export function parseOwnerBookings(json: unknown): OwnerBookings | { error: string; status?: string } | null {
  if (!isObj(json)) return null;
  if (typeof json.error === "string") return typeof json.status === "string" ? { error: json.error, status: json.status } : { error: json.error };
  if (json.ok !== true || typeof json.now !== "string" || !Number.isFinite(Date.parse(json.now)) || typeof json.on !== "boolean" || typeof json.open !== "boolean") return null;
  if (!Array.isArray(json.waiting) || !Array.isArray(json.confirmed)) return null;
  const rows = (a: unknown[]) => a.map(ownerRow).filter((r): r is OwnerBookingRequest => !!r);
  const out: OwnerBookings = { ok: true, now: json.now, on: json.on, open: json.open, waiting: rows(json.waiting), confirmed: rows(json.confirmed) };
  if (json.done === "confirm" || json.done === "decline" || json.done === "cancel") out.done = json.done;
  if (typeof json.declined_others === "number") out.declined_others = json.declined_others;
  return out;
}

// ── Words ──

/** The turf page's request sheet. The player's words never say "book", "instant" or "guaranteed": they ask, the turf confirms. */
export const SHEET_COPY = {
  title: "Request this time",
  howLong: "How long?",
  hours: (n: number) => (n === 1 ? "1 hour" : `${n} hours`),
  until: (clock: string) => `to ${clock}`,
  noteLabel: "Note for the turf (optional)",
  notePlaceholder: "For example: 5-a-side, 10 players",
  seesYou: "The turf will see your name and number.",
  pay: "Pay at the turf; nothing is paid online.",
  confirms: "The turf confirms or declines. You'll get a message.",
  send: "Send request",
  cancel: "Cancel",
  sending: "Sending…",
  orWhatsApp: "Or ask on WhatsApp",
  orCall: "Or call the turf",
  signedOut: "Log in to send a request.",
  logIn: "Log in",
  noPhoneTitle: "Add your phone number first",
  noPhoneBody: "The turf needs a number to reach you. Add it in your profile, then come back here.",
  addNumber: "Add your number",
  phoneLogin: "To send requests, log in with your phone number.",
  sent: "Request sent.",
  sentLine: "The turf confirms here; you'll get a message.",
  payShort: "Pay at the turf.",
  atTurf: (when: string, turf: string) => `${when} at ${turf}`,
  tellWhatsApp: "Tell the turf on WhatsApp",
  done: "Done",
  seeRequests: "See your requests",
  failed: "Couldn't send. Check your connection and try again.",
  limitWaiting: `You have ${MAX_WAITING} requests waiting for an answer. Cancel one on your Me tab, or wait for an answer.`,
  limitDay: (day: string) => `You already have a request waiting at this turf for ${day}.`,
  limitSends: `You've sent ${MAX_SENDS_PER_DAY} requests today. Try again tomorrow.`,
  taken: "That time isn't free any more. Pick another time.",
  pickAnother: "Pick another time",
  off: "This turf isn't taking requests right now. You can still contact the turf directly.",
  own: "This is your turf. Players' requests show on myTapturf.",
  openMy: "Open myTapturf",
  signIn: "Your login ended. Log in again to send a request.",
} as const;

/** The Me tab's Turf requests. */
export const ME_COPY = {
  heading: "Turf requests",
  pill: { waiting: "Waiting", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled", expired: "Expired" } satisfies Record<BookingStatus, string>,
  waiting: "The turf confirms here; you'll get a message.",
  confirmed: "Confirmed. Pay at the turf.",
  declinedOwner: "The turf declined this.",
  declinedTaken: "Those hours went to someone else.",
  cancelledPlayer: "You cancelled this.",
  cancelledOwner: "The turf cancelled this.",
  expired: "No answer before it started.",
  said: (reason: string) => `The turf said: "${reason}"`,
  sent: (date: string) => `Sent ${date}`,
  cancelRequest: "Cancel request",
  cancel: "Cancel",
  askCancel: "Cancel this? The turf will be told.",
  yesCancel: "Yes, cancel",
  keep: "Keep it",
  cancelFailed: "Couldn't cancel. Check your connection and try again.",
  started: "It has started, so it can't be cancelled here. Contact the turf directly.",
} as const;

/** The line under a request on the Me tab. */
export function meLine(r: Pick<MyBookingRequest, "status" | "changed_by" | "at">, nowMs: number): string {
  switch (effectiveStatus(r.status, r.at, nowMs)) {
    case "waiting":
      return ME_COPY.waiting;
    case "confirmed":
      return ME_COPY.confirmed;
    case "declined":
      return r.changed_by === "taken" ? ME_COPY.declinedTaken : ME_COPY.declinedOwner;
    case "cancelled":
      return r.changed_by === "owner" ? ME_COPY.cancelledOwner : ME_COPY.cancelledPlayer;
    default:
      return ME_COPY.expired;
  }
}

/** The owner's list and switch on myTapturf (owners read "Booked" there, as Free slots says it). */
export const OWNER_COPY = {
  heading: (n: number) => `Booking requests · ${n}`,
  call: "Call",
  sent: (ago: string) => `Sent ${ago}`,
  confirm: "Confirm",
  confirming: "Confirming…",
  decline: "Decline",
  confirmed: (others: number) =>
    `Confirmed. Those hours are marked Booked.${others > 0 ? ` ${others} other request${others === 1 ? "" : "s"} for them ${others === 1 ? "was" : "were"} declined.` : ""}`,
  askDecline: "Decline this request?",
  reasonLabel: "Reason (optional)",
  reasonPlaceholder: "For example: ground closed for a match",
  declineRequest: "Decline request",
  keep: "Keep",
  declined: "Declined. The player is told.",
  comingUp: "Confirmed, coming up",
  cancelBooking: "Cancel booking",
  askCancel: (name: string) => `Cancel this booking? ${name} will be told, and the hours go back to Free.`,
  cancelled: "Cancelled. The player is told, and the hours are Free again.",
  grounds: "Confirming marks the hours Booked. If another ground is still free then, tap the hour Free again below.",
  taken: "Couldn't confirm: some of these hours are marked Booked now. Tap them Free below first, or decline.",
  answered: "This request was answered already.",
  started: "This has started, so it can't be cancelled.",
  forbidden: "Couldn't save.",
  signInAgain: "Sign in again",
  network: "Not saved. Check your connection and try again.",
  other: "Couldn't save. Try again.",
  toggle: "Take booking requests on TapTurf",
  toggleHelp: "Players can ask for a free hour on your page. You confirm or decline here. They pay at the turf.",
  toggleOn: "On. Players see the request button within 2 minutes.",
  toggleHidden: "Players can't send requests while your free slots are hidden. Tap All correct to show them.",
  toggleFailed: "Couldn't change this. Check your connection and try again.",
} as const;
