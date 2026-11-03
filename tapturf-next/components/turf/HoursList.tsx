"use client";

import { useEffect, useState } from "react";
import { istWeekdayName, type DayName } from "@/lib/utils/hours";

export type HoursRow = { day: DayName; closed: boolean; text: string };

/**
 * The opening hours list with today's row marked. Turf pages are built
 * ahead and kept for a day, so "today" is worked out here, in the
 * browser, in India time (Asia/Kolkata whatever the phone's own zone),
 * and again when the tab comes back after midnight. The server HTML
 * marks no day, so a page built on Monday never says Monday on Tuesday.
 */
export function HoursList({ rows }: { rows: HoursRow[] }) {
  const [today, setToday] = useState<DayName | null>(null);

  useEffect(() => {
    const update = () => setToday(istWeekdayName());
    update();
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(update, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <ul className="rounded-2xl border border-cream-300 divide-y divide-cream-200 overflow-hidden">
      {rows.map((row) => {
        const isToday = row.day === today;
        return (
          <li
            key={row.day}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              isToday ? "bg-accent-50/60" : "bg-white"
            }`}
          >
            <span
              className={`font-medium ${
                isToday ? "text-accent-700" : "text-primary-700"
              }`}
            >
              {row.day}
              {isToday && (
                <span className="ml-2 text-[10px] text-accent-600">
                  Today
                </span>
              )}
            </span>
            <span
              className={`tabular-nums ${
                row.closed ? "text-primary-400 italic" : "text-primary-800"
              }`}
            >
              {row.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
