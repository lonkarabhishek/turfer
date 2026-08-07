import type { Metadata } from "next";
import { GamesListingClient } from "@/components/game/GamesListingClient";
import { getAvailableGamesServer } from "@/lib/queries/games.server";
import { filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";

// Revalidate the pre-rendered HTML every 60s so Google sees fresh open games
// without paying a per-request DB cost.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Open Cricket, Football & Sports Games in Nashik | Join Free",
  description:
    "Find and join live sports games in Nashik. Open cricket, football, box-cricket, basketball games near you. Filter by sport, skill level. No booking fee.",
  keywords:
    "cricket games nashik, football games nashik, box cricket nashik, join a game nashik, open games nashik, sports meetup nashik",
  openGraph: {
    title: "Open Games in Nashik | TapTurf",
    description:
      "Live sports games looking for players in Nashik. Cricket, football, and more — join in one tap.",
    url: "https://www.tapturf.in/games",
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in/games" },
};

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
        name: `${g.sport} at ${g.turfs?.name || "Nashik turf"}`,
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
      {active.length > 0 && (
        <div className="sr-only" aria-hidden>
          <h1>Open sports games in Nashik</h1>
          <ul>
            {active.map((g) => (
              <li key={g.id}>
                <a href={`/game/${g.id}`}>
                  {g.sport} at {g.turfs?.name || "Nashik turf"} — {g.date} {g.start_time}
                  {" "}
                  {g.turfs?.address ? `— ${g.turfs.address}` : ""}
                  {" "}
                  {g.price_per_player > 0 ? `₹${g.price_per_player} per player` : "Free"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <GamesListingClient />
    </>
  );
}
