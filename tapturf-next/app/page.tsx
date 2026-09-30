import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { HomeShell } from "@/components/home/HomeShell";
import { PopularByCity } from "@/components/home/PopularByCity";
import { TrendingSpotlight } from "@/components/turf/TrendingSpotlight";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { compareTopRated, hasEnoughReviews } from "@/lib/utils/ranking";
import { CITIES, type CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";

export const revalidate = 600;

async function fetchAllCities(): Promise<Record<CityId, Turf[]>> {
  const entries = await Promise.all(
    CITIES.map(async (c) => [c.id, await getAllActiveTurfs(c.id)] as const),
  );
  return Object.fromEntries(entries) as Record<CityId, Turf[]>;
}

// generateMetadata so the "N+ grounds" number in title/description
// stays honest as the DB grows, instead of the old hard-coded "90+".
export async function generateMetadata(): Promise<Metadata> {
  const byCity = await fetchAllCities();
  const total = Object.values(byCity).reduce((n, list) => n + list.length, 0);
  // Round down to a tens boundary so we don't reprint stale counts
  // on every deploy — "175+" reads honest even if it becomes 176.
  const rounded = Math.max(50, Math.floor(total / 5) * 5);
  const activeCityLabels = CITIES
    .filter((c) => (byCity[c.id]?.length ?? 0) > 0)
    .map((c) => c.label);
  const cityLine =
    activeCityLabels.length <= 1
      ? activeCityLabels[0] ?? "Nashik"
      : activeCityLabels.slice(0, -1).join(", ") + " & " + activeCityLabels.at(-1)!;

  return {
    // absolute so layout's template doesn't add another "| TapTurf" —
    // the wordmark is already the first word.
    title: {
      absolute: `TapTurf: Cricket, Football & Sports Turfs in ${cityLine}`,
    },
    description: `Book sports turfs across ${cityLine}. ${rounded}+ grounds for cricket, football, box cricket, badminton and more. Find a game, host a game, run the pitch.`,
    keywords:
      "turf booking nashik, turf booking pune, turf booking mumbai, cricket turf, football turf, box cricket, sports turfs maharashtra, tapturf",
    openGraph: {
      title: `TapTurf: Book Turfs in ${cityLine}`,
      description: `${rounded}+ sports turfs across ${cityLine}. Find a game, host a game, run the pitch.`,
      url: "https://www.tapturf.in",
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
    },
    alternates: { canonical: "https://www.tapturf.in" },
  };
}

/**
 * Pick top turfs for a city — rating × review-count (Wilson-lite),
 * skipping unrated. Server-rendered so Googlebot sees turf links even
 * though the marketing hero mounts as a client component below.
 */
function topTurfsFor(all: Turf[]) {
  return [...all]
    .filter(hasEnoughReviews)
    .sort(compareTopRated)
    .slice(0, 8);
}

export default async function HomePage() {
  const [byCity, trendingPicks] = await Promise.all([fetchAllCities(), getTrendingPicks()]);
  const spotlights = toSpotlights(trendingPicks, Object.values(byCity).flat());
  const total = Object.values(byCity).reduce((n, list) => n + list.length, 0);
  // HomeShell still takes nashik/pune explicitly for now — its child
  // MarketingHome shows a "Browse Nashik / Browse Pune" pair; when
  // Mumbai has turfs we'll extend that too.
  const nashikTurfs = byCity.nashik ?? [];
  const puneTurfs = byCity.pune ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TapTurf",
    url: "https://www.tapturf.in",
    description: `Find and book sports turfs across Nashik, Pune and Mumbai (${total}+ grounds).`,
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.tapturf.in/turfs?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeShell nashikTurfs={nashikTurfs} puneTurfs={puneTurfs} />

      {/* This week's "Most Trending Turf" for the visitor's city. */}
      <TrendingSpotlight picks={spotlights} className="max-w-6xl mx-auto px-4 sm:px-6 mt-14" />

      {/* Top-turf strips. Server-rendered for every city (crawlers see
          all the /turf links); the client then narrows to the visitor's
          picked or detected city. Iterates CITIES so a new city appears
          once it has rated turfs. */}
      <PopularByCity
        cities={CITIES.map((c) => ({
          id: c.id,
          total: (byCity[c.id] ?? []).length,
          turfs: topTurfsFor(byCity[c.id] ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            address: t.address,
            rating: t.rating,
            reviews: t.total_reviews,
          })),
        })).filter((c) => c.turfs.length > 0)}
      />
      <div className="h-16" />
    </>
  );
}
