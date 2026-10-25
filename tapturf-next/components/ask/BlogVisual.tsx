"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BlogVisual } from "@/lib/ask/blogTypes";
import { artBroken, knownArt, loadArt } from "./artLoad";
import { visualShows } from "./blogUi";

/**
 * The picture under an answer about a blog post: a bar chart of the
 * article's own numbers, its steps in order, two or three things side by
 * side, a few headline numbers, or an illustration Claude draws when the
 * reader asks to see something. Everything fits a 390px phone; a wide
 * table scrolls inside its own box, never the page.
 */
export function BlogVisualView({ visual }: { visual: BlogVisual }) {
  // The thread is kept in sessionStorage, so a reply saved by another
  // version of the chat can come back here: anything missing shows nothing
  // (the same check tells the answer card whether there's a visual at all).
  if (!visualShows(visual)) return null;
  switch (visual.kind) {
    case "bars":
      return <Bars v={visual} />;
    case "steps":
      return <Steps v={visual} />;
    case "compare":
      return <Compare v={visual} />;
    case "stats":
      return <Stats v={visual} />;
    case "art":
      return <Art key={visual.token} v={visual} />;
    default:
      return null;
  }
}

type Of<K extends BlogVisual["kind"]> = Extract<BlogVisual, { kind: K }>;

