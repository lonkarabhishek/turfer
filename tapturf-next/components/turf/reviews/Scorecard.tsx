"use client";

import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { emptyScorecardLine, partCounts, playAgainLine, SCORE_MIN, scorecard, waitingLine } from "@/lib/reviews/insights";
import type { AspectCount, PlayAgainCounts } from "@/lib/reviews/types";
import type { ReviewSummary } from "@/types/review";

/**
 * "★ 4.6 on TapTurf · 11 players" (tap for the 5-bar histogram) and the
 * would-play-again share: what an average of 4s and 5s hides. From 3 live
 * reports, as the bars: one report is not a score (it is still listed below).
 */
export function ScoreRow({ stats, playAgain }: { stats: ReviewSummary; playAgain: PlayAgainCounts | null }) {
  const [open, setOpen] = useState(false);
  if (stats.count < SCORE_MIN) return null;
  const again = playAgainLine(playAgain);
  const most = Math.max(1, ...stats.histogram);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press-tight inline-flex items-center gap-1.5 min-h-11 rounded-full bg-primary-50 hover:bg-primary-100 px-4 text-[14px] text-primary-700"
      >
        <Star className="w-4 h-4 fill-accent-500 text-accent-500" aria-hidden />
        <span className="font-bold text-primary-900 tabular-nums">{stats.average.toFixed(1)}</span>
        <span>on TapTurf · {stats.count} player{stats.count === 1 ? "" : "s"}</span>
        <ChevronDown className={`w-4 h-4 text-primary-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5 max-w-xs report-chips-in" aria-label="Ratings by stars">
          {[5, 4, 3, 2, 1].map((s) => (
            <li key={s} className="flex items-center gap-2 text-[13px] text-primary-600">
              <span className="w-8 tabular-nums">{s} ★</span>
              <span className="flex-1 h-2 rounded-full bg-primary-100 overflow-hidden">
                <span className="block h-full rounded-full bg-accent-500" style={{ width: `${(stats.histogram[s - 1] / most) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums">{stats.histogram[s - 1]}</span>
            </li>
          ))}
        </ul>
      )}
      {again && <p className="mt-2 text-[14px] font-semibold text-primary-800">{again}</p>}
    </div>
  );
}

/** Needs work is striped as well as red, so the bar reads without telling red from green. */
const NEEDS_STRIPES = { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.65) 0 2px, transparent 2px 5px)" };

/**
 * One part's bar: Great green, Okay grey, Needs work red and striped, with a
 * gap between them, and the counts in words underneath. The turf page and
 * /my both use it.
 */
export function PartBar({ label, n, great, okay, needs_work, thin }: { label: string; n: number; great: number; okay: number; needs_work: number; thin?: boolean }) {
  const counts = partCounts({ great, okay, needs_work });
  return (
    <>
      <div className={`mt-1.5 flex gap-0.5 ${thin ? "h-2" : "h-2.5"} rounded-full overflow-hidden bg-primary-100`} role="img" aria-label={`${label}: ${counts}`}>
        {great > 0 && <span className="h-full bg-accent-500" style={{ width: `${(great / n) * 100}%` }} />}
        {okay > 0 && <span className="h-full bg-primary-300" style={{ width: `${(okay / n) * 100}%` }} />}
        {needs_work > 0 && <span className="h-full bg-hot-500" style={{ width: `${(needs_work / n) * 100}%`, ...NEEDS_STRIPES }} />}
      </div>
      <p className="mt-1 text-[12px] text-primary-600 tabular-nums" aria-hidden>{counts}</p>
    </>
  );
}

/**
 * "How it plays": one bar per part 3 or more TapTurf reports rated in the
 * last 12 months; plain counts, so anyone can check them against the
 * reports below. Nothing at all on a turf with no reports.
 */
export function Scorecard({ counts, turfSports, reports }: { counts: AspectCount[]; turfSports: readonly string[]; reports: number }) {
  const { bars, waiting } = scorecard(counts, turfSports);
  if (!bars.length) {
    const line = emptyScorecardLine(reports, waiting, turfSports);
    return line ? <p className="mt-4 text-[13px] text-primary-500">{line}</p> : null;
  }
  const rest = waitingLine(waiting, turfSports);
  return (
    <div className="mt-5">
      <h3 className="text-[15px] font-bold text-primary-900">How it plays</h3>
      <ul className="mt-3 space-y-4">
        {bars.map((b) => (
          <li key={b.aspect}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-primary-800">{b.label}</span>
              <span className={`text-[13px] font-medium ${b.tone === "great" ? "text-accent-700" : b.tone === "needs" ? "text-hot-600" : "text-primary-600"}`}>{b.words}</span>
            </div>
            <PartBar label={b.label} n={b.n} great={b.great} okay={b.okay} needs_work={b.needs_work} />
            {b.chips.length > 0 && (
              <p className="mt-1 text-[12px] text-primary-600">
                {b.chips.map((c, i) => (
                  <span key={c.tag}>
                    {i > 0 && " · "}
                    <span className={c.sign === -1 ? "text-hot-600" : "text-primary-800"}>{c.label}</span> ×{c.n}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
      {rest && <p className="mt-3 text-[13px] text-primary-500">{rest}</p>}
      <p className="mt-2 text-[12px] text-primary-500">From TapTurf players in the last 12 months.</p>
    </div>
  );
}
