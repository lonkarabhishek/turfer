"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ZoomOut } from "lucide-react";
import {
  LEVELS,
  LEVEL_NAMES,
  bucketsOf,
  canPan,
  defaultWindow,
  finer,
  panned,
  totals,
  trail,
  zoomInto,
  type Bucket,
  type Level,
  type TrendWindow,
} from "@/lib/admin/trend";

/**
 * Sign-ups over time, zoomable: 3 months, then monthly, weekly, daily and
 * 6 hours. Tap a bar (or Enter on it) to open it one level down; the
 * breadcrumb, Zoom out and Escape go back up; the arrows move to the
 * stretch before or after.
 * All buckets are India time (lib/admin/trend.ts does the counting).
 */

// One series, so one hue: the brand green (passes the palette checks on white), darker on hover.
const BAR = "#16A34A";
const BAR_HOVER = "#15803D";
// The bucket still going on is lighter: it is not finished.
const BAR_CURRENT = "#86CFA0";
const GRID = "#F3F4F6";
const BASELINE = "#E5E7EB";
const AXIS_TEXT = "#6E6E73";

/** The zoom buttons on a phone, where the full names do not fit in one row. */
const LEVEL_SHORT: Record<Level, string> = { quarter: "3 mo", month: "Month", week: "Week", day: "Day", "6h": "6 hr" };

const PLOT_H = 200;
const AXIS_H = 28;
const Y_AXIS_W = 32;
const TOP_PAD = 18;

/** A clean upper bound and step for the y axis: whole numbers, 1/2/5 steps. */
function yScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  return { top: Math.ceil(max / step) * step, step };
}

