import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrendingSpotlight, type SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { MIN_REVIEWS_FOR_TOP_RATED } from "@/lib/utils/ranking";
import { plural } from "@/lib/home/format";
import type { HomeScope } from "@/lib/home/select";
import type { HomeTile } from "@/lib/home/types";
import { HomeTurfTile } from "./HomeTurfTile";

/**
 * "Top-rated in {City}": real photos of the best grounds in the city the
 * page was rendered for, then this week's trending spotlight under its
 * own label. In the all-India view: the best rated across India, at most
 * two per city, each tile naming its city. Server markup; the city comes
 * from the URL the proxy rewrote to, so nothing swaps after load.
 */
export function TopTurfsByCity({
  scope,
  tiles,
  n,
  curated,
  spotlight,
}: {
  scope: HomeScope;
  tiles: HomeTile[];
  n: number;
  curated: boolean;
  spotlight: SpotlightTurf | null;
}) {
  if (tiles.length === 0) return null;
  const city = scope.kind === "city" ? { id: scope.id, label: scope.label } : null;
  const shownCount = tiles.length;
  const title = city ? (curated ? `Top-rated in ${city.label}` : `Turfs in ${city.label}`) : "Top-rated across India";
  const subtitle = !city
    ? `Each with ${MIN_REVIEWS_FOR_TOP_RATED} or more reviews where we have them, two per city at most.`
    : curated
      ? `Each with ${MIN_REVIEWS_FOR_TOP_RATED} or more reviews, best rated first.`
      : n > shownCount
        ? `${shownCount} of ${plural(n, "turf", "turfs")} here, most reviewed first.`
        : "Every turf we know here.";
  const allHref = city ? `/${city.id}` : "/turfs";
  const allLabel = city ? `All ${plural(n, "turf", "turfs")} in ${city.label}` : `All ${plural(n, "turf", "turfs")}`;

  return (
    <section aria-labelledby="top-turfs-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="top-turfs-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            {title}
          </h2>
          <p className="text-[13px] text-primary-500 mt-1">{subtitle}</p>
        </div>
        <Link
          href={allHref}
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          {allLabel} <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 scrollbar-hide md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
        {tiles.map((t, i) => (
          <div key={t.id} className="w-[236px] shrink-0 snap-start md:w-auto">
            <HomeTurfTile tile={t} eager={i === 0} />
          </div>
        ))}
      </div>
      <Link
        href={allHref}
        className="sm:hidden mt-4 flex h-11 items-center justify-center rounded-full border border-primary-200 text-[15px] font-semibold text-primary-900 press-tight focus-neon"
      >
        {allLabel}
      </Link>

      {/* An editorial pick, so it sits under its own label, never under
          the "best rated first" promise above the tiles. */}
      {city && spotlight && (
        <>
          <p className="mt-6 text-[13px] font-semibold text-primary-500">This week in {city.label}</p>
          <TrendingSpotlight picks={[spotlight]} loading="lazy" className="mt-2" />
        </>
      )}
    </section>
  );
}
