import type { Turf } from "../../types/turf";
import { isBookingAppUrl } from "../utils/bookingApps";
import { directionsUrl } from "../utils/maps";

// Relative imports only, so node --test runs this (lib/turfPage/noContact.test.ts).

/**
 * What a turf page with no usable number (lib/utils/contact.ts
 * hasUsableContact false: no Call, no WhatsApp) offers instead, in this
 * order: directions, the turf's own website or Instagram, "I know the
 * number" (the suggestion sheet, whose numbers are checked before they
 * show) and, on an unclaimed turf, the claim on myTapturf. Plain links
 * only, built on the server, so the card says nothing it cannot back and
 * nothing loads from Google or Instagram before a tap.
 */
export type NoContactLinks = {
  /** Google Maps directions (lib/utils/maps.ts directionsUrl), or null. */
  directions: string | null;
  /** The turf's own site: https, not a booking app's, not Instagram. */
  website: string | null;
  /** The turf's Instagram profile: https on instagram.com. */
  instagram: string | null;
  /** The claim on myTapturf, as the page's invite links it; null on a claimed turf. */
  claim: string | null;
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

/** The turf's Instagram: an https link on instagram.com to a page (a profile), not the site's front page. */
export function instagramLink(url: unknown): string | null {
  const s = httpsLink(url);
  if (!s || !hostIn(s, INSTAGRAM_HOSTS)) return null;
  return new URL(s).pathname.replace(/\/+$/, "") ? s : null;
}

/** The turf's own website: an https link that is not Instagram (that one is the Instagram button). */
export function websiteLink(url: unknown): string | null {
  const s = httpsLink(url);
  return s && !hostIn(s, INSTAGRAM_HOSTS) ? s : null;
}

/** The no-number card's links for a turf (claimed: an owner runs it, so no claim link). */
export function noContactLinks(
  turf: Pick<Turf, "id" | "name" | "address" | "lat" | "lng" | "google_place_id" | "website_url" | "instagram_url">,
  claimed: boolean,
): NoContactLinks {
  const website = websiteLink(turf.website_url);
  // An Instagram profile stored as the website is the Instagram button.
  const instagram = instagramLink(turf.instagram_url) ?? instagramLink(turf.website_url);
  return {
    directions: directionsUrl({ lat: turf.lat, lng: turf.lng, name: turf.name, address: turf.address, placeId: turf.google_place_id }),
    website,
    instagram,
    // As the invite on the page links it (components/turf/ClaimInvite.tsx).
    claim: claimed ? null : `/my?claim=${turf.id}`,
  };
}

/** The sidebar's members' club line: the turf's own access notes, else ours, which says to call only when there is a number. */
export function membersNote(accessNotes: string | null, hasContact: boolean): string {
  if (accessNotes) return accessNotes;
  return hasContact ? "Booking is for members. Call to ask about guest access." : "For members only. We don't have a number for it yet.";
}

/** The sidebar's line under the buttons: only where there is a number to contact, and not for a members' club. */
export function bookingFeeLine(membersOnly: boolean, hasContact: boolean): string | null {
  return !membersOnly && hasContact ? "No booking fee. Contact turf directly to reserve your slot." : null;
}
