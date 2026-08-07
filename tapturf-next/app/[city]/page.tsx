import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { CITIES, isCity, labelFor, type CityId } from "@/lib/city";

// One page per city — hard SEO landing so /nashik and /pune both rank
// for their own local queries.
export const revalidate = 600;

export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params;
  if (!isCity(city)) return { title: "City not found", robots: { index: false } };
  const label = labelFor(city);

  return {
    title: `Sports Turfs in ${label} | Book Cricket, Football & More`,
    description: `Every sports turf in ${label}, one place. Compare prices, ratings, and photos. Cricket, football, box cricket, badminton — call or WhatsApp to book instantly. No booking fee.`,
    keywords: [
      `turfs in ${label.toLowerCase()}`,
      `turf booking ${label.toLowerCase()}`,
      `cricket turf ${label.toLowerCase()}`,
      `football turf ${label.toLowerCase()}`,
      `box cricket ${label.toLowerCase()}`,
      `sports ${label.toLowerCase()}`,
    ].join(", "),
    openGraph: {
      title: `Sports Turfs in ${label} | TapTurf`,
      description: `Every turf in ${label}, one tap away. Compare & book instantly.`,
      url: `https://www.tapturf.in/${city}`,
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
    },
    alternates: { canonical: `https://www.tapturf.in/${city}` },
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  if (!isCity(city)) notFound();
  const cityId = city as CityId;
  const label = labelFor(cityId);

  const turfs = await getAllActiveTurfs(cityId);
  const featured = turfs.slice(0, 6);

  // JSON-LD: ItemList of turfs + LocalBusiness per turf for rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Sports turfs in ${label}`,
    itemListElement: turfs.slice(0, 30).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsActivityLocation",
        "@id": `https://www.tapturf.in/turf/${t.id}`,
        name: t.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: t.address,
          addressLocality: label,
          addressRegion: "Maharashtra",
          addressCountry: "IN",
        },
        aggregateRating: t.rating > 0 && t.total_reviews > 0 ? {
          "@type": "AggregateRating",
          ratingValue: t.rating,
          reviewCount: t.total_reviews,
        } : undefined,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section
        className="relative bg-white"
        style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 60%)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-10 md:pt-16 md:pb-14">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600 mb-2">
            // {turfs.length} grounds
          </p>
          <h1 className="font-display uppercase text-primary-800 leading-[0.88] tracking-tight text-[48px] sm:text-[80px] md:text-[120px]">
            Turfs in<br />
            <span className="text-accent-500">{label}.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-primary-500">
            Every cricket, football, box-cricket and multi-sport turf in {label}
            — compare, contact, and book without a booking fee.
          </p>

          {/* Sr-only for crawlers */}
          <ul className="sr-only" aria-hidden>
            {turfs.map((t) => (
              <li key={t.id}>
                <Link href={`/turf/${t.id}`}>
                  {t.name} — {t.address}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured grid */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-[11px] font-mono text-accent-500 uppercase tracking-[0.2em] mb-2">
                // Top-rated
              </p>
              <h2 className="font-display uppercase text-3xl md:text-4xl text-primary-800 leading-[0.92] tracking-tight">
                Popular in {label}
              </h2>
            </div>
            <Link
              href="/turfs"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700 uppercase tracking-wide"
            >
              All {turfs.length} <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {featured.map((turf, i) => (
              <TurfCard key={turf.id} turf={turf} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Full crawlable list (visible) */}
      {turfs.length > 6 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-14">
          <h2 className="font-display uppercase text-2xl text-primary-800 tracking-tight mb-4">
            All {turfs.length} turfs in {label}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {turfs.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/turf/${t.id}`}
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

      <div className="h-16" />
    </>
  );
}
