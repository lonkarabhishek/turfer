import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { plural } from "@/lib/home/format";
import type { HomeCityRow } from "@/lib/home/types";

const SHOWN_FIRST = 6;

type Row = HomeCityRow & { km: number | null };

/** A city with its count (and distance) and its three top turfs as 40px pills. */
function CityRow({ c, showKm }: { c: Row; showKm: boolean }) {
  return (
    <li>
      <Link href={`/${c.id}`} className="flex items-center justify-between gap-3 min-h-11 focus-neon">
        <span className="text-[16px] font-semibold text-primary-900 hover:text-accent-700">{c.label}</span>
        <span className="text-[13px] text-primary-500 tabular-nums shrink-0">
          {plural(c.n, "turf", "turfs")}
          {showKm && c.km != null ? ` · ${c.km.toLocaleString("en-IN")} km` : ""}
        </span>
      </Link>
      {c.top.length > 0 && (
        <ul className="mt-0.5 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
          {c.top.map((t) => (
            <li key={t.id} className="shrink-0">
              <Link
                href={`/turf/${t.id}`}
                className="inline-flex items-center h-10 px-3 rounded-full bg-primary-50 hover:bg-primary-100 text-[13px] text-primary-700 whitespace-nowrap press-tight focus-neon transition-colors"
              >
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Every city on TapTurf with its live count: the first six as rows with
 * their three top turf pills, the rest as a compact pill cloud behind a
 * toggle. In a city view it is "Other cities", nearest first, so a small
 * city's neighbours come first; in the all-India view, biggest first.
 * Pure server markup: the SEO backbone of the home, so every city link
 * is in the HTML.
 */
export function EveryCityList({
  title,
  caption,
  rows,
  total,
  showKm = false,
}: {
  title: string;
  caption: string;
  rows: Row[];
  total: number;
  showKm?: boolean;
}) {
  if (rows.length === 0) return null;
  const first = rows.slice(0, SHOWN_FIRST);
  const rest = rows.slice(SHOWN_FIRST);
  return (
    <nav id="all-cities" aria-labelledby="all-cities-h" style={{ scrollMarginTop: "4.5rem" }}>
      <h2 id="all-cities-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
        {title}
      </h2>
      <p className="text-[13px] text-primary-500 mt-1">{caption}</p>
      <ul className="mt-4 grid grid-cols-1 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
        {first.map((c) => (
          <CityRow key={c.id} c={c} showKm={showKm} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-5">
          <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-semibold text-primary-900 cursor-pointer focus-neon">
            <span className="group-open:hidden">Show all {plural(total, "city", "cities")}</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-4 flex flex-wrap gap-2">
            {rest.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${c.id}`}
                  className="inline-flex items-center h-10 px-3.5 rounded-full bg-primary-50 hover:bg-primary-100 text-[14px] font-semibold text-primary-900 press-tight focus-neon transition-colors"
                >
                  {c.label}
                  <span className="ml-1.5 text-primary-500 tabular-nums font-normal">{c.n.toLocaleString("en-IN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  );
}
