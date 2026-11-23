/**
 * The Me tab's Alerts, ten at a time (the site owner, 23 Nov 2026: "Cap
 * alerts to last 10 only and give a show more, if clicked load next").
 * The read (GET /api/notifications?limit=, public.notifications_mine)
 * takes how many of the newest to return, 100 at most, and no cursor: so
 * "Show more" asks for the newest N + 10 again, one more than it will show
 * so it knows whether to offer the button once more. The unread count is
 * never worked out from what is on screen: the same read answers the true
 * total. Pure, no imports, tested in tabs.test.ts (npm run test:matches).
 */

export const ALERTS_PAGE = 10;
/** The read's own ceiling (notifications_mine): the latest 100 are all the list ever shows. */
export const ALERTS_MAX = 100;

/** How many to ask the server for, to show `want`: one more, to learn whether there are more, up to the ceiling. */
export function alertsLimit(want: number): number {
  return Math.min(Math.max(want, 1) + 1, ALERTS_MAX);
}

/** How many to show after another "Show more". */
export function alertsNext(want: number): number {
  return Math.min(want + ALERTS_PAGE, ALERTS_MAX);
}

export type AlertsPage<T> = {
  /** What is on screen: the newest `want`. */
  shown: T[];
  /** There are more to load: the button shows. */
  more: boolean;
  /** The list is at the ceiling and there may be older ones it can't show. */
  capped: boolean;
};

/** rows: the newest alertsLimit(want), newest first. */
export function alertsPage<T>(rows: readonly T[], want: number): AlertsPage<T> {
  const shown = rows.slice(0, want);
  return { shown, more: want < ALERTS_MAX && rows.length > want, capped: want >= ALERTS_MAX && rows.length >= ALERTS_MAX };
}

/**
 * The rows after a longer read, keeping what this page already knows:
 * one marked read here stays read (the read may have been asked before the
 * mark landed), and nothing is listed twice.
 */
export function alertsMerge<T extends { id: string; is_read: boolean }>(had: readonly T[], fresh: readonly T[]): T[] {
  const read = new Set(had.filter((n) => n.is_read).map((n) => n.id));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const n of fresh) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(read.has(n.id) && !n.is_read ? { ...n, is_read: true } : n);
  }
  return out;
}

/** The unread total after one more was marked read here. Never below zero. */
export const unreadLess = (total: number, by = 1): number => Math.max(0, total - by);
