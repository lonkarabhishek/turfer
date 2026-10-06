import Link from "next/link";
import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfListingClient } from "@/components/search/TurfListingClient";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";

export const revalidate = 600;

// Static metadata used for the initial paint / social share. We can't
// put the live turf count in a static export, so we phrase it in a
// way that stays accurate as the number grows ("Every sports turf in
// Nashik, Mumbai & Pune"). If we want the exact number in <title>, we'd have
// to switch this to a `generateMetadata()` async function.
// Title stops at "…Book" — layout's title.template adds "| TapTurf" so
// hard-coding it here produced "…Book | TapTurf | TapTurf" in SERPs.
export const metadata: Metadata = {
  title: "All Sports Turfs in Nashik, Mumbai & Pune",
  description:
    "Every sports turf in Nashik, Mumbai and Pune. Compare prices, check ratings, view photos. Football, box cricket, cricket, badminton and more. Call or WhatsApp to book, no booking fee.",
  keywords:
    "turf in nashik, turf in pune, turf in mumbai, sports turf nashik pune mumbai, football turf nashik, football turf pune, football turf mumbai, cricket turf nashik, cricket turf pune, turf booking maharashtra, box cricket",
  openGraph: {
    title: "All Sports Turfs in Nashik, Mumbai & Pune | TapTurf",
    description:
      "Every sports turf across Nashik, Mumbai and Pune. Compare prices, check ratings, call or WhatsApp to book.",
    url: "https://www.tapturf.in/turfs",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in/turfs" },
};

export default async function TurfsPage() {
  const [turfs, trendingPicks] = await Promise.all([getAllActiveTurfs(), getTrendingPicks()]);
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
      <TurfListingClient turfs={turfs} spotlights={spotlights} />
    </div>
  );
}
