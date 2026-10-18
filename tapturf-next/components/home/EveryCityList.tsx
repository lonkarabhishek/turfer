import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { plural } from "@/lib/home/format";
import type { HomeCityRow } from "@/lib/home/types";

const SHOWN_FIRST = 6;

function Row({ c }: { c: HomeCityRow }) {
  return (
    <li>
      <Link href={`/${c.id}`} className="flex items-baseline justify-between h-8 focus-neon">
        <span className="text-[15px] font-semibold text-primary-900 hover:text-accent-700">{c.label}</span>
        <span className="text-[13px] text-primary-500 tabular-nums">{plural(c.n, "turf", "turfs")}</span>
      </Link>
      {c.top.length > 0 && (
        <p className="text-[13px] text-primary-500 truncate">
          {c.top.map((t, i) => (
            <span key={t.id}>
              {i > 0 && " · "}
              <Link href={`/turf/${t.id}`} className="hover:text-accent-600">
                {t.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

const GRID = "grid grid-cols-1 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 gap-x-6";

/**
 * Every city on TapTurf with its live count and three top turf links,
 * biggest first. Pure server markup: the SEO backbone of the home.
 */
export function EveryCityList({ cities, cityCount }: { cities: HomeCityRow[]; cityCount: number }) {
  if (cities.length === 0) return null;
  const first = cities.slice(0, SHOWN_FIRST);
  const rest = cities.slice(SHOWN_FIRST);
  return (
    <nav id="all-cities" aria-label="All cities" className="section-divider" style={{ scrollMarginTop: "4.5rem" }}>
      <h3 className="text-[15px] font-semibold text-primary-900">Every city on TapTurf</h3>
      <p className="text-[13px] text-primary-500 mt-0.5">{plural(cityCount, "city", "cities")}, biggest first.</p>
      <ul className={`mt-4 ${GRID}`}>
        {first.map((c) => (
          <Row key={c.id} c={c} />
        ))}
        {rest.length > 0 && (
          <li className="col-span-full mt-1">
            <details className="group">
              <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-semibold text-primary-900 cursor-pointer focus-neon">
                <span className="group-open:hidden">Show all {plural(cityCount, "city", "cities")}</span>
                <span className="hidden group-open:inline">Show fewer</span>
                <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ul className={`mt-4 ${GRID}`}>
                {rest.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </nav>
  );
}
