import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getTurfsBySport } from "@/lib/queries/turfs";
import { SportTurfList } from "@/components/sport/SportTurfList";
import { SPORT_PAGES, sportBySlug, sportVenues, venueWord, type SportPage } from "@/lib/sports";
import { CITY_IDS, isCity, labelFor } from "@/lib/city";
import type { Turf } from "@/types/turf";

export const revalidate = 3600;

// Pages list turfs from every city. One fetch per request, shared by
// generateMetadata and the page.
const turfsFor = cache((info: SportPage) => getTurfsBySport(info));

/**
 * Cities that have this sport, most venues first (ties by city size).
 * Grouped from the turfs themselves, so a city the database has and
 * lib/city.ts does not still gets its chip.
 */
function citiesFor(turfs: Turf[]): { id: string; label: string; count: number }[] {
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const counts = new Map<string, number>();
  for (const t of turfs) if (isCity(t.city)) counts.set(t.city, (counts.get(t.city) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: labelFor(id), count }))
    .sort((a, b) => b.count - a.count || (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

/**
 * Where the sport is played, for the title ("across 54 Cities"), the H1
 * ("in 54 cities across India") and the list heading ("in 54 cities").
 * Three cities or fewer are named instead of counted, so a sport in two
 * cities never claims a number it does not have.
 */
function placeFor(cities: { label: string }[]) {
  const n = cities.length;
  if (n > 3) {
    return { title: `across ${n} Cities`, prose: `in ${n} cities across India`, short: `${n} cities` };
  }
  const names = cities.map((c) => c.label);
  const and = names.length <= 1 ? names[0] ?? "India" : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const amp = names.length <= 1 ? names[0] ?? "India" : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
  return { title: `in ${amp}`, prose: `in ${and}`, short: and };
}

export async function generateStaticParams() {
  return SPORT_PAGES.map((s) => ({ sport: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport } = await params;
  const info = sportBySlug(sport);
  if (!info) return { title: "Sport not found", robots: { index: false } };

  const lower = info.name.toLowerCase();
  const word = venueWord(info, 1);
  const cities = citiesFor(await turfsFor(info));
  const place = placeFor(cities);
  return {
    // Layout's title template appends "| TapTurf".
    // "Football Turfs across 54 Cities: Compare & Book" stays under 60 with the suffix.
    title: `${sportVenues(info, { title: true })} ${place.title}: Compare & Book`,
    description: `${info.blurb} Compare ${lower} ${venueWord(info)} ${place.prose} by price, rating and photos. Call or WhatsApp to book.`,
    keywords: [`${lower} ${word}`, `${lower} ${word} near me`, `book ${lower} ${word}`, ...cities.flatMap((c) => [
      `${lower} ${word} ${c.label.toLowerCase()}`,
      `${lower} ${c.label.toLowerCase()}`,
      `book ${lower} ${c.label.toLowerCase()}`,
    ])].join(", "),
    openGraph: {
      images: [{ url: "https://www.tapturf.in/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
      title: `${sportVenues(info, { title: true })} ${place.title} | TapTurf`,
      description: info.blurb,
      url: `https://www.tapturf.in/sport/${info.slug}`,
      type: "website",
    },
    alternates: { canonical: `https://www.tapturf.in/sport/${info.slug}` },
  };
}

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  const info = sportBySlug(sport);
  if (!info) notFound();

  const turfs = await turfsFor(info);
  const perCity = citiesFor(turfs);
  const place = placeFor(perCity);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-primary-400 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-cream-400" />
        <Link href="/turfs" className="hover:text-primary-600 transition-colors">
          Turfs
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-cream-400" />
        <span className="text-primary-700 font-medium">{info.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-5xl">{info.icon}</span>
          <div>
            <h1 className="text-[28px] md:text-[36px] text-primary-900 leading-tight font-display">
              {sportVenues(info)} {place.prose}
            </h1>
            <p className="text-[15px] text-primary-500 mt-1">
              {turfs.length} {info.name.toLowerCase()} {venueWord(info, turfs.length)}
              {perCity.length > 0 && (
                <> · {perCity.slice(0, 8).map((c) => `${c.count} in ${c.label}`).join(", ")}{perCity.length > 8 ? ` and ${perCity.length - 8} more cities` : ""}</>
              )}
            </p>
          </div>
        </div>
        <p className="text-[16px] text-primary-600 mt-4 max-w-2xl leading-relaxed">{info.blurb}</p>

        {/* By city: the "<sport> turfs/courts in <city>" pages. */}
        {perCity.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {perCity.map((c) => (
              <Link
                key={c.id}
                href={`/${c.id}/${info.slug}`}
                className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full bg-accent-50 hover:bg-accent-100 text-[14px] font-medium text-accent-700"
              >
                {sportVenues(info)} in {c.label}
                <span className="text-accent-600/70 tabular-nums">{c.count}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Other sports: crawlable links between the sport pages. */}
        <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {SPORT_PAGES.map((s) => (
            <Link
              key={s.slug}
              href={`/sport/${s.slug}`}
              aria-current={s.slug === info.slug ? "page" : undefined}
              className={`shrink-0 h-9 px-4 inline-flex items-center rounded-full text-[14px] font-medium transition-colors ${
                s.slug === info.slug
                  ? "bg-primary-900 text-white"
                  : "bg-primary-100 text-primary-900 hover:bg-primary-200"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Top 24 as cards, the rest as a light list */}
      {turfs.length > 0 ? (
        <SportTurfList turfs={turfs} venues={sportVenues(info).toLowerCase()} placeLabel={place.short} showCity />
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">{info.icon}</p>
          <p className="text-lg font-semibold text-primary-900">
            No {sportVenues(info).toLowerCase()} listed yet
          </p>
          <Link href="/turfs" className="mt-4 inline-flex text-[15px] text-accent-600 hover:text-accent-700">
            Browse all turfs
          </Link>
        </div>
      )}
    </div>
  );
}
