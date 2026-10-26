import Link from "next/link";
import { citySportHref, sportBySlug, venueWord } from "@/lib/sports";
import type { HomeScope } from "@/lib/home/select";

type Tile = { slug: string; name: string; count: number };

function Grid({ tiles, cityId, cityLabel }: { tiles: Tile[]; cityId: string | null; cityLabel: string | null }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {tiles.map((s) => {
        const sp = sportBySlug(s.slug);
        const word = sp ? venueWord(sp, s.count) : s.count === 1 ? "turf" : "turfs";
        return (
          <li key={s.slug}>
            <Link
              href={(cityId && citySportHref(cityId, s.slug, s.count)) || `/sport/${s.slug}`}
              className="press-tight focus-neon flex flex-col justify-between rounded-2xl bg-primary-50 hover:bg-primary-100 px-4 py-3.5 min-h-[76px] transition-colors"
            >
              <span className="block w-5 h-0.5 rounded-full bg-accent-500" aria-hidden />
              <span className="mt-2 text-[15px] sm:text-[16px] font-semibold text-primary-900 leading-tight">{s.name}</span>
              <span className="text-[12px] sm:text-[13px] text-primary-500 tabular-nums leading-snug">
                {s.count.toLocaleString("en-IN")} {word}
                {cityLabel ? ` in ${cityLabel}` : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Browse by sport. In a city: that city's sport pages (only those big
 * enough to be indexed) with its counts, then the other sports as a
 * labelled "across India" row, so two scopes never mix in one grid.
 * In the all-India view: the national counts.
 */
export function SportGrid({
  scope,
  primary,
  more,
  inCity,
}: {
  scope: HomeScope;
  primary: Tile[];
  more: { slug: string; name: string }[];
  /** False: national counts (all-India view, or a city with no indexable sport page). */
  inCity: boolean;
}) {
  const city = scope.kind === "city" && inCity ? { id: scope.id, label: scope.label } : null;
  const tiles = primary;
  if (tiles.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="sports-h">
      <h2 id="sports-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
        {city ? `Browse by sport in ${city.label}` : "Browse by sport across India"}
      </h2>
      <Grid tiles={tiles} cityId={city?.id ?? null} cityLabel={city?.label ?? null} />
      {city && more.length > 0 && (
        <div className="mt-5">
          <p className="text-[13px] font-semibold text-primary-500">More sports across India</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {more.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/sport/${s.slug}`}
                  className="inline-flex items-center h-11 px-4 rounded-full bg-primary-50 hover:bg-primary-100 text-[14px] font-semibold text-primary-900 press-tight focus-neon transition-colors"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
