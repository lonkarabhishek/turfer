import type { Metadata } from "next";
import { CITY_IDS, guessCityFromAddress, isCity, labelFor } from "@/lib/city";
import { GamesListingClient } from "@/components/game/GamesListingClient";
import { getAvailableGamesServer } from "@/lib/queries/games.server";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";

// Revalidate the pre-rendered HTML every 60s so Google sees fresh open games
// without paying a per-request DB cost.
export const revalidate = 60;

// Games can be hosted at any turf TapTurf lists, but on a given day
// most open games sit in a few cities. The metadata stays city-neutral
// and the H1 names the cities that actually have games right now.
export const metadata: Metadata = {
  title: "Open Cricket, Football & Sports Games across India",
  description:
    "Find and join live sports games near you. Open cricket, football, box cricket and basketball games across India. Filter by sport and skill level. No booking fee.",
  keywords:
    "open games india, sports games near me, cricket games nashik, cricket games pune, football games nashik, football games pune, box cricket, join a game, open games maharashtra, sports meetup",
  openGraph: {
    images: [{ url: "https://www.tapturf.in/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
    title: "Open Games across India | TapTurf",
    description:
      "Live sports games looking for players across India. Cricket, football, and more. Join in one tap.",
    url: "https://www.tapturf.in/games",
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in/games" },
};

/** Cities with at least one open game, biggest city first; "across India" when none. */
function gameCitiesLine(games: { turfs?: { city?: string | null; address?: string } }[]): string {
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const ids = new Set<string>();
  for (const g of games) {
    const c = g.turfs?.city ?? guessCityFromAddress(g.turfs?.address);
    if (isCity(c)) ids.add(c);
  }
  const labels = [...ids]
    .sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
    .map(labelFor);
  if (labels.length === 0) return "across India";
  if (labels.length === 1) return `in ${labels[0]}`;
  return `in ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export default async function GamesPage() {
  const all = await getAvailableGamesServer();
  const active = sortGamesByDateTime(filterNonExpiredGames(all));

  // JSON-LD: SportsEvent per game so Google can show rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: active.slice(0, 20).map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsEvent",
        "@id": `https://www.tapturf.in/game/${g.id}`,
        name: `${g.sport} at ${g.turfs?.name || "a local turf"}`,
        startDate: `${g.date}T${g.start_time}`,
        endDate: `${g.date}T${g.end_time}`,
        sport: g.sport,
        location: g.turfs
          ? {
              "@type": "Place",
              name: g.turfs.name,
              address: g.turfs.address,
            }
          : undefined,
        offers: {
          "@type": "Offer",
          price: g.price_per_player ?? 0,
          priceCurrency: "INR",
          availability: g.current_players < g.max_players
            ? "https://schema.org/InStock"
            : "https://schema.org/SoldOut",
        },
        maximumAttendeeCapacity: g.max_players,
        remainingAttendeeCapacity: Math.max(0, g.max_players - g.current_players),
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* SEO: server-render a plain, crawler-visible list of the current open
          games. Interactive filters + real cards live in the client component
          below. The client fetches its own state, so both coexist happily. */}
      <div className="sr-only" aria-hidden>
        <h1>Open sports games {gameCitiesLine(active)}</h1>
        {active.length > 0 && (
          <ul>
            {active.map((g) => (
              <li key={g.id}>
                <a href={`/game/${g.id}`}>
                  {g.sport} at {g.turfs?.name || "a local turf"}, {g.date} {g.start_time}
                  {" "}
                  {g.turfs?.address ? `, ${g.turfs.address}` : ""}
                  {" "}
                  {g.price_per_player > 0 ? `₹${g.price_per_player} per player` : "Free"}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <GamesListingClient />
    </>
  );
}
