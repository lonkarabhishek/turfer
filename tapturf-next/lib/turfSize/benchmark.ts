// How big a ground is, in words and against other turfs, and what it suits:
// the one place the turf page's Ground size card and the owner's preview on
// myTapturf take these from. Pure, relative imports only (npm run test:turf).
//
// The size words come from fixed bands until enough turfs have sizes; from
// BENCHMARK_MIN_TURFS turfs with a size, each one also says where it sits
// among them ("Longer than 72% of turfs in Nashik"): the turf's own city
// when CITY_MIN_TURFS turfs there have one, else all of India. All of
// these are starting values, easy to tune.
//
// What a ground suits follows the site owner's rules of thumb (2 Nov 2026),
// worded as guidance:
//   higher nets are better for cricket (lofted shots stay in play);
//   longer is usually better; wider means more singles and doubles;
//   long but low: good for football, not great for cricket;
//   high but short: not great for adult cricket (the boundary is close, a
//   mistimed shot can still go for six), good for football and for
//   under-14/16 cricket;
//   long, wide and high: great for adult cricket and football.
// Short and narrow without high nets: only OK, for small-sided football (a
// small cage is not "good for football" just for being a cage).
// No height given (an open ground): judged on length and width, and it says so.

import { type Dim, type Ground, type Unit, fromFeet, shown, sizeLine, tenth } from "./sizes";

/** Feet. Below `low` is the first word, above `high` the last, from low to high inclusive the middle one. */
export const SIZE_BANDS: Record<Dim, { low: number; high: number; words: readonly [string, string, string] }> = {
  length: { low: 100, high: 140, words: ["Short", "Medium", "Long"] },
  width: { low: 55, high: 80, words: ["Narrow", "Medium", "Wide"] },
  height: { low: 25, high: 40, words: ["Low", "Medium", "High"] },
};
/** Turfs with a size (all of India) before any percentile is shown. */
export const BENCHMARK_MIN_TURFS = 20;
/** Turfs with a size in the turf's city before the comparison is with its city rather than India. */
export const CITY_MIN_TURFS = 10;

/** Longer (or shorter) than at least this share of the others before it says so; in between it is "about as long as most". */
export const CLEAR_PCT = 60;

/** 0 short / narrow / low, 1 medium, 2 long / wide / high. */
export type Level = 0 | 1 | 2;
export function levelOf(dim: Dim, ft: number): Level {
  const b = SIZE_BANDS[dim];
  return ft < b.low ? 0 : ft > b.high ? 2 : 1;
}
export const sizeWord = (dim: Dim, ft: number): string => SIZE_BANDS[dim].words[levelOf(dim, ft)];

/** Where the meters start and end (feet): sizes past these sit at the meter's ends. */
const METER_ENDS: Record<Dim, { min: number; max: number }> = {
  length: { min: 60, max: 220 },
  width: { min: 30, max: 120 },
  height: { min: 12, max: 60 },
};

