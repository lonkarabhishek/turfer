"use client";

import { useState } from "react";
import { formatPrice, type BandRow } from "@/lib/utils/prices";
import { formatLabel } from "@/lib/utils/formats";

const BAND_ORDER = ["morning", "day", "evening", "night"] as const;
const BAND_LABEL: Record<BandRow["band"], { name: string; time: string }> = {
  morning: { name: "Morning", time: "5 am to 12 pm" },
  day: { name: "Afternoon", time: "12 to 5 pm" },
  evening: { name: "Evening", time: "5 to 9 pm" },
  night: { name: "Night", time: "after 9 pm" },
};

/**
 * Listed per-hour prices by format and time of day. Formats become
 * pills when there are several (a venue can list 5-a-side, 7-a-side and
 * three box cricket sizes); weekday and weekend columns collapse into
 * one when every band is listed for all days. The server sends the bands
 * without their source notes (bandRows) and the month they were checked
 * (bandsCheckedOn), so nothing about where they came from reaches the page.
 */
export function PriceBands({ bands, checked }: { bands: BandRow[]; checked: string | null }) {
  const formats = [...new Set(bands.map((b) => b.format ?? ""))];
  const [active, setActive] = useState(formats[0]);
  const rows = bands.filter((b) => (b.format ?? "") === active);
  const split = rows.some((b) => b.days !== "all");
  const price = (band: BandRow["band"], days: "weekday" | "weekend") =>
    rows.find((b) => b.band === band && (b.days === days || b.days === "all"))?.price_per_hour ?? null;
  const present = BAND_ORDER.filter((band) => rows.some((b) => b.band === band));

  return (
    <div>
      {formats.length > 1 && (
        <div role="tablist" aria-label="Format" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap mb-4">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={f === active}
              onClick={() => setActive(f)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[14px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                f === active ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-800 hover:bg-primary-200"
              }`}
            >
              {formatLabel(f || null)}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-cream-300">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-50 border-b border-cream-300">
              <th className="text-left py-3.5 px-5 text-xs font-semibold text-primary-500">Time</th>
              <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">{split ? "Weekday" : "Every day"}</th>
              {split && <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">Weekend</th>}
            </tr>
          </thead>
          <tbody>
            {present.map((band, i) => {
              const wd = price(band, "weekday");
              const we = price(band, "weekend");
              return (
                <tr key={band} className={`border-b border-cream-200 last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-cream-50"}`}>
                  <td className="py-4 px-5">
                    <span className="block text-base text-primary-700 font-medium">{BAND_LABEL[band].name}</span>
                    <span className="block text-xs text-primary-400">{BAND_LABEL[band].time}</span>
                  </td>
                  <td className="py-4 px-5 text-right tabular-nums">
                    <span className="text-base font-bold text-primary-800 font-serif">{wd != null ? formatPrice(wd) : "–"}</span>
                    {wd != null && <span className="text-xs text-primary-400">/hr</span>}
                  </td>
                  {split && (
                    <td className="py-4 px-5 text-right tabular-nums">
                      <span className="text-base font-bold text-accent-600 font-serif">{we != null ? formatPrice(we) : "–"}</span>
                      {we != null && <span className="text-xs text-primary-400">/hr</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-primary-400">
        {checked ? `Rates as of ${checked}. ` : ""}Times are approximate; confirm the rate with the turf.
      </p>
    </div>
  );
}
