import Link from "next/link";
import type { ByCity } from "@/lib/byCity";
import { plural } from "@/lib/home/format";

/**
 * One link per city, biggest first, with its count (lib/byCity.ts picks
 * where each goes): what an all-India page lists in place of every turf
 * (/sport/<sport>, /turf-near-me). Cities without a page worth indexing
 * close the list as "and 9 more cities (11 turfs)", with no link.
 */
export function ByCityLinks({
  id,
  title,
  sub,
  byCity,
  unit,
  className = "mt-12",
}: {
  id?: string;
  title: string;
  sub?: string;
  byCity: ByCity;
  /** The venues the counts are of, one and many: ["box cricket turf", "box cricket turfs"]. */
  unit: [string, string];
  className?: string;
}) {
  const { links, rest } = byCity;
  if (links.length === 0 && rest.cities === 0) return null;
  return (
    <section id={id} className={`${className} scroll-mt-20`}>
      <h2 className="text-[20px] font-display text-primary-900">{title}</h2>
      {sub && <p className="text-[14px] text-primary-500 mt-1">{sub}</p>}
      {links.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6">
          {links.map((c) => (
            <li key={c.id}>
              <Link href={c.href} className="flex min-h-10 items-center justify-between gap-3 py-2 text-[15px] text-primary-900 hover:text-accent-600">
                <span className="min-w-0 truncate">{c.label}</span>
                <span className="shrink-0 text-[13px] text-primary-500 tabular-nums">{c.count.toLocaleString("en-IN")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rest.cities > 0 && (
        <p className="mt-3 text-[14px] text-primary-500">
          {links.length > 0 ? "and " : ""}
          {plural(rest.cities, links.length > 0 ? "more city" : "city", links.length > 0 ? "more cities" : "cities")} ({plural(rest.venues, unit[0], unit[1])})
        </p>
      )}
    </section>
  );
}
