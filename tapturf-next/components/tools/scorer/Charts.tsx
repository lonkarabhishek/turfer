"use client";

import { useEffect, useRef, useState } from "react";
import type { InningsView, MatchView } from "@/lib/cricket/scoring";

/**
 * Manhattan (runs per over) and worm (runs as the overs go) for both
 * innings, as plain SVG. Two series: blue for the side that batted
 * first, orange for the chase (checked for colour blindness). Text stays
 * in ink, never in the series colour. Tap or hover a bar or a point on
 * the worm for the numbers; the Overs tab has every number as a list.
 */

export const SERIES = ["#2a78d6", "#eb6834"] as const;
const INK = "#1D1D1F";
const MUTED = "#6E6E73";
const GRID = "#E5E7EB";
const SURFACE = "#FFFFFF";

function useWidth<T extends HTMLElement>(initial = 340) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Round up to a clean axis maximum and a step giving 3 or 4 gridlines. */
function niceAxis(max: number): { top: number; step: number } {
  const m = Math.max(1, max);
  for (const step of [2, 5, 10, 20, 25, 50, 100]) {
    const top = Math.ceil(m / step) * step;
    if (top / step <= 4) return { top, step };
  }
  const step = Math.ceil(m / 4 / 100) * 100;
  return { top: step * 4, step };
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Legend({ innings, kind }: { innings: InningsView[]; kind: "bar" | "line" }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-primary-700">
      {innings.map((inn) => (
        <li key={inn.index} className="inline-flex items-center gap-1.5">
          {kind === "bar" ? <span className="w-3 h-3 rounded-[3px]" style={{ background: SERIES[inn.index] }} aria-hidden /> : <span className="w-4 h-[3px] rounded-full" style={{ background: SERIES[inn.index] }} aria-hidden />}
          <span className="font-semibold">{inn.battingName}</span>
          <span className="text-primary-500 tabular-nums">{inn.score}</span>
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: kind === "bar" ? INK : MUTED }} aria-hidden />
        <span>Wicket</span>
      </li>
    </ul>
  );
}

function overCount(view: MatchView) {
  return Math.max(view.setup.overs, ...view.innings.map((i) => Math.ceil(i.maxBalls / 6)), ...view.innings.map((i) => i.byOver.length), 1);
}

export function Manhattan({ view }: { view: MatchView }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const innings = view.innings.filter((i) => i.byOver.length > 0);
  const overs = overCount(view);
  const H = 190;
  const m = { l: 28, r: 6, t: 14, b: 24 };
  const pw = Math.max(80, width - m.l - m.r);
  const ph = H - m.t - m.b;
  const maxRuns = Math.max(6, ...innings.flatMap((i) => i.byOver.map((o) => o.runs)));
  const { top, step } = niceAxis(maxRuns);
  const band = pw / overs;
  const n = Math.max(1, innings.length);
  const barW = Math.max(3, Math.min(24, (band - 4 - (n - 1) * 2) / n));
  const groupW = n * barW + (n - 1) * 2;
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const labelEvery = overs <= 10 ? 1 : overs <= 20 ? 2 : 5;

  const readout = (o: number) =>
    view.innings
      .map((inn) => {
        const ov = inn.byOver[o - 1];
        return ov ? `${inn.battingName} ${ov.runs}${ov.wickets ? `, ${ov.wickets} wkt` : ""}${ov.complete ? "" : " so far"}` : null;
      })
      .filter(Boolean)
      .join(" · ");

  if (!innings.length) return <p className="text-[14px] text-primary-500">The chart fills in from the first ball.</p>;

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <span className="block text-[15px] font-bold text-primary-900">Runs per over</span>
        <Legend innings={innings} kind="bar" />
      </figcaption>
      <div ref={ref} className="w-full" onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}>
        <svg width={width} height={H} role="group" aria-label={`Runs per over for ${innings.map((i) => i.battingName).join(" and ")}`} className="block select-none">
          {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
              <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {v}
              </text>
            </g>
          ))}
          {Array.from({ length: overs }, (_, k) => k + 1).map((o) => {
            const x0 = m.l + (o - 1) * band;
            const gx = x0 + (band - groupW) / 2;
            const dim = sel !== null && sel !== o;
            return (
              <g key={o} opacity={dim ? 0.35 : 1}>
                {innings.map((inn, j) => {
                  const ov = inn.byOver[o - 1];
                  if (!ov) return null;
                  const bx = gx + j * (barW + 2);
                  const by = y(ov.runs);
                  return (
                    <g key={inn.index}>
                      <path d={barPath(bx, by, barW, m.t + ph - by)} fill={SERIES[inn.index]} />
                      {Array.from({ length: ov.wickets }, (_, w) => (
                        <circle key={w} cx={bx + barW / 2} cy={by - 7 - w * 10} r={4} fill={INK} stroke={SURFACE} strokeWidth={2} />
                      ))}
                    </g>
                  );
                })}
                {(o % labelEvery === 0 || o === 1) && (
                  <text x={x0 + band / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
                    {o}
                  </text>
                )}
                <rect
                  x={x0}
                  y={m.t}
                  width={band}
                  height={ph + m.b}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`Over ${o}: ${readout(o) || "not bowled"}`}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setSel(o)}
                  onClick={() => setSel(o)}
                  onFocus={() => setSel(o)}
                  className="outline-none cursor-pointer"
                />
              </g>
            );
          })}
          <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke="#D1D5DB" strokeWidth={1} />
        </svg>
      </div>
      <p className="mt-1 min-h-[20px] text-[13px] text-primary-700" aria-live="polite">
        {sel !== null ? (
          <>
            <span className="font-bold">Over {sel}</span> {readout(sel) ? `· ${readout(sel)}` : "· not bowled yet"}
          </>
        ) : (
          <span className="text-primary-500">Tap a bar for that over. Overs run along the bottom.</span>
        )}
      </p>
    </figure>
  );
}