/** The size's place on a meter of three equal parts (the bands), 0 to 1. */
export function meterPos(dim: Dim, ft: number): number {
  const b = SIZE_BANDS[dim];
  const e = METER_ENDS[dim];
  const level = levelOf(dim, ft);
  const [lo, hi] = level === 0 ? [e.min, b.low] : level === 1 ? [b.low, b.high] : [b.high, e.max];
  const within = Math.min(1, Math.max(0, (ft - lo) / (hi - lo)));
  return Math.round(((level + within) / 3) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Other turfs                                                         */
/* ------------------------------------------------------------------ */

/** One turf with sizes, as the benchmark compares it: its largest of each (a turf with two boxes is as long as its longer one). */
export type PeerTurf = { id: string; city: string | null; length: number; width: number; height: number | null };

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/**
 * public.turf_ground_size_peers(): [[turf id, city, [[length, width, height], ...]], ...]
 * for every active turf whose owner saved sizes. Anything malformed is left out.
 */
export function peersFrom(raw: unknown): PeerTurf[] {
  if (!Array.isArray(raw)) return [];
  const out: PeerTurf[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || !Array.isArray(row[2])) continue;
    let length = 0;
    let width = 0;
    let height: number | null = null;
    for (const g of row[2]) {
      if (!Array.isArray(g)) continue;
      const l = finite(g[0]);
      const w = finite(g[1]);
      if (l == null || w == null) continue;
      length = Math.max(length, l);
      width = Math.max(width, w);
      const h = finite(g[2]);
      if (h != null) height = Math.max(height ?? 0, h);
    }
    if (length > 0) out.push({ id: row[0], city: typeof row[1] === "string" && row[1] ? row[1] : null, length, width, height });
  }
  return out;
}

/** Where a ground sits among other turfs on one size: more (longer...) than pct% of them, less than pct%, or about the same as most. */
export type Benchmark = { dir: "more" | "less" | "same"; pct: number; place: "city" | "india"; city: string | null; n: number };

/**
 * A ground's place among the other turfs with sizes, size by size: none
 * until BENCHMARK_MIN_TURFS turfs have that size; the turf's city once
 * CITY_MIN_TURFS turfs there have it (this turf counted), else all of
 * India. The turf itself is never one of the turfs it is compared with.
 */
export function benchmarkOf(g: Ground, turf: { id: string; city: string | null }, peers: readonly PeerTurf[]): Partial<Record<Dim, Benchmark>> {
  const out: Partial<Record<Dim, Benchmark>> = {};
  const value: Record<Dim, number | null> = { length: g.length_ft, width: g.width_ft, height: g.height_ft };
  for (const dim of ["length", "width", "height"] as const) {
    const x = value[dim];
    if (x == null) continue;
    const having = peers.filter((p) => p[dim] != null);
    // This turf counts towards the thresholds, whether or not the peers' copy has caught up with it.
    const withSelf = (list: readonly PeerTurf[]) => list.length + (list.some((p) => p.id === turf.id) ? 0 : 1);
    if (withSelf(having) < BENCHMARK_MIN_TURFS) continue;
    const inCity = turf.city ? having.filter((p) => p.city === turf.city) : [];
    const place = turf.city && withSelf(inCity) >= CITY_MIN_TURFS ? "city" : "india";
    const others = (place === "city" ? inCity : having).filter((p) => p.id !== turf.id).map((p) => p[dim] as number);
    if (others.length === 0) continue;
    const below = others.filter((v) => v < x).length;
    const above = others.filter((v) => v > x).length;
    const pBelow = Math.round((100 * below) / others.length);
    const pAbove = Math.round((100 * above) / others.length);
    const b = { place, city: place === "city" ? turf.city : null, n: others.length } as const;
    out[dim] = pBelow >= CLEAR_PCT ? { dir: "more", pct: pBelow, ...b } : pAbove >= CLEAR_PCT ? { dir: "less", pct: pAbove, ...b } : { dir: "same", pct: 0, ...b };
  }
  return out;
}

const COMPARE: Record<Dim, { more: string; less: string; same: string }> = {
  length: { more: "Longer than", less: "Shorter than", same: "About as long as most turfs" },
  width: { more: "Wider than", less: "Narrower than", same: "About as wide as most turfs" },
  height: { more: "Higher than", less: "Lower than", same: "About as high as most turfs" },
};

/** "Longer than 72% of turfs in Nashik" ("than any other turf" at 100%). cityLabel turns a city id into its name. */
export function benchmarkText(dim: Dim, b: Benchmark, cityLabel: (id: string) => string): string {
  const where = b.place === "city" && b.city ? `in ${cityLabel(b.city)}` : "across India";
  if (b.dir === "same") return `${COMPARE[dim].same} ${where}`;
  if (b.pct === 100) return `${COMPARE[dim][b.dir]} any other turf ${where}`;
  return `${COMPARE[dim][b.dir]} ${b.pct}% of turfs ${where}`;
}

/** "Compared with the 34 other turfs in Nashik whose owners shared their size on TapTurf." */
export function benchmarkNote(b: Benchmark, cityLabel: (id: string) => string): string {
  const where = b.place === "city" && b.city ? ` in ${cityLabel(b.city)}` : " across India";
  return `Compared with the ${b.n} other turf${b.n === 1 ? "" : "s"}${where} whose owners shared their size on TapTurf.`;
}

/**
 * The note under the card for every comparison it shows: the turfs they
 * compare with, when all of them compare with the same ones. Each size picks
 * its own (net height counts only turfs that gave one, and may fall back to
 * India), so when they differ the note says each line names its place. null
 * without any comparison.
 */
export function benchmarksNote(bs: readonly Benchmark[], cityLabel: (id: string) => string): string | null {
  if (bs.length === 0) return null;
  const same = bs.every((b) => b.place === bs[0].place && b.city === bs[0].city && b.n === bs[0].n);
  return same ? benchmarkNote(bs[0], cityLabel) : "Compared with other turfs whose owners shared their size on TapTurf, in the place each line names.";
}

/** The middle turf of the place a benchmark compares with (length and width), for the dashed outline; null without one. */
export function middleTurf(turf: { id: string; city: string | null }, peers: readonly PeerTurf[], b: Benchmark | undefined): { length: number; width: number } | null {
  if (!b) return null;
  const set = peers.filter((p) => p.id !== turf.id && (b.place === "india" || p.city === b.city));
  if (set.length === 0) return null;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, c) => a - c);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return { length: Math.round(median(set.map((p) => p.length))), width: Math.round(median(set.map((p) => p.width))) };
}

