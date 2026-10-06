import Link from "next/link";
import { Star } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { forCard } from "@/lib/utils/cardTurf";
import { areaFor } from "@/lib/utils/area";
import { labelFor, isCity } from "@/lib/city";
import type { Turf } from "@/types/turf";

/** How many turfs get a full photo card; the rest are a plain list. */
const CARD_LIMIT = 24;

/**
 * Turf list for sport pages. The first CARD_LIMIT turfs render as
 * photo cards; the rest as light text links. Every turf stays linked
 * (for players and crawlers) without shipping 200+ client cards,
 * which made /sport/football a 2 MB page.
 */
export function SportTurfList({
  turfs,
  venues,
  placeLabel,
  showCity = false,
}: {
  turfs: Turf[];
  /** Lowercase plural, e.g. "football turfs" or "pickleball courts". */
  venues: string;
  placeLabel: string;
  /** Show the city next to each name (all-cities pages). */
  showCity?: boolean;
}) {
  const cards = turfs.slice(0, CARD_LIMIT);
  const rest = turfs.slice(CARD_LIMIT);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
        {cards.map((turf, i) => (
          <TurfCard key={turf.id} turf={forCard(turf)} priority={i < 3} />
        ))}
      </div>

      {rest.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[20px] font-display text-primary-900 mb-4">
            {rest.length} more {rest.length === 1 ? venues.replace(/s$/, "") : venues} in {placeLabel}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 divide-y divide-primary-100 sm:divide-y-0">
            {rest.map((t) => {
              const area = areaFor(t);
              const where = [area, showCity && isCity(t.city) ? labelFor(t.city) : null]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={t.id}>
                  <Link
                    href={`/turf/${t.id}`}
                    className="flex items-center justify-between gap-3 py-3 group"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-primary-900 group-hover:text-accent-600 truncate">
                        {t.name}
                      </span>
                      {where && <span className="block text-[13px] text-primary-500 truncate">{where}</span>}
                    </span>
                    {t.rating > 0 && t.total_reviews > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[13px] text-primary-700">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {t.rating.toFixed(1)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
