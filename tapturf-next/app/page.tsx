import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getHomeData } from "@/lib/home/data";
import { HomeShell } from "@/components/home/HomeShell";
import { TopTurfsByCity } from "@/components/home/TopTurfsByCity";
import { EveryCityList } from "@/components/home/EveryCityList";
import { OpenGames } from "@/components/home/OpenGames";
import { SportGrid } from "@/components/home/SportGrid";
import { NearMeBand } from "@/components/home/NearMeBand";
import { ToolsRow } from "@/components/home/ToolsRow";
import { GuidesRow } from "@/components/home/GuidesRow";
import { FinalBand } from "@/components/home/FinalBand";

// Same window as HOME_REVALIDATE in lib/home/data.ts (Next needs a literal here).
export const revalidate = 600;

/** "Hyderabad, Bangalore, Mumbai, Pune, Delhi and 49 more cities", biggest first. */
function whereLine(labels: string[], cityCount: number): string {
  const top5 = labels.slice(0, 5);
  if (top5.length === 0) return "India";
  const more = cityCount - top5.length;
  return `${top5.join(", ")}${more > 0 ? ` and ${more} more cities` : ""}`;
}

// generateMetadata so the count and the city names in title/description
// stay honest as the database grows. Same snapshot as the page.
export async function generateMetadata(): Promise<Metadata> {
  const d = await getHomeData();
  const labels = d.hero.topCities.map((c) => c.label);
  const top3 = labels.slice(0, 3);
  const top5 = labels.slice(0, 5);
  // Floor to a multiple of 5 so "2,335+" reads honest even when the
  // live count is 2,337 and changes between deploys.
  const rounded = Math.floor(d.total / 5) * 5;
  const where = whereLine(labels, d.cityCount);
  const countLine = rounded >= 50 ? `${rounded.toLocaleString("en-IN")}+ grounds with photos, ratings and prices. ` : "";

  // Title under 60 characters, description about 150: Google shows the
  // whole of both, including the no-fee line that sets TapTurf apart.
  const titleWhere = d.cityCount > 0 ? `${d.cityCount} Indian Cities` : "India";
  const more = d.cityCount - top3.length;
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

export default async function HomePage() {
  const d = await getHomeData();
  const where = whereLine(d.hero.topCities.map((c) => c.label), d.cityCount);

  const jsonLd = {
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Visitors: the hero. Signed in: LoggedInHome. Everything below is shared. */}
      <HomeShell hero={d.hero} />

      {/* Top-rated photo tiles for the visitor's city (server renders the
          biggest city), then every city with its top turf links for crawlers. */}
      {d.strips.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 md:mt-10">
          <TopTurfsByCity strips={d.strips} featuredId={d.strips[0].id} spotlights={d.spotlights} />
        </div>
      )}
      {d.cityRows.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
          <EveryCityList cities={d.cityRows} cityCount={d.cityCount} />
        </section>
      )}

      <OpenGames games={d.games} gamesByCity={d.gamesByCity} total={d.openGamesTotal} totalByCity={d.openGamesByCity} />

      {d.sports.length > 0 && <SportGrid sports={d.sports} byCity={d.sportsByCity} />}

      <NearMeBand pins={d.pins} />
      <ToolsRow />
      <GuidesRow posts={d.posts} />
      <FinalBand />
    </>
  );
}
