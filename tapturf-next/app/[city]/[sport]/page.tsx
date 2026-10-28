import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getAllActiveTurfs, turfRowsStale } from "@/lib/queries/turfs";
import { isCity, labelFor, type CityId } from "@/lib/city";
import { getCitiesForSport, isLiveCity, pickOtherCities } from "@/lib/queries/cities";
import { citySportHref, citySportLinks, sportBySlug, sportVenues, turfPlaysSport, venueWord } from "@/lib/sports";
import { MIN_TURFS_TO_INDEX, relatedPosts, sportCityFaq, sportCityStats } from "@/lib/sportCity";
import { SportTurfList } from "@/components/sport/SportTurfList";
import { MakeMyCity } from "@/components/city/MakeMyCity";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { NoteInterest } from "@/components/analytics/VisitTracker";
import { turfUrl } from "@/lib/utils/turfPath";
import { fitFontSize } from "@/lib/utils/fitText";
import { busiestAreas, citySportDescription, citySportTitle, listingOgImage } from "@/lib/seo/listingMeta";
import { OG_BASE, ROBOTS_INDEX, ROBOTS_NOINDEX_FOLLOW, TWITTER_CARD } from "@/lib/seo/defaults";

// "Football turfs in Pune" style landing pages: the city + sport
// queries people actually search. Built from the listings only.
export const revalidate = 3600;

// None built at deploy: about 750 city and sport pairs, many of them
// 404s or thin pages, each rendered against the database on every build
// and preview. Each now renders on its first visit (from the cached turf
// rows) and is cached from then on.
export function generateStaticParams(): { city: string; sport: string }[] {
  return [];
}

// Once per render: generateMetadata and the page share it (React cache).
const load = cache(async (cityParam: string, sportParam: string) => {
  if (!isCity(cityParam) || !(await isLiveCity(cityParam))) return null;
  const sport = sportBySlug(sportParam);
  if (!sport) return null;
  const city = cityParam as CityId;
  const cityTurfs = await getAllActiveTurfs(city);
  // A live city has active turfs, so an empty list is a bad read, not a
  // missing page: throw (the last good page keeps serving) rather than
  // cache a 404. /bangalore/swimming, 17 pools, was a 404 to Google on 18 Oct.
  if (cityTurfs.length === 0) throw new Error(`No turfs read for live city ${city}`);
  const turfs = cityTurfs.filter((t) => turfPlaysSport(t.sports, sport));
  // Rows older than the current version (its read failed) may predate this
  // sport's first turfs here: fail the render rather than cache a 404.
  if (turfs.length === 0 && (await turfRowsStale())) throw new Error(`No ${sport.slug} turfs in ${city} in an older copy of the rows`);
  return { city, sport, turfs, cityTurfs };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; sport: string }>;
}): Promise<Metadata> {
  const { city, sport } = await params;
  const data = await load(city, sport);
  if (!data) return { title: "Not found", robots: ROBOTS_NOINDEX_FOLLOW };
  const { sport: s, turfs } = data;
  const cityLabel = labelFor(data.city);
  const stats = sportCityStats(turfs);
  const lower = s.name.toLowerCase();
  const word = venueWord(s, 1);
  const url = `https://www.tapturf.in/${data.city}/${s.slug}`;
  // Counts from the rows; no price range in the snippet (QUOTE_CITY_PRICE_RANGE):
  // some listed rates look per player rather than per hour (data team checking).
  const facts = {
    cityLabel,
    sport: s,
    count: stats.count,
    priced: stats.priced,
    floodlit: stats.floodlit,
    areas: busiestAreas(turfs),
    priceMin: stats.priceMin,
    priceMax: stats.priceMax,
  };
  const title = citySportTitle(facts);
  const description = citySportDescription(facts);

  return {
    title: { absolute: title },
    description,
    keywords: [
      `${lower} ${word} in ${cityLabel.toLowerCase()}`,
      `${lower} ${word} ${cityLabel.toLowerCase()}`,
      `${lower} ${s.venue === "turf" ? "ground" : `${s.venue} booking`} ${cityLabel.toLowerCase()}`,
      `${lower} ${word} near me`,
      `book ${lower} ${word} ${cityLabel.toLowerCase()}`,
      ...stats.topAreas.slice(0, 4).map((a) => `${lower} ${word} ${a.area.toLowerCase()}`),
    ].join(", "),
    // Thin pages (1-2 venues) stay out of the index. Always a whole
    // robots value: undefined would wipe the layout's.
    robots: stats.count >= MIN_TURFS_TO_INDEX ? ROBOTS_INDEX : ROBOTS_NOINDEX_FOLLOW,
    openGraph: {
      ...OG_BASE,
      images: [listingOgImage(turfs, `${sportVenues(s)} in ${cityLabel}`)],
      title,
      description,
      url,
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: url },
  };
}

