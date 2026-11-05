import type { Turf } from "../../types/turf";
import { googleMapsUrl, isBookingAppUrl, publicLink } from "../utils/bookingApps";
import { directionsUrl } from "../utils/maps";

// Relative imports only, so node --test runs this (lib/turfPage/noContact.test.ts).

/**
 * What a turf page with no usable number (lib/utils/contact.ts
 * hasUsableContact false: no Call, no WhatsApp) offers instead, in this
 * order: directions, the turf's own website or Instagram, "I know the
 * number" (the suggestion sheet, whose numbers are checked before they
 * show). No claim link: players on these pages were claiming turfs to
 * book them (5 Nov 2026), so the owner's way in is the invite lower on
 * the page (components/turf/ClaimInvite.tsx). Plain links only, built on the server, so the card says nothing it cannot back and
 * nothing loads from Google or Instagram before a tap.
 */
export type NoContactLinks = {
  /** Google Maps directions (lib/utils/maps.ts directionsUrl), or null. */
  directions: string | null;
  /** The turf's own site: https, not a booking app's, not Instagram. */
  website: string | null;
  /** The turf's Instagram profile: https on instagram.com. */
  instagram: string | null;
};

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
// A named host: labels of letters, digits and hyphens, and a real top level (letters, or punycode).
const NAMED_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

/**
 * A stored link the page may show as a button: an absolute https URL to a
 * named host (no IP, no user name or password in it, no spaces), not a
 * booking app's (lib/utils/bookingApps.ts), at most 2,000 characters. As
 * the URL parser writes it; null for anything else (http, "external-listing", junk).
 */
