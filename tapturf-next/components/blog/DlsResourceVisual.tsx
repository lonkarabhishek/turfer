"use client";

import { useState } from "react";

/**
 * Lesson picture for the DLS explainer. Overs still to bat and wickets
 * in hand fill one bar. The fill is overs/50 times wickets/10, so either
 * slider changes it and either one at zero empties it.
 *
 * This is deliberately not the Duckworth-Lewis-Stern resource function.
 * It must not show a percentage, a par score, or a target.
 */
export function DlsResourceVisual({
  defaults,
  caption,
}: {
  defaults?: { oversLeft?: number; wicketsInHand?: number };
  caption?: string;
}) {
  const [overs, setOvers] = useState(() => clampInt(defaults?.oversLeft, 0, 50, 20));
  const [wickets, setWickets] = useState(() => clampInt(defaults?.wicketsInHand, 0, 10, 10));

  const fill = lessonFill(overs, wickets);
  const status = `${overs} ${overs === 1 ? "over" : "overs"} still to bat and ${wickets} ${wickets === 1 ? "wicket" : "wickets"} in hand: ${shareLabel(fill)}.`;

  return (
    <div className="my-8 rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-accent-50/40 p-5 sm:p-6 not-prose">
      {caption && <p className="text-xs font-bold text-accent-600 mb-2">{caption}</p>}
      <p className="text-[15px] leading-snug text-primary-800 mb-5">
        More overs still to bat, or more wickets in hand, fills the bar. Fewer of either empties it.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Slider
          label="Overs still to bat"
          value={overs}
          min={0}
          max={50}
          onChange={setOvers}
          hint="0 to 50. A full one-day innings is 50. A T20 is 20, so twenty overs alone does not fill the bar."
        />
        <Slider
          label="Wickets in hand"
          value={wickets}
          min={0}
          max={10}
          onChange={setWickets}
          hint="0 to 10. Ten means no wicket lost. Zero means all out, so the bar is empty."
        />
      </div>

      <div className="rounded-2xl bg-white border border-primary-100 p-4 sm:p-5">
        <p className="text-[11px] font-semibold text-primary-500 mb-2">Resources left, as a picture</p>
        <div className="h-6 rounded-full bg-primary-100 overflow-hidden" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent-500 motion-reduce:transition-none transition-[width] duration-200 ease-out"
            style={{ width: `${fill * 100}%` }}
          />
        </div>
        <p className="mt-3 text-[15px] leading-snug text-primary-800" aria-live="polite">
          {status}
        </p>
      </div>

      <p className="mt-4 rounded-2xl border border-accent-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-primary-800">
        <span className="font-semibold text-accent-700">Lesson only. </span>
        This bar is a picture of the idea. It is not the DLS table, not an official resource percentage, and it does not give a target.
      </p>
    </div>
  );
}

function lessonFill(overs: number, wickets: number): number {
  if (overs <= 0 || wickets <= 0) return 0;
  return (overs / 50) * (wickets / 10);
}

function shareLabel(fill: number): string {
  if (fill <= 0) return "nothing of the innings is left";
  if (fill >= 0.97) return "a full 50-over share is left";
  if (fill >= 0.7) return "most of a 50-over innings is left";
  if (fill >= 0.4) return "a solid share of a 50-over innings is left";
  if (fill >= 0.18) return "a smaller share of a 50-over innings is left";
  return "very little of a 50-over innings is left";
}

function clampInt(n: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function Slider({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint: string;
  onChange: (n: number) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-primary-800">{label}</span>
        <span className="font-display text-3xl leading-none text-primary-900 tabular-nums">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clampInt(Number(e.target.value), min, max, min))}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${label.toLowerCase()}`}
        className="block w-full h-11 cursor-pointer accent-accent-600 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600"
      />
      <p className="text-[12px] leading-snug text-primary-500">{hint}</p>
    </div>
  );
}
