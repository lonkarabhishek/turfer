import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Phone, MessageCircle, Search, MapPin } from "lucide-react";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfCard } from "@/components/turf/TurfCard";
import { sportConfig } from "@/components/ui/SportChip";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "TapTurf - Find & Book Turf in Nashik | 49+ Sports Turfs",
  description:
    "Find and book sports turfs in Nashik. Compare prices, check ratings, view photos, and call to book instantly. 49+ football, cricket, basketball turfs listed.",
  keywords:
    "turf in nashik, turf booking nashik, sports turf nashik, football turf nashik, cricket turf nashik, box cricket nashik, nashik turf",
  openGraph: {
    title: "TapTurf - Find & Book Turf in Nashik",
    description:
      "Book turf in Nashik. Compare prices, ratings, and book instantly via call or WhatsApp.",
    url: "https://www.tapturf.in",
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in" },
};

export default async function HomePage() {
  const turfs = await getAllActiveTurfs();
  const featuredTurfs = turfs.slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TapTurf",
    url: "https://www.tapturf.in",
    description: "Find and book sports turfs in Nashik",
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

      {/* Hero — Airbnb-inspired: clean, warm, generous whitespace */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50/30" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-5">
              <MapPin className="w-4 h-4 text-accent-500" />
              <span className="text-sm font-medium text-gray-600">
                Nashik, Maharashtra
              </span>
            </div>
            <h1 className="text-4xl md:text-[56px] font-bold text-gray-900 leading-[1.1] tracking-tight">
              Find your
              <br />
              perfect turf
            </h1>
            <p className="mt-5 text-lg text-gray-500 leading-relaxed">
              {turfs.length}+ sports turfs with pricing, ratings, and
              directions. Call or WhatsApp to book instantly.
            </p>
            <div className="mt-8">
              <Link
                href="/turfs"
                className="inline-flex items-center gap-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold px-8 py-4 rounded-xl transition-all hover:shadow-lg text-base"
              >
                <Search className="w-5 h-5" />
                Explore all turfs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sports — horizontal scrollable chips */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-8 relative z-10">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {Object.entries(sportConfig).map(([slug, config]) => (
            <Link
              key={slug}
              href={`/sport/${slug}`}
              className="flex items-center gap-2.5 px-5 py-3.5 bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-all whitespace-nowrap group"
            >
              <span className="text-2xl">{config.icon}</span>
              <span className="font-medium text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                {config.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Turfs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-[28px] font-semibold text-gray-900">
              Top rated turfs
            </h2>
            <p className="text-base text-gray-500 mt-1">
              Most popular turfs in Nashik
            </p>
          </div>
          <Link
            href="/turfs"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors underline underline-offset-4"
          >
            Show all ({turfs.length})
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {featuredTurfs.map((turf) => (
            <TurfCard key={turf.id} turf={turf} />
          ))}
        </div>
        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/turfs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 underline underline-offset-4"
          >
            Show all {turfs.length} turfs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How it works — clean and minimal */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-12">
        <h2 className="text-2xl md:text-[28px] font-semibold text-gray-900 text-center mb-3">
          How it works
        </h2>
        <p className="text-base text-gray-500 text-center mb-10">
          Book a turf in 3 simple steps
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: <Search className="w-7 h-7 text-accent-500" />,
              step: "1",
              title: "Browse turfs",
              desc: `Compare prices, ratings, and amenities of ${turfs.length}+ turfs in Nashik`,
            },
            {
              icon: <Phone className="w-7 h-7 text-accent-500" />,
              step: "2",
              title: "Call or WhatsApp",
              desc: "Tap to call or message the turf owner directly to check availability",
            },
            {
              icon: <MessageCircle className="w-7 h-7 text-accent-500" />,
              step: "3",
              title: "Book & Play",
              desc: "Confirm your slot, show up, and enjoy the game with your friends",
            },
          ].map((step) => (
            <div key={step.step} className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-50 rounded-2xl mb-4">
                {step.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-xs mx-auto">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