export function httpsLink(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const s = url.trim();
  if (!s || s.length > 2000 || /\s/.test(s) || !/^https:\/\//i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || !NAMED_HOST.test(u.hostname.toLowerCase())) return null;
  return isBookingAppUrl(u.href) ? null : u.href;
}

const hostIn = (href: string, hosts: Set<string>) => hosts.has(new URL(href).hostname.toLowerCase());

// Instagram's own pages, not anyone's profile: a post, a reel, explore, stories, a share link, settings.
const INSTAGRAM_NOT_PROFILES = new Set(["p", "reel", "reels", "tv", "explore", "stories", "share", "accounts", "direct", "about", "legal", "developer", "web", "_u"]);
// An Instagram user name: letters, digits, "." and "_", at most 30 (all 81 stored on active turfs on 5 Nov are).
const INSTAGRAM_USER = /^[a-z0-9._]{1,30}$/i;

/** The turf's Instagram: an https link on instagram.com to a profile (instagram.com/<user name>), not a post, reel, explore page or the front page. */
export function instagramLink(url: unknown): string | null {
  const s = httpsLink(url);
  if (!s || !hostIn(s, INSTAGRAM_HOSTS)) return null;
  const first = new URL(s).pathname.split("/").filter(Boolean)[0] ?? "";
  return INSTAGRAM_USER.test(first) && !INSTAGRAM_NOT_PROFILES.has(first.toLowerCase()) ? s : null;
}

// Links that are no turf's own website, whatever a row stores as one (live on 5 Nov, website_url of
// active turfs: wa.link 4, chat.whatsapp.com 3, api.whatsapp.com 2, call.whatsapp.com 1, whatsapp.com 1,
// bit.ly 3, abr.ge 3, rb.gy 1, g.page 1):
// - a chat (wa.me/91..., api.whatsapp.com/send?phone=...): it opens a chat to a number nobody checked,
//   on a page that says it has none;
// - a redirector or a shortener: it hides where it goes (a chat, a booking app);
// - Google Maps: Get directions is the button for the map.
const CHAT_DOMAINS = ["wa.me", "wa.link", "whatsapp.com", "whatsapp.net"];
const REDIRECT_HOSTS = new Set(["l.instagram.com", "l.facebook.com", "lm.facebook.com", "l.messenger.com"]);
const SHORTENER_DOMAINS = ["bit.ly", "rb.gy", "tinyurl.com", "cutt.ly", "is.gd", "t.co", "abr.ge", "shorturl.at", "tiny.cc", "goo.gl", "page.link", "app.link"];
const inDomains = (host: string, domains: readonly string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * True for a stored link that is not the turf's own site: a WhatsApp chat,
 * a link redirector or shortener, or Google Maps (lib/utils/bookingApps.ts
 * googleMapsUrl). http or https; false for anything that is no link.
 */
export function isNotTurfSite(url: unknown): boolean {
  if (typeof url !== "string") return false;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  if (!host) return false;
  return inDomains(host, CHAT_DOMAINS) || REDIRECT_HOSTS.has(host) || inDomains(host, SHORTENER_DOMAINS) || googleMapsUrl(url.trim()) !== null;
}

/** The turf's own website: an https link that is not Instagram (that one is the Instagram button), a chat, a redirect or Google Maps. */
export function websiteLink(url: unknown): string | null {
  const s = httpsLink(url);
  return s && !hostIn(s, INSTAGRAM_HOSTS) && !isNotTurfSite(s) ? s : null;
}

/**
 * Turf details' Website or Instagram row (components/turf/TurfDetails.tsx):
 * a public link (lib/utils/bookingApps.ts publicLink), as on every page;
 * on a page with no number, not one that is no turf's site (isNotTurfSite),
 * so a page that says it has no number opens no chat to one.
 */
export function detailsLink(url: unknown, hasContact: boolean): string | null {
  const s = publicLink(url);
  return s && (hasContact || !isNotTurfSite(s)) ? s : null;
}

/** The no-number card's links for a turf. */
export function noContactLinks(
  turf: Pick<Turf, "name" | "address" | "lat" | "lng" | "google_place_id" | "website_url" | "instagram_url">,
): NoContactLinks {
  const website = websiteLink(turf.website_url);
  // An Instagram profile stored as the website is the Instagram button.
  const instagram = instagramLink(turf.instagram_url) ?? instagramLink(turf.website_url);
  return {
    directions: directionsUrl({ lat: turf.lat, lng: turf.lng, name: turf.name, address: turf.address, placeId: turf.google_place_id }),
    website,
    instagram,
  };
}

/** The sidebar's members' club line: the turf's own access notes, else ours, which says to call only when there is a number. */
export function membersNote(accessNotes: string | null, hasContact: boolean): string {
  if (accessNotes) return accessNotes;
  return hasContact ? "Booking is for members. Call to ask about guest access." : "For members only. We don't have a number for it yet.";
}

/** Pricing's note over prices players reported: checking "with the turf before you book" only where there is a number to check with. */
export function reportedPricesNote(hasContact: boolean): string {
  return hasContact
    ? "Reported prices, not confirmed by the turf. Check the rate with the turf before you book."
    : "Reported prices, not confirmed by the turf. Check the rate at the turf before you play.";
}

/**
 * The check a line asks for ("confirm the rate with the turf"): with the
 * turf where there is a number to ask it on, at the turf where there is
 * none (the page says it has no number). `what`: "the rate", or nothing.
 */
export function turfCheck(hasContact: boolean, what?: string): string {
  const w = what ? `${what} ` : "";
  return hasContact ? `confirm ${w}with the turf` : `check ${w}at the turf`;
}

/**
 * How a player books, in the site owner's words (5 Nov 2026): say where
 * bookings happen, never that TapTurf doesn't take them. Over the phone's
 * Call and WhatsApp bar, and leading the sidebar's line under its buttons.
 */
export const BOOKING_LINE = "For bookings, contact the turf directly.";

/** The phone bar's line over Call and WhatsApp: only where there is a number to contact, and not for a members' club. */
export function bookingLine(membersOnly: boolean, hasContact: boolean): string | null {
  return !membersOnly && hasContact ? BOOKING_LINE : null;
}

/** The sidebar's line under the buttons: only where there is a number to contact, and not for a members' club. */
export function bookingFeeLine(membersOnly: boolean, hasContact: boolean): string | null {
  return !membersOnly && hasContact ? `${BOOKING_LINE} No booking fee.` : null;
}
