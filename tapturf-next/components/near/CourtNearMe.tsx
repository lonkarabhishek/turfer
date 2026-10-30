import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTurfsBySport } from "@/lib/queries/turfs";
import { getSportBands, withSportBands } from "@/lib/queries/sportBands";
import { getTurfFacts } from "@/lib/queries/turfFacts";
import { sportVenues, venueWord } from "@/lib/sports";
import { areaFor } from "@/lib/utils/area";
import { turfPath } from "@/lib/utils/turfPath";
import { getSortedPosts } from "@/content/blog";
import { NearMeFinder } from "@/components/near/NearMeFinder";
import {
  courtCities,
  courtFaq,
  courtHeroLine,
  courtNearMePath,
  courtNearMeSport,
  courtPriceFacts,
  sportGuides,
  venuesByCity,
  type CourtNearMeSlug,
} from "@/lib/near/courtNearMe";
import { courtNearMeDescription, courtNearMeKeywords, courtNearMeTitle } from "@/lib/seo/listingMeta";
import { listingReach, reachOf } from "@/lib/seo/turfFacts";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";

// "Badminton courts near me" and its two siblings (pickleball, tennis):
// the court twin of /turf-near-me for players who search a court sport,
// built from that sport's venues only. Additive: it never links to,
// canonicalises to or replaces /turf-near-me. No JSON-LD and no sitemap
// entry (not approved). Every venue is linked by city in the HTML; the
// location button is a layer on top (components/near/NearMeFinder.tsx).

/** Venue link lists: styled from the parent so each row stays tiny (as on /turf-near-me). */
const LIST =
  "mt-3 text-[15px] text-primary-800 [&_a]:flex [&_a]:items-center [&_a]:justify-between [&_a]:gap-3 [&_a]:py-1.5 [&_a:hover]:text-accent-600 [&_span]:min-w-0 [&_span]:truncate [&_small]:text-[13px] [&_small]:text-primary-500 [&_i]:not-italic [&_i]:shrink-0 [&_i]:text-[13px] [&_i]:text-primary-600 [&_i]:tabular-nums";

// Once per render: generateMetadata and the page share it (React cache).
const load = cache(async (slug: CourtNearMeSlug) => {
  const sport = courtNearMeSport(slug);
  if (!sport) throw new Error(`No court near-me page for ${slug}`);
  // The sport page's rows (top rated first), its sport bands for the
  // price facts, and the turf facts for what the venues show.
  const [turfs, bands, facts] = await Promise.all([getTurfsBySport(sport), getSportBands(), getTurfFacts()]);
  const cities = courtCities(turfs, sport);
  return {
    sport,
    turfs,
    cities,
    reach: listingReach(turfs, reachOf(facts)),
    prices: courtPriceFacts(turfs.map((t) => withSportBands(t, bands)), sport),
  };
});

export async function courtNearMeMetadata(slug: CourtNearMeSlug): Promise<Metadata> {
  const { sport, turfs, cities } = await load(slug);
  // Venues that list the sport, and their cities most first: the sport page's counts.
  const facts = { sport, count: turfs.length, cities: cities.map((c) => ({ label: c.label, count: c.count })) };
  const title = courtNearMeTitle(facts);
  const description = courtNearMeDescription(facts);
  const url = `https://www.tapturf.in${courtNearMePath(slug)}`;
  return {
    title: { absolute: title },
    description,
    keywords: courtNearMeKeywords(facts),
    robots: ROBOTS_INDEX,
    openGraph: {
      ...OG_BASE,
      images: [DEFAULT_OG_IMAGE],
      title,
      description,
      url,
    },
    twitter: TWITTER_CARD,
    alternates: { canonical: url },
  };
}

