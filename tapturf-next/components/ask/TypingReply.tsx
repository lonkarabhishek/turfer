"use client";

import { useEffect, useEffectEvent, useMemo, useRef } from "react";

const BALL = 9; // px, sized to the 15px reply text
const DROP = 80; // ms the ball takes to fall onto the first letter
const CAP = 1500; // ms: however long the reply, it is all typed by then
const LEAD = 25; // ms a letter starts fading in before the ball reaches it
const MIN_HOP = 80; // ms: shorter words share one hop, so the ball never jitters
const MAX_HOP = 240; // ms: long words get a second landing mid-word
const SQUASH = 28; // ms either side of a landing that the ball squashes
const END = [170, 90, 150]; // ms: hop off the last letter, little bounce, roll away

const SPACE = /\s/;

/** Splits by grapheme so Devanagari clusters and emoji never break apart. */
function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  }
  // Older browsers: keep marks, joiners, skin tones and conjuncts on the letter before.
  const out: string[] = [];
  for (const ch of s) {
    const prev = out[out.length - 1];
    if (prev && (/[\p{M}\u200d\u{1f3fb}-\u{1f3ff}]/u.test(ch) || /[\u200d\u094d]$/.test(prev))) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Where each grapheme sits in the layer: centre x, the top of its glyphs, its baseline, its line. */
type Geo = { x: number[]; top: number[]; base: number[]; line: number[]; width: number };

function measure(layer: HTMLElement, spans: HTMLElement[]): Geo {
  const o = layer.getBoundingClientRect();
  const geo: Geo = { x: [], top: [], base: [], line: [], width: o.width };
  let line = 0;
  let mid = Number.NEGATIVE_INFINITY;
  for (const s of spans) {
    const r = s.getBoundingClientRect();
    const m = r.top + r.height / 2 - o.top;
    if (m > mid + r.height / 2) {
      if (geo.line.length) line++;
      mid = m;
    }
    geo.x.push(r.left - o.left + r.width / 2);
    // The ball lands on top of the lowercase letters and rests on the baseline.
    geo.top.push(r.top - o.top + r.height * 0.24);
    geo.base.push(r.top - o.top + r.height * 0.8);
    geo.line.push(line);
  }
  return geo;
}

/**
 * When the ball reaches each grapheme (ms). About 33 to 42 a second, a
 * beat after a full stop or comma and time for the hop down at each line
 * end; long replies speed up to fit the cap, pauses capped at a third.
 */
function schedule(gs: string[], line: number[]): number[] {
  const n = gs.length;
  const gap = [0];
  let prev = 0;
  for (let i = 1; i < n; i++) {
    const space = SPACE.test(gs[i]);
    let ms = 0;
    if (space && /[.!?।]/.test(gs[i - 1])) ms += 90;
    else if (space && /[,;:]/.test(gs[i - 1])) ms += 40;
    if (!space && line[i] !== line[prev]) ms += 80;
    gap.push(ms);
    if (!space) prev = i;
  }
  const budget = CAP - DROP;
  let pauses = gap.reduce((a, b) => a + b, 0);
  let per = n < 30 ? 30 : 24;
  if ((n - 1) * per + pauses > budget) {
    const k = Math.min(1, (budget / 3) / (pauses || 1));
    pauses *= k;
    for (let i = 0; i < n; i++) gap[i] *= k;
    per = (budget - pauses) / Math.max(1, n - 1);
  }
  const at = [DROP];
  for (let i = 1; i < n; i++) at.push(at[i - 1] + per + gap[i]);
  return at;
}

/** Graphemes the ball lands on: word starts, plus both ends of every line so it hops down to the next. */
function landings(gs: string[], line: number[], at: number[]): number[] {
  const out: number[] = [];
  const forced = new Set<number>();
  let prev = -1;
  for (let i = 0; i < gs.length; i++) {
    if (SPACE.test(gs[i])) continue;
    const since = out.length ? at[i] - at[out[out.length - 1]] : 0;
    if (prev < 0) out.push(i);
    else if (line[i] !== line[prev]) {
      if (out[out.length - 1] !== prev) out.push(prev);
      out.push(i);
      forced.add(prev).add(i);
    } else if (since >= MAX_HOP || (SPACE.test(gs[i - 1]) && since >= MIN_HOP)) out.push(i);
    prev = i;
  }
  if (prev >= 0 && out[out.length - 1] !== prev) {
    // A tiny last hop reads as a twitch: stretch the one before it instead.
    const before = out[out.length - 1];
    if (out.length > 1 && !forced.has(before) && at[prev] - at[before] < MIN_HOP / 2) out.pop();
    out.push(prev);
  }
  return out;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const arc = (u: number) => 4 * u * (1 - u);
const squash = (d: number, w: number) => Math.max(0, 1 - d / w);

type Pose = { x: number; y: number; c: number; air: number; op: number };

/** The ball at time t: x, the y of its bottom, how squashed (c) or stretched (air), opacity. */
function pose(t: number, geo: Geo, hops: number[], at: number[]): Pose {
  const first = hops[0];
  const last = hops[hops.length - 1];
  if (t < at[first]) {
    const u = Math.max(0, t / at[first]);
    // From hop height, so it starts clear of the "TapTurf" label above.
    return { x: geo.x[first], y: geo.top[first] - 5 * (1 - u * u), c: squash(at[first] - t, 30), air: u, op: Math.min(1, u * 3) };
  }
  if (t < at[last]) {
    let k = 0;
    while (k < hops.length - 2 && at[hops[k + 1]] <= t) k++;
    const a = hops[k];
    const b = hops[k + 1];
    const dt = at[b] - at[a];
    const u = (t - at[a]) / dt;
    const cross = geo.line[a] !== geo.line[b];
    // Low hops: any higher and the ball reaches into the line above (or the "TapTurf" label).
    const h = Math.max(3.5, Math.min(5, dt * 0.05));
    let x: number;
    let y: number;
    if (cross) {
      // Drop to the next line first, then run back along it while it is
      // still blank, so the ball never sweeps over the line just typed.
      const w = Math.max(0, (u - 0.35) / 0.65);
      x = lerp(geo.x[a], geo.x[b], w * w * (3 - 2 * w));
      y = lerp(geo.top[a], geo.top[b], 1 - (1 - u) ** 3);
    } else {
      // Grapheme by grapheme, so each letter appears right under the ball.
      let i = a;
      while (i < b - 1 && at[i + 1] <= t) i++;
      x = lerp(geo.x[i], geo.x[i + 1], Math.min(1, (t - at[i]) / (at[i + 1] - at[i] || 1)));
      y = lerp(geo.top[a], geo.top[b], u) - h * arc(u);
    }
    const c = squash(Math.min(t - at[a], at[b] - t), Math.min(SQUASH, dt * 0.25));
    return { x, y, c, air: Math.abs(1 - 2 * u) * (1 - c) * (cross ? 1 : h / 8), op: 1 };
  }
  // The end: hop off the last letter onto the line beside it, a little bounce, roll away.
  const e = t - at[last];
  const x0 = geo.x[last];
  const room = geo.width - BALL / 2 - x0 >= 22;
  const dx = room ? 12 : 0;
  const g0 = geo.top[last];
  const g1 = room ? geo.base[last] : g0;
  if (e < END[0]) {
    const u = e / END[0];
    return { x: x0 + dx * u, y: lerp(g0, g1, u) - 7 * arc(u), c: squash(Math.min(e, END[0] - e), 34), air: Math.abs(1 - 2 * u) * 0.6, op: 1 };
  }
  if (e < END[0] + END[1]) {
    const u = (e - END[0]) / END[1];
    return { x: x0 + dx + 3 * u, y: g1 - 2.5 * arc(u), c: squash(Math.min(e - END[0], END[0] + END[1] - e), 24) * 0.7, air: 0, op: 1 };
  }
  const u = Math.min(1, (e - END[0] - END[1]) / END[2]);
  return { x: x0 + dx + 3 + 8 * (1 - (1 - u) * (1 - u)), y: g1, c: 0, air: 0, op: 1 - u };
}

/**
 * The newest reply typed in letter by letter, with a tennis ball hopping
 * along the words like a karaoke ball. The real text is in the page from
 * the start (it keeps the space and is what screen readers get); the
 * typing layer on top is decoration. Tap to finish. With play off it is
 * just the text.
 */
export function TypingReply({ text, play, onReveal, onDone }: { text: string; play: boolean; onReveal: () => void; onDone: () => void }) {
  const gs = useMemo(() => (play ? graphemes(text) : []), [text, play]);
  const layerRef = useRef<HTMLSpanElement>(null);
  const ballRef = useRef<HTMLSpanElement>(null);
  const reveal = useEffectEvent(onReveal);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    const layer = layerRef.current;
    const ball = ballRef.current;
    const felt = ball?.firstElementChild as HTMLElement | null;
    if (!play || !layer || !ball || !felt || !gs.length) return;
    const spans = Array.from(layer.children).filter((el) => el !== ball) as HTMLElement[];
    let geo = measure(layer, spans);
    const at = schedule(gs, geo.line);
    let hops = landings(gs, geo.line, at);
    if (!hops.length) {
      finish();
      return;
    }
    // Panel resized or rotated: the text rewraps, so measure again.
    const ro = new ResizeObserver(() => {
      geo = measure(layer, spans);
      hops = landings(gs, geo.line, at);
    });
    ro.observe(layer);

    const n = spans.length;
    // Subline and cards start fading in two thirds of the way through.
    const revealAt = DROP + (at[n - 1] - DROP) * (2 / 3);
    const end = at[hops[hops.length - 1]] + END[0] + END[1] + END[2];
    let shown = 0;
    let told = false;
    let start = -1;
    let raf = 0;
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = now - start;
      while (shown < n && at[shown] - LEAD <= t) spans[shown++].classList.add("on");
      if (!told && t >= revealAt) {
        told = true;
        reveal();
      }
      if (t >= end) {
        if (!told) reveal();
        finish();
        return;
      }
      const p = pose(t, geo, hops, at);
      const x = Math.max(BALL / 2, Math.min(geo.width - BALL / 2, p.x));
      const sx = (1 + 0.24 * p.c) * (1 - 0.08 * p.air);
      const sy = (1 - 0.22 * p.c) * (1 + 0.12 * p.air);
      ball.style.opacity = String(p.op);
      ball.style.transform = `translate3d(${(x - BALL / 2).toFixed(2)}px,${(p.y - BALL).toFixed(2)}px,0) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
      felt.style.transform = `rotate(${Math.round(t * 0.8)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [play, gs]);

  return (
    <span
      className="ask-type"
      data-typing={play ? "" : undefined}
      onClick={
        play
          ? () => {
              onReveal();
              onDone();
            }
          : undefined
      }
    >
      <span className="ask-type-text">{text}</span>
      {play && (
        <span ref={layerRef} className="ask-type-layer" aria-hidden>
          {gs.map((g, i) => (
            <span key={i} className="ask-g">
              {g}
            </span>
          ))}
          <span ref={ballRef} className="ask-ball">
            <i />
          </span>
        </span>
      )}
    </span>
  );
}
