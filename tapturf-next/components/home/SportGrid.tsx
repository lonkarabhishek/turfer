"use client";

import Link from "next/link";
import { labelFor } from "@/lib/city";
import { sportBySlug, venueWord } from "@/lib/sports";
import type { HomeSport } from "@/lib/home/types";
import { useCityPref } from "./useCityPref";

/**
 * Browse by sport: twelve sport pages with live counts, type-led tiles
 * (the sport name is the icon). After hydration a tile points at the
 * visitor's city sport page when that page is big enough to be indexed.
 */
export function SportGrid({ sports, byCity }: { sports: HomeSport[]; byCity: Record<string, Record<string, number>> }) {
  const pref = useCityPref();
  const cityCounts = pref ? byCity[pref] : undefined;
  const label = pref ? labelFor(pref) : null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="sports-h">
      <h2 id="sports-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
        Browse by sport
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {sports.map((s) => {
          const sp = sportBySlug(s.slug);
          const n = cityCounts?.[s.slug];
          const local = pref && n != null && label;
          const count = local ? n : s.count;
          const word = sp ? venueWord(sp, count) : count === 1 ? "turf" : "turfs";
          return (
            <li key={s.slug}>
              <Link
                href={local ? `/${pref}/${s.slug}` : `/sport/${s.slug}`}
                className="press-tight focus-neon flex flex-col justify-between rounded-2xl bg-primary-50 hover:bg-primary-100 px-4 py-3.5 min-h-[76px] transition-colors"
              >
                <span className="block w-5 h-0.5 rounded-full bg-accent-500" aria-hidden />
                <span className="mt-2 text-[16px] font-semibold text-primary-900 truncate">{s.name}</span>
                <span className="text-[13px] text-primary-500 tabular-nums truncate">
                  {count.toLocaleString("en-IN")} {word}
                  {local ? ` in ${label}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
