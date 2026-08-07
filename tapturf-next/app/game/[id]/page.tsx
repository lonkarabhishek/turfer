import type { Metadata } from "next";
import { GameDetailClient } from "@/components/game/GameDetailClient";
import { getGameByIdServer } from "@/lib/queries/games.server";

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

  const venue = game.turfs?.name || "Nashik turf";
  const when = humanDate(game.date, game.start_time);
  const spotsLeft = Math.max(0, game.max_players - game.current_players);
  const price = game.price_per_player > 0 ? `₹${game.price_per_player}/player` : "Free";

  const title = `${game.sport} at ${venue} — ${when}`;
  const description = `${game.sport} game at ${venue}, Nashik on ${when}. ${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left · ${price}. Join in one tap on TapTurf.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://www.tapturf.in/game/${id}`,
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
    },
    alternates: { canonical: `https://www.tapturf.in/game/${id}` },
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGameByIdServer(id);

  const jsonLd = game ? {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `https://www.tapturf.in/game/${id}`,
    name: `${game.sport} at ${game.turfs?.name || "Nashik turf"}`,
    description: `Join a ${game.sport} game at ${game.turfs?.name || "a Nashik turf"} on TapTurf.`,
    startDate: `${game.date}T${game.start_time}`,
    endDate: `${game.date}T${game.end_time}`,
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
            addressLocality: "Nashik",
            addressRegion: "Maharashtra",
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
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <GameDetailClient gameId={id} />
    </>
  );
}
