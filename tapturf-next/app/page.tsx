import type { Metadata } from "next";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { HomeShell } from "@/components/home/HomeShell";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "TapTurf — Cricket, Football & Sports Turfs in Nashik & Pune",
  description:
    "Book sports turfs across Nashik and Pune. 90+ grounds for cricket, football, box cricket, badminton and more. Find a game, host a game, run the pitch.",
  keywords:
    "turf booking nashik, turf booking pune, cricket turf nashik, cricket turf pune, football turf nashik, football turf pune, box cricket, sports turfs maharashtra, tapturf",
  openGraph: {
    title: "TapTurf — Book Turfs in Nashik & Pune",
    description:
      "Every sports turf across Nashik and Pune. Find a game, host a game, run the pitch.",
    url: "https://www.tapturf.in",
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in" },
};

export default async function HomePage() {
  // Fetch each city's turfs server-side so the marketing hero can
  // rescope instantly on the client without a follow-up round-trip.
  const [nashikTurfs, puneTurfs] = await Promise.all([
    getAllActiveTurfs("nashik"),
    getAllActiveTurfs("pune"),
  ]);
  const total = nashikTurfs.length + puneTurfs.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TapTurf",
    url: "https://www.tapturf.in",
    description: `Find and book sports turfs across Nashik and Pune (${total}+ grounds).`,
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
    </>
  );
}
