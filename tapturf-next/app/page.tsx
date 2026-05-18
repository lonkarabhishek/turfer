import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Phone,
  MessageCircle,
  Search,
  MapPin,
  CircleDot,
  Target,
  Circle,
  Feather,
  Grip,
  Dumbbell,
} from "lucide-react";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfCard } from "@/components/turf/TurfCard";

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

const sportLinks = [
  { slug: "football", label: "Football", icon: <CircleDot className="w-4 h-4" /> },
  { slug: "cricket", label: "Cricket", icon: <Target className="w-4 h-4" /> },
  { slug: "basketball", label: "Basketball", icon: <Circle className="w-4 h-4" /> },
  { slug: "badminton", label: "Badminton", icon: <Feather className="w-4 h-4" /> },
  { slug: "tennis", label: "Tennis", icon: <Grip className="w-4 h-4" /> },
  { slug: "pickleball", label: "Pickleball", icon: <Dumbbell className="w-4 h-4" /> },
];

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

      {/* Hero — search-focused (marketplace pattern per uipro) */}
      <section className="relative overflow-hidden bg-primary-600">
        {/* Dot-pattern texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #D4A853 1px, transparent 0)`,
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700/60 via-transparent to-primary-800/40" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-28 md:pt-24 md:pb-36 text-center">
          {/* Location pill */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 backdrop-blur-sm">
            <MapPin className="w-3.5 h-3.5 text-accent-400" aria-hidden="true" />
            <span className="text-sm font-medium text-white/90">Nashik, Maharashtra</span>
          </div>

          <h1 className="text-4xl md:text-[64px] font-bold text-white leading-[1.05] tracking-tight font-serif mb-4">
            Find your perfect<br />
            <span className="italic text-accent-400">turf in Nashik</span>
          </h1>

          <p className="text-lg text-primary-200 leading-relaxed mb-8 max-w-lg mx-auto">
            {turfs.length}+ premium sports turfs. Compare prices, check ratings, and book with a single call.
          </p>

          {/* Search bar CTA — uipro: "Search bar is the CTA" for marketplace */}
          <Link
            href="/turfs"
            className="group flex items-center gap-3 bg-white rounded-2xl px-5 py-4 max-w-lg mx-auto shadow-elevated hover:shadow-gold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-primary-600"
            aria-label="Search for turfs in Nashik"
          >
            <Search className="w-5 h-5 text-primary-400 group-hover:text-primary-600 transition-colors shrink-0" />
            <span className="text-primary-400 text-base text-left flex-1 group-hover:text-primary-600 transition-colors">
              Search turfs by name, area or sport...
            </span>
            <span className="bg-primary-600 group-hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap">
              Search
            </span>
          </Link>

          {/* Popular searches */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="text-xs text-primary-300">Popular:</span>
            {["Football", "Box Cricket", "Badminton"].map((s) => (
              <Link
                key={s}
                href={`/turfs?q=${s.toLowerCase()}`}
                className="text-xs text-primary-200 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-1 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-white/50"
              >
                {s}
              </Link>
            ))}
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-10 mt-10">
            {[
              { value: `${turfs.length}+`, label: "Turfs listed" },
              { value: "6", label: "Sports" },
              { value: "Free", label: "No booking fee" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold text-white font-serif">{stat.value}</p>
                <p className="text-xs text-primary-300 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sport category chips — SVG icons, no emojis (uipro rule) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-5 relative z-10">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {sportLinks.map(({ slug, label, icon }) => (
            <Link
              key={slug}
              href={`/sport/${slug}`}
              className="flex items-center gap-2.5 px-5 py-3.5 bg-white border border-cream-300 rounded-2xl shadow-card hover:shadow-card-hover hover:border-primary-200 transition-all whitespace-nowrap group cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
            >
              <span className="text-primary-400 group-hover:text-primary-600 transition-colors">{icon}</span>
              <span className="font-medium text-sm text-primary-700 group-hover:text-primary-600 transition-colors">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Turfs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold text-accent-600 uppercase tracking-widest mb-2">
              Top Picks
            </p>
            <h2 className="text-3xl md:text-[36px] font-bold text-primary-800 font-serif leading-tight">
              Most popular turfs
            </h2>
          </div>
          <Link
            href="/turfs"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors focus:outline-none focus:underline"
          >
            Show all ({turfs.length}) <ArrowRight className="w-4 h-4" />
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
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600"
          >
            Show all {turfs.length} turfs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-24 mb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-primary-600 rounded-3xl px-6 py-14 md:px-16 overflow-hidden relative">
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, #D4A853 1px, transparent 0)`,
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative">
              <p className="text-xs font-semibold text-accent-400 uppercase tracking-widest text-center mb-2">
                Simple Process
              </p>
              <h2 className="text-3xl md:text-[36px] font-bold text-white font-serif text-center mb-12">
                Book in 3 steps
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
                {[
                  {
                    icon: <Search className="w-6 h-6 text-accent-400" aria-hidden="true" />,
                    step: "01",
                    title: "Browse turfs",
                    desc: `Compare prices, ratings, and amenities of ${turfs.length}+ turfs in Nashik`,
                  },
                  {
                    icon: <Phone className="w-6 h-6 text-accent-400" aria-hidden="true" />,
                    step: "02",
                    title: "Call or WhatsApp",
                    desc: "Tap to call or message the turf owner directly to check availability",
                  },
                  {
                    icon: <MessageCircle className="w-6 h-6 text-accent-400" aria-hidden="true" />,
                    step: "03",
                    title: "Book & Play",
                    desc: "Confirm your slot, show up, and enjoy the game with your squad",
                  },
                ].map((step) => (
                  <div key={step.step} className="flex flex-col items-center text-center">
                    <div className="relative mb-5">
                      <div className="w-14 h-14 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center">
                        {step.icon}
                      </div>
                      <span className="absolute -top-2 -right-2 text-[10px] font-bold text-accent-400 bg-primary-700 border border-primary-600 rounded-full w-5 h-5 flex items-center justify-center">
                        {step.step.slice(1)}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white font-serif">{step.title}</h3>
                    <p className="text-sm text-primary-300 mt-2 leading-relaxed max-w-xs">
                      {step.desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-12 text-center">
                <Link
                  href="/turfs"
                  className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 text-primary-900 font-bold px-8 py-3.5 rounded-xl transition-all hover:shadow-gold text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-primary-600"
                >
                  Start exploring <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-16" />
    </>
  );
}
