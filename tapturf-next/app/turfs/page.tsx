import Link from "next/link";
import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfListingClient } from "@/components/search/TurfListingClient";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { forCard } from "@/lib/utils/cardTurf";
import { getCityCopy, getLiveCities } from "@/lib/queries/cities";

export const revalidate = 600;

// Metadata reads the live city list (cached an hour) so the names and
// the city count stay honest as cities are added. The title stops at
// the city list: layout's title.template adds "| TapTurf", so baking it
// in here produced "... | TapTurf | TapTurf" in SERPs.
export async function generateMetadata(): Promise<Metadata> {
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

export default async function TurfsPage() {
  const [turfs, trendingPicks, cities] = await Promise.all([getAllActiveTurfs(), getTrendingPicks(), getLiveCities()]);
  const spotlights = toSpotlights(trendingPicks, turfs);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10">
      <h1 className="text-[32px] md:text-[40px] text-primary-900 font-display leading-tight">
        Find your turf
      </h1>
      <Link href="/turf-near-me" className="inline-block mt-1 text-[15px] font-medium text-accent-600 hover:text-accent-700">
        Turfs near me, sorted by distance
      </Link>
      {/* The count line lives in the client: it follows the visitor's
          picked city, which only the browser knows. */}
      <TurfListingClient turfs={turfs.map(forCard)} spotlights={spotlights} />

      {/* Browse by city: a crawlable link to every city page, biggest
          city first. The listing above is client-filtered, so without
          this /turfs had no server-rendered path to any city. */}
      {cities.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[20px] font-display text-primary-900 mb-4">
            Turfs by city
          </h2>
          <ul className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${c.id}`}
                  className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-medium text-primary-900"
                >
                  Turfs in {c.label}
                  {c.n > 0 && <span className="text-primary-500 tabular-nums">{c.n}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
