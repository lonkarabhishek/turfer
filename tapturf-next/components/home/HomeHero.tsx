"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Navigation } from "lucide-react";
import { CityPicker } from "@/components/city/CityPicker";
import { AskEntry } from "@/components/ask/AskEntry";
import { plural } from "@/lib/home/format";
import type { HomeHeroProps } from "@/lib/home/types";
import { useCityPref } from "./useCityPref";

const SEP = " · ";

/**
 * One of the two 68px routes under the Ask box. The icon circle only
 * appears from `sm`: a 390px phone gives each tile about 150px of text,
 * which is the title and a short sub, not a 40px circle as well.
 */
function HeroTile({
  href,
  dark = false,
  icon,
  title,
  sub,
  subShort,
}: {
  href: string;
  dark?: boolean;
  icon: React.ReactNode;
  title: string;
  /** Sub line from `sm` up. */
  sub: string;
  /** Shorter sub line for phones. */
  subShort: string;
}) {
  return (
    <Link
      href={href}
      className={`press-tight focus-neon flex items-center gap-3 rounded-2xl px-3 sm:px-3.5 h-[68px] transition-colors ${
        dark ? "bg-primary-900 hover:bg-primary-600 text-white" : "bg-primary-50 hover:bg-primary-100 text-primary-900"
      }`}
    >
      <span
        className={`hidden sm:inline-flex shrink-0 w-10 h-10 rounded-full items-center justify-center ${
          dark ? "bg-white/15" : "bg-white shadow-card"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] sm:text-[15px] font-semibold truncate">{title}</span>
        <span className={`block text-[12px] truncate tabular-nums ${dark ? "text-white/70" : "text-primary-500"}`}>
          <span className="sm:hidden">{subShort}</span>
          <span className="hidden sm:inline">{sub}</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * Home hero for visitors. Left-aligned, never viewport-filling: where
 * you are, how big TapTurf is, the Ask box and two one-tap routes.
 * Fully pre-rendered with the all-cities strings; the city pref swaps
 * text for text in the hydration commit. No GPS, no fetch here: the
 * shared CityPicker does the silent header-based detect on a first visit.
 */
export function HomeHero({ total, cityCount, cities, topCities }: HomeHeroProps) {
  const pref = useCityPref();
  const city = pref && cities[pref] ? pref : null;
  const info = city ? cities[city] : null;

  // The one bold line that sells scale. It names the two sports people
  // search for whenever the data backs it, and wraps rather than clips.
  const statLine = info
    ? info.core
      ? `${info.n.toLocaleString("en-IN")} football, box cricket and sports turfs in ${info.label}`
      : `${plural(info.n, "turf", "turfs")} in ${info.label}${SEP}${plural(info.sports, "sport", "sports")}`
    : `${total.toLocaleString("en-IN")} football, box cricket and sports turfs${SEP}${plural(cityCount, "city", "cities")}`;

  const chips = info
    ? [
        `Box cricket in ${info.area ?? info.label} under ₹1,000`,
        `Football turf in ${info.label} with floodlights`,
        `Open games in ${info.label} this weekend`,
        `Which ${info.label} turf is open 24 hours?`,
      ]
    : ["Box cricket near me under ₹1,000", "Football turf with floodlights tonight", "Open games this weekend", "Compare two turfs"];

  const maxN = topCities[0]?.n ?? 1;

  return (
    <section className="relative" style={{ background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 70%)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4 lg:pt-14 lg:pb-12 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:items-start">
        <div className="max-w-[640px]">
          <CityPicker variant="hero" />

          <h1 className="mt-4 font-display text-[clamp(2.125rem,10.5vw,2.5rem)] md:text-[64px] leading-[1.02] tracking-[-0.03em] text-primary-900">
            Find your turf.
            <br />
            <span className="text-accent-500">Go play.</span>
          </h1>

          {total > 0 && (
            <p className="mt-3 max-w-[40ch] md:max-w-none text-[15px] min-[360px]:text-[17px] md:text-[20px] font-semibold text-primary-900 tabular-nums leading-snug">
              {statLine}
            </p>
          )}

          <p className="mt-2 max-w-[38ch] text-[15px] md:text-[17px] leading-snug text-primary-500">
            Photos, ratings and prices. Call or WhatsApp the turf to book, no booking fee.
          </p>

          <AskEntry examples={chips} className="mt-5" />

          <div className="mt-4 grid grid-cols-2 gap-2 lg:max-w-[560px]">
            <HeroTile
              href="/turf-near-me"
              dark
              icon={<Navigation className="w-5 h-5" />}
              title="Turfs near me"
              sub="Sorted by distance"
              subShort="Sorted by distance"
            />
            {info ? (
              <HeroTile
                href={`/${city}`}
                icon={<MapPin className="w-5 h-5 text-accent-600" />}
                title={`Turfs in ${info.label}`}
                sub={`${plural(info.n, "turf", "turfs")}, top rated first`}
                subShort="Top rated first"
              />
            ) : (
              <HeroTile
                href="/turfs"
                icon={<MapPin className="w-5 h-5 text-accent-600" />}
                title="All turfs"
                sub={total > 0 ? `${plural(total, "turf", "turfs")} in ${plural(cityCount, "city", "cities")}` : "Every ground we know"}
                subShort="Top rated first"
              />
            )}
          </div>
        </div>

        {topCities.length > 0 && (
          <aside className="hidden lg:block rounded-3xl border border-primary-200 bg-white p-5 shadow-card">
            <p className="text-[13px] font-semibold text-primary-500">Where the turfs are</p>
            <nav aria-label="Biggest cities" className="mt-2">
              <ul className="space-y-0.5">
                {topCities.map((c) => {
                  const active = c.id === city;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/${c.id}`}
                        className={`relative isolate flex items-center justify-between h-10 px-3 rounded-xl hover:bg-primary-50 focus-neon transition-colors ${active ? "ring-1 ring-accent-300" : ""}`}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-y-1 left-0 rounded-lg bg-accent-50 -z-10"
                          style={{ width: `${Math.round((c.n / maxN) * 100)}%` }}
                        />
                        <span className={`relative text-[15px] font-semibold ${active ? "text-accent-700" : "text-primary-900"}`}>{c.label}</span>
                        <span className="relative text-[14px] text-primary-500 tabular-nums">{c.n.toLocaleString("en-IN")}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <Link
              href="#all-cities"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700"
            >
              All {plural(cityCount, "city", "cities")} <ArrowUpRight className="w-4 h-4" />
            </Link>
          </aside>
        )}
      </div>
    </section>
  );
}
