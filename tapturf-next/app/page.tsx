import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { HomeShell } from "@/components/home/HomeShell";
import Link from "next/link";
import { PopularByCity } from "@/components/home/PopularByCity";
import { SPORT_PAGES, turfPlaysSport } from "@/lib/sports";
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
      absolute: `TapTurf: Football & Box Cricket Turfs in ${cityLine}`,
    },
    description: `Find and book football, box cricket and sports turfs across ${cityLine}. ${rounded}+ grounds with photos, ratings and prices. Call or WhatsApp the turf, no booking fee.`,
    keywords:
      "football turf, football turf near me, football turf nashik, football turf pune, football turf mumbai, box cricket, turf booking nashik, turf booking pune, turf booking mumbai, tapturf",
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
  const allTurfs = Object.values(byCity).flat();
  const sportCounts = SPORT_PAGES.map((sp) => ({
    ...sp,
    count: allTurfs.filter((t) => turfPlaysSport(t.sports, sp)).length,
  })).filter((sp) => sp.count > 0);
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
      {/* Browse by sport: server-rendered links to every sport page,
          with live counts. Also what Google uses to pick sitelinks. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
        <h2 className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight mb-4">
          Browse by sport
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sportCounts.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/sport/${s.slug}`}
                className="flex items-center gap-3 rounded-2xl bg-primary-50 hover:bg-primary-100 px-4 py-3 transition-colors"
              >
                <span className="text-2xl" aria-hidden>{s.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">{s.name}</span>
                  <span className="block text-[13px] text-primary-500 tabular-nums">
                    {s.count} turf{s.count !== 1 ? "s" : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="h-16" />
    </>
  );
}
