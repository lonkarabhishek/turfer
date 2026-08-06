import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  MapPin,
  CircleDot,
  Target,
  Circle,
  Feather,
  Grip,
  Dumbbell,
  Zap,
  Users,
  Trophy,
  Search,
} from "lucide-react";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { TurfCard } from "@/components/turf/TurfCard";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "TapTurf — Cricket, Football & More in Nashik | Book a Turf",
  description:
    "Book turf, find your squad, run the pitch. 49+ premium sports turfs in Nashik. Cricket, football, box cricket, badminton — book instantly.",
  keywords:
    "cricket turf nashik, box cricket nashik, turf booking nashik, football turf nashik, tapturf",
  openGraph: {
    title: "TapTurf — Book a Turf in Nashik",
    description:
      "Book turf, find your squad, run the pitch. 49+ turfs in Nashik.",
    url: "https://www.tapturf.in",
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
  },
  alternates: { canonical: "https://www.tapturf.in" },
};

const sportLinks = [
  { slug: "cricket", label: "Cricket", icon: <Target className="w-4 h-4" /> },
  { slug: "football", label: "Football", icon: <CircleDot className="w-4 h-4" /> },
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

      {/* ─── HERO — Stadium broadcast ───────────────────────── */}
      <section className="relative overflow-hidden scanline">
        {/* Backdrop: layered pitch stripes + neon spot */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              rgba(198, 255, 0, 0.4) 0 1px,
              transparent 1px 96px
            )`,
          }}
          aria-hidden
        />
        <div
          className="absolute -top-32 -right-32 w-[560px] h-[560px] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, #C6FF00 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="absolute -bottom-40 -left-20 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #FF2B6D 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-20 md:pt-24 md:pb-28">
          {/* LIVE ticker chip */}
          <div className="inline-flex items-center gap-2.5 border border-white/10 bg-white/5 backdrop-blur-md rounded-full pl-2.5 pr-4 py-1.5 mb-8">
            <span className="relative flex items-center justify-center w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-hot-500 pulse-live" />
              <span className="relative w-2 h-2 rounded-full bg-hot-500" />
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/70">
              Live · Nashik · {turfs.length} turfs on the pitch
            </span>
          </div>

          {/* Hero headline — huge Bebas */}
          <h1 className="font-display uppercase text-white leading-[0.85] tracking-tight text-[64px] sm:text-[96px] md:text-[144px] lg:text-[168px]">
            Book turf.<br />
            <span className="neon-shimmer">Find your squad.</span><br />
            Run the pitch.
          </h1>

          <p className="mt-8 max-w-xl text-base md:text-lg text-white/60 leading-relaxed">
            {turfs.length}+ cricket, football & box-cricket grounds across Nashik.
            No booking fee. Squad up in one tap.
          </p>

          {/* Primary CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              href="/games"
              className="group inline-flex items-center justify-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 font-bold text-base px-7 py-4 rounded-full transition-all shadow-neon focus-neon"
            >
              <Zap className="w-5 h-5" strokeWidth={2.5} aria-hidden />
              Find a game tonight
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden />
            </Link>
            <Link
              href="/turfs"
              className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold text-base px-7 py-4 rounded-full backdrop-blur-md transition-all focus-neon"
            >
              <Search className="w-4 h-4" aria-hidden />
              Browse turfs
            </Link>
          </div>

          {/* Scoreboard stat strip */}
          <div className="mt-14 grid grid-cols-3 max-w-lg gap-6 border-t border-white/10 pt-6">
            {[
              { value: `${turfs.length}+`, label: "Grounds" },
              { value: "6", label: "Sports" },
              { value: "0", label: "Booking fee" },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono font-bold text-3xl md:text-4xl text-accent-400 tabular tracking-tight">
                  {s.value}
                </p>
                <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mt-1">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Sport chip rail ────────────────────────────────── */}
      <section className="border-y border-white/5 bg-primary-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {sportLinks.map(({ slug, label, icon }) => (
              <Link
                key={slug}
                href={`/sport/${slug}`}
                className="flex-shrink-0 group flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/[0.03] hover:border-accent-400/60 hover:bg-accent-400/10 transition-all whitespace-nowrap focus-neon"
              >
                <span className="text-accent-400 group-hover:scale-110 transition-transform">{icon}</span>
                <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors uppercase tracking-wide">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Featured Turfs ─────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[11px] font-mono text-accent-400 uppercase tracking-[0.25em] mb-3">
              // Top of the table
            </p>
            <h2 className="font-display uppercase text-4xl md:text-6xl text-white leading-[0.9] tracking-tight">
              Grounds people<br />are booking now
            </h2>
          </div>
          <Link
            href="/turfs"
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:text-accent-300 transition-colors focus:outline-none focus:underline uppercase tracking-wide"
          >
            All {turfs.length} <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {featuredTurfs.map((turf) => (
            <TurfCard key={turf.id} turf={turf} />
          ))}
        </div>
        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/turfs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 uppercase tracking-wide"
          >
            All {turfs.length} turfs <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── How it works — cards, not preachy ─────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-24">
        <div className="relative bg-primary-950 border border-white/10 rounded-3xl px-6 py-14 md:px-14 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, #C6FF00 1px, transparent 0)`,
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30"
            style={{ background: "radial-gradient(circle, #C6FF00 0%, transparent 70%)" }}
            aria-hidden
          />

          <div className="relative">
            <p className="text-[11px] font-mono text-accent-400 uppercase tracking-[0.25em] mb-3">
              // Playbook
            </p>
            <h2 className="font-display uppercase text-4xl md:text-6xl text-white leading-[0.9] tracking-tight mb-12">
              Three taps.<br />You&apos;re on the pitch.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: <Search className="w-5 h-5" strokeWidth={2.5} />,
                  step: "01",
                  title: "Scout",
                  desc: `Compare ${turfs.length}+ grounds. Prices, ratings, distance from you.`,
                },
                {
                  icon: <Users className="w-5 h-5" strokeWidth={2.5} />,
                  step: "02",
                  title: "Squad up",
                  desc: "Post a game or join one. Auto-fills your team from other players nearby.",
                },
                {
                  icon: <Trophy className="w-5 h-5" strokeWidth={2.5} />,
                  step: "03",
                  title: "Play",
                  desc: "One-tap call to book. Show up. Rack up wins. Tag your crew.",
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="group relative border border-white/10 rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent-400/40 transition-all"
                >
                  <span className="absolute top-4 right-4 font-mono text-xs text-white/30 tabular">
                    {s.step}
                  </span>
                  <div className="w-11 h-11 rounded-xl bg-accent-400/15 border border-accent-400/30 flex items-center justify-center text-accent-400 mb-5">
                    {s.icon}
                  </div>
                  <h3 className="font-display uppercase text-2xl text-white tracking-wide">{s.title}</h3>
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link
                href="/game/create"
                className="inline-flex items-center justify-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 font-bold px-7 py-3.5 rounded-full transition-all shadow-neon focus-neon"
              >
                Host a game <ArrowUpRight className="w-4 h-4" />
              </Link>
              <Link
                href="/games"
                className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold px-7 py-3.5 rounded-full transition-all focus-neon"
              >
                Join a game
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer strip — location + trust ─────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 my-16">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <MapPin className="w-4 h-4 text-accent-400" />
            <span className="font-mono uppercase tracking-wide text-xs">
              Nashik, Maharashtra · India
            </span>
          </div>
          <p className="text-xs text-white/30 font-mono uppercase tracking-wide">
            Built by players. For players.
          </p>
        </div>
      </section>

      <div className="h-16" />
    </>
  );
}
