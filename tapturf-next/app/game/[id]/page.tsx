import type { Metadata } from "next";
import { GameDetailClient } from "@/components/game/GameDetailClient";
import { getGameByIdServer } from "@/lib/queries/games.server";
import { guessCityFromAddress, isCity, labelFor, stateFor } from "@/lib/city";
import { gameVenue, isGameExpired, type GameVenue } from "@/lib/utils/game";
import type { Game } from "@/types/game";
import { gameDates } from "@/lib/seo/gameDates";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_NOINDEX_FOLLOW, TWITTER_CARD } from "@/lib/seo/defaults";
import { jsonLdHtml } from "@/lib/seo/jsonLd";

export const revalidate = 60;

function humanDate(dateStr: string, timeStr?: string): string {
  const iso = timeStr ? `${dateStr}T${timeStr}` : dateStr;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: timeStr ? "numeric" : undefined,
    minute: timeStr ? "2-digit" : undefined,
  });
}

/** The city the page names: a turf's as before (its city, else one its address names), a typed venue's own (the host's words for a town TapTurf has no city for). */
function cityLabelOf(game: Game, place: GameVenue | null): string | null {
  if (!game.turfs) return place?.cityLabel || null;
  const turfCity = (game.turfs["city"] as string | undefined) ?? (game.turfs.address ? guessCityFromAddress(game.turfs.address) : null);
  return isCity(turfCity) ? labelFor(turfCity) : null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const game = await getGameByIdServer(id);

  if (!game) {
    return {
      title: "Game not found",
      robots: { index: false, follow: false },
    };
  }

  // Its turf, or the venue its host typed (not on TapTurf): named the same way.
  const place = gameVenue(game);
  const venue = place?.name || "a local turf";
  const when = humanDate(game.date, game.start_time);
  const spotsLeft = Math.max(0, game.max_players - game.current_players);
  const price = game.price_per_player > 0 ? `₹${game.price_per_player}/player` : "Free";

  // Locality follows the venue's own city (a typed venue's in the host's
  // words); with no city on record the description names only the venue
  // instead of guessing a city.
  const cityLabel = cityLabelOf(game, place);
  const title = `${game.sport} at ${venue}, ${when}`;
  const description = `${game.sport} game at ${venue}${cityLabel ? `, ${cityLabel}` : ""} on ${when}. ${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left · ${price}. Join in one tap on TapTurf.`;

  return {
    title,
    description,
    // A game that has been played is no use in search; keep its links followed.
    ...(isGameExpired(game) ? { robots: ROBOTS_NOINDEX_FOLLOW } : {}),
    openGraph: {
      ...OG_BASE,
      images: [DEFAULT_OG_IMAGE],
      title,
      description,
      url: `https://www.tapturf.in/game/${id}`,
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: `https://www.tapturf.in/game/${id}` },
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGameByIdServer(id);

  const jsonLd = game ? (() => {
    // A TapTurf turf, or the venue its host typed: a Place with its own address either way.
    const place = gameVenue(game);
    const gCityLabel = cityLabelOf(game, place);
    const venueName = place?.name ?? "a local turf";
    return {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      "@id": `https://www.tapturf.in/game/${id}`,
      name: `${game.sport} at ${venueName}`,
      description: `Join a ${game.sport} game at ${venueName} on TapTurf.`,
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
          ? {
              // The venue its host typed (not on TapTurf): its own name and address.
              "@type": "Place",
              name: place.name,
              address: {
                "@type": "PostalAddress",
                streetAddress: place.address,
                ...(gCityLabel && { addressLocality: gCityLabel }),
                // A curated city's state only; a town TapTurf has no city for gives none.
                addressRegion: stateFor(place.city),
                addressCountry: "IN",
              },
            }
          : undefined,
    organizer: {
      "@type": "Person",
      name: game.host_name || "TapTurf host",
    },
    offers: {
      "@type": "Offer",
      url: `https://www.tapturf.in/game/${id}`,
      price: game.price_per_player ?? 0,
      priceCurrency: "INR",
      availability: game.current_players < game.max_players
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
      validFrom: new Date().toISOString(),
    },
      maximumAttendeeCapacity: game.max_players,
      remainingAttendeeCapacity: Math.max(0, game.max_players - game.current_players),
    };
  })() : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />
      )}
      {/* The live link copy only when live links are set up (LIVE_WRITE_KEY is server-only). */}
      <GameDetailClient gameId={id} liveLinks={Boolean(process.env.LIVE_WRITE_KEY)} />
    </>
  );
}
