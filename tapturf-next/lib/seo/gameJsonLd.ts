import type { Game } from "../../types/game";
import { guessCityFromAddress, isCity, labelFor, stateFor } from "../city";
import { gameShareImages } from "../og/gameCard";
import { gameVenue, type GameVenue } from "../utils/game";
import { SITE_URL } from "./defaults";
import { gameDates } from "./gameDates";

/**
 * SportsEvent JSON-LD for a game: its page (app/game/[id]/page.tsx) and
 * the ItemList of the first 20 open games on /games and every
 * /c/<city>/games (components/game/GamesView.tsx).
 *
 * - organizer: the host, a Person by their name, with url: their public
 *   profile (/u/<username>) when they have one that is shown (a username
 *   with "Let others find and tag me" on: lib/games/hostProfile.ts finds
 *   it on the server), else the game's own page, where players reach the
 *   host. Never a number or an email.
 * - performer: the host again, a Person by name: the host plays in the
 *   game (game_create puts them in game_participants). No teams or players
 *   are invented.
 * - image: the game's own share card (lib/og/gameCard.ts), 1200x630, 4:3
 *   and 1:1, absolute www URLs that change when what it says changes.
 * - Everything else is as it was before these three (and, on /games,
 *   description, eventStatus, eventAttendanceMode and a typed venue's
 *   location) were added; test:seo pins it.
 *
 * Pure (relative imports), so node --test runs it (npm run test:seo).
 */

/** Host account id -> their shown username (lib/games/hostProfile.ts). */
export type HostProfiles = ReadonlyMap<string, string>;

const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;

export const gamePageUrl = (id: string) => `${SITE_URL}/game/${id}`;

/** The host as organizer (with url) and performer (by name). */
export function gameHost(g: Pick<Game, "host_name">, pageUrl: string, username: string | null | undefined) {
  const name = g.host_name || "TapTurf host";
  return {
    organizer: {
      "@type": "Person",
      name,
      url: username && USERNAME.test(username) ? `${SITE_URL}/u/${username}` : pageUrl,
    },
    performer: { "@type": "Person", name },
  };
}

/** The city the page names: a turf's as before (its city, else one its address names), a typed venue's own (the host's words for a town TapTurf has no city for). */
export function gameCityLabel(game: Pick<Game, "turfs">, place: GameVenue | null): string | null {
  if (!game.turfs) return place?.cityLabel || null;
  const turfCity = (game.turfs["city"] as string | undefined) ?? (game.turfs.address ? guessCityFromAddress(game.turfs.address) : null);
  return isCity(turfCity) ? labelFor(turfCity) : null;
}

/** The venue its host typed (not on TapTurf): a Place with its own name and address. */
function typedPlace(place: GameVenue, cityLabel: string | null) {
  return {
    "@type": "Place",
    name: place.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: place.address,
      ...(cityLabel && { addressLocality: cityLabel }),
      // A curated city's state only; a town TapTurf has no city for gives none.
      addressRegion: stateFor(place.city),
      addressCountry: "IN",
    },
  };
}

export type GameJsonLdOptions = {
  /** The id in the page's URL (its canonical). */
  id: string;
  /** The host's shown username, when lib/games/hostProfile.ts found one. */
  hostUsername?: string | null;
  now?: number;
};

/** The game page's SportsEvent. */
export function gameEventJsonLd(game: Game, { id, hostUsername = null, now = Date.now() }: GameJsonLdOptions) {
  // A TapTurf turf, or the venue its host typed: a Place with its own address either way.
  const place = gameVenue(game);
  const gCityLabel = gameCityLabel(game, place);
  const venueName = place?.name ?? "a local turf";
  const url = gamePageUrl(id);
  const { organizer, performer } = gameHost(game, url, hostUsername);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": url,
    name: `${game.sport} at ${venueName}`,
    description: `Join a ${game.sport} game at ${venueName} on TapTurf.`,
    image: gameShareImages(id, game, now).jsonLd,
    // India time (+05:30); an end at or before the start is the next day.
    ...gameDates(game),
    sport: game.sport,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: game.turfs
      ? {
          "@type": "Place",
          name: game.turfs.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: game.turfs.address,
            ...(gCityLabel && { addressLocality: gCityLabel }),
            addressRegion: stateFor(game.turfs.city),
            addressCountry: "IN",
          },
        }
      : place
        ? typedPlace(place, gCityLabel)
        : undefined,
    organizer,
    performer,
    offers: {
      "@type": "Offer",
      url,
      price: game.price_per_player ?? 0,
      priceCurrency: "INR",
      availability: game.current_players < game.max_players ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      validFrom: new Date(now).toISOString(),
    },
    maximumAttendeeCapacity: game.max_players,
    remainingAttendeeCapacity: Math.max(0, game.max_players - game.current_players),
  };
}

/** One game in the /games ItemList: as before, plus what the game page says of its host, card, status and a typed venue. */
function gameListEvent(g: Game, hosts: HostProfiles, now: number) {
  const place = gameVenue(g);
  const venueName = place?.name ?? "a local turf";
  const url = gamePageUrl(g.id);
  const { organizer, performer } = gameHost(g, url, hosts.get(g.creator_id));
  return {
    "@type": "SportsEvent",
    "@id": url,
    name: `${g.sport} at ${venueName}`,
    description: `Join a ${g.sport} game at ${venueName} on TapTurf.`,
    image: gameShareImages(g.id, g, now).jsonLd,
    // India time, so a 7 PM game is not read as 7 PM UTC.
    ...gameDates(g),
    sport: g.sport,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: g.turfs
      ? {
          "@type": "Place",
          name: g.turfs.name,
          address: g.turfs.address,
        }
      : place
        ? typedPlace(place, gameCityLabel(g, place))
        : undefined,
    organizer,
    performer,
    offers: {
      "@type": "Offer",
      price: g.price_per_player ?? 0,
      priceCurrency: "INR",
      availability: g.current_players < g.max_players ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
    maximumAttendeeCapacity: g.max_players,
    remainingAttendeeCapacity: Math.max(0, g.max_players - g.current_players),
  };
}

/** The first 20 open games, identical in every /games variant. */
export const GAMES_JSON_LD_MAX = 20;

/** ItemList of SportsEvent for the first 20 open games, identical in every /games variant. */
export function gamesJsonLd(active: Game[], hosts: HostProfiles = new Map(), now: number = Date.now()) {
  // JSON-LD: SportsEvent per game so Google can show rich results.
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: active.slice(0, GAMES_JSON_LD_MAX).map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: gameListEvent(g, hosts, now),
    })),
  };
}
