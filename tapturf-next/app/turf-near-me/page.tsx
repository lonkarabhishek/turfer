import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { CITIES, type CityId } from "@/lib/city";
import { SPORT_PAGES, sportBySlug, turfPlaysSport } from "@/lib/sports";
import { areaFor } from "@/lib/utils/area";
import { slugify } from "@/lib/utils/slugify";
import { TurfCard } from "@/components/turf/TurfCard";
import { NearMeFinder } from "@/components/near/NearMeFinder";
import type { Turf } from "@/types/turf";

// "Turf near me": the page for people who don't know a turf's name yet.
// Everything a crawler needs is in the HTML (every turf linked, grouped
// by city and area, plus a FAQ); the location button is a layer on top.
export const revalidate = 3600;

const PAGE_URL = "https://www.tapturf.in/turf-near-me";
/** Turf link lists: styled from the parent so each of the ~240 rows stays tiny. */
const LIST =
  "mt-3 text-[15px] text-primary-800 [&_a]:flex [&_a]:items-center [&_a]:justify-between [&_a]:gap-3 [&_a]:py-1.5 [&_a:hover]:text-accent-600 [&_span]:min-w-0 [&_span]:truncate [&_small]:text-[13px] [&_small]:text-primary-500 [&_i]:not-italic [&_i]:shrink-0 [&_i]:text-[13px] [&_i]:text-primary-600 [&_i]:tabular-nums";

/** Photo cards per city; every other turf is still linked by area. */
const CARDS_PER_CITY = 8;

type CityBlock = {
  id: CityId;
  label: string;
  turfs: Turf[];
  /** Areas with 2+ turfs, biggest first. */
  areas: { area: string; turfs: Turf[] }[];
  /** Turfs in one-turf areas or with no known area. */
  more: { turf: Turf; area: string | null }[];
  sports: { slug: string; name: string; icon: string; count: number }[];
};

/** Only what TurfCard reads, so the page doesn't ship descriptions etc. twice. */
function forCard(t: Turf): Turf {
  return {
    id: t.id,
    name: t.name,
    address: t.address,
    city: t.city,
    rating: t.rating,
    total_reviews: t.total_reviews,
    cover_image: t.cover_image,
    images: t.images.slice(0, 4),
    sports: t.sports,
    morning_price: t.morning_price,
    afternoon_price: t.afternoon_price,
    evening_price: t.evening_price,
    weekend_morning_price: t.weekend_morning_price,
    weekend_afternoon_price: t.weekend_afternoon_price,
    weekend_evening_price: t.weekend_evening_price,
    price_mentions: t.price_mentions,
  } as Turf;
}

async function load() {
  const blocks: CityBlock[] = (
    await Promise.all(
      CITIES.map(async (c) => {
        const turfs = await getAllActiveTurfs(c.id); // already top-rated first
        const byArea = new Map<string, Turf[]>();
        const noArea: Turf[] = [];
        for (const t of turfs) {
          const a = areaFor(t);
          if (a) byArea.set(a, [...(byArea.get(a) ?? []), t]);
          else noArea.push(t);
        }
        const groups = [...byArea.entries()].map(([area, list]) => ({ area, turfs: list }));
        const areas = groups
          .filter((g) => g.turfs.length >= 2)
          .sort((a, b) => b.turfs.length - a.turfs.length || a.area.localeCompare(b.area));
        const more = [
          ...groups
            .filter((g) => g.turfs.length === 1)
            .sort((a, b) => a.area.localeCompare(b.area))
            .map((g) => ({ turf: g.turfs[0], area: g.area as string | null })),
          ...noArea.map((turf) => ({ turf, area: null })),
        ];
        const sports = SPORT_PAGES.map((sp) => ({
          slug: sp.slug,
          name: sp.name,
          icon: sp.icon,
          count: turfs.filter((t) => turfPlaysSport(t.sports, sp)).length,
        })).filter((s) => s.count > 0);
        return { id: c.id, label: c.label, turfs, areas, more, sports };
      }),
    )
  ).filter((b) => b.turfs.length > 0);

  const all = blocks.flatMap((b) => b.turfs);
  const football = sportBySlug("football");
  const boxCricket = sportBySlug("box-cricket");
  return {
    blocks,
    total: all.length,
    floodlit: all.filter((t) => t.has_floodlights === true).length,
    areaCount: blocks.reduce((n, b) => n + b.areas.length + b.more.filter((m) => m.area).length, 0),
    footballCount: football ? all.filter((t) => turfPlaysSport(t.sports, football)).length : 0,
    boxCricketCount: boxCricket ? all.filter((t) => turfPlaysSport(t.sports, boxCricket)).length : 0,
  };
}

