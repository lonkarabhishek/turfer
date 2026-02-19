import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfListingClient } from "@/components/search/TurfListingClient";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "All Turfs in Nashik - Compare Prices & Book",
  description:
    "Browse 49+ sports turfs in Nashik. Compare prices starting from ₹350/hr, check ratings, view photos. Football, cricket, basketball turfs available. Call or WhatsApp to book.",
  keywords:
    "turf in nashik, sports turf nashik, football turf nashik, cricket turf nashik, turf booking nashik, box cricket nashik",
  openGraph: {
    title: "All Turfs in Nashik - Compare Prices & Book | TapTurf",
    description:
      "Browse 49+ sports turfs in Nashik. Compare prices, check ratings, and book instantly.",
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
        <h1 className="text-[28px] md:text-[32px] font-semibold text-gray-900">
          Turfs in Nashik
        </h1>
        <p className="text-base text-gray-500 mt-1">
          {turfs.length} sports turfs with pricing, ratings, and directions
        </p>
      </div>

      <TurfListingClient turfs={turfs} />
    </div>
  );
}
