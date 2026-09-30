"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCityPref, labelFor, type CityId } from "@/lib/city";

export interface PopularCity {
  id: CityId;
  total: number;
  turfs: { id: string; name: string; address: string; rating: number; reviews: number }[];
}

/**
 * "Popular in <city>" strips on the home page. The server renders every
 * city (so crawlers see all the /turf links); once the browser knows the
 * visitor's city (picked in the header, or auto-detected from location)
 * only that city's strip is shown. "All cities" shows them all.
 */
export function PopularByCity({ cities }: { cities: PopularCity[] }) {
  const [city, setCity] = useState<CityId | null>(null);

  useEffect(() => {
    const load = () => setCity(getCityPref());
    load();
    window.addEventListener("tapturf:city-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("tapturf:city-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const hasPicked = city != null && cities.some((c) => c.id === city);
  const shown = hasPicked ? cities.filter((c) => c.id === city) : cities;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 space-y-10">
      {shown.map((c) => (
        <div key={c.id}>
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
              Popular in {labelFor(c.id)}
            </h2>
            <Link
              href={`/${c.id}`}
              className="flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700"
            >
              All {c.total} <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {c.turfs.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/turf/${t.id}`}
                  className="flex items-start gap-2 rounded-xl border border-primary-200 bg-white p-3 hover:border-accent-500 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-primary-800 truncate">{t.name}</p>
                    <p className="text-[12px] text-primary-500 truncate">{t.address}</p>
                  </div>
                  {t.rating > 0 && t.reviews > 0 && (
                    <span className="text-[11px] font-semibold text-primary-800 shrink-0">
                      ★ {t.rating.toFixed(1)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
