import type { Metadata } from "next";
import { compareTopRated, hasEnoughReviews } from "@/lib/utils/ranking";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { getAllActiveTurfs, getCardTurfs } from "@/lib/queries/turfs";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { trendingFor } from "@/lib/queries/turfList";
import { TurfListingClient } from "@/components/search/TurfListingClient";
import { DEFAULT_FILTERS, FIRST_PAGE, availableSports, pageOf } from "@/lib/turfList/query";
import { LIST_PREPAINT_JS } from "@/lib/turfList/client";
import { MakeMyCity } from "@/components/city/MakeMyCity";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { citySportLinks, venueWord } from "@/lib/sports";
import { CITIES, cityPointsOf, isCity, labelFor, stateFor, type CityId } from "@/lib/city";
import { getLiveCities, isLiveCity, pickOtherCities } from "@/lib/queries/cities";
import { NoteInterest } from "@/components/analytics/VisitTracker";
import { turfPath, turfUrl } from "@/lib/utils/turfPath";
import { fitFontSize } from "@/lib/utils/fitText";
import { cityDescription, cityFacts, cityTitle, listingOgImage } from "@/lib/seo/listingMeta";
import { OG_BASE, ROBOTS_NOINDEX_FOLLOW, TWITTER_CARD } from "@/lib/seo/defaults";
import { jsonLdHtml } from "@/lib/seo/jsonLd";
import { listingReach, reachOf } from "@/lib/seo/turfFacts";
import { getTurfFacts } from "@/lib/queries/turfFacts";

// One page per city: a hard SEO landing so each city ranks for its own
// local queries.
export const revalidate = 600;

