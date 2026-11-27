/**
 * Reminders to update free slots (the site owner, 27 Nov 2026:
 * "can we set up some email reminders to owners to update their slots?
 * maybe every 2 days if they havent done it already";
 * supabase/migrations/20261129_slot_reminders.sql). One email per account
 * that runs a claimed turf, listing its turfs whose slots are out of date.
 * The rules and every word a person reads are here; the template
 * (lib/email/templates.ts) only lays them out. Pure, no imports, so the
 * Me tab and myTapturf can read its words without carrying anything else
 * (npm run test:email).
 *
 * The constants are the migration's own (private.slot_reminder_*);
 * scripts/sql-tests/slot_reminders.check.mjs and the tests compare them.
 */

/** At most one reminder per account in this many India days. */
export const EVERY_DAYS = 2;
/** A turf needs an update when its slots were last updated this long ago, or never. */
export const STALE_HOURS = 48;
/** After this many in a row with no update, no more until the next update. */
export const MAX_IN_A_ROW = 5;
/** The hour of the day, India time, the reminders go (the job: '30 3 * * *' in UTC). */
export const SEND_HOUR_IST = 9;
/** "Players asked for a slot here N times in the last 7 days". */
export const ASKS_DAYS = 7;
/** The most turfs one email lists. */
export const TURFS_MAX = 5;
/** A reminder not sent within this long of 9 AM is never sent. */
export const LATE_HOURS = 12;
/** How long players see free hours after an update: FRESH_HOURS in lib/availability/slots.ts (the test compares the two). */
export const SEEN_HOURS = 24;

/** A turf the reminder is about, as private.slot_reminder_job sends it. */
export type SlotTurf = {
  id: string;
  name: string;
  /** The owner's last tap or All correct; null: never marked. */
  updated_at: string | null;
  /** Times players asked for a slot there in the last 7 India days. */
  asks: number;
};

const DAY_MS = 86_400_000;

/** Whole days since the slots were last updated; null: never, or not a time. */
export function daysSince(updatedAt: string | null | undefined, nowMs: number): number | null {
  const t = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/** Players see none of this turf's free hours now: never marked, or its last update is 24 hours old or more. */
export function hiddenNow(t: Pick<SlotTurf, "updated_at">, nowMs: number): boolean {
  if (t.updated_at === null) return true;
  const at = Date.parse(t.updated_at);
  return Number.isFinite(at) && nowMs - at >= SEEN_HOURS * 3_600_000;
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "Update your free slots: Kings Turf Arena", "... and 1 more". */
export function slotSubject(first: string, others: number): string {
  return `Update your free slots: ${first}${others > 0 ? ` and ${others} more` : ""}`;
}

/** Every word of the email. Never "book" in any form, never a number of people, no hurry. */
export const SLOT_REMINDER_COPY = {
  preheader: `Players see your free hours for ${SEEN_HOURS} hours after you update them.`,
  title: "Your free slots need an update",
  rule: `Players see your free hours on TapTurf only for ${SEEN_HOURS} hours after you update them.`,
  /** One turf, marked before. */
  stale: (name: string, n: number) => `${name} was last updated ${days(n)} ago, so players see none right now.`,
  /** One turf, never marked. */
  never: (name: string) => `You haven't marked your free hours at ${name} yet, so players see none.`,
  /** Several turfs: the line before them. */
  several: "These turfs need an update:",
  /** Several turfs: under a turf's name. */
  staleShort: (n: number) => `Last updated ${days(n)} ago, so players see none right now.`,
  neverShort: "You haven't marked its free hours yet, so players see none.",
  /** Only when the real count is above zero. Times asked, never people. */
  asks: (n: number) => `Players asked for a slot here ${n === 1 ? "1 time" : `${n} times`} in the last ${ASKS_DAYS} days.`,
  button: "Update slots",
  /** After the button: how little it takes. The buttons named are the Slots tab's own (lib/availability/slots.ts ownerStatus). */
  quick: "It takes under a minute. Tap All correct if nothing changed.",
  quickNever: "It takes under a minute. Tap the hours that are taken, then Show free hours to players.",
  /** The 5th in a row. */
  last: "This is the last reminder for now. We'll send them again after you next update your slots.",
  more: (n: number) => `${n === 1 ? "1 more of your turfs needs" : `${n} more of your turfs need`} an update too.`,
  moreHeading: "More turfs",
  moreButton: "See them on myTapturf",
  why: (many: boolean) => (many ? "You run these turfs' pages on TapTurf." : "You run this turf's page on TapTurf."),
  offLabel: "Turn off these reminders",
} as const;

/** The switch, on the Me tab and on the page the email's link opens. */
export const SLOT_SWITCH_LABEL = "Reminders to update your free slots";
export const SLOT_SWITCH_DETAIL = `For turf owners: an email every ${EVERY_DAYS} days while your free slots are out of date, ${MAX_IN_A_ROW} in a row at most. They start again after your next update.`;

/** The quiet line under the Free slots editor on myTapturf (components/my/SlotReminderLine.tsx). */
export const SLOT_LINE = {
  on: `Email reminders are on: we email you when your free slots are ${EVERY_DAYS} days old, ${MAX_IN_A_ROW} times in a row at most.`,
  off: "Email reminders to update your free slots are off.",
  turnOff: "Turn off",
  turnOn: "Turn on",
  failed: "Couldn't save that. Check your connection and try again.",
} as const;