/** A mid-size turf (the middle of the medium bands), when there is no middle turf to draw. */
export const MID_TURF = {
  length: Math.round((SIZE_BANDS.length.low + SIZE_BANDS.length.high) / 2),
  width: Math.round((SIZE_BANDS.width.low + SIZE_BANDS.width.high) / 2),
} as const;

/* ------------------------------------------------------------------ */
/* What a ground suits                                                 */
/* ------------------------------------------------------------------ */

export type Tone = "great" | "good" | "ok" | "poor";
export type Chip = { id: "cricket" | "juniors" | "football" | "running"; text: string; tone: Tone };
export type Suitability = { summary: string; chips: Chip[]; reasons: string[] };

/** Which of the two sports to judge: the ground's own, else the turf's (both when it lists neither, or nothing). */
export function sportsFor(g: Ground, turfSports: readonly string[]): { cricket: boolean; football: boolean } {
  if (g.sport === "cricket") return { cricket: true, football: false };
  if (g.sport === "football") return { cricket: false, football: true };
  if (g.sport === "both") return { cricket: true, football: true };
  const cricket = turfSports.some((s) => /cricket/i.test(s));
  const football = turfSports.some((s) => /football|futsal|soccer/i.test(s));
  if (turfSports.length === 0) return { cricket: true, football: true };
  return { cricket, football };
}

const SHAPE = {
  length: ["Short", "Mid-length", "Long"],
  width: ["narrow", "mid-width", "wide"],
  height: ["low", "mid-height", "high"],
} as const;

const CRICKET_CHIP: Record<Tone, string> = {
  great: "Great for adult cricket",
  good: "Good for adult cricket",
  ok: "OK for adult cricket",
  poor: "Not great for adult cricket",
};

/** A ground's bands, and how it does for adult cricket, junior cricket and football. */
function grades(g: Ground) {
  const L = levelOf("length", g.length_ft);
  const W = levelOf("width", g.width_ft);
  const H: Level | null = g.height_ft == null ? null : levelOf("height", g.height_ft);
  // Adult cricket: the boundary (length) first, then the nets (height), then the room to run (width).
  let adult: Tone;
  if (L === 0) adult = "poor";
  else if (H === 0) adult = "poor";
  else if (L === 2 && H === 2) adult = W === 0 ? "good" : "great";
  else if (L === 2 || H === 2) adult = "good";
  else adult = "ok";
  const juniors = L === 0 && H !== 0;
  // Short and narrow: room for a small game only, unless the nets are high (short and high is good for football).
  const football: Tone = L === 2 && W > 0 ? "great" : L === 0 && W === 0 && H !== 2 ? "ok" : "good";
  return { L, W, H, adult, juniors, football };
}

const FOOTBALL_CHIP: Record<Tone, string> = {
  great: "Great for football",
  good: "Good for football",
  ok: "OK for small-sided football",
  poor: "Not great for football",
};
const SMALL_FOOTBALL = "Short and narrow: suits small-sided football with fewer players.";

/**
 * The one-line summary, chips and short reasons for one ground. Cricket is
 * judged only where the ground or the turf is for cricket, football the same.
 */
