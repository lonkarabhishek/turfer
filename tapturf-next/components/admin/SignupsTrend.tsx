"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, X, ZoomOut } from "lucide-react";
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
import { NO_CITY, cityLabel, inCity, joinedBetween, type Person } from "@/lib/admin/people";
import { CityBreakdown } from "./CityBreakdown";
import { SignupPeople } from "./SignupPeople";

/**
 * Sign-ups over time, zoomable: 3 months, then monthly, weekly, daily and
 * 6 hours. Tap a bar (or Enter on it) to open it one level down; the
 * breadcrumb, Zoom out and Escape go back up; the arrows move to the
 * stretch before or after. Under it, sign-ups by city for the stretch
 * shown (tap a city to show only its sign-ups, in the chart and the
 * list), then the people who signed up, with everything about them. All
 * use each person's sign-up time (lib/admin/people.ts), so the list
 * always matches the bars.
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

/** Where focus goes once the next view has drawn: the bar holding a time, or the current crumb. */
type FocusAfter = { bar: number | null } | "crumb" | null;

export function SignupsTrend({ people, now, focus = null }: { people: Person[] | null; now: number; focus?: string | null }) {
  // The city picked in By city (NO_CITY: no known city), or everyone. Kept while zooming and moving.
  const [city, setCity] = useState<string | null>(null);
  // Windows start from the first sign-up of anyone, so picking a city never moves the view.
  const first = useMemo(() => (people?.length ? people.reduce((m, p) => Math.min(m, p.joinedAt), Infinity) : null), [people]);
  const list = useMemo(() => (people ?? []).filter((p) => inCity(p, city)).map((p) => p.joinedAt).sort((a, b) => a - b), [people, city]);
  const [stack, setStack] = useState<TrendWindow[]>(() => [defaultWindow("quarter", now, first)]);
  const [hover, setHover] = useState<number | null>(null);
  // The bar that takes Tab (roving tabindex): the last one focused, else the first.
  const [active, setActive] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(640);
  const barsRef = useRef<(SVGGElement | null)[]>([]);
  const crumbRef = useRef<HTMLSpanElement | null>(null);
  const heroRef = useRef<HTMLParagraphElement | null>(null);
  const focusAfter = useRef<FocusAfter>(null);
  const id = useId();

  const w = stack[stack.length - 1];
  const buckets = useMemo(() => bucketsOf(list, w, now), [list, w, now]);
  const inWindow = useMemo(() => joinedBetween(people ?? [], w.start, w.end), [people, w]);
  const sum = useMemo(() => totals(list, w, now), [list, w, now]);

  // Measured with a callback ref, so it also starts when the plot first appears after an empty state.
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // After a change made from the keyboard, put focus back where the person was.
  useEffect(() => {
    const f = focusAfter.current;
    if (f === null) return;
    focusAfter.current = null;
    if (f === "crumb") {
      crumbRef.current?.focus();
      return;
    }
    const at = f.bar;
    const found = at === null ? -1 : buckets.findIndex((b) => b.start <= at && at < b.end);
    barsRef.current[Math.max(0, Math.min(found, buckets.length - 1))]?.focus();
  }, [buckets]);

  if (people === null) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-primary-500">Couldn&apos;t load sign-ups right now. Reload to try again.</p>
      </Shell>
    );
  }
  if (!people.length) {
    return <Shell>{<p className="py-16 text-center text-sm text-primary-500">No sign-ups yet.</p>}</Shell>;
  }

  const go = (next: TrendWindow[], focus: FocusAfter = null) => {
    focusAfter.current = focus;
    setHover(null);
    setActive(0);
    setStack(next);
  };
  const pickLevel = (level: Level, focus: FocusAfter = null) => go([defaultWindow(level, now, first)], focus);
  const zoomIn = (b: Bucket, byKey = false) => {
    const next = zoomInto(w, b);
    if (!next) return;
    go([...stack, next], byKey ? { bar: null } : null);
  };
  /** Up one level; from the plot, focus lands on the bar that holds the view being left. */
  const zoomOut = (focus: FocusAfter = null) => {
    if (stack.length > 1) return go(stack.slice(0, -1), focus);
    const i = LEVELS.indexOf(w.level);
    if (i > 0) pickLevel(LEVELS[i - 1], focus);
  };
  const canMove = (dir: -1 | 1) => canPan(w, dir, now, first);
  const move = (dir: -1 | 1) => {
    const next = panned(w, dir, now);
    if (next && canMove(dir)) go(trail(next, now, first));
  };
  const canZoomOut = stack.length > 1 || w.level !== "quarter";
  const deeper = finer(w.level);
  // Which sign-ups the chart and its table hold, for screen readers.
  const scope = city === null ? "" : city === NO_CITY ? " with no known city" : ` from ${cityLabel(city)}`;

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
  const tabStop = Math.min(active, n - 1);

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
        if (e.key !== "Escape" || !canZoomOut) return;
        e.preventDefault();
        // From a bar, stay in the plot on the bar just left; from the crumbs, on the current crumb;
        // from any other control, focus stays where it is.
        const from = e.target as Element;
        zoomOut(from.closest("svg") ? { bar: w.start } : from.closest("nav") ? "crumb" : null);
      }}
    >
      {/* Zoom level */}
      <div role="group" aria-label="Group sign-ups by" className="grid grid-cols-5 sm:flex gap-1 rounded-full bg-primary-100 p-1 sm:w-fit">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={w.level === l}
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
                  <span ref={crumbRef} tabIndex={-1} className="font-semibold text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 rounded" aria-current="page">
                    {s.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => go(stack.slice(0, i + 1), "crumb")} className="underline underline-offset-2 hover:text-primary-900">
                    {s.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex items-center gap-1">
          {/* aria-disabled, not disabled: a button that turns off under focus would drop focus to the page. */}
          <button type="button" onClick={() => move(-1)} aria-disabled={!canMove(-1)} aria-label="Earlier" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-primary-200 text-primary-700 hover:bg-primary-50 aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:cursor-default">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(1)} aria-disabled={!canMove(1)} aria-label="Later" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-primary-200 text-primary-700 hover:bg-primary-50 aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:cursor-default">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => canZoomOut && zoomOut()} aria-disabled={!canZoomOut} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full border border-primary-200 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:cursor-default">
            <ZoomOut className="w-4 h-4" aria-hidden /> Zoom out
          </button>
        </div>
      </div>

      {/* The number */}
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-1">
        <p ref={heroRef} tabIndex={-1} className="text-[40px] leading-none font-semibold text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 rounded">
          {sum.total.toLocaleString("en-IN")}
        </p>
        {city !== null && (
          <button
            type="button"
            // The chip goes away: keep focus on the number, which now counts everyone.
            onClick={() => {
              heroRef.current?.focus();
              setCity(null);
            }}
            className="mb-1 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-primary-900 text-white text-[13px] font-semibold" aria-label={`Showing ${city === NO_CITY ? "people with no known city" : cityLabel(city)} only. Show every city`}>
            {city === NO_CITY ? "No known city" : cityLabel(city)} <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
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
        {/* viewBox and width 100%: before it is measured, the first draw scales into the card instead of spilling out. */}
        <svg
          width={width}
          height={PLOT_H + AXIS_H}
          viewBox={`0 0 ${width} ${PLOT_H + AXIS_H}`}
          style={{ width: "100%", height: "auto" }}
          role="group"
          aria-label={`Sign-ups${scope} by ${LEVEL_NAMES[w.level].toLowerCase()}, ${w.label}. Use the table below for every value.`}
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
                // Keyed by level too, so a zoom draws new bars and focusing one fires onFocus (the tooltip).
                key={`${w.level}:${b.start}`}
                ref={(el) => {
                  barsRef.current[i] = el;
                }}
                role="button"
                tabIndex={i === tabStop ? 0 : -1}
                aria-label={what}
                aria-disabled={!deeper}
                onPointerEnter={() => setHover(i)}
                onPointerMove={() => hover !== i && setHover(i)}
                onFocus={() => {
                  setHover(i);
                  setActive(i);
                }}
                onBlur={() => setHover((x) => (x === i ? null : x))}
                // A bar that had focus (a click, or a screen reader's activation) keeps focus in the plot after the zoom.
                onClick={(e) => zoomIn(b, document.activeElement === e.currentTarget)}
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
            // The bar's own label already says this to screen readers.
            aria-hidden
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
            <caption className="sr-only">{`Sign-ups${scope}, ${w.label}`}</caption>
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

      <CityBreakdown people={inWindow} city={city} onCity={setCity} label={w.label} />

      <SignupPeople
        people={people}
        start={w.start}
        end={w.end}
        label={w.label}
        now={now}
        city={city}
        onShowAll={stack.length === 1 && w.level === "quarter" ? undefined : () => pickLevel("quarter")}
        focus={focus}
      />
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
        <p className="text-[13px] text-primary-500">New accounts over time and who they are, India time</p>
      </div>
      {children}
    </section>
  );
}
