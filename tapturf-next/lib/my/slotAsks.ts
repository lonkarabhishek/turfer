/**
 * myTapturf's Analytics tab: how often players used "Ask for a slot" on
 * the turf's page (lib/slotAsk/) and for which start hours, read from
 * public.owner_slot_asks (20261118_slot_asks.sql) beside
 * public.owner_dashboard, which is left as it is. Counts of asks, never of
 * people, and never what the turf answered. Before that file is applied,
 * or when the read fails, the tab is exactly as it was. Pure, no imports
 * (npm run test:my).
 */

export type OwnerAsks = { days: number; asks: number; prev: number; hours: { hour: number; n: number }[] };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;

/** owner_slot_asks' answer; null for a refusal or anything that isn't a whole one (the hours must add up to the count). */
export function parseOwnerAsks(raw: unknown): OwnerAsks | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isCount(o.days) || o.days < 7 || o.days > 90 || !isCount(o.asks) || !isCount(o.prev) || !Array.isArray(o.hours)) return null;
  const hours: { hour: number; n: number }[] = [];
  for (const h of o.hours as Record<string, unknown>[]) {
    if (!h || !isCount(h.hour) || h.hour > 23 || !isCount(h.n) || h.n < 1 || hours.some((x) => x.hour === h.hour)) return null;
    hours.push({ hour: h.hour, n: h.n });
  }
  if (hours.reduce((n, h) => n + h.n, 0) !== o.asks) return null;
  return { days: o.days, asks: o.asks, prev: o.prev, hours };
}

/** 19 as "7 PM", 0 as "12 AM". */
export function askHourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

/** The start hours asked for most, at most `max`, most first (a tie to the earlier hour). */
export function topAsked(a: OwnerAsks, max = 5): { hour: number; n: number }[] {
  return [...a.hours].sort((x, y) => y.n - x.n || x.hour - y.hour).slice(0, max);
}

/** The words of the block. Never "book", never a count of people. */
export const OWNER_ASKS_COPY = {
  title: "Slots players asked for",
  stat: "Times players asked for a slot",
  top: "Most asked start times",
  note: (days: number) =>
    `A player picks a day and a time on your page and WhatsApp opens with the question written to you. This counts each time that happened in the last ${days} days: times asked, not people. Compared with the ${days} days before.`,
} as const;
