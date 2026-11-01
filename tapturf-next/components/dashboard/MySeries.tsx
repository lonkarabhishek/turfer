"use client";

import { useState } from "react";
import Link from "next/link";
import { Repeat as RepeatIcon } from "lucide-react";
import { SeriesStopSheet } from "@/components/game/SeriesStopSheet";
import { repeatLabel, repeatSummary } from "@/lib/games/repeat";
import type { GameSeries } from "@/lib/games/types";
import { formatGameDay } from "@/lib/utils/game";

/**
 * The repeats a host runs, on the Me tab's Hosted list: how each repeats,
 * where, its next game and how many are up, and Stop (keeping or
 * cancelling the games already up). Stopped and finished ones follow,
 * quieter, while they still have games to play.
 */
export function MySeries({
  series,
  venues,
  onStop,
}: {
  series: GameSeries[];
  /** The venue of each repeat (from its games), by id. */
  venues: Map<string, string>;
  /** Stop one; answers the page's words for what went wrong, or null. */
  onStop: (id: string, cancel: boolean) => Promise<string | null>;
}) {
  const [stopping, setStopping] = useState<GameSeries | null>(null);
  const shown = series.filter((s) => s.active || (s.upcoming ?? 0) > 0);
  if (shown.length === 0) return null;
  const running = shown.filter((s) => s.active).length;

  return (
    <section aria-labelledby="my-repeats" className="mb-6">
      <p id="my-repeats" className="text-[11px] font-semibold text-accent-600 mb-3">
        Repeating · {running}
      </p>
      <ul className="space-y-3">
        {shown.map((s) => {
          const venue = venues.get(s.id);
          const up = s.upcoming ?? 0;
          return (
            <li key={s.id} className={`rounded-2xl border bg-white p-4 ${s.active ? "border-accent-500/40" : "border-primary-200 opacity-80"}`}>
              <div className="flex items-start gap-3">
                <span className={`size-10 shrink-0 rounded-xl grid place-items-center ${s.active ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-500"}`}>
                  <RepeatIcon className="w-5 h-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-primary-900 leading-snug">
                    {s.sport}
                    {venue && <span className="font-medium text-primary-600"> · {venue}</span>}
                  </p>
                  <p className="text-[13px] text-primary-700 leading-snug mt-0.5">
                    {repeatSummary({ rule: s.rule, ends: s.ends }, s.starts_on, s.start_time, s.end_time)}
                  </p>
                  <p className="text-[12px] text-primary-500 leading-snug mt-1">
                    {!s.active && <span className="font-semibold">{s.ended === "done" ? "Last games up" : "Stopped"} · </span>}
                    {s.next ? (
                      <>
                        Next{" "}
                        <Link href={`/game/${s.next.id}`} className="font-semibold text-accent-700 underline underline-offset-2 focus-neon rounded">
                          {formatGameDay(s.next.date).short}
                        </Link>
                        {" · "}
                        {up === 1 ? "1 game up" : `${up} games up`}
                      </>
                    ) : (
                      "No game up right now"
                    )}
                  </p>
                </div>
              </div>
              {s.active && (
                <button
                  type="button"
                  onClick={() => setStopping(s)}
                  className="mt-3 inline-flex items-center min-h-11 px-4 rounded-full border-2 border-primary-200 bg-white hover:border-hot-500 text-[14px] font-bold text-primary-800 transition-colors focus-neon"
                  aria-label={`Stop repeating ${s.sport}, ${repeatLabel(s.rule)}`}
                >
                  Stop repeating
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {stopping && (
        <SeriesStopSheet
          open
          label={repeatLabel(stopping.rule)}
          left={stopping.upcoming ?? null}
          onStop={async (cancel) => {
            const problem = await onStop(stopping.id, cancel);
            if (!problem) setStopping(null);
            return problem;
          }}
          onClose={() => setStopping(null)}
        />
      )}
    </section>
  );
}