function cityLine(labels: string[]) {
  return labels.length <= 1 ? labels[0] ?? "" : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { total, blocks } = await load();
  const cities = cityLine(blocks.map((b) => b.label));
  const description = `Find a turf near you in ${cities}. ${total} football and box cricket turfs sorted by distance, with photos, ratings and timings. Call or WhatsApp to book, no booking fee.`;
  return {
    // Keyword first; absolute so the layout template doesn't add a second brand.
    title: { absolute: "Turf Near Me: Find Football & Box Cricket Turfs | TapTurf" },
    description,
    keywords: [
      "turf near me",
      "turfs near me",
      "football turf near me",
      "box cricket near me",
      "cricket turf near me",
      "turf booking near me",
      ...blocks.map((b) => `turf near me ${b.label.toLowerCase()}`),
    ].join(", "),
    openGraph: {
      title: "Find a Turf Near You | TapTurf",
      description,
      url: PAGE_URL,
      type: "website",
      siteName: "TapTurf",
      locale: "en_IN",
    },
    alternates: { canonical: PAGE_URL },
  };
}

export default async function TurfNearMePage() {
  const { blocks, total, floodlit, areaCount, footballCount, boxCricketCount } = await load();
  const cities = cityLine(blocks.map((b) => b.label));
  const topAreas = blocks
    .flatMap((b) => b.areas.slice(0, 2).map((a) => `${a.area} (${b.label})`))
    .slice(0, 6);

  // Every answer comes from the listings; no invented prices.
  const faq: { q: string; a: string }[] = [
    {
      q: "How do I find a turf near me?",
      a: `Tap "Use my location" on this page and TapTurf sorts all ${total} turfs in ${cities} by distance from you, with photos, ratings and timings. You can also browse turfs by city and area below.`,
    },
    {
      q: "How many turfs are there near me?",
      a: `TapTurf lists ${blocks.map((b) => `${b.turfs.length} turfs in ${b.label}`).join(", ")}${
        topAreas.length ? `. Areas with the most turfs include ${topAreas.join(", ")}.` : "."
      }`,
    },
    {
      q: "Can I play football and box cricket at a turf near me?",
      a: `Yes. ${footballCount} of the ${total} turfs on TapTurf list football and ${boxCricketCount} list box cricket, and many take both. Each turf page shows the sports it hosts.`,
    },
    ...(floodlit > 0
      ? [{
          q: "Which turfs near me are open at night?",
          a: `At least ${floodlit} turfs on TapTurf are listed with floodlights for evening and late night games. Check the timings on each turf page before you go.`,
        }]
      : []),
    {
      q: "How much does it cost to book a turf near me?",
      a: "Rates depend on the turf, the time slot and the day. Evenings and weekends usually cost more. Each turf page shows the rates the turf has shared; confirm your slot price when you call or WhatsApp.",
    },
    {
      q: "Is there a booking fee?",
      a: "No. TapTurf connects you to the turf directly by call or WhatsApp, so you pay the turf and nothing extra.",
    },
    {
      q: "How do I find players for a game near me?",
      a: "Open Games on TapTurf to join an open match near you, or host your own game at any turf and let players request to join.",
    },
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tapturf.in" },
        { "@type": "ListItem", position: 2, name: "Turf near me", item: PAGE_URL },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Find a turf near you",
      url: PAGE_URL,
      description: `${total} football and box cricket turfs in ${cities}, sorted by distance.`,
      isPartOf: { "@type": "WebSite", name: "TapTurf", url: "https://www.tapturf.in" },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: total,
        itemListElement: blocks
          .flatMap((b) => b.turfs.slice(0, CARDS_PER_CITY))
          .map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://www.tapturf.in/turf/${t.id}`,
            name: t.name,
          })),
      },
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
    <div className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8 md:pt-10 text-center">
          <nav aria-label="Breadcrumb" className="flex items-center justify-center gap-1.5 text-[13px] text-primary-400 mb-8">
            <Link href="/" className="hover:text-primary-700">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-primary-700 font-medium">Turf near me</span>
          </nav>
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-card mb-5">
            <MapPin className="w-7 h-7 text-accent-500" strokeWidth={2.25} />
          </span>
          <h1 className="font-display text-[34px] leading-[1.1] md:text-[52px] text-primary-900 tracking-tight">
            Find a turf near you
          </h1>
          <p className="mt-4 text-[17px] md:text-[19px] text-primary-500 leading-snug max-w-xl mx-auto">
            {total} football and box cricket turfs across {cities}. Share your location and see the
            closest ones first, with photos, ratings and timings.
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <NearMeFinder total={total} />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 md:pb-16 text-center">
          <ul className="mt-8 flex flex-wrap justify-center gap-2 text-[13px] text-primary-600">
            <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{total}</strong> turfs</li>
            <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{areaCount}</strong> areas</li>
            {floodlit > 0 && (
              <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5"><strong className="text-primary-900">{floodlit}</strong> with floodlights</li>
            )}
            <li className="rounded-full bg-white ring-1 ring-primary-200 px-3 py-1.5">No booking fee</li>
          </ul>
        </div>
      </section>

      {/* Jump to a city */}
      <nav aria-label="Cities" className="max-w-7xl mx-auto px-4 sm:px-6 -mt-2 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide justify-start sm:justify-center">
          {blocks.map((b) => (
            <a
              key={b.id}
              href={`#${b.id}`}
              className="shrink-0 h-10 px-4 inline-flex items-center gap-2 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-medium text-primary-900"
            >
              {b.label}
              <span className="text-primary-500 tabular-nums">{b.turfs.length}</span>
            </a>
          ))}
        </div>
      </nav>

      {blocks.map((b) => (
        <section key={b.id} id={b.id} className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 scroll-mt-20">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-[26px] md:text-[34px] text-primary-900 tracking-tight leading-tight">
                Turfs near you in {b.label}
              </h2>
              <p className="text-[15px] text-primary-500 mt-1">
                Top rated first · {b.turfs.length} turfs
              </p>
            </div>
            <Link
              href={`/${b.id}`}
              className="hidden sm:inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-accent-600 hover:text-accent-700"
            >
              All {b.label} turfs <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
            {b.turfs.slice(0, CARDS_PER_CITY).map((t, i) => (
              <TurfCard key={t.id} turf={forCard(t)} priority={b === blocks[0] && i < 2} />
            ))}
          </div>

          {/* By area: every turf in the city, linked. */}
          <h3 className="font-display text-[20px] md:text-[22px] text-primary-900 mt-12 mb-4">
            Find a turf by area in {b.label}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {b.areas.map(({ area, turfs }) => (
              <div key={area} id={`${b.id}-${slugify(area)}`} className="rounded-2xl bg-primary-50 p-5 scroll-mt-20">
                <h4 className="flex items-baseline justify-between gap-3 text-[16px] font-semibold text-primary-900">
                  Turfs near {area}
                  <span className="text-[13px] font-normal text-primary-500 tabular-nums">{turfs.length}</span>
                </h4>
                <ul className={LIST}>
                  {turfs.map((t) => (
                    <li key={t.id}>
                      <Link href={`/turf/${t.id}`}>
                        <span>{t.name}</span>
                        {t.rating > 0 && t.total_reviews > 0 && <i>★ {t.rating.toFixed(1)}</i>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {b.more.length > 0 && (
              <div className="rounded-2xl bg-primary-50 p-5 sm:col-span-2 lg:col-span-3">
                <h4 className="flex items-baseline justify-between gap-3 text-[16px] font-semibold text-primary-900">
                  More turfs in {b.label}
                  <span className="text-[13px] font-normal text-primary-500 tabular-nums">{b.more.length}</span>
                </h4>
                <ul className={`${LIST} sm:columns-2 lg:columns-3 gap-x-8`}>
                  {b.more.map(({ turf: t, area }) => (
                    <li key={t.id} className="break-inside-avoid">
                      <Link href={`/turf/${t.id}`}>
                        <span>
                          {t.name}
                          {area && <small>, {area}</small>}
                        </span>
                        {t.rating > 0 && t.total_reviews > 0 && <i>★ {t.rating.toFixed(1)}</i>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* By sport in this city */}
          {b.sports.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {b.sports.map((s) => (
                <Link
                  key={s.slug}
                  href={`/${b.id}/${s.slug}`}
                  className="h-10 px-4 inline-flex items-center gap-2 rounded-full ring-1 ring-primary-200 hover:bg-primary-50 text-[14px] text-primary-900"
                >
                  <span aria-hidden>{s.icon}</span>
                  {s.name} turfs in {b.label}
                  <span className="text-primary-500 tabular-nums">{s.count}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* FAQ: visible text matches the FAQPage JSON-LD */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 mt-20">
        <h2 className="font-display text-[26px] md:text-[30px] text-primary-900 tracking-tight mb-5 text-center">
          Turf near me: quick answers
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
        <p className="mt-8 text-center text-[15px] text-primary-500">
          Want a team too?{" "}
          <Link href="/games" className="font-semibold text-accent-600 hover:text-accent-700">Join a game near you</Link>
          {" "}or read our{" "}
          <Link href="/blog/turf-near-me" className="font-semibold text-accent-600 hover:text-accent-700">guide to finding a good turf</Link>.
        </p>
      </section>
    </div>
  );
}
