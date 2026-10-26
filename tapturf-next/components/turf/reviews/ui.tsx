"use client";

import { Star } from "lucide-react";
import { ASPECT_ORDER, aspectShort, SCORE_WORDS, tagLabel, whenLabel, type AspectId, type PlayedWhen, type Score } from "@/lib/reviews/catalog";
import type { Aspects } from "@/lib/reviews/types";

/**
 * Small pieces the report sheet and the review list share. Colours follow
 * the site's tokens: green (accent) is Great and the stars, red (hot) is
 * Needs work and only ever an outline and tint, near-black is a neutral
 * pick. Every tap target is at least 44px tall.
 */

/** A window event the page uses to open the one report sheet (TurfReviews listens). */
export const OPEN_REPORT_EVENT = "tapturf:open-report";
export type OpenReportDetail = { stars?: number; channel?: "turf_page" | "link" | "edit" };

export function openReport(detail: OpenReportDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenReportDetail>(OPEN_REPORT_EVENT, { detail }));
}

/** A short buzz on a tap, where the phone supports it. */
export function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not supported */
  }
}

export function StarsShown({ n, size = "w-4 h-4", className = "" }: { n: number; size?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${n} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`${size} ${i <= n ? "fill-accent-500 text-accent-500" : "fill-none text-primary-300"}`} />
      ))}
    </span>
  );
}

/** "Box Cricket" as a reviewer's sport line: "Box cricket". */
export const sportWords = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** "Oct 2026", for dates on reports (after hydration only: it reads the visitor's clock). */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** "Box cricket · Evening" */
export function playedLine(sport: string | null | undefined, when: PlayedWhen | null | undefined): string {
  return [sport ? sportWords(sport) : null, when ? whenLabel(when) : null].filter(Boolean).join(" · ");
}

const PILL = "press-tight min-h-11 rounded-full font-semibold transition-colors inline-flex items-center justify-center gap-1.5 select-none whitespace-nowrap";

/** A neutral pick (sport, time of day, a price): near-black when on. */
export function Pill({ on, onClick, children, disabled, className = "", label }: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        buzz();
        onClick();
      }}
      className={`${PILL} ${className || "px-4 text-[14px]"} ${on ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-900 hover:bg-primary-200"} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

/** Needs work, Okay, Great (and No, Maybe, Yes): red outline, near-black, green when on. */
export function ScorePill({ score, on, onClick, children, label }: { score: Score; on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  const tone = !on
    ? "bg-white border border-primary-200 text-primary-800 hover:border-primary-400"
    : score === 1
      ? "bg-accent-500 border border-accent-500 text-white"
      : score === -1
        ? "bg-hot-500/10 border-2 border-hot-500 text-hot-600"
        : "bg-primary-900 border border-primary-900 text-white";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={() => {
        buzz();
        onClick();
      }}
      className={`${PILL} flex-1 min-w-0 px-1.5 text-[13px] ${tone}`}
    >
      {children}
    </button>
  );
}

/** A reason chip under a row ("Dim corners"): toggles, up to three. */
export function ReasonChip({ on, sign, onClick, children, disabled }: { on: boolean; sign: 1 | -1; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  const tone = on
    ? sign === 1
      ? "bg-accent-50 border-accent-500 text-accent-800"
      : "bg-hot-500/10 border-hot-500 text-hot-600"
    : "bg-white border-primary-200 text-primary-700 hover:border-primary-400";
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => {
        buzz();
        onClick();
      }}
      className={`press-tight min-h-11 px-3.5 rounded-full border text-[13px] font-medium transition-colors disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}

/** One rated part as a chip on a report: "Pitch: Great · True bounce". */
export function aspectChipText(a: AspectId, rating: { score: Score; tags?: string[] }, sport: string | null | undefined, turfSports: readonly string[]): string {
  const tags = (rating.tags ?? []).map((t) => tagLabel(a, t));
  return `${aspectShort(a, sport, turfSports)}: ${SCORE_WORDS[rating.score]}${tags.length ? ` · ${tags.join(", ")}` : ""}`;
}

export function chipTone(score: Score): string {
  return score === 1
    ? "bg-accent-50 border-accent-200 text-accent-800"
    : score === -1
      ? "bg-white border-hot-400 text-hot-600"
      : "bg-primary-100 border-primary-100 text-primary-700";
}

/** The chips of a report's scorecard, in catalogue order. */
export function ReportChips({ aspects, sport, turfSports }: { aspects: Aspects | null | undefined; sport?: string | null; turfSports: readonly string[] }) {
  if (!aspects) return null;
  const rated = ASPECT_ORDER.filter((a) => aspects[a]);
  if (!rated.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Scorecard">
      {rated.map((a) => (
        <li key={a} className={`rounded-full border px-2.5 py-1 text-[12px] font-medium leading-tight ${chipTone(aspects[a]!.score)}`}>
          {aspectChipText(a, aspects[a]!, sport, turfSports)}
        </li>
      ))}
    </ul>
  );
}