export async function CourtNearMe({ slug }: { slug: CourtNearMeSlug }) {
  const { sport, turfs, cities, reach, prices } = await load(slug);
  const lower = sport.name.toLowerCase();
  const venues = sportVenues(sport);
  const many = venues.toLowerCase();
  const count = turfs.length;
  const hero = courtHeroLine({ sport, count, cityLabels: cities.map((c) => c.label), ...reach });
  const faq = courtFaq({ sport, count, cities, prices });
  const { groups, rest } = venuesByCity(turfs, cities);
  const guides = sportGuides(getSortedPosts(), sport);

  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8 md:pt-10 text-center">
          <nav aria-label="Breadcrumb" className="flex items-center justify-center gap-1.5 text-[13px] text-primary-400 mb-8">
            <Link href="/" className="hover:text-primary-700">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href={`/sport/${sport.slug}`} className="hover:text-primary-700">{sport.name}</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-primary-700 font-medium">Courts near me</span>
          </nav>
          <span aria-hidden className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-card mb-5 text-[28px]">
            {sport.icon}
          </span>
          <h1 className="font-display text-[34px] leading-[1.1] md:text-[52px] text-primary-900 tracking-tight">
            {venues} near you
          </h1>
          <p className="mt-4 text-[17px] md:text-[19px] text-primary-500 leading-snug max-w-xl mx-auto">{hero}</p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <NearMeFinder
            total={count}
            cities={cities.map((c) => ({ id: c.id, label: c.label, href: c.href }))}
            sport={{ slug: sport.slug, labels: sport.labels, one: `${lower} ${venueWord(sport, 1)}`, many }}
          />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 md:pb-16 text-center">
          <ul className="mt-8 flex flex-wrap justify-center gap-2 text-[13px] text-primary-600">
            <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{count}</strong> {venueWord(sport, count)}</li>
            {cities.length > 0 && (
              <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{cities.length}</strong> {cities.length === 1 ? "city" : "cities"}</li>
            )}
            {prices.shown > 0 && (
              <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{prices.shown}</strong> with {lower} prices</li>
            )}
            <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5">No booking fee</li>
          </ul>
        </div>
      </section>

      {/* By city: the "<sport> courts in <city>" pages, most venues first */}
      {cities.length > 0 && (
        <nav id="cities" aria-label="Cities" className="max-w-7xl mx-auto px-4 sm:px-6 scroll-mt-20">
          <h2 className="font-display text-[26px] md:text-[34px] text-primary-900 tracking-tight leading-tight">
            {venues} by city
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {cities.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full bg-accent-50 hover:bg-accent-100 text-[14px] font-medium text-accent-700"
              >
                {venues} in {c.label}
                <span className="text-accent-600/70 tabular-nums">{c.count}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Every venue, by city, top rated first */}
      {count > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12">
          <h2 className="font-display text-[22px] md:text-[26px] text-primary-900 tracking-tight leading-tight mb-5">
            Every {lower} {venueWord(sport, 1)} on TapTurf
          </h2>
          <div className="sm:columns-2 lg:columns-3 gap-4">
            {groups.map(({ city, turfs: list }) => (
              <div key={city.id} className="break-inside-avoid mb-4 rounded-2xl bg-primary-50 p-5">
                <h3 className="flex items-baseline justify-between gap-3 text-[16px] font-semibold text-primary-900">
                  {city.label}
                  <span className="text-[13px] font-normal text-primary-500 tabular-nums">{list.length}</span>
                </h3>
                <ul className={LIST}>
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link href={turfPath(t)}>
                        <span>
                          {t.name}
                          {areaFor(t) && <small>, {areaFor(t)}</small>}
                        </span>
                        {t.rating > 0 && t.total_reviews > 0 && <i>★ {t.rating.toFixed(1)}</i>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {rest.length > 0 && (
              <div className="break-inside-avoid mb-4 rounded-2xl bg-primary-50 p-5">
                <h3 className="flex items-baseline justify-between gap-3 text-[16px] font-semibold text-primary-900">
                  More {many}
                  <span className="text-[13px] font-normal text-primary-500 tabular-nums">{rest.length}</span>
                </h3>
                <ul className={LIST}>
                  {rest.map((t) => (
                    <li key={t.id}>
                      <Link href={turfPath(t)}>
                        <span>{t.name}</span>
                        {t.rating > 0 && t.total_reviews > 0 && <i>★ {t.rating.toFixed(1)}</i>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* FAQ, from the venues' own data */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 mt-16">
        <h2 className="font-display text-[26px] md:text-[30px] text-primary-900 tracking-tight mb-5 text-center">
          {venues} near me: quick answers
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

        {guides.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[20px] font-display text-primary-900 mb-3">{sport.name} guides</h2>
            <ul className="space-y-2">
              {guides.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="text-[15px] text-accent-600 hover:text-accent-700">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-8 text-center text-[15px] text-primary-500">
          Need players?{" "}
          <Link href="/games" className="font-semibold text-accent-600 hover:text-accent-700">Join or host a game on TapTurf</Link>.
        </p>
      </section>
    </div>
  );
}
