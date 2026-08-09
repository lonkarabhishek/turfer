"use client";

import { useEffect, useState } from "react";
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
  Loader2,
} from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import {
  CITIES,
  getCityPref,
  setCityPref,
  autoDetectCity,
  labelFor,
  isCity,
  type CityId,
} from "@/lib/city";
import type { Turf } from "@/types/turf";

const sportLinks = [
  { slug: "cricket", label: "Cricket", icon: <Target className="w-4 h-4" /> },
  { slug: "football", label: "Football", icon: <CircleDot className="w-4 h-4" /> },
  { slug: "basketball", label: "Basketball", icon: <Circle className="w-4 h-4" /> },
  { slug: "badminton", label: "Badminton", icon: <Feather className="w-4 h-4" /> },
  { slug: "tennis", label: "Tennis", icon: <Grip className="w-4 h-4" /> },
  { slug: "pickleball", label: "Pickleball", icon: <Dumbbell className="w-4 h-4" /> },
];

/**
 * Marketing home (logged-out visitors). Displays city-scoped copy
 * and turfs based on the user's picked city (or both cities if none).
 * The two per-city turf lists come from the server component so
 * initial paint is instant regardless of client-side state.
 */
export function MarketingHome({
  nashikTurfs,
  puneTurfs,
}: {
  nashikTurfs: Turf[];
  puneTurfs: Turf[];
}) {
  const [city, setCity] = useState<CityId | null>(null);
  const [mounted, setMounted] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    setCity(getCityPref());
    setMounted(true);
    const onChange = () => setCity(getCityPref());
    window.addEventListener("tapturf:city-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("tapturf:city-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const pickCity = (next: CityId) => {
    setCityPref(next);
    setCity(next);
    window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: next }));
  };

  const detect = async () => {
    setDetecting(true);
    try { localStorage.removeItem("tapturf_city_autodetect_v1"); } catch { /* ignore */ }
    const c = await autoDetectCity();
    if (c) {
      setCity(c);
      window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: c }));
    }
    setDetecting(false);
  };

  // Data + labels per current city choice
  const turfs: Turf[] =
    city === "nashik" ? nashikTurfs :
    city === "pune"   ? puneTurfs :
    [...nashikTurfs, ...puneTurfs];
  const featuredTurfs = turfs.slice(0, 6);
  const cityLabel = city ? labelFor(city) : "Nashik & Pune";
  const cityLabelShort = city ? labelFor(city) : "Nashik + Pune";
  const nashikCount = nashikTurfs.length;
  const puneCount = puneTurfs.length;

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section
        className="relative bg-white"
        style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 60%)" }}
      >
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-14 md:pt-20 md:pb-24">
          {/* LIVE chip — city-scoped */}
          <div className="inline-flex items-center gap-2 border border-primary-200 bg-white rounded-full pl-2 pr-3.5 py-1.5 mb-6 shadow-soft">
            <span className="relative flex items-center justify-center w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-hot-500 pulse-live" />
              <span className="relative w-2 h-2 rounded-full bg-hot-500" />
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-primary-500">
              Live · {cityLabelShort} · {turfs.length} turfs
            </span>
          </div>

          <h1 className="font-display uppercase text-primary-800 leading-[0.88] tracking-tight text-[56px] sm:text-[88px] md:text-[128px] lg:text-[152px]">
            Book turf.<br />
            <span className="text-accent-500">Find your squad.</span><br />
            Run the pitch.
          </h1>

          <p className="mt-6 md:mt-8 max-w-xl text-base md:text-lg text-primary-500 leading-relaxed">
            {turfs.length}+ cricket, football & box-cricket grounds{" "}
            {city ? `in ${cityLabel}` : "across Nashik and Pune"}.
            No booking fee. Squad up in one tap.
          </p>

          {/* ─── City picker prompt — only when no city set ─── */}
          {mounted && !city && (
            <div className="mt-8 rounded-2xl border border-accent-500/30 bg-accent-50 p-5 max-w-xl">
              <p className="text-[11px] font-mono uppercase tracking-widest text-accent-700 mb-1">
                // Where are you playing?
              </p>
              <p className="font-display uppercase text-2xl text-primary-800 leading-tight tracking-wide mb-4">
                Pick your city for a better experience
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {CITIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pickCity(c.id)}
                    className="flex flex-col items-start p-4 rounded-xl bg-white border border-primary-200 hover:border-accent-500 transition-colors focus-neon active:scale-[0.98]"
                  >
                    <span className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center mb-2">
                      <MapPin className="w-4 h-4 text-white" strokeWidth={2.5} />
                    </span>
                    <span className="font-display uppercase text-xl text-primary-800 tracking-wide leading-none">
                      {c.label}
                    </span>
                    <span className="text-[11px] text-primary-500 font-mono mt-1">
                      {c.id === "nashik" ? nashikCount : puneCount} turfs
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={detect}
                disabled={detecting}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent-700 hover:text-accent-800 disabled:opacity-60"
              >
                {detecting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting your location…</>
                ) : (
                  <><MapPin className="w-3.5 h-3.5" /> Use my location instead</>
                )}
              </button>
            </div>
          )}

          {/* Primary CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              href="/games"
              className="group inline-flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-900 text-white font-bold text-base px-7 py-4 rounded-full transition-all shadow-elevated focus-neon"
            >
              <Zap className="w-5 h-5 text-accent-400" strokeWidth={2.5} aria-hidden />
              Find a game tonight
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden />
            </Link>
            <Link
              href={city ? `/${city}` : "/turfs"}
              className="inline-flex items-center justify-center gap-2 border border-primary-300 bg-white hover:border-primary-800 text-primary-800 font-semibold text-base px-7 py-4 rounded-full transition-all focus-neon"
            >
              <Search className="w-4 h-4" aria-hidden />
              Browse turfs{city ? ` in ${cityLabel}` : ""}
            </Link>
          </div>

          {/* Scoreboard */}
          <div className="mt-10 grid grid-cols-3 max-w-lg gap-6 border-t border-primary-200 pt-6">
            {[
              { value: `${turfs.length}+`, label: `Grounds ${city ? `in ${cityLabel}` : ""}` },
              { value: "6", label: "Sports" },
              { value: "0", label: "Booking fee" },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono font-bold text-3xl md:text-4xl text-accent-500 tabular tracking-tight">
                  {s.value}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-primary-400 mt-1">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sport chip rail */}
      <section className="border-y border-primary-200 bg-primary-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {sportLinks.map(({ slug, label, icon }) => (
              <Link
                key={slug}
                href={`/sport/${slug}`}
                className="flex-shrink-0 group flex items-center gap-2 px-4 py-2.5 rounded-full border border-primary-200 bg-white hover:border-accent-500 hover:bg-accent-50 transition-all whitespace-nowrap focus-neon"
              >
                <span className="text-accent-500 group-hover:scale-110 transition-transform">{icon}</span>
                <span className="text-sm font-semibold text-primary-700 uppercase tracking-wide">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Turfs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-14 md:mt-20">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <p className="text-[11px] font-mono text-accent-500 uppercase tracking-[0.2em] mb-2">
              // Top of the table{city ? ` · ${cityLabel}` : ""}
            </p>
            <h2 className="font-display uppercase text-3xl md:text-5xl text-primary-800 leading-[0.92] tracking-tight">
              Grounds people<br />are booking now
            </h2>
          </div>
          <Link
            href={city && isCity(city) ? `/${city}` : "/turfs"}
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700 transition-colors focus:outline-none focus:underline uppercase tracking-wide"
          >
            All {turfs.length} <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {featuredTurfs.map((turf, i) => (
            <TurfCard key={turf.id} turf={turf} priority={i < 3} />
          ))}
        </div>
        <div className="mt-6 text-center sm:hidden">
          <Link
            href={city && isCity(city) ? `/${city}` : "/turfs"}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 uppercase tracking-wide"
          >
            All {turfs.length} turfs <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mt-16 md:mt-24">
        <div className="relative bg-primary-800 rounded-3xl px-6 py-12 md:px-14 md:py-16 overflow-hidden">
          <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-accent-500/15" aria-hidden />
          <div className="relative">
            <p className="text-[11px] font-mono text-accent-400 uppercase tracking-[0.2em] mb-3">
              // Playbook
            </p>
            <h2 className="font-display uppercase text-3xl md:text-5xl text-white leading-[0.92] tracking-tight mb-10">
              Three taps.<br />You&apos;re on the pitch.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: <Search className="w-5 h-5" strokeWidth={2.5} />, step: "01", title: "Scout",
                  desc: `Compare ${turfs.length}+ grounds. Prices, ratings, distance from you.` },
                { icon: <Users className="w-5 h-5" strokeWidth={2.5} />, step: "02", title: "Squad up",
                  desc: "Post a game or join one. Auto-fills your team from other players nearby." },
                { icon: <Trophy className="w-5 h-5" strokeWidth={2.5} />, step: "03", title: "Play",
                  desc: "One-tap call to book. Show up. Rack up wins. Tag your crew." },
              ].map((s) => (
                <div key={s.step} className="group relative border border-white/10 rounded-2xl p-6 bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                  <span className="absolute top-4 right-4 font-mono text-xs text-white/30 tabular">{s.step}</span>
                  <div className="w-11 h-11 rounded-xl bg-accent-400/15 border border-accent-400/30 flex items-center justify-center text-accent-400 mb-4">
                    {s.icon}
                  </div>
                  <h3 className="font-display uppercase text-2xl text-white tracking-wide">{s.title}</h3>
                  <p className="text-sm text-white/70 mt-2 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/game/create" className="inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-neon focus-neon">
                Host a game <ArrowUpRight className="w-4 h-4" />
              </Link>
              <Link href="/games" className="inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 text-white font-semibold px-7 py-3.5 rounded-full transition-all focus-neon">
                Join a game
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 my-14">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-primary-200 pt-8">
          <div className="flex items-center gap-2 text-primary-500 text-sm">
            <MapPin className="w-4 h-4 text-accent-500" />
            <span className="font-mono uppercase tracking-wide text-xs">
              {cityLabel}, Maharashtra · India
            </span>
          </div>
          <p className="text-xs text-primary-400 font-mono uppercase tracking-wide">
            Built by players. For players.
          </p>
        </div>
      </section>

      <div className="h-16 md:h-4" />
    </>
  );
}
