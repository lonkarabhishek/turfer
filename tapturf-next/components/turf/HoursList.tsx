"use client";

import { useEffect, useState } from "react";
import { istWeekdayName, type DayName } from "@/lib/utils/hours";

/**
 * One day of the table. `spans` are the formatted ranges ("6:00 AM –
 * 10:00 AM"), one per line; when there are none `text` is shown instead
 * ("Closed", or the stored text when it did not parse).
 */
export type HoursRow = { day: DayName; closed: boolean; spans: string[]; text: string };

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

  // Two columns, the day one a fixed width, so every row's hours start
  // at the same place whatever the day's name or the "Today" line.
  return (
    <ul className="rounded-2xl border border-cream-300 divide-y divide-cream-200 overflow-hidden">
      {rows.map((row) => {
        const isToday = row.day === today;
        return (
          <li
            key={row.day}
            className={`grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2.5 text-sm ${
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
                <span className="block text-[10px] leading-tight text-accent-600">
                  Today
                </span>
              )}
            </span>
            {row.spans.length ? (
              <span className="tabular-nums text-primary-800">
                {row.spans.map((span, i) => (
                  <span key={i} className="block">
                    <SpanText span={span} />
                  </span>
                ))}
              </span>
            ) : (
              <span
                className={`tabular-nums [overflow-wrap:anywhere] ${
                  row.closed ? "text-primary-400 italic" : "text-primary-800"
                }`}
              >
                {row.text}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "7:00 AM – 12:00 AM" may break after the dash on a very narrow
 * screen, never inside a time ("12:00" on one line, "AM" on the next).
 */
function SpanText({ span }: { span: string }) {
  const at = span.indexOf(" – ");
  if (at < 0) return <span className="whitespace-nowrap">{span}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{span.slice(0, at + 2)}</span>{" "}
      <span className="whitespace-nowrap">{span.slice(at + 3)}</span>
    </>
  );
}
