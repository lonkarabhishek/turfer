import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfListingClient } from "@/components/search/TurfListingClient";

export const revalidate = 600;

// Static metadata used for the initial paint / social share. We can't
// put the live turf count in a static export, so we phrase it in a
// way that stays accurate as the number grows ("Every sports turf in
// Nashik & Pune"). If we want the exact number in <title>, we'd have
// to switch this to a `generateMetadata()` async function.
export const metadata: Metadata = {
  title: "All Sports Turfs in Nashik & Pune — Compare Prices & Book | TapTurf",
  description:
    "Every sports turf in Nashik and Pune. Compare prices, check ratings, view photos. Cricket, football, box cricket, badminton and more. Call or WhatsApp to book.",
  keywords:
    "turf in nashik, turf in pune, sports turf nashik pune, football turf nashik, football turf pune, cricket turf nashik, cricket turf pune, turf booking maharashtra, box cricket",
  openGraph: {
    title: "All Sports Turfs in Nashik & Pune | TapTurf",
    description:
      "Every sports turf across Nashik and Pune. Compare prices, check ratings, book instantly.",
    url: "https://www.tapturf.in/turfs",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in/turfs" },
};

export default async function TurfsPage() {
  const turfs = await getAllActiveTurfs();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold text-accent-600 uppercase tracking-widest mb-2">
          Nashik + Pune
        </p>
        <h1 className="text-[30px] md:text-[36px] font-bold text-primary-800 font-serif">
          Find your turf
        </h1>
        <p className="text-base text-primary-400 mt-1">
          {turfs.length} sports turfs with pricing, ratings, and directions
        </p>
      </div>

      <TurfListingClient turfs={turfs} />
    </div>
  );
}