export function suitability(g: Ground, sports: { cricket: boolean; football: boolean }): Suitability {
  const gr = grades(g);
  const { L, W, H, adult, juniors, football } = gr;
  const chips: Chip[] = [];
  const reasons: string[] = [];

  if (sports.cricket) {
    chips.push({ id: "cricket", text: CRICKET_CHIP[adult], tone: adult });
    if (juniors) chips.push({ id: "juniors", text: "Good for juniors (U14-16)", tone: "good" });
  }
  if (sports.football) chips.push({ id: "football", text: FOOTBALL_CHIP[football], tone: football });
  if (sports.cricket && W === 2) chips.push({ id: "running", text: "Lots of singles and doubles", tone: "great" });

  if (sports.cricket) {
    if (L === 0) {
      reasons.push(
        H === 0
          ? "Short and low: the boundary is close and lofted shots hit the net or roof."
          : "Short: the boundary is close, so even a mistimed shot can go for six. Fine for under-14 and under-16 players.",
      );
    } else {
      reasons.push(L === 2 ? "Long: room for big shots before the boundary." : "Medium length: a fair boundary for box cricket.");
      if (H === 0) reasons.push("Low nets: lofted shots hit the net or roof, which suits football more than cricket.");
      else if (H === 2) reasons.push("High nets: lofted shots stay in play.");
      else if (H === 1) reasons.push("Medium net height: the highest lofted shots may hit the net.");
    }
    reasons.push(W === 2 ? "Wide: more room to run singles and doubles." : W === 1 ? "Medium width: room for some singles and doubles." : "Narrow: fewer singles and doubles.");
    if (sports.football && football === "ok") reasons.push(SMALL_FOOTBALL);
  } else if (sports.football) {
    if (football === "ok") reasons.push(SMALL_FOOTBALL);
    else {
      reasons.push(L === 2 ? "Long: room for a bigger game." : L === 1 ? "Medium length: a good size for small-sided football." : "Short: suits small-sided football.");
      if (W === 0) reasons.push("Narrow: less room out wide.");
    }
  }
  if (sports.football && sports.cricket && H === 0 && L > 0) reasons.push("Low nets matter less for football, where the ball mostly stays down.");
  if (H === null) reasons.push("No net height given, so this is judged on length and width only.");

  const shape = H === null ? `${SHAPE.length[L]} and ${SHAPE.width[W]}` : `${SHAPE.length[L]}, ${SHAPE.width[W]} and ${SHAPE.height[H]}`;
  const v = verdict(sports, gr);
  return { summary: v ? `${shape}: ${v}.` : `${shape}.`, chips, reasons };
}

/** What a ground suits, as said after the colon ("great for adult cricket and football"); null when neither sport is judged. */
function verdict(sports: { cricket: boolean; football: boolean }, { adult, juniors, football }: ReturnType<typeof grades>): string | null {
  const fb = football === "ok" ? FOOTBALL_CHIP.ok : FOOTBALL_CHIP[football].toLowerCase();
  if (sports.cricket && sports.football) {
    if (adult === "great") return "great for adult cricket and football";
    if (adult === "good") return football === "great" ? "good for adult cricket, great for football" : "good for adult cricket and football";
    if (adult === "ok") return `OK for adult cricket, ${fb}`;
    if (juniors) return football === "ok" ? `good for junior cricket, ${fb}` : `${fb} and junior cricket`;
    return `${fb}, not great for cricket`;
  }
  if (sports.cricket) return adult === "poor" ? (juniors ? "good for junior cricket, short for adults" : "not great for cricket") : CRICKET_CHIP[adult].toLowerCase().replace(/^ok/, "OK");
  if (sports.football) return fb;
  return null;
}

/** One ground in a sentence, in the pieces the card styles: who, its size in the owner's unit, the same in the other unit, and the rest. */
export type GroundSentence = { subject: string; size: string; other: string; rest: string };

/**
 * "Box 1 is 120 ft long, 70 ft wide and 40 ft high (36.6 × 21.3 × 12.2 m):
 * great for adult cricket, lots of singles and doubles." The plain-text line
 * the turf page's card shows for each ground and its JSON-LD carries
 * (amenityFeature, lib/utils/seo.ts), so a crawler that reads no SVG and runs
 * no script still gets the size and what it suits. No benchmarks: they
 * change as other turfs add sizes.
 */
