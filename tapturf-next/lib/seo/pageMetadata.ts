import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getLiveCities } from "@/lib/queries/cities";
import { CITIES, cityCopyFrom } from "@/lib/city";
import { allTurfsDescription, homeDescription, homeTitle } from "@/lib/seo/listingMeta";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";
import { gameDates } from "@/lib/seo/gameDates";
import type { HomeData } from "@/lib/home/types";
import type { Game } from "@/types/game";
import { plural } from "@/lib/home/format";

/**
 * Metadata and JSON-LD for the pages that have per-city twins (/, and
 * later /turfs and /games). The public page and every app/c/[city]
 * variant call the same builders, so title, description, canonical, OG
 * and structured data are identical whichever city the visitor sees.
 */

/** "Hyderabad, Bangalore, Pune, Mumbai, Delhi and 83 more cities", biggest first, with the live count. */
function whereLine(labels: string[], cityCount: number): string {
  const top5 = labels.slice(0, 5);
  if (top5.length === 0) return "India";
  const more = cityCount - top5.length;
  return `${top5.join(", ")}${more > 0 ? ` and ${plural(more, "more city", "more cities")}` : ""}`;
}

// generateMetadata so the count and the city names in title/description
// stay honest as the database grows. Same snapshot as the page.
export function homeMetadata(d: HomeData, liveCityCount?: number): Metadata {
  const cityCount = liveCityCount && liveCityCount > 0 ? liveCityCount : d.cityCount;
  const labels = d.hero.topCities.map((c) => c.label);
  const top5 = labels.slice(0, 5);
  // "Find a Turf Near You: 3,660+ Turfs in 174 Cities | TapTurf": the
  // words of the "turf near me" searches Google already sends here, the
  // count floored to 5 so it reads honest between deploys, and the brand
  // last, only while the whole title fits (lib/seo/listingMeta.ts).
  const title = homeTitle(d.total, cityCount);
  const description = homeDescription(labels, cityCount);

  return {
    title: { absolute: title },
    description,
    keywords: `football turf, football turf near me, box cricket, box cricket near me, turf near me, ${top5
      .map((l) => `turf ${l.toLowerCase()}`)
      .join(", ")}, tapturf`,
    openGraph: {
      ...OG_BASE,
      images: [DEFAULT_OG_IMAGE],
      title,
      description,
      url: "https://www.tapturf.in",
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: "https://www.tapturf.in" },
  };
}

/**
 * Home JSON-LD, identical in every variant: the WebSite (its name is the
 * site name Google shows above each result) and the Organization behind
 * it. No SearchAction: Google retired the sitelinks search box in
 * November 2024.
 */
export function homeJsonLd(d: HomeData) {
  const where = whereLine(d.hero.topCities.map((c) => c.label), d.cityCount);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://www.tapturf.in/#website",
        name: "TapTurf",
        alternateName: ["Tap Turf", "tapturf.in"],
        url: "https://www.tapturf.in/",
        inLanguage: "en-IN",
        description:
          d.total > 0
            ? `Find sports turfs across ${where} (${d.total.toLocaleString("en-IN")} grounds). Call or WhatsApp the turf, no booking fee.`
            : "Find sports turfs across India. Call or WhatsApp the turf, no booking fee.",
        publisher: { "@id": "https://www.tapturf.in/#org" },
      },
      {
        "@type": "Organization",
        "@id": "https://www.tapturf.in/#org",
        name: "TapTurf",
        url: "https://www.tapturf.in/",
        email: CONTACT_EMAIL,
        logo: {
          "@type": "ImageObject",
          url: "https://www.tapturf.in/icon-512.png",
          width: 512,
          height: 512,
        },
      },
    ],
  };
}

// Metadata reads the live city list (cached an hour) so the names and
// the city count stay honest as cities are added. The title stops at
// the city list: layout's title.template adds "| TapTurf", so baking it
// in here produced "... | TapTurf | TapTurf" in SERPs.
export async function turfsMetadata(): Promise<Metadata> {
  const live = await getLiveCities();
  const labels = live.map((c) => c.label);
  const { short } = cityCopyFrom(labels.length ? labels : CITIES.map((c) => c.label));
  const description = allTurfsDescription(labels, live.length);
  return {
    title: `All Sports Turfs in ${short}`,
    description,
    keywords:
      "turf in hyderabad, turf in bangalore, turf in mumbai, turf in pune, turf in delhi, turf in chennai, turf in nashik, turf in nagpur, box cricket hyderabad, box cricket bangalore, box cricket mumbai, football turf hyderabad, football turf bangalore, football turf mumbai, football turf pune, football turf delhi, football turf nashik, football turf nagpur, cricket turf hyderabad, cricket turf bangalore, cricket turf nashik, cricket turf pune, box cricket nagpur, turf booking india, turf booking telangana, turf booking karnataka, turf booking maharashtra, box cricket",
    openGraph: {
      ...OG_BASE,
      images: [DEFAULT_OG_IMAGE],
      title: `All Sports Turfs in ${short} | TapTurf`,
      description,
      url: "https://www.tapturf.in/turfs",
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: "https://www.tapturf.in/turfs" },
  };
}

// Games can be hosted at any turf TapTurf lists, but on a given day
// most open games sit in a few cities. The metadata stays city-neutral
// and the H1 names the cities that actually have games right now.
const GAMES_TITLE = "Open Cricket, Football & Sports Games across India";
const GAMES_DESCRIPTION =
  "Find and join open sports games across India: cricket, football, box cricket and basketball. Filter by sport and skill level. No booking fee.";

export const GAMES_METADATA: Metadata = {
  title: GAMES_TITLE,
  description: GAMES_DESCRIPTION,
  keywords:
    "open games india, sports games near me, cricket games nashik, cricket games pune, football games nashik, football games pune, box cricket, join a game, open games maharashtra, sports meetup",
  robots: ROBOTS_INDEX,
  openGraph: {
    ...OG_BASE,
    images: [DEFAULT_OG_IMAGE],
    // The title as the layout's template prints it.
    title: `${GAMES_TITLE} | TapTurf`,
    description: GAMES_DESCRIPTION,
    url: "https://www.tapturf.in/games",
  },
  twitter: TWITTER_CARD,
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
        // India time, so a 7 PM game is not read as 7 PM UTC.
        ...gameDates(g),
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
