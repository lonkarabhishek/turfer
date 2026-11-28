import { mapsSearchUrl } from "./maps";

/**
 * "Share location" (the site owner, 28 Nov 2026: "give an easy option to
 * share location of turf in the game and turf ... Simple. One tap"): the
 * message a player sends their friends so they can find the turf. One
 * button on a turf's page (under its map, beside Get directions) and on a
 * game's page (Where you'll play), drawn by
 * components/ui/ShareLocationButton.tsx: a tap opens the phone's share
 * sheet with this text, or copies it where there is none.
 *
 * The text is the place and nothing else: its name, its address, a Google
 * Maps link that opens the place, and the turf's own TapTurf page last
 * (the Maps link first, so a chat's link preview is the map). No game, no
 * time, no person. The Maps link is only text until someone taps it, so
 * nothing loads from Google on our page. Relative imports only
 * (npm run test:game).
 */

/** Every word a person reads on the button. */
export const SHARE_LOCATION = {
  label: "Share location",
  copied: "Location copied",
  /** For a screen reader and the tooltip: whose location. */
  aria: (name: string) => `Share ${name}'s location`,
} as const;

type Place = {
  name?: string | null;
  address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  /** The turf's Google place id, when it has one: Maps then opens the place itself, by name. */
  placeId?: string | null;
};

const clean = (x: unknown): string => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "");

/**
 * A Google Maps link that opens the place. With the turf's Google place
 * id: a search for its name and address that Maps answers with that exact
 * place (query_place_id, which Google reads only beside a query). Else
 * the point (never 0,0, which is no place), else a search for the name
 * and address (mapsSearchUrl). Null with nothing to find.
 */
export function placeUrl(p: Place): string | null {
  const text = [clean(p.name), clean(p.address)].filter(Boolean).join(", ");
  const id = clean(p.placeId);
  // Place ids are letters, digits, - and _ (ChIJ..., about 27 long; longer forms exist).
  if (text && /^[A-Za-z0-9_-]{16,300}$/.test(id)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}&query_place_id=${id}`;
  }
  const zero = Number(p.lat) === 0 && Number(p.lng) === 0;
  return mapsSearchUrl(zero ? { name: p.name, address: p.address } : p);
}

/**
 * The message: "📍 Kings Turf Arena", its address, the Maps link, then the
 * turf's page. A line with nothing known is left out, and an address that
 * only repeats the name is not said twice. Null when there is neither a
 * name nor a Maps link: nothing worth sending.
 *
 * `mapUrl` is the Maps link to send (placeUrl, or the link a game's host
 * gave for a venue they typed); `pageUrl` the turf's own page, absolute,
 * none for a venue that is not on TapTurf.
 */
export function locationShareText(p: { name?: string | null; address?: string | null; mapUrl?: string | null; pageUrl?: string | null }): string | null {
  const name = clean(p.name);
  const address = clean(p.address);
  const map = clean(p.mapUrl);
  if (!name || !map) return null;
  const lines = [`📍 ${name}`];
  if (address && address.toLowerCase() !== name.toLowerCase()) lines.push(address);
  lines.push(map);
  const page = clean(p.pageUrl);
  if (page) lines.push(`On TapTurf: ${page}`);
  return lines.join("\n");
}

/** A turf's message from its own row: the place link by its place id or point, and its page. */
export function turfLocationText(turf: Place, pageUrl?: string | null): string | null {
  return locationShareText({ name: turf.name, address: turf.address, mapUrl: placeUrl(turf), pageUrl });
}
