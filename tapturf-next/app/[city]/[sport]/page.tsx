import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { CITIES, isCity, labelFor, type CityId } from "@/lib/city";
import { SPORT_PAGES, sportBySlug, turfPlaysSport } from "@/lib/sports";
import { MIN_TURFS_TO_INDEX, relatedPosts, sportCityFaq, sportCityStats } from "@/lib/sportCity";
import { SportTurfList } from "@/components/sport/SportTurfList";

// "Football turfs in Pune" style landing pages: the city + sport
// queries people actually search. Built from the listings only.
export const revalidate = 3600;

export function generateStaticParams() {
  return CITIES.flatMap((c) => SPORT_PAGES.map((s) => ({ city: c.id, sport: s.slug })));
}

async function load(cityParam: string, sportParam: string) {
  if (!isCity(cityParam)) return null;
  const sport = sportBySlug(sportParam);
  if (!sport) return null;
  const city = cityParam as CityId;
  const cityTurfs = await getAllActiveTurfs(city);
  const turfs = cityTurfs.filter((t) => turfPlaysSport(t.sports, sport));
  return { city, sport, turfs, cityTurfs };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; sport: string }>;
}): Promise<Metadata> {
  const { city, sport } = await params;
  const data = await load(city, sport);
  if (!data) return { title: "Not found", robots: { index: false } };
  const { sport: s, turfs } = data;
  const cityLabel = labelFor(data.city);
  const stats = sportCityStats(turfs);
  const lower = s.name.toLowerCase();
  const url = `https://www.tapturf.in/${data.city}/${s.slug}`;

  const bits = [
    `Compare ${stats.count} ${lower} turf${stats.count !== 1 ? "s" : ""} in ${cityLabel} by area, rating and price.`,
    stats.floodlit > 0 ? `${stats.floodlit} with floodlights.` : null,
    stats.priceMin != null ? `From ${"₹" + stats.priceMin.toLocaleString("en-IN")}/hr.` : null,
    "Call or WhatsApp to book, no booking fee.",
  ].filter(Boolean);

  return {
    // Layout's template appends "| TapTurf".
    title: `${s.name} Turfs in ${cityLabel}: ${stats.count} Grounds, Compare & Book`,
    description: bits.join(" "),
    keywords: [
      `${lower} turf in ${cityLabel.toLowerCase()}`,
      `${lower} turf ${cityLabel.toLowerCase()}`,
      `${lower} ground ${cityLabel.toLowerCase()}`,
      `${lower} turf near me`,
      `book ${lower} turf ${cityLabel.toLowerCase()}`,
      ...stats.topAreas.slice(0, 4).map((a) => `${lower} turf ${a.area.toLowerCase()}`),
    ].join(", "),
    // Thin pages (1-2 turfs) stay out of the index.
    robots: stats.count >= MIN_TURFS_TO_INDEX ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${s.name} Turfs in ${cityLabel} | TapTurf`,
      description: bits.join(" "),
      url,
      type: "website",
      siteName: "TapTurf",
      locale: "en_IN",
    },
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
  const pageUrl = `https://www.tapturf.in/${cityId}/${s.slug}`;

  // Same sport in other cities, and other sports in this city, for
  // players and crawlers. Only cities/sports that have turfs.
  const otherCities = CITIES.filter((c) => c.id !== cityId);
  const otherSports = SPORT_PAGES.filter((sp) => sp.slug !== s.slug)
    .map((sp) => ({ ...sp, count: data.cityTurfs.filter((t) => turfPlaysSport(t.sports, sp)).length }))
    .filter((sp) => sp.count > 0);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tapturf.in" },
        { "@type": "ListItem", position: 2, name: cityLabel, item: `https://www.tapturf.in/${cityId}` },
        { "@type": "ListItem", position: 3, name: `${s.name} turfs`, item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${s.name} turfs in ${cityLabel}`,
      numberOfItems: turfs.length,
      itemListElement: turfs.slice(0, 30).map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.tapturf.in/turf/${t.id}`,
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
          <span className="text-5xl" aria-hidden>{s.icon}</span>
          <div>
            <h1 className="text-[28px] md:text-[40px] text-primary-900 leading-tight font-display">
              {s.name} turfs in {cityLabel}
            </h1>
            <p className="text-[15px] text-primary-500 mt-1">
              {stats.count} turf{stats.count !== 1 ? "s" : ""}
              {stats.floodlit > 0 && <> · {stats.floodlit} with floodlights</>}
              {stats.priceMin != null && stats.priceMax != null && (
                <> · ₹{stats.priceMin.toLocaleString("en-IN")} to ₹{stats.priceMax.toLocaleString("en-IN")}/hr listed</>
              )}
            </p>
          </div>
        </div>
        <p className="text-[16px] text-primary-600 mt-4 max-w-2xl leading-relaxed">
          {s.blurb} Every {lower} turf in {cityLabel} we know of, ranked by Google rating
          (turfs with at least 15 reviews first). Call or WhatsApp to book, no booking fee.
        </p>

        {stats.topAreas.length > 0 && (
          <p className="mt-3 text-[14px] text-primary-500">
            Popular areas: {stats.topAreas.map((a) => `${a.area} (${a.count})`).join(", ")}
          </p>
        )}
      </header>

      <SportTurfList turfs={turfs} sportName={s.name} placeLabel={cityLabel} />

      {/* FAQ: visible text matches the FAQPage JSON-LD */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-[22px] font-display text-primary-900 mb-4">
          {s.name} turfs in {cityLabel}: quick answers
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
                href={`/${c.id}/${s.slug}`}
                className="h-9 px-4 inline-flex items-center rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] text-primary-900"
              >
                {s.name} turfs in {c.label}
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
                  href={`/${cityId}/${sp.slug}`}
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
