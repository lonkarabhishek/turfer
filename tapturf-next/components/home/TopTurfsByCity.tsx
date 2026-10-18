"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrendingSpotlight, type SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { MIN_REVIEWS_FOR_TOP_RATED } from "@/lib/utils/ranking";
import { plural } from "@/lib/home/format";
import type { HomeStrip } from "@/lib/home/types";
import { HomeTurfTile } from "./HomeTurfTile";
import { useCityPref, useCitySwapCount } from "./useCityPref";

/**
 * "Top-rated in {City}": real photos of the best grounds in the
 * visitor's city, one tap to a turf page, plus this week's trending
 * spotlight when a pick is live. The server renders the biggest city;
 * the client swaps to the picked city in the hydration commit.
 */
export function TopTurfsByCity({
  strips,
  featuredId,
  spotlights,
}: {
  strips: HomeStrip[];
  featuredId: string;
  spotlights: SpotlightTurf[];
}) {
  const pref = useCityPref();
  const shown = strips.find((s) => s.id === pref) ?? strips.find((s) => s.id === featuredId) ?? strips[0];

  // Fade only after a user-initiated city change, never at hydration.
  const swaps = useCitySwapCount(pref);

  if (!shown) return null;
  const pick = spotlights.find((p) => p.city === shown.id);

  return (
    <div aria-labelledby="top-turfs-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="top-turfs-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            {shown.curated ? `Top-rated in ${shown.label}` : `Turfs in ${shown.label}`}
          </h2>
          <p className="text-[13px] text-primary-500 mt-1">
            {shown.curated ? `Each with ${MIN_REVIEWS_FOR_TOP_RATED} or more reviews, best rated first.` : "Every turf we know here."}
          </p>
        </div>
        <Link
          href={`/${shown.id}`}
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          All {shown.n.toLocaleString("en-IN")} <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {pick && <TrendingSpotlight picks={[pick]} mode="fixed" className="mt-4" />}

      <div key={shown.id} className={swaps > 0 ? "animate-fade-in" : ""}>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 scrollbar-hide md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {shown.tiles.map((t, i) => (
            <div key={t.id} className="w-[236px] shrink-0 snap-start md:w-auto">
              <HomeTurfTile tile={t} eager={i === 0} />
            </div>
          ))}
        </div>
        <Link
          href={`/${shown.id}`}
          className="sm:hidden mt-4 flex h-11 items-center justify-center rounded-full border border-primary-200 text-[15px] font-semibold text-primary-900 press-tight focus-neon"
        >
          All {plural(shown.n, "turf", "turfs")} in {shown.label}
        </Link>
      </div>
    </div>
  );
}