type Pt = { runs: number; wkts: number; partial: boolean };

function valueAt(inn: InningsView, over: number): Pt | null {
  if (over === 0) return { runs: 0, wkts: 0, partial: false };
  const o = inn.byOver[over - 1];
  return o ? { runs: o.totalRuns, wkts: o.totalWickets, partial: !o.complete } : null;
}

export function Worm({ view }: { view: MatchView }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const innings = view.innings.filter((i) => i.legalBalls > 0 || i.runs > 0);
  const overs = overCount(view);
  const H = 210;
  const m = { l: 32, r: 14, t: 14, b: 24 };
  const pw = Math.max(80, width - m.l - m.r);
  const ph = H - m.t - m.b;
  const maxRuns = Math.max(10, ...view.innings.map((i) => Math.max(i.runs, i.target ?? 0)));
  const { top, step } = niceAxis(maxRuns);
  const x = (balls: number) => m.l + (balls / (overs * 6)) * pw;
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const xStep = overs <= 10 ? 1 : overs <= 20 ? 2 : 5;

  if (!innings.length) return <p className="text-[14px] text-primary-500">The worm starts with the first ball.</p>;

  const pick = (clientX: number, el: SVGRectElement) => {
    const r = el.getBoundingClientRect();
    const ov = Math.round(((clientX - r.left) / r.width) * overs);
    setSel(Math.max(0, Math.min(overs, ov)));
  };
  const readout = (o: number) =>
    innings
      .map((inn) => {
        const v = valueAt(inn, o);
        return v ? `${inn.battingName} ${v.runs}/${v.wkts}${v.partial ? " (in progress)" : ""}` : null;
      })
      .filter(Boolean)
      .join(" · ");

  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <span className="block text-[15px] font-bold text-primary-900">Worm: runs as the overs go</span>
        <Legend innings={innings} kind="line" />
      </figcaption>
      <div ref={ref} className="w-full">
        <svg width={width} height={H} role="img" aria-label={`Worm chart. ${innings.map((i) => `${i.battingName} ${i.score} in ${i.overs} overs`).join(". ")}`} className="block select-none touch-pan-y">
          {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + pw} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
              <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {v}
              </text>
            </g>
          ))}
          {Array.from({ length: Math.floor(overs / xStep) + 1 }, (_, i) => i * xStep).map((o) => (
            <text key={o} x={x(o * 6)} y={H - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
              {o}
            </text>
          ))}
          <line x1={m.l} x2={m.l + pw} y1={m.t + ph} y2={m.t + ph} stroke="#D1D5DB" strokeWidth={1} />
          {sel !== null && <line x1={x(sel * 6)} x2={x(sel * 6)} y1={m.t} y2={m.t + ph} stroke="#9CA3AF" strokeWidth={1} />}
          {innings.map((inn) => {
            // Wickets are points on the line too, so the dots sit on it.
            const all = [...inn.worm.map((p) => ({ balls: p.balls, runs: p.runs })), ...inn.fow.map((w) => ({ balls: w.balls, runs: w.runs }))].sort((a, b) => a.balls - b.balls || a.runs - b.runs);
            const pts = all.map((p) => `${x(p.balls).toFixed(1)},${y(p.runs).toFixed(1)}`).join(" ");
            return (
              <g key={inn.index}>
                <polyline points={pts} fill="none" stroke={SERIES[inn.index]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {inn.fow.map((w) => (
                  <circle key={w.wicket} cx={x(w.balls)} cy={y(w.runs)} r={4} fill={SERIES[inn.index]} stroke={SURFACE} strokeWidth={2} />
                ))}
              </g>
            );
          })}
          {sel !== null &&
            innings.map((inn) => {
              const v = valueAt(inn, sel);
              if (!v) return null;
              const bx = v.partial ? inn.legalBalls : sel * 6;
              return <circle key={inn.index} cx={x(bx)} cy={y(v.runs)} r={5} fill={SERIES[inn.index]} stroke={SURFACE} strokeWidth={2} />;
            })}
          <rect
            x={m.l}
            y={m.t}
            width={pw}
            height={ph}
            fill="transparent"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}
          />
        </svg>
      </div>
      <p className="mt-1 min-h-[20px] text-[13px] text-primary-700" aria-live="polite">
        {sel !== null ? (
          <>
            <span className="font-bold">After {sel} {sel === 1 ? "over" : "overs"}</span> · {readout(sel) || "not reached yet"}
          </>
        ) : (
          <span className="text-primary-500">Touch the chart to compare both sides at any over. Dots are wickets.</span>
        )}
      </p>
    </figure>
  );
}
