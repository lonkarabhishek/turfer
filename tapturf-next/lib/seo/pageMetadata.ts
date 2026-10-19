import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getCityCopy } from "@/lib/queries/cities";
import type { HomeData } from "@/lib/home/types";
import type { Game } from "@/types/game";

/**
 * Metadata and JSON-LD for the pages that have per-city twins (/, and
 * later /turfs and /games). The public page and every app/c/[city]
 * variant call the same builders, so title, description, canonical, OG
 * and structured data are identical whichever city the visitor sees.
 */

/** "Hyderabad, Bangalore, Mumbai, Pune, Delhi and 49 more cities", biggest first. */
function whereLine(labels: string[], cityCount: number): string {
  const top5 = labels.slice(0, 5);
  if (top5.length === 0) return "India";
  const more = cityCount - top5.length;
  return `${top5.join(", ")}${more > 0 ? ` and ${more} more cities` : ""}`;
}

// generateMetadata so the count and the city names in title/description
// stay honest as the database grows. Same snapshot as the page.
export function homeMetadata(d: HomeData, liveCityCount?: number): Metadata {
  const cityCount = liveCityCount && liveCityCount > 0 ? liveCityCount : d.cityCount;
  const labels = d.hero.topCities.map((c) => c.label);
  const top3 = labels.slice(0, 3);
  const top5 = labels.slice(0, 5);
  // Floor to a multiple of 5 so "2,335+" reads honest even when the
  // live count is 2,337 and changes between deploys.
  const rounded = Math.floor(d.total / 5) * 5;
  const where = whereLine(labels, cityCount);
  const countLine = rounded >= 50 ? `${rounded.toLocaleString("en-IN")}+ grounds with photos, ratings and prices. ` : "";

  // Title under 60 characters, description about 150: Google shows the
  // whole of both, including the no-fee line that sets TapTurf apart.
  const titleWhere = cityCount > 0 ? `${cityCount} Indian Cities` : "India";
  const more = cityCount - top3.length;
  const descWhere = top3.length ? `in ${top3.join(", ")}${more > 0 ? ` and ${more} more cities` : ""}` : "across India";
  const description =
    rounded >= 50
      ? `${rounded.toLocaleString("en-IN")}+ football, box cricket and sports turfs ${descWhere}. Photos, ratings and prices. No booking fee.`
      : `Football, box cricket and sports turfs ${descWhere}. Photos, ratings and prices. Call or WhatsApp the turf, no booking fee.`;
  const titleCities = top3.length ? `${top3.join(", ")} & more` : "India";

  return {
    // absolute so layout's template doesn't add another "| TapTurf":
    // the wordmark is already the first word.
    title: { absolute: `TapTurf: Football & Box Cricket Turfs in ${titleWhere}` },
    description,
    keywords: `football turf, football turf near me, box cricket, box cricket near me, turf near me, ${top5
      .map((l) => `turf ${l.toLowerCase()}`)
      .join(", ")}, tapturf`,
    openGraph: {
      images: [{ url: "https://www.tapturf.in/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
      title: `TapTurf: Sports Turfs in ${titleCities}`,
      description: `${countLine}Find a turf across ${where}, call or WhatsApp to book, join an open game.`.trim(),
      url: "https://www.tapturf.in",
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
    },
    alternates: { canonical: "https://www.tapturf.in" },
  };
}

/** WebSite JSON-LD for the home, identical in every variant. */
export function homeJsonLd(d: HomeData) {
  const where = whereLine(d.hero.topCities.map((c) => c.label), d.cityCount);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TapTurf",
    url: "https://www.tapturf.in",
    description:
      d.total > 0
        ? `Find sports turfs across ${where} (${d.total.toLocaleString("en-IN")} grounds). Call or WhatsApp the turf, no booking fee.`
        : "Find sports turfs across India. Call or WhatsApp the turf, no booking fee.",
    publisher: {
      "@type": "Organization",
      name: "TapTurf",
      url: "https://www.tapturf.in",
      email: CONTACT_EMAIL,
      logo: "https://www.tapturf.in/icon-512.png",
    },
    // /turfs seeds its search box from ?q=, so this action is real.
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.tapturf.in/turfs?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };
}

// Metadata reads the live city list (cached an hour) so the names and
// the city count stay honest as cities are added. The title stops at
// the city list: layout's title.template adds "| TapTurf", so baking it
// in here produced "... | TapTurf | TapTurf" in SERPs.
export async function turfsMetadata(): Promise<Metadata> {
  const { short, listAnd } = await getCityCopy();
  return {
    title: `All Sports Turfs in ${short}`,
    description: `Every sports turf in ${listAnd}. Compare prices, check ratings, view photos. Football, box cricket, cricket, badminton and more. Call or WhatsApp to book, no booking fee.`,
    keywords:
      "turf in hyderabad, turf in bangalore, turf in mumbai, turf in pune, turf in delhi, turf in chennai, turf in nashik, turf in nagpur, box cricket hyderabad, box cricket bangalore, box cricket mumbai, football turf hyderabad, football turf bangalore, football turf mumbai, football turf pune, football turf delhi, football turf nashik, football turf nagpur, cricket turf hyderabad, cricket turf bangalore, cricket turf nashik, cricket turf pune, box cricket nagpur, turf booking india, turf booking telangana, turf booking karnataka, turf booking maharashtra, box cricket",
    openGraph: {
      images: [{ url: "https://www.tapturf.in/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
      title: `All Sports Turfs in ${short} | TapTurf`,
      description: `Every sports turf across ${listAnd}. Compare prices, check ratings, call or WhatsApp to book.`,
      url: "https://www.tapturf.in/turfs",
      type: "website",
    },
    alternates: { canonical: "https://www.tapturf.in/turfs" },
  };
}

// Games can be hosted at any turf TapTurf lists, but on a given day
// most open games sit in a few cities. The metadata stays city-neutral
// and the H1 names the cities that actually have games right now.
export const GAMES_METADATA: Metadata = {
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

/** ItemList of SportsEvent for the first 20 open games, identical in every /games variant. */
export function gamesJsonLd(active: Game[]) {
  // JSON-LD: SportsEvent per game so Google can show rich results.
  return {
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
}
