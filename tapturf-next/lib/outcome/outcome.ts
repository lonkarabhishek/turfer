/**
 * "Did you get a slot?" (12 Nov 2026): what a player's answer is, checked
 * the same way by the card that sends it (components/outcome/OutcomeCard.tsx)
 * and the route that stores it (POST /api/contact-outcome, lib/outcome/route.ts;
 * private.contact_outcomes, 20261113_contact_outcomes.sql), and the card's
 * words. One answer per Call or WhatsApp tap, tapped not typed: whether
 * they got a slot, when they play (or which time was full), or why not.
 * Nothing about the player goes with it: no account, no name, no number,
 * no device tag. Pure, relative imports only (npm run test:outcome).
 */

export const OUTCOMES = ["got_slot", "not_this_time", "deciding", "dismissed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const REASONS = ["full", "price", "no_reply", "wrong_number", "just_asking"] as const;
export type Reason = (typeof REASONS)[number];
export const KINDS = ["call", "whatsapp"] as const;
export type Kind = (typeof KINDS)[number];
export const DAYS = ["today", "tomorrow"] as const;
/** The day picked; "Later" and Skip send none. The server turns it into India's date (the card never sends a date). */
export type Day = (typeof DAYS)[number];

/** A click's source is at most this long (public.turf_contact_clicks). */
export const SOURCE_MAX = 40;

export type OutcomeAnswer = {
  turf: string;
  kind: Kind;
  source: string;
  outcome: Outcome;
  /** Only with not_this_time. */
  reason: Reason | null;
  /** Only with got_slot (when they play) or a full slot (the time they wanted). */
  day: Day | null;
  /** 0 to 23, only with a day. 0 and 1 are the late night of that day (the hour row ends at 1 AM). */
  hour: number | null;
  signedIn: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = /^[a-z0-9_]{1,40}$/;
const isOne = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * A POST body as an answer; null for anything that isn't exactly one
 * ({turf, kind, source, outcome, reason?, day?, hour?, signed?}). A reason
 * goes only with not_this_time; a day only with got_slot or a full slot;
 * an hour only with a day. Anything else is refused whole, never trimmed
 * into something the player didn't say.
 */
export function parseOutcome(raw: unknown): OutcomeAnswer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["turf", "kind", "source", "outcome", "reason", "day", "hour", "signed"].includes(k)) return null;
  if (typeof o.turf !== "string" || !UUID.test(o.turf)) return null;
  if (!isOne(KINDS, o.kind) || !isOne(OUTCOMES, o.outcome)) return null;
  if (typeof o.source !== "string" || !SOURCE.test(o.source)) return null;
  const reason = o.reason == null ? null : isOne(REASONS, o.reason) ? o.reason : undefined;
  const day = o.day == null ? null : isOne(DAYS, o.day) ? o.day : undefined;
  const hour = o.hour == null ? null : typeof o.hour === "number" && Number.isInteger(o.hour) && o.hour >= 0 && o.hour <= 23 ? o.hour : undefined;
  if (reason === undefined || day === undefined || hour === undefined) return null;
  if (o.signed != null && typeof o.signed !== "boolean") return null;
  if (reason && o.outcome !== "not_this_time") return null;
  if (day && !(o.outcome === "got_slot" || reason === "full")) return null;
  if (hour != null && !day) return null;
  return { turf: o.turf.toLowerCase(), kind: o.kind, source: o.source, outcome: o.outcome, reason, day, hour, signedIn: o.signed === true };
}

/** The body the card sends for an answer (what parseOutcome reads back). */
export function outcomeBody(a: OutcomeAnswer): Record<string, unknown> {
  return {
    turf: a.turf,
    kind: a.kind,
    source: a.source,
    outcome: a.outcome,
    ...(a.reason ? { reason: a.reason } : {}),
    ...(a.day ? { day: a.day } : {}),
    ...(a.day && a.hour != null ? { hour: a.hour } : {}),
    signed: a.signedIn,
  };
}

// ---------------------------------------------------------------------------
// The hour row

/** The hours offered, in the order shown: 5 AM to 11 PM, then midnight and 1 AM. */
export const HOURS: readonly number[] = [...Array.from({ length: 19 }, (_, i) => i + 5), 0, 1];

/** 19 as "7 PM", 0 as "12 AM". */
export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

/** India is UTC+5:30 all year. */
const IST_OFFSET_MS = 330 * 60_000;

/** India's date at a moment, "2026-11-13". */
export function istDay(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The hour the row is scrolled to. Today: the next full hour in India
 * (6:20 PM gives 7 PM; between 1 AM and 5 AM, 5 AM). Tomorrow: 6 PM, when
 * most games are played.
 */
export function startHour(day: Day, now: number): number {
  if (day === "tomorrow") return 18;
  const next = (new Date(now + IST_OFFSET_MS).getUTCHours() + 1) % 24;
  return next >= 2 && next < 5 ? 5 : next;
}

// ---------------------------------------------------------------------------
// The card's words. Never "book" or "booking" (npm run test:outcome checks).

export const OUTCOME_COPY = {
  ask: (name: string) => `Back from ${name}?`,
  askLine: "Did you get a slot?",
  yes: "Yes! 🎉",
  no: "Not this time",
  deciding: "Still deciding",
  whenPlay: "Nice! When are you playing?",
  whenWanted: "Which time did you want?",
  days: { today: "Today", tomorrow: "Tomorrow", later: "Later" },
  skip: "Skip",
  done: "Done",
  why: "Ah, what happened?",
  reasons: { full: "Slot was full", price: "Too pricey", no_reply: "No reply", wrong_number: "Wrong number", just_asking: "Just asking" } satisfies Record<Reason, string>,
  thanksPlay: "Have a great game! ⚽",
  thanksFull: "Got it, thanks! This helps us show free hours.",
  thanksWrong: "Thanks for telling us. We'll check this number.",
  thanks: "Thanks! 🙌",
  thanksDeciding: "No worries! Good luck 🙂",
  freeLink: (city: string) => `See turfs with free hours in ${city}`,
  close: "Close",
  hour: "Hour",
  label: "A quick question from TapTurf",
} as const;

/** What the card says once an answer is sent. */
export function thanksFor(a: Pick<OutcomeAnswer, "outcome" | "reason">): string {
  if (a.outcome === "got_slot") return OUTCOME_COPY.thanksPlay;
  if (a.outcome === "deciding") return OUTCOME_COPY.thanksDeciding;
  if (a.reason === "full") return OUTCOME_COPY.thanksFull;
  if (a.reason === "wrong_number") return OUTCOME_COPY.thanksWrong;
  return OUTCOME_COPY.thanks;
}

/** A turf's name as the question says it: one line, at most 40 characters. */
export function shortName(name: string): string {
  const s = name.replace(/\s+/g, " ").trim();
  return s.length <= 40 ? s : `${s.slice(0, 39).trimEnd()}…`;
}