export function groundSentenceParts(g: Ground, index: number, count: number, unit: Unit, sports: { cricket: boolean; football: boolean }): GroundSentence {
  const u = (ft: number) => `${shown(fromFeet(ft, unit))} ${unit}`;
  const gr = grades(g);
  const suits = [verdict(sports, gr), sports.cricket && gr.W === 2 ? "lots of singles and doubles" : null].filter((x): x is string => !!x);
  return {
    subject: g.name ?? (count > 1 ? `Ground ${index + 1}` : "The ground"),
    size: g.height_ft == null ? `${u(g.length_ft)} long and ${u(g.width_ft)} wide` : `${u(g.length_ft)} long, ${u(g.width_ft)} wide and ${u(g.height_ft)} high`,
    other: `(${sizeLine(g, unit === "m" ? "ft" : "m")})`,
    rest: `${g.height_ft == null ? ", with no net height given" : ""}${suits.length ? `: ${suits.join(", ")}` : ""}.`,
  };
}

/** The pieces as the one line of text the card reads as. */
export const sentenceText = (p: GroundSentence): string => `${p.subject} is ${p.size} ${p.other}${p.rest}`;

export function groundSentence(g: Ground, index: number, count: number, unit: Unit, sports: { cricket: boolean; football: boolean }): string {
  return sentenceText(groundSentenceParts(g, index, count, unit, sports));
}

/* ------------------------------------------------------------------ */
/* Drawings                                                            */
/* ------------------------------------------------------------------ */

/** A 22-yard pitch, narrowed to fit a short box. */
export const PITCH_FT = { length: 66, width: 10 } as const;
export const PLAYER_FT = 6;
/** The side view's height: nets up to this many feet share one scale. */
export const SIDE_FRAME_FT = 60;

/**
 * The top view: the ground and a dashed reference turf (`ref`) to one
 * scale, centred on each other, in a box `w` wide. Feet times `s` are
 * drawing units; the drawing is `h` tall. `frame` (the turf's largest
 * ground) gives every ground of a turf the same scale.
 */
export function topView(g: Ground, ref: { length: number; width: number }, frame: { length: number; width: number } | null = null, w = 320, pad = 12) {
  const maxL = Math.max(g.length_ft, ref.length, frame?.length ?? 0);
  const maxW = Math.max(g.width_ft, ref.width, frame?.width ?? 0);
  // The longer side across; never taller than half the width again, so a square box stays small.
  const s = Math.min((w - 2 * pad) / maxL, (w * 0.55) / maxW);
  const h = Math.ceil(maxW * s + 2 * pad);
  const cx = w / 2;
  const cy = h / 2;
  const rect = (l: number, wd: number) => ({ x: tenth(cx - (l * s) / 2), y: tenth(cy - (wd * s) / 2), w: tenth(l * s), h: tenth(wd * s) });
  const pitchL = Math.min(PITCH_FT.length, g.length_ft * 0.6);
  return { w, h, s, ground: rect(g.length_ft, g.width_ft), ref: rect(ref.length, ref.width), pitch: rect(pitchL, Math.min(PITCH_FT.width, g.width_ft * 0.2)) };
}

/** "6½": a number of players to the nearest half. */
export function halves(x: number): string {
  const r = Math.round(x * 2) / 2;
  const whole = Math.floor(r);
  return r === whole ? String(whole) : whole === 0 ? "½" : `${whole}½`;
}

/** The side view: net height against a 6 ft player, in a box `w` by `h`, the ground line at `base`. */
export function sideView(heightFt: number, w = 120, h = 132) {
  const base = h - 8;
  const top = 10;
  // One frame of 60 ft (more for higher nets), so 30 ft nets draw half as high as 60 ft ones, on any turf.
  const s = (base - top) / Math.max(heightFt, SIDE_FRAME_FT);
  return { w, h, base, s, netTop: tenth(base - heightFt * s), player: tenth(PLAYER_FT * s), players: halves(heightFt / PLAYER_FT) };
}
