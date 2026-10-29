"use client";

import Link from "next/link";
import { Gamepad2, Search } from "lucide-react";
import { CityLine } from "@/components/city/CityLine";
import { AskEntry } from "@/components/ask/AskEntry";
import { plural } from "@/lib/home/format";
import type { CityLineProps } from "@/lib/cityLine";
import type { HomeScope, ScopedHome } from "@/lib/home/select";

/**
 * Home hero for visitors: the centred "Playing should be easy."
 * (the owner's line, 29 Oct) in the layout people know, with two actions and the Ask box. Additions stay
 * quiet: one grey line with the live count, chips for the visitor's own
 * city, and the city line where the old city button sat. Every string
 * comes from server props for the city the page was rendered for, so
 * nothing swaps after load. A little shorter than a full screen so the
 * turfs below peek in.
 */
export function HomeHero({ hero, line }: { hero: ScopedHome["hero"]; scope: HomeScope; line: CityLineProps }) {
  const { total, cityCount, chips } = hero;
  const info = hero.city;

  const count = info
    ? `${plural(info.n, "turf", "turfs")} in ${info.label}`
    : total > 0
      ? `${total.toLocaleString("en-IN")} turfs in ${plural(cityCount, "city", "cities")}`
      : null;

  return (
    <section className="min-h-[calc(100svh-3.5rem-3.5rem-4rem)] md:min-h-[calc(100vh-4rem-6rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px] text-center">
        <h1 className="font-display text-primary-900 text-display-xl mb-4">
          Playing should
          <br />
          <span className="text-accent-500">be easy.</span>
        </h1>
        <p className="text-primary-500 text-[17px] md:text-xl leading-snug max-w-[420px] mx-auto">
          Find a sports turf or join an open match near you.
        </p>
        {count && <p className="mt-2 text-[14px] text-primary-400 tabular-nums">{count}, with photos, ratings and prices</p>}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/turfs"
            className="press-tight inline-flex items-center justify-center gap-2 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[17px] font-semibold px-7 py-3.5 transition-colors"
          >
            <Search className="w-[18px] h-[18px]" strokeWidth={2.25} />
            Find a turf
          </Link>
          <Link
            href="/games"
            className="press-tight inline-flex items-center justify-center gap-2 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[17px] font-semibold px-7 py-3.5 transition-colors"
          >
            <Gamepad2 className="w-[18px] h-[18px]" strokeWidth={2.25} />
            Join a game
          </Link>
        </div>

        <AskEntry examples={chips} center />

        <div className="mt-6 flex justify-center text-[15px]">
          <CityLine {...line} />
        </div>
      </div>
    </section>
  );
}