/** Title, an optional line under it, and an optional control on the right; the visual below. */
function Figure({ title, sub, action, children }: { title: string; sub?: string | null; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-primary-900 leading-snug">{title}</p>
          {sub && <p className="mt-0.5 text-[12px] text-primary-500 leading-snug">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Bars ───────────────────────────────────────────────────────────

/**
 * One series, so no legend: the title says what is plotted. Thin bars
 * grow from the left with a rounded end at the value, over a faint
 * track; labels and values stay in ink. The table view carries every
 * value in full for screen readers and for labels cut short.
 */
function Bars({ v }: { v: Of<"bars"> }) {
  const [table, setTable] = useState(false);
  const bars = v.bars
    .filter((b) => b && typeof b.label === "string" && Number.isFinite(b.value))
    .map((b) => ({ label: b.label, value: b.value, display: typeof b.display === "string" && b.display ? b.display : b.value.toLocaleString("en-IN") }));
  if (bars.length === 0) return null;
  const max = Math.max(0, ...bars.map((b) => b.value));
  // Every value cell holds all the values, the others invisible, so each
  // is as wide as the widest one and the tracks line up row to row.
  const displays = [...new Set(bars.map((b) => b.display))];
  const sub = [v.unit, v.note].filter(Boolean).join(" · ");
  // Venue names run long ("GSS Lords Big Box Cricket"): rather than cut
  // them beside the bar, each gets its own line over its bar.
  const stacked = bars.some((b) => b.label.length > 16);
  return (
    <Figure
      title={v.title}
      sub={sub}
      action={
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="-my-2.5 -mr-1.5 h-10 shrink-0 px-1.5 text-[12px] font-semibold text-accent-700 hover:text-accent-800 cursor-pointer transition-colors"
        >
          {table ? "Show as chart" : "Show as table"}
        </button>
      }
    >
      <div className="rounded-2xl border border-primary-100 bg-white px-3.5 py-2.5">
        {table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <caption className="sr-only">{v.title}</caption>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-primary-400">
                  <th scope="col" className="py-1.5 pr-3 text-left font-semibold">
                    <span className="sr-only">Item</span>
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold">
                    {v.unit || "Value"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bars.map((b, i) => (
                  <tr key={i} className="border-t border-primary-100 align-top">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-primary-800">
                      {b.label}
                    </th>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-primary-900 whitespace-nowrap">{b.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul role="list" aria-label={v.title} className={stacked ? "space-y-1.5" : "space-y-0.5"}>
            {bars.map((b, i) => {
              const pct = max > 0 && b.value > 0 ? (b.value / max) * 100 : 0;
              const label = (
                <span className={stacked ? "block text-[13px] leading-snug text-primary-800" : "w-[40%] shrink-0 truncate text-[13px] text-primary-800"} title={b.label}>
                  {b.label}
                  <span className="sr-only">: </span>
                </span>
              );
              const bar = (
                <>
                  <span className="h-2.5 min-w-0 flex-1 rounded-r-[4px] bg-primary-100/60" aria-hidden>
                    {/* At least a sliver for a small value, so it never reads as zero. */}
                    <span className="block h-full rounded-r-[4px] bg-accent-500 group-hover:bg-accent-600 transition-colors" style={{ width: pct > 0 ? `max(2px, ${pct.toFixed(2)}%)` : 0 }} />
                  </span>
                  {/* A long value ("₹1,000 on weekdays") wraps rather than squeezing the bar out. */}
                  <span className="grid max-w-[32%] shrink-0 items-center justify-items-end text-right text-[12px] font-semibold leading-tight tabular-nums text-primary-900">
                    {displays.map((d) => (
                      <span key={d} className={`col-start-1 row-start-1 ${d === b.display ? "" : "invisible"}`} aria-hidden={d === b.display ? undefined : true}>
                        {d}
                      </span>
                    ))}
                  </span>
                </>
              );
              return stacked ? (
                <li key={i} aria-label={`${b.label}: ${b.display}`} className="group py-1">
                  {label}
                  <span className="mt-1 flex items-center gap-2.5">{bar}</span>
                </li>
              ) : (
                <li key={i} aria-label={`${b.label}: ${b.display}`} className="group flex min-h-7 items-center gap-2.5 py-px">
                  {label}
                  {bar}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Figure>
  );
}

// ── Steps ──────────────────────────────────────────────────────────

function Steps({ v }: { v: Of<"steps"> }) {
  const steps = v.steps.filter((s) => s && typeof s.title === "string" && s.title.trim());
  if (steps.length === 0) return null;
  return (
    <Figure title={v.title}>
      <ol role="list" className="rounded-2xl border border-primary-100 bg-white px-3.5 py-3">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* The line down to the next number. */}
            {i < steps.length - 1 && <span aria-hidden className="absolute left-[11px] top-7 bottom-1 w-0.5 rounded-full bg-primary-200" />}
            <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-900 text-[12px] font-semibold text-white">{i + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[14px] font-semibold text-primary-900 leading-snug">{s.title}</p>
              {s.detail && <p className="mt-0.5 text-[13px] text-primary-500 leading-snug">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

// ── Side by side ───────────────────────────────────────────────────

/** Laid out like the turf comparison (AskResults CompareBlock): aspects down the side, the things compared across. */
function Compare({ v }: { v: Of<"compare"> }) {
  const rows = v.rows.filter((r) => r && Array.isArray(r.values));
  if (rows.length === 0) return null;
  return (
    <Figure title={v.title}>
      <div className="rounded-2xl border border-primary-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className={`w-full text-[13px] border-collapse ${v.columns.length >= 3 ? "min-w-[500px]" : ""}`}>
            <caption className="sr-only">{v.title}</caption>
            <thead>
              <tr className="bg-primary-50">
                <th scope="col" className="sticky left-0 bg-primary-50 px-3 py-2 w-[96px]">
                  <span className="sr-only">Aspect</span>
                </th>
                {v.columns.map((c, i) => (
                  <th key={i} scope="col" className="px-3 py-2 text-left font-semibold text-primary-900 align-bottom">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="align-top border-t border-primary-100">
                  <th scope="row" className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-primary-500">
                    {row.label}
                  </th>
                  {v.columns.map((_, i) => (
                    <td key={i} className="px-3 py-2 text-primary-800">
                      {row.values[i] || "Not listed"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

// ── Headline numbers ───────────────────────────────────────────────

function Stats({ v }: { v: Of<"stats"> }) {
  const stats = v.stats.filter((s) => s && typeof s.value === "string" && s.value.trim());
  if (stats.length === 0) return null;
  return (
    <Figure title={v.title}>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map((s, i) => (
          // The label comes first for screen readers ("Players a side, 6"); the number shows first.
          <div key={i} className="flex flex-col-reverse justify-end rounded-xl border border-primary-100 bg-white px-3 py-2.5">
            <dt className="mt-0.5 text-[12px] text-primary-500 leading-snug">{s.label}</dt>
            <dd className="font-display text-[20px] leading-tight text-primary-900 break-words">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Figure>
  );
}

// ── Illustration ───────────────────────────────────────────────────

/**
 * Drawn on demand: the answer carries a signed token, and the card gets
 * the drawing from /api/ask/art (artLoad.ts: it waits while another
 * request draws it, and remembers drawings and refusals for the visit).
 * It shows as an <img>, which can't run scripts or load anything, on top
 * of the server's own sanitising. A failure says so in a line.
 */
function Art({ v }: { v: Of<"art"> }) {
  const [art, setArt] = useState(() => knownArt(v.token));

  useEffect(() => {
    if (knownArt(v.token)) return;
    const stop = new AbortController();
    void loadArt(v.token, stop.signal).then((r) => {
      if (r.kind === "ok") setArt({ src: r.src });
      else if (r.kind === "failed") setArt("failed");
      // Stopped: the chat closed first. Nothing is kept, the next open asks again.
    });
    return () => stop.abort();
  }, [v.token]);

  if (art === "failed") return <p className="text-[13px] text-primary-500">Couldn&rsquo;t draw this one right now.</p>;
  return (
    <Figure title={v.title}>
      {art ? (
        <div className="rounded-2xl border border-primary-100 bg-white p-2 overflow-hidden">
          {/* A data URL of our own sanitised SVG: next/image has nothing to optimise. A tall one fits the screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.src}
            alt={v.alt}
            className="block w-full h-auto max-h-[70vh] object-contain rounded-xl"
            onError={() => {
              artBroken(v.token);
              setArt("failed");
            }}
          />
        </div>
      ) : (
        <div className="ask-skel relative aspect-[3/2] rounded-2xl flex items-center justify-center">
          <span className="text-[13px] text-primary-500">Drawing it&hellip;</span>
        </div>
      )}
    </Figure>
  );
}
