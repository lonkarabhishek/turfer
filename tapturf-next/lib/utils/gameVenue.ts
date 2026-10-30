import { SPORT_PAGES, sportPageForLabel, turfPlaysSport, type SportPage } from "../sports";
import { formatDistance, haversineKm } from "./location";
import { firstName, formatGameDay, gamePlace } from "./game";
import { sportLabel } from "./sport";

/**
 * The host moves a game to another turf from the edit sheet (the booked
 * one fell through, or it is closed): the other venues near the current
 * one that list the game's sport, what the save checks, and what the
 * players are told. Relative imports only (npm run test:game).
 */

/** A turf the host can move the game to, as the sheet lists it. */
export type VenueOption = {
  id: string;
  name: string;
  area?: string | null;
  city?: string | null;
  address?: string | null;
  /** Straight-line distance from the game's current turf; null when either has no coordinates. */
  km?: number | null;
};

/** A row of the nearest-turfs list (/api/turfs/near): only what the suggestions read. */
export type VenueRow = VenueOption & {
  lat?: number | null;
  lng?: number | null;
  sports?: readonly string[] | null;
  is_active?: boolean | null;
};

/** Further than this from the current turf is not "nearby": the host searches instead. */
export const NEARBY_MAX_KM = 25;
/** How many nearby venues the sheet lists. */
export const NEARBY_LIMIT = 5;

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * The sport page whose venues can host this game: the stored sport's own
 * label ("Box Cricket", "football"), else the longest page label it names
 * as whole words ("5v5 Football" -> Football). Undefined for a sport no
 * page lists ("Kabaddi"): the sheet then offers only the search.
 */
export function gameSportPage(sport: string | null | undefined): SportPage | undefined {
  const label = sportLabel(sport);
  const exact = sportPageForLabel(label) ?? SPORT_PAGES.find((p) => p.name.toLowerCase() === label.toLowerCase());
  if (exact) return exact;
  const have = words(label);
  let best: { page: SportPage; len: number } | null = null;
  for (const page of SPORT_PAGES) {
    for (const l of page.labels) {
      if (have.includes(words(l)) && (!best || l.length > best.len)) best = { page, len: l.length };
    }
  }
  return best?.page;
}

/** A cricket match, box or not: what a turf must list to host one. */
const CRICKET_MATCH = new Set(["cricket", "box cricket"]);

/**
 * Whether a turf can take the game: it lists the game's sport, exactly as
 * turfPlaysSport reads it. A cricket game, box or not, can move to a turf
 * listed under either name, since hosts and turfs use the two
 * interchangeably (7 of the 10 Box Cricket games on 30 Oct were at turfs
 * listed only as "Cricket"); practice nets alone (Cricket Nets, Bowling
 * Machine) do not host a match.
 */
export function venueHostsSport(turfSports: readonly string[], sport: SportPage): boolean {
  if (sport.slug === "cricket" || sport.slug === "box-cricket") return turfSports.some((s) => CRICKET_MATCH.has(s.trim().toLowerCase()));
  return turfPlaysSport([...turfSports], sport);
}

/**
 * Other turfs near the game's current one that can take it
 * (venueHostsSport), nearest first, within NEARBY_MAX_KM. Nothing when
 * the current turf has no coordinates or the sport has no page: no list
 * is better than a wrong one.
 */
export function nearbyVenues(
  origin: { id?: string | null; lat?: number | null; lng?: number | null } | null | undefined,
  rows: readonly VenueRow[],
  sport: SportPage | undefined,
  limit = NEARBY_LIMIT,
): VenueOption[] {
  if (!origin || !sport || origin.lat == null || origin.lng == null) return [];
  const from = { lat: Number(origin.lat), lng: Number(origin.lng) };
  const seen = new Set<string>();
  const out: VenueOption[] = [];
  for (const r of rows) {
    if (!r.id || r.id === origin.id || seen.has(r.id) || r.is_active === false || !r.name?.trim()) continue;
    if (r.lat == null || r.lng == null || !venueHostsSport(r.sports ?? [], sport)) continue;
    const km = haversineKm(from, { lat: Number(r.lat), lng: Number(r.lng) });
    if (!Number.isFinite(km) || km > NEARBY_MAX_KM) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name.trim(), area: r.area ?? null, city: r.city ?? null, address: r.address ?? null, km });
  }
  return out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.name.localeCompare(b.name)).slice(0, limit);
}

/** "800 m", "2.4 km": straight-line, as the sheet says. Null when not known. */
export function venueDistance(km: number | null | undefined): string | null {
  return km != null && Number.isFinite(km) ? formatDistance(km) : null;
}

/** "Dribble Den, Begur": the venue and its area (else its city), for one line; once when the name says it ("Ascend (Baner)"). */
export function venueLine(t: Pick<VenueOption, "name" | "area" | "city" | "address"> | null | undefined): string {
  const name = t?.name?.trim() ?? "";
  if (!name) return "";
  const place = gamePlace(t).split(", ")[0] ?? "";
  return place && !words(name).includes(words(place)) ? `${name}, ${place}` : name;
}

/**
 * Why the picked venue cannot be saved, or null when it can. `active` is
 * the turf as the save read it just now (null: not found or not listed);
 * `unread`: that read failed, so the pick may be fine and is not called unlisted.
 */
export function venueProblem(
  pick: { id?: string | null } | null | undefined,
  current: string | null | undefined,
  active: { id: string } | null,
  unread = false,
): string | null {
  if (!pick?.id || pick.id === current) return null;
  if (unread) return "Couldn't check that venue. Check your connection and try again.";
  if (!active || active.id !== pick.id) return "That venue isn't listed on TapTurf any more. Pick another one.";
  return null;
}

/**
 * The note the players get: "Asha moved Football on Sat 1 Nov to Dribble
 * Den, Begur". The date itself, never "Today": a notification is read
 * later. Nothing about booking: players call or WhatsApp the turf.
 */
export function venueMoveNotice(
  g: { host_name?: string | null; sport?: string | null; date?: string | null },
  to: Pick<VenueOption, "name" | "area" | "city" | "address">,
): { title: string; message: string } {
  const host = firstName(g.host_name);
  const who = host === "the host" ? "Your host" : host;
  const day = g.date ? formatGameDay(g.date).plain : "";
  return {
    title: "Venue changed",
    message: `${who} moved ${sportLabel(g.sport)}${day ? ` on ${day}` : ""} to ${venueLine(to)}`,
  };
}

/**
 * Who hears about the move: everyone playing (accepted) and everyone
 * still waiting on a request, once each, never the host.
 */
export function venueMoveRecipients(
  hostId: string,
  participants: readonly { user_id?: string | null }[],
  requests: readonly { user_id?: string | null; status?: string | null }[],
): string[] {
  const ids = [
    ...participants.map((p) => p.user_id),
    ...requests.filter((r) => r.status === "pending" || r.status === "accepted").map((r) => r.user_id),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== "" && id !== hostId))];
}
