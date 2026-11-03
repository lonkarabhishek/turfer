"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Visits a day for the admin's Traffic section: one column per India day,
 * oldest on the left, today (so far, lighter) on the right, in plain SVG
 * with no chart library. Tap, hover or use the arrow keys on a day to read
 * its visits and page views above the chart (today's at first); a table of
 * every day is there for screen readers. Readable at 390 px.
 */

export type ChartDay = { day: string; label: string; visits: number; views: number };

/** The bars' colour: TapTurf's teal, one step darker so a bar keeps 3:1 against white. */
const BAR = "#008C80";
const H = 120;
/** Bars are at most this wide, with at least GAP of surface between them. */
const BAR_MAX = 24;
const GAP = 2;
const fmt = (n: number) => n.toLocaleString("en-IN");

/** A clean top for the scale (1, 2, 5 times a power of ten) at or above the highest day. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** A column with a rounded data end (r) and a square foot on the baseline. */
const column = (x: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  const y = H - h;
  return `M${x},${H}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${H}Z`;
};

export function TrafficChart({ days }: { days: ChartDay[] }) {
  const [at, setAt] = useState(days.length - 1);
  // Drawn in the plot's own pixels once it is measured (so a bar is never wider than BAR_MAX); a phone's width before.
  const [width, setWidth] = useState(300);
  const plot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = plot.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(60, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (days.length === 0) return null;
  const top = niceMax(Math.max(...days.map((d) => d.visits)));
  const n = days.length;
  const slot = width / n;
  const barW = Math.max(1, Math.min(BAR_MAX, slot - GAP));
  const sel = days[Math.min(Math.max(at, 0), n - 1)];
  const isToday = at === n - 1;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setAt((a) => Math.max(0, a - 1));
    else if (e.key === "ArrowRight") setAt((a) => Math.min(n - 1, a + 1));
    else if (e.key === "Home") setAt(0);
    else if (e.key === "End") setAt(n - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div>
      {/* The day picked: today's at first. */}
      <p className="mb-2 min-h-10 text-[13px] leading-snug text-primary-600" aria-live="polite">
        <span className="font-semibold text-primary-900">{isToday ? `Today (${sel.label}, so far)` : sel.label}</span>
        <br />
        <b className="font-bold tabular-nums text-primary-900">{fmt(sel.visits)}</b> {sel.visits === 1 ? "visit" : "visits"} ·{" "}
        <span className="tabular-nums">{fmt(sel.views)}</span> {sel.views === 1 ? "page view" : "page views"}
      </p>
      <div className="flex gap-1.5">
        {/* The scale: its top and 0, at the gridlines. */}
        <div className="relative w-7 shrink-0 text-right text-[10px] font-semibold tabular-nums text-primary-400" style={{ height: H }} aria-hidden>
          <span className="absolute right-0 top-0 -translate-y-1/2">{fmt(top)}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{fmt(top / 2)}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div
          ref={plot}
          className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          tabIndex={0}
          role="slider"
          aria-label="Day in the chart"
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={at + 1}
          aria-valuetext={`${sel.label}: ${fmt(sel.visits)} visits, ${fmt(sel.views)} page views`}
          onKeyDown={onKey}
        >
          <svg viewBox={`0 0 ${width} ${H}`} preserveAspectRatio="none" className="block w-full touch-manipulation" style={{ height: H }} aria-hidden>
            {/* Recessive gridlines: the top, the middle and the baseline. */}
            {[0, H / 2, H].map((y) => (
              <line key={y} x1={0} x2={width} y1={y === 0 ? 0.5 : y === H ? H - 0.5 : y} y2={y === 0 ? 0.5 : y === H ? H - 0.5 : y} stroke="#E5E7EB" strokeWidth={1} />
            ))}
            {days.map((d, i) => {
              const h = d.visits > 0 ? Math.max(2, (d.visits / top) * H) : 0;
              const last = i === n - 1;
              return (
                <g key={d.day}>
                  {/* The whole column is the tap target, not just the bar. */}
                  <rect x={i * slot} y={0} width={slot} height={H} fill={i === at ? "#F3F4F6" : "transparent"} onPointerEnter={() => setAt(i)} onPointerDown={() => setAt(i)} />
                  {h > 0 && <path d={column(i * slot + (slot - barW) / 2, barW, h)} fill={BAR} opacity={last ? 0.5 : 1} pointerEvents="none" />}
                </g>
              );
            })}
          </svg>
          <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-primary-400" aria-hidden>
            <span>{days[0].label}</span>
            <span>{days[Math.floor((n - 1) / 2)].label}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
      {/* sr-only on the wrapper: a table sized to its content would ignore it and widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Visits and page views a day, last {n} days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Visits</th>
              <th scope="col">Page views</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.day}>
                <th scope="row">{i === n - 1 ? `${d.label} (today, so far)` : d.label}</th>
                <td>{fmt(d.visits)}</td>
                <td>{fmt(d.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