// Production builds render every live city up front (and the curated
// ones, should the read fail); previews and local builds render none
// (each page renders on its first visit instead), so a preview of a
// branch no longer renders pages against the production database (about
// 1,300 per preview before 20 Oct). A city added after the deploy renders
// on its first visit.
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const live = await getLiveCities().catch(() => []);
  return [...new Set([...live.map((c) => c.id), ...CITIES.map((c) => c.id)])].map((city) => ({ city }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params;
  if (!isCity(city) || !(await isLiveCity(city))) return { title: "City not found", robots: ROBOTS_NOINDEX_FOLLOW };
  const label = labelFor(city);
  // The rows the page reads anyway (one read per render, React cache),
  // and which of them show timings or a number to call (a day-long copy).
  const [turfs, turfFacts] = await Promise.all([getAllActiveTurfs(city), getTurfFacts()]);
  const facts = cityFacts(label, turfs, citySportLinks(city, turfs), listingReach(turfs, reachOf(turfFacts)));
  const title = cityTitle(facts);
  const description = cityDescription(facts);

  return {
    title: { absolute: title },
    description,
    keywords: [
      `turfs in ${label.toLowerCase()}`,
      `football turf in ${label.toLowerCase()}`,
      `box cricket in ${label.toLowerCase()}`,
      `turf booking ${label.toLowerCase()}`,
      `cricket turf ${label.toLowerCase()}`,
      `football turf ${label.toLowerCase()}`,
      `box cricket ${label.toLowerCase()}`,
      `sports ${label.toLowerCase()}`,
    ].join(", "),
    openGraph: {
      ...OG_BASE,
      images: [listingOgImage(turfs, `Turfs in ${label}`)],
      title,
      description,
      url: `https://www.tapturf.in/${city}`,
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: `https://www.tapturf.in/${city}` },
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  if (!isCity(city) || !(await isLiveCity(city))) notFound();
  const cityId = city as CityId;
  const label = labelFor(cityId);

  // The card rows and picks are the ones /turfs and GET /api/turfs/list rank
  // (same rows as getAllActiveTurfs, one read per render).
  const [turfs, picks, liveCities, cards] = await Promise.all([
    getAllActiveTurfs(cityId),
    getTrendingPicks(),
    getLiveCities(),
    getCardTurfs(cityId),
  ]);
  const trendingPick = picks[cityId] ?? null;
  // Cross-links to other city pages: the twelve nearest (curated or not:
  // each placed by its curated centroid, else its turfs' median), plus the
  // home cities, nearest first.
  const otherCities = pickOtherCities(liveCities, cityId, cityPointsOf(liveCities));
  const spotlight = trendingPick ? toSpotlights({ [cityId]: trendingPick }, turfs) : [];
  const sportCounts = citySportLinks(cityId, turfs);
  // Turfs with enough reviews to trust the score: the list is "Popular" when there are some.
  const featured = [...turfs].filter(hasEnoughReviews).sort(compareTopRated).slice(0, 6);
  // The list's first cards: /turfs's default list for this city (top rated, the trending
  // pick first), so every "Popular" turf the page showed is among them, in the same order.
  const first = pageOf(cards.turfs, { ...DEFAULT_FILTERS, at: null }, trendingFor(cityId, picks), 0, FIRST_PAGE, cards.v);

  // JSON-LD: ItemList of turfs, a SportsActivityLocation per turf
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Sports turfs in ${label}`,
    itemListElement: turfs.slice(0, 30).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsActivityLocation",
        "@id": turfUrl(t),
        name: t.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: t.address,
          addressLocality: label,
          addressRegion: stateFor(cityId),
          addressCountry: "IN",
        },
        // No aggregateRating: t.rating and t.total_reviews are Google's,
        // and Google's review-snippet rules want ratings the site collected
        // itself. A turf's own page carries TapTurf players' stars once it
        // has enough of them (lib/utils/seo.ts generateTurfJsonLd).
      },
    })),
  };

  return (
    <>
      <NoteInterest city={city} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      {/* The chat answers for this city while the visitor is on its page. */}
      <AskPageContext city={cityId} />

      {/* Hero */}
      <section
        className="relative bg-white"
        style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 60%)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-10 md:pt-16 md:pb-14">
          <p className="text-[11px] font-mono text-accent-600 mb-2">
            {turfs.length} {turfs.length === 1 ? "ground" : "grounds"}
          </p>
          {/* The city word is one unbreakable line at 48 to 120px: a long name
              (Thiruvananthapuram, Visakhapatnam) shrinks to the H1's width
              (container units), and may break as a last resort. */}
          <h1
            className="font-display text-primary-800 leading-[0.88] tracking-tight text-[48px] sm:text-[80px] md:text-[120px] [overflow-wrap:anywhere]"
            style={{ containerType: "inline-size" }}
          >
            Turfs in<br />
            <span className="text-accent-500" style={{ fontSize: fitFontSize(`${label}.`) }}>
              {label}.
            </span>
          </h1>
          <div className="mt-4">
            <MakeMyCity city={cityId} label={label} />
          </div>
          <p className="mt-4 max-w-xl text-base text-primary-500">
            Every cricket, football, box-cricket and multi-sport turf in {label}.
            Compare, contact, and book without a booking fee.
          </p>

        </div>
      </section>

      {/* By sport in this city -> /<city>/<sport> pages */}
      {sportCounts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
          <h2 className="text-[18px] font-semibold text-primary-900 mb-3">Turfs and courts by sport in {label}</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sportCounts.map((sp) => (
              <li key={sp.slug}>
                <Link
                  href={sp.href}
                  className="flex items-center gap-3 rounded-2xl bg-primary-50 hover:bg-primary-100 px-4 py-3 transition-colors"
                >
                  <span className="text-2xl" aria-hidden>{sp.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-primary-900 truncate">{sp.name}</span>
                    <span className="block text-[13px] text-primary-500 tabular-nums">
                      {sp.count} {venueWord(sp, sp.count)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Every turf in this city, as on /turfs: search, sport chips, Filters,
          sorts and "Show more" (lib/turfList/query.ts ranks the server's first
          cards and every batch of GET /api/turfs/list). Its default sort is
          Top rated, so it is the "Popular" list it replaces: the server
          renders its first 10 cards, which hold every turf the old Popular
          grid showed (its 6 best rated with 15 reviews or more), top rated
          first as there, with the week's trending pick (framed in gold there
          too) leading, as on /turfs. This week's Most Trending Turf card
          sits under its controls, until a search or filter. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            {featured.length > 0 && (
              <p className="text-[11px] font-mono text-accent-500 mb-2">
                Top-rated
              </p>
            )}
            <h2 className="font-display text-3xl md:text-4xl text-primary-800 leading-[0.92] tracking-tight">
              {featured.length > 0 ? <>Popular in {label}</> : <>Find a turf in {label}</>}
            </h2>
          </div>
          {turfs.length > featured.length && (
            <Link
              href="#all-turfs"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700"
            >
              All {turfs.length} <ArrowUpRight className="w-4 h-4" />
            </Link>
          )}
        </div>
        {/* Before the first paint: a URL with a search, sport, sort or Filters choice dims these cards until the right ones arrive. */}
        <script dangerouslySetInnerHTML={{ __html: LIST_PREPAINT_JS }} />
        <TurfListingClient
          initial={first}
          sports={availableSports(cards.turfs)}
          scope={{ kind: "city", id: cityId, label, requested: null }}
          spotlight={spotlight[0] ?? null}
        />
      </section>

      {/* Every turf, whenever the Top-rated grid does not show them all:
          the ItemList above marks up only turfs a visitor can see. */}
      {turfs.length > featured.length && (
        <section id="all-turfs" className="max-w-7xl mx-auto px-4 sm:px-6 mt-14" style={{ scrollMarginTop: "4.5rem" }}>
          <h2 className="font-display text-2xl text-primary-800 tracking-tight mb-4">
            {turfs.length === 1 ? `1 turf in ${label}` : `All ${turfs.length} turfs in ${label}`}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {turfs.map((t) => (
              <li key={t.id}>
                <Link
                  href={turfPath(t)}
                  className="flex items-start gap-2 rounded-xl border border-primary-200 bg-white p-3 hover:border-accent-500 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-accent-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-primary-800 truncate">{t.name}</p>
                    <p className="text-[12px] text-primary-500 truncate">{t.address}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Other cities: the only sibling links between city pages. */}
      {otherCities.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-14">
          <h2 className="text-[18px] font-semibold text-primary-900 mb-3">Turfs in other cities</h2>
          <ul className="flex flex-wrap gap-2">
            {otherCities.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${c.id}`}
                  className="h-9 px-4 inline-flex items-center rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] text-primary-900"
                >
                  Turfs in {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="h-16" />
    </>
  );
}