export default async function CitySportPage({
  params,
}: {
  params: Promise<{ city: string; sport: string }>;
}) {
  const { city, sport } = await params;
  const data = await load(city, sport);
  if (!data || data.turfs.length === 0) notFound();
  const { sport: s, turfs } = data;
  const cityId = data.city;
  const cityLabel = labelFor(cityId);
  const stats = sportCityStats(turfs);
  const faq = sportCityFaq(s, cityId, stats);
  const posts = relatedPosts(s, cityId);
  const lower = s.name.toLowerCase();
  const venues = sportVenues(s);
  const pageUrl = `https://www.tapturf.in/${cityId}/${s.slug}`;

  // Same sport in other cities, and other sports in this city, for
  // players and crawlers. Only cities where this sport's page is
  // indexable (same threshold as the sitemap), same state first, then
  // the biggest, plus the home cities so /nashik/<sport> keeps its
  // sibling links.
  const otherCities = pickOtherCities(await getCitiesForSport(s.slug), cityId).flatMap((c) => {
    const href = citySportHref(c.id, s.slug, c.n);
    return href ? [{ ...c, href }] : [];
  });
  const otherSports = citySportLinks(cityId, data.cityTurfs).filter((sp) => sp.slug !== s.slug);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tapturf.in" },
        { "@type": "ListItem", position: 2, name: cityLabel, item: `https://www.tapturf.in/${cityId}` },
        { "@type": "ListItem", position: 3, name: venues, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${venues} in ${cityLabel}`,
      numberOfItems: turfs.length,
      itemListElement: turfs.slice(0, 30).map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: turfUrl(t),
        name: t.name,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* The chat answers for this city while the visitor is on its page. */}
      <AskPageContext city={cityId} />
      <NoteInterest city={cityId} sports={[s.name]} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-primary-400 mb-8 overflow-x-auto scrollbar-hide">
        <Link href="/" className="hover:text-primary-600 transition-colors whitespace-nowrap">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        <Link href={`/${cityId}`} className="hover:text-primary-600 transition-colors whitespace-nowrap">{cityLabel}</Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        <span className="text-primary-700 font-medium whitespace-nowrap">{s.name}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-4">
          <span className="text-5xl shrink-0" aria-hidden>{s.icon}</span>
          {/* The column takes the rest of the row (flex-1 min-w-0), and a long
              city name (Thiruvananthapuram) shrinks to its width rather than
              breaking mid-word or pushing the page sideways. */}
          <div className="min-w-0 flex-1">
            <h1
              className="text-[28px] md:text-[40px] text-primary-900 leading-tight font-display [overflow-wrap:anywhere]"
              style={{ containerType: "inline-size" }}
            >
              {venues} in <span style={{ fontSize: fitFontSize(cityLabel) }}>{cityLabel}</span>
            </h1>
            <p className="text-[15px] text-primary-500 mt-1">
              {stats.count} {venueWord(s, stats.count)}
              {s.venue === "turf" && stats.floodlit > 0 && <> · {stats.floodlit} with floodlights</>}
              {stats.priceMin != null && stats.priceMax != null && (
                <> · ₹{stats.priceMin.toLocaleString("en-IN")} to ₹{stats.priceMax.toLocaleString("en-IN")}/hr listed</>
              )}
            </p>
          </div>
        </div>
        {isCity(cityId) && (
          <div className="mt-4">
            <MakeMyCity city={cityId} label={cityLabel} />
          </div>
        )}
        <p className="text-[16px] text-primary-600 mt-4 max-w-2xl leading-relaxed">
          {s.blurb} Every {lower} {venueWord(s, 1)} in {cityLabel} we know of, ranked by Google rating
          (places with at least 15 reviews first). Call or WhatsApp to book, no booking fee.
        </p>

        {stats.topAreas.length > 0 && (
          <p className="mt-3 text-[14px] text-primary-500">
            Popular areas: {stats.topAreas.map((a) => `${a.area} (${a.count})`).join(", ")}
          </p>
        )}
      </header>

      <SportTurfList turfs={turfs} venues={venues.toLowerCase()} placeLabel={cityLabel} />

      {/* FAQ: visible text matches the FAQPage JSON-LD */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-[22px] font-display text-primary-900 mb-4">
          {venues} in {cityLabel}: quick answers
        </h2>
        <div className="space-y-2">
          {faq.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-primary-50 open:bg-white open:ring-1 open:ring-primary-200">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-4">
                <span className="font-semibold text-primary-900 text-[15px]">{f.q}</span>
                <span aria-hidden className="text-primary-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-relaxed text-primary-700">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Guides */}
      {posts.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[20px] font-display text-primary-900 mb-3">Guides</h2>
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`} className="text-[15px] text-accent-600 hover:text-accent-700">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cross-links */}
      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-[16px] font-semibold text-primary-900 mb-3">{s.name} in other cities</h2>
          <div className="flex flex-wrap gap-2">
            {otherCities.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="h-9 px-4 inline-flex items-center rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] text-primary-900"
              >
                {venues} in {c.label}
              </Link>
            ))}
          </div>
        </div>
        {otherSports.length > 0 && (
          <div>
            <h2 className="text-[16px] font-semibold text-primary-900 mb-3">Other sports in {cityLabel}</h2>
            <div className="flex flex-wrap gap-2">
              {otherSports.map((sp) => (
                <Link
                  key={sp.slug}
                  href={sp.href}
                  className="h-9 px-4 inline-flex items-center rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] text-primary-900"
                >
                  {sp.name} ({sp.count})
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