/** A column with a 4px rounded top and a square foot. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function SignupsTrend({ times, now }: { times: number[] | null; now: number }) {
  const list = useMemo(() => times ?? [], [times]);
  const first = list.length ? list[0] : null;
  const [stack, setStack] = useState<TrendWindow[]>(() => [defaultWindow("quarter", now, first)]);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(640);
  const boxRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(SVGGElement | null)[]>([]);
  const focusAfter = useRef<number | null>(null);
  const id = useId();

  const w = stack[stack.length - 1];
  const buckets = useMemo(() => bucketsOf(list, w, now), [list, w, now]);
  const sum = useMemo(() => totals(list, w, now), [list, w, now]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // After a zoom by keyboard, keep focus in the chart.
  useEffect(() => {
    if (focusAfter.current === null) return;
    const i = Math.min(focusAfter.current, buckets.length - 1);
    focusAfter.current = null;
    barsRef.current[i]?.focus();
  }, [buckets]);

  if (times === null) {
    return <Shell>{<p className="py-16 text-center text-sm text-primary-500">Couldn&apos;t load sign-ups right now. Reload to try again.</p>}</Shell>;
  }
  if (list.length === 0) {
    return <Shell>{<p className="py-16 text-center text-sm text-primary-500">No sign-ups yet.</p>}</Shell>;
  }

  const go = (next: TrendWindow[]) => {
    setHover(null);
    setStack(next);
  };
  const pickLevel = (level: Level) => go([defaultWindow(level, now, first)]);
  const zoomIn = (b: Bucket, byKey = false) => {
    const next = zoomInto(w, b);
    if (!next) return;
    if (byKey) focusAfter.current = 0;
    go([...stack, next]);
  };
  const zoomOut = () => {
    if (stack.length > 1) return go(stack.slice(0, -1));
    const i = LEVELS.indexOf(w.level);
    if (i > 0) pickLevel(LEVELS[i - 1]);
  };
  const move = (dir: -1 | 1) => {
    const next = panned(w, dir, now);
    if (next && canPan(w, dir, now, first)) go(trail(next, now, first));
  };
  const canZoomOut = stack.length > 1 || w.level !== "quarter";
  const deeper = finer(w.level);

  // Geometry.
  const plotW = Math.max(120, width - Y_AXIS_W);
  const n = buckets.length;
  const band = plotW / Math.max(1, n);
  const barW = Math.max(2, Math.min(24, band - 2));
  const max = Math.max(0, ...buckets.map((b) => b.count));
  const { top, step } = yScale(max);
  const y = (v: number) => TOP_PAD + (PLOT_H - TOP_PAD) * (1 - v / top);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const peak = max > 0 ? buckets.findIndex((b) => b.count === max) : -1;

  // Axis labels: as many as fit, evenly; at 6 hours on several days, only the day starts.
  const room = Math.max(1, Math.floor(plotW / 64));
  const dayStarts = w.level === "6h" && n > 8;
  const every = Math.max(1, Math.ceil((dayStarts ? buckets.filter((b) => !b.axis.includes(":")).length : n) / room));
  let shown = 0;
  const axisLabel = buckets.map((b) => {
    if (dayStarts && b.axis.includes(":")) return false;
    return shown++ % every === 0;
  });

  const delta = sum.previous === null ? null : sum.total - sum.previous;
  const hovered = hover !== null ? buckets[hover] : null;

  const onBarKey = (e: KeyboardEvent<SVGGElement>, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = Math.max(0, Math.min(n - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
      barsRef.current[j]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      zoomIn(buckets[i], true);
    }
  };

  return (
    <Shell
      onKeyDown={(e) => {
        if (e.key === "Escape" && canZoomOut) {
          e.preventDefault();
          focusAfter.current = 0;
          zoomOut();
        }
      }}
    >
      {/* Zoom level */}
      <div role="radiogroup" aria-label="Group sign-ups by" className="grid grid-cols-5 sm:flex gap-1 rounded-full bg-primary-100 p-1 sm:w-fit">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={w.level === l}
            aria-label={LEVEL_NAMES[l]}
            onClick={() => pickLevel(l)}
            className={`h-8 px-1 sm:px-3 rounded-full text-[12px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors ${w.level === l ? "bg-white text-primary-900 shadow-sm" : "text-primary-500 hover:text-primary-800"}`}
          >
            <span className="sm:hidden" aria-hidden>
              {LEVEL_SHORT[l]}
            </span>
            <span className="hidden sm:inline">{LEVEL_NAMES[l]}</span>
          </button>
        ))}
      </div>

      {/* Where we are, and moving around */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Zoom path" className="min-w-0 flex-1">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-primary-500">
            {stack.map((s, i) => (
              <li key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span aria-hidden>›</span>}
                {i === stack.length - 1 ? (
                  <span className="font-semibold text-primary-900" aria-current="page">
                    {s.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => go(stack.slice(0, i + 1))} className="underline underline-offset-2 hover:text-primary-900">
                    {s.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} disabled={!canPan(w, -1, now, first)} aria-label="Earlier" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-35 disabled:hover:bg-transparent">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(1)} disabled={!canPan(w, 1, now, first)} aria-label="Later" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-35 disabled:hover:bg-transparent">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={zoomOut} disabled={!canZoomOut} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full border border-primary-200 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-35 disabled:hover:bg-transparent">
            <ZoomOut className="w-4 h-4" aria-hidden /> Zoom out
          </button>
        </div>
      </div>

      {/* The number */}
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-1">
        <p className="text-[40px] leading-none font-semibold text-primary-900">{sum.total.toLocaleString("en-IN")}</p>
        <div className="pb-1 text-[13px] text-primary-500">
          {delta !== null && sum.previousName && (
            <p>
              <span className={`font-semibold ${delta > 0 ? "text-accent-700" : delta < 0 ? "text-hot-600" : "text-primary-700"}`}>
                {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                {Math.abs(delta).toLocaleString("en-IN")}
                {sum.previous ? ` (${delta >= 0 ? "+" : "−"}${Math.round((Math.abs(delta) / sum.previous) * 100)}%)` : ""}
              </span>{" "}
              vs {sum.previousName}
              {w.end > now ? ", same point in time" : ""}
            </p>
          )}
          {peak >= 0 && (
            <p>
              Busiest: {buckets[peak].long}, {plural(max, "sign-up", "sign-ups")}
            </p>
          )}
        </div>
      </div>

      {/* The chart */}
      <div ref={boxRef} className="relative mt-4" onPointerLeave={() => setHover(null)}>
        <svg
          width={width}
          height={PLOT_H + AXIS_H}
          role="group"
          aria-label={`Sign-ups by ${LEVEL_NAMES[w.level].toLowerCase()}, ${w.label}. Use the table below for every value.`}
          className="block overflow-visible select-none"
        >
          {/* Grid and y axis */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={Y_AXIS_W} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASELINE : GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={Y_AXIS_W - 8} y={y(v)} dy="0.35em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} style={{ fontVariantNumeric: "tabular-nums" }}>
                {v}
              </text>
            </g>
          ))}

          {/* Bars, each its whole band as the hit target */}
          {buckets.map((b, i) => {
            const cx = Y_AXIS_W + band * i + band / 2;
            const h = Math.max(0, y(0) - y(b.count));
            const fill = hover === i ? BAR_HOVER : b.current ? BAR_CURRENT : BAR;
            const what = `${b.long}: ${plural(b.count, "sign-up", "sign-ups")}${b.current ? " so far" : ""}${deeper ? `. Press Enter to zoom in to ${LEVEL_NAMES[deeper].toLowerCase()}` : ""}`;
            return (
              <g
                key={b.start}
                ref={(el) => {
                  barsRef.current[i] = el;
                }}
                role="button"
                tabIndex={i === 0 ? 0 : -1}
                aria-label={what}
                aria-disabled={!deeper}
                onPointerEnter={() => setHover(i)}
                onPointerMove={() => hover !== i && setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((x) => (x === i ? null : x))}
                onClick={() => zoomIn(b)}
                onKeyDown={(e) => onBarKey(e, i)}
                className={`outline-none ${deeper ? "cursor-zoom-in" : ""}`}
              >
                <rect x={Y_AXIS_W + band * i} y={0} width={band} height={PLOT_H} fill="transparent" />
                {b.count > 0 && <path d={barPath(cx - barW / 2, y(b.count), barW, h)} fill={fill} />}
                {hover === i && <rect x={Y_AXIS_W + band * i + 1} y={1} width={Math.max(0, band - 2)} height={PLOT_H - 2} fill="none" stroke={BASELINE} strokeWidth={1} rx={4} />}
                {i === peak && b.count > 0 && hover !== i && (
                  <text x={cx} y={y(b.count) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#1D1D1F">
                    {b.count}
                  </text>
                )}
                {axisLabel[i] && (
                  <text x={cx} y={PLOT_H + 18} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                    {b.axis}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-xl bg-primary-900 text-white px-3 py-2 shadow-elevated text-left"
            // Its bottom sits just above the bar top, so it never covers the bar it is about.
            style={{
              left: Math.min(Math.max(Y_AXIS_W + band * hover + band / 2 - 105, 0), Math.max(0, width - 210)),
              top: y(hovered.count) - 10,
              width: 210,
              transform: "translateY(-100%)",
            }}
          >
            <p className="text-[18px] font-semibold leading-tight">
              {hovered.count.toLocaleString("en-IN")}
              <span className="ml-1 text-[12px] font-normal text-white/70">{hovered.count === 1 ? "sign-up" : "sign-ups"}{hovered.current ? " so far" : ""}</span>
            </p>
            <p className="text-[12px] text-white/80 leading-snug">{hovered.long}</p>
            {deeper && <p className="mt-1 text-[11px] text-accent-300">Tap to see {LEVEL_NAMES[deeper].toLowerCase()}</p>}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-primary-500">
        <p>
          {deeper ? "Tap a bar to zoom in." : "This is the finest view. Zoom out to see more."}
          {buckets.some((b) => b.current && b.count > 0) && (
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: BAR_CURRENT }} aria-hidden /> still going on
            </span>
          )}
        </p>
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} aria-controls={`${id}-table`} className="font-semibold text-primary-700 underline underline-offset-2">
          {showTable ? "Hide table" : "Show as table"}
        </button>
      </div>

      {showTable && (
        <div id={`${id}-table`} className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-primary-200">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Sign-ups, {w.label}</caption>
            <thead className="sticky top-0 bg-primary-50">
              <tr>
                <th scope="col" className="text-left font-semibold text-primary-600 px-3 py-2">
                  {LEVEL_NAMES[w.level]}
                </th>
                <th scope="col" className="text-right font-semibold text-primary-600 px-3 py-2">
                  Sign-ups
                </th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start} className="border-t border-primary-100">
                  <th scope="row" className="text-left font-normal text-primary-800 px-3 py-1.5">
                    {b.long}
                    {b.current ? " (so far)" : ""}
                  </th>
                  <td className="text-right px-3 py-1.5 text-primary-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {b.count.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, onKeyDown }: { children: React.ReactNode; onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void }) {
  return (
    <section aria-labelledby="signups-trend-title" onKeyDown={onKeyDown} className="rounded-2xl bg-white border border-primary-200 p-5">
      <div className="mb-3">
        <h2 id="signups-trend-title" className="font-semibold text-primary-900">
          Sign-ups
        </h2>
        <p className="text-[13px] text-primary-500">New accounts over time, India time</p>
      </div>
      {children}
    </section>
  );
}
