/**
 * The three tabs of a turf on myTapturf (/my/turf/<id>, components/my/MyTurf.tsx),
 * and where /my opens. Pure: no imports, so npm run test:my runs it as is.
 *
 *   Slots      /my/turf/<id>                 the default: mark the hours already booked (FreeSlots)
 *   Your page  /my/turf/<id>?tab=page        prices, hours, numbers, facilities, photos, ground size, reports
 *   Analytics  /my/turf/<id>?tab=analytics   views, calls, WhatsApp taps, Ask, the trends
 *
 * The tab is part of the URL, so links and Back work. A link to a section
 * (#hours, #numbers, #photos ...) opens the tab that section is on and
 * scrolls there, whatever ?tab says: ANCHOR_TABS lists every id a link on
 * myTapturf points at (lib/my/turfTabs.test.ts checks the components
 * against it).
 */

export type TurfTab = "slots" | "page" | "analytics";

/** The tabs, in order; the first is the default (no ?tab). Words an owner reads at a glance. */
export const TURF_TABS: readonly { id: TurfTab; label: string }[] = [
  { id: "slots", label: "Slots" },
  { id: "page", label: "Your page" },
  { id: "analytics", label: "Analytics" },
];

/** Every section a link scrolls to on /my/turf/<id>, and the tab it is on. */
export const ANCHOR_TABS: Readonly<Record<string, TurfTab>> = {
  // components/my/FreeSlots.tsx
  slots: "slots",
  // components/my/EditListing.tsx: the editor, and its Opening hours and Your numbers groups
  edit: "page",
  hours: "page",
  numbers: "page",
  // components/my/MyTurf.tsx: the Photos and Ground size sections (OwnerPhotos, GroundSizes)
  photos: "page",
  "ground-size": "page",
  // components/my/PlayerReports.tsx
  "player-reports": "page",
};

/** /my with the list of turfs, even for an owner with one turf (the way back from a turf). */
export const MY_LIST_HREF = "/my?list=1";

const TAB_IDS = new Set<string>(TURF_TABS.map((t) => t.id));

/** "#hours", "hours", "%23hours" → "hours" when it is a known section, else null. */
export function anchorOf(hash: string | null | undefined): string | null {
  let h = String(hash ?? "").trim().replace(/^#/, "");
  try {
    h = decodeURIComponent(h);
  } catch {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(ANCHOR_TABS, h) ? h : null;
}

/** ?tab=<x> as a tab: "page" or "analytics"; "slots", nothing or anything else is the default, Slots. */
export function tabParam(v: string | null | undefined): TurfTab {
  const s = String(v ?? "").trim().toLowerCase();
  return TAB_IDS.has(s) ? (s as TurfTab) : "slots";
}

/**
 * What a URL on /my/turf/<id> shows: its tab, and the section to scroll to.
 * A known section decides the tab (#hours is on Your page even under
 * ?tab=analytics); else ?tab; else Slots. search and hash as location has
 * them ("?tab=page", "#hours"), either may be empty.
 */
export function turfView(search: string | null | undefined, hash: string | null | undefined): { tab: TurfTab; anchor: string | null } {
  const anchor = anchorOf(hash);
  if (anchor) return { tab: ANCHOR_TABS[anchor], anchor };
  let tab: string | null = null;
  try {
    tab = new URLSearchParams(String(search ?? "")).get("tab");
  } catch {
    tab = null;
  }
  return { tab: tabParam(tab), anchor: null };
}

/** The link to a tab (and a section on it): /my/turf/<id>, /my/turf/<id>?tab=page#hours. Slots has no ?tab. */
export function turfTabHref(turfId: string, tab: TurfTab, anchor?: string | null): string {
  const a = anchorOf(anchor);
  // A section on another tab is reached through its own tab.
  const t = a ? ANCHOR_TABS[a] : tab;
  return `/my/turf/${turfId}${t === "slots" ? "" : `?tab=${t}`}${a ? `#${a}` : ""}`;
}

/** What /my knows when it decides where to open (owner_home, and the URL). */
export type MyLanding = {
  signedIn: boolean;
  /** The site owner: every turf opens for them, so /my stays their list and search. */
  admin: boolean;
  /** owner_home.turfs: confirmed (active) and waiting (pending) claims. */
  turfs: readonly { id: string; status: string }[];
  /** ?claim=<id>: a claim in progress keeps the claim flow exactly as it is. */
  claim: string | null;
  /** ?list=1: the list asked for (MY_LIST_HREF, the way back from a turf). */
  list: boolean;
  /** ?tab and the hash /my was opened with, passed on to the turf (/my?tab=page#edit). */
  tab?: string | null;
  hash?: string | null;
};

/**
 * Where /my opens: an owner with exactly one turf, confirmed, and nothing
 * else waiting goes straight to that turf (its Slots tab, or the tab and
 * section /my was opened with); else null, the list stays. A claim in
 * progress (?claim=), a waiting claim, two turfs or more, the list asked
 * for, the site owner and a signed-out visit all keep /my as it is.
 */
export function myLanding(x: MyLanding): string | null {
  if (!x.signedIn || x.admin || x.claim || x.list) return null;
  if (x.turfs.length !== 1) return null;
  const [only] = x.turfs;
  if (only.status !== "active" || !only.id) return null;
  const view = turfView(x.tab ? `?tab=${encodeURIComponent(x.tab)}` : "", x.hash);
  return turfTabHref(only.id, view.tab, view.anchor);
}
