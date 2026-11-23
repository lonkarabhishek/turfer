/**
 * The Me section's tabs (/dashboard): their order, the key each has in the
 * address (?tab=<key>, which the rest of the site links to: never rename
 * one) and their names. Matches sits between Requests and Alerts (the site
 * owner, 23 Nov 2026: "Games Requests Matches ... Alerts Profile"); the
 * Passport is a pill on a wide screen only, and on a phone the Me card
 * opens it, so a phone's row is the five. Pure, no imports, tested in
 * tabs.test.ts (npm run test:matches).
 */

export const ME_TABS = [
  { key: "games", label: "Games" },
  { key: "requests", label: "Requests" },
  { key: "matches", label: "Matches" },
  { key: "notifications", label: "Alerts" },
  { key: "profile", label: "Profile" },
  { key: "passport", label: "Passport" },
] as const;

export type MeTabKey = (typeof ME_TABS)[number]["key"];

/** Not in a phone's tab row. */
export const WIDE_ONLY: readonly MeTabKey[] = ["passport"];

/** A phone's row, in order. */
export const PHONE_TABS = ME_TABS.filter((t) => !WIDE_ONLY.includes(t.key));

/** The tab a ?tab= value names, or null (the caller then shows the first). */
export function meTab(asked: string | null | undefined): MeTabKey | null {
  return ME_TABS.find((t) => t.key === asked)?.key ?? null;
}

export const meTabHref = (key: MeTabKey): string => `/dashboard?tab=${key}`;

/** What a tab's count counts, for a screen reader: "Games, 3 upcoming". Matches counts only what is live right now. */
export function countWord(key: MeTabKey): string {
  return key === "notifications" ? "unread" : key === "requests" ? "pending" : key === "matches" ? "live now" : "upcoming";
}

/** A count as its badge shows it: nothing for none or not known, "99+" past 99. */
export function badgeText(n: number | null | undefined): string | null {
  if (!n || n < 0) return null;
  return n > 99 ? "99+" : String(n);
}
