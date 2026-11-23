import { dayLabel, timeLabel } from "./format";
import { readDay, readTime } from "./payload";
import { TOURNAMENT_CODE_RE, type Format, type Slot, type Stage } from "./types";

/**
 * A live scorecard that is a tournament's match (the site owner, 23 Nov
 * 2026: "live scorecards if they are part of a tournament give a link and
 * show it properly"): what public.live_tournament answers
 * (20261123_tournament_host.sql) in the app's terms, and the words of the
 * banner the scorecard page (/live/<code>) puts over the score: the
 * tournament's name, which match this is as the tournament page words it
 * ("League · Match 3 of 6", "Semi-final 1", "Final"), the two sides by
 * their tournament names when the scorer typed them differently, the next
 * match once this one is over, and the link to the tournament. Nothing
 * about who organises it. Pure, relative imports only, tested in
 * scorecard.test.ts (npm run test:tournament).
 */

export type NextMatch = { stage: Stage; slot: Slot | null; n: number | null; home: string | null; away: string | null; day: string | null; time: string | null };

export type LiveTournament = {
  code: string;
  name: string;
  format: Format;
  fixture: number;
  stage: Stage;
  slot: Slot | null;
  /** A league match's place among the league matches, in the organiser's order; null for a playoff. */
  n: number | null;
  /** How many league matches there are. */
  of: number;
  /** The two teams as the tournament names them; null for a playoff place not filled yet. */
  home: string | null;
  away: string | null;
  /** The first match with no result and no scorecard yet, other than this one. */
  next: NextMatch | null;
};

const STAGES: readonly Stage[] = ["league", "semi", "final"];
const SLOTS: readonly Slot[] = ["s1", "s2", "f"];
const FORMATS: readonly Format[] = ["league", "bilateral", "tri"];
const oneLine = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const count = (x: unknown, min: number) => (typeof x === "number" && Number.isInteger(x) && x >= min && x <= 300 ? x : null);

function toMatch(o: Record<string, unknown>): Pick<LiveTournament, "stage" | "slot" | "n" | "home" | "away"> | null {
  const stage = STAGES.find((s) => s === o.stage);
  if (!stage) return null;
  return { stage, slot: SLOTS.find((s) => s === o.slot) ?? null, n: stage === "league" ? count(o.n, 1) : null, home: oneLine(o.home, 30) || null, away: oneLine(o.away, 30) || null };
}

/**
 * public.live_tournament's answer, or null: no tournament (the scorecard
 * then looks as it always did), a refusal ({r}), or anything that is not
 * a whole answer. Never a guess: a banner is drawn only from a code that
 * can be a tournament's, a name and a stage.
 */
export function toLiveTournament(data: unknown): LiveTournament | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if ("r" in o) return null;
  const name = oneLine(o.name, 60);
  const format = FORMATS.find((f) => f === o.format);
  const fixture = count(o.fixture, 1);
  const match = toMatch(o);
  if (typeof o.code !== "string" || !TOURNAMENT_CODE_RE.test(o.code) || !name || !format || fixture === null || !match) return null;
  const nx = o.next && typeof o.next === "object" && !Array.isArray(o.next) ? (o.next as Record<string, unknown>) : null;
  const nextMatch = nx ? toMatch(nx) : null;
  return {
    code: o.code,
    name,
    format,
    fixture,
    ...match,
    of: count(o.of, 0) ?? 0,
    next: nx && nextMatch ? { ...nextMatch, day: readDay(nx.day), time: readTime(nx.time) } : null,
  };
}

/** The league stage in a word, by the tournament's format, as its page has it. */
const STAGE_WORD: Record<Format, string> = { league: "League", bilateral: "Series", tri: "Tri-series" };

/** A match's own name, as the tournament page's cards have it (lib/tournament/format.ts fixtureTitle): "Match 3", "Semi-final 1", "Final". */
export function matchName(m: Pick<LiveTournament, "stage" | "slot" | "n">): string {
  if (m.stage === "final") return "Final";
  if (m.stage === "semi") return m.slot === "s2" ? "Semi-final 2" : "Semi-final 1";
  return m.n ? `Match ${m.n}` : "Match";
}

/** Which match this is in the tournament: "League · Match 3 of 6", "Series · Match 2 of 3", "Semi-final 1", "Final". */
export function matchPlace(t: Pick<LiveTournament, "format" | "stage" | "slot" | "n" | "of">): string {
  if (t.stage !== "league") return matchName(t);
  const word = STAGE_WORD[t.format];
  if (!t.n) return `${word} match`;
  return `${word} · Match ${t.n}${t.of >= t.n && t.of > 1 ? ` of ${t.of}` : ""}`;
}

const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * "Titans v Strikers": the two sides by their tournament names, only when
 * that says something the scorecard under it doesn't (the scorer typed
 * other names, or there is no score yet). null when both are the
 * scorecard's own names, either way round, or a side is not known.
 */
export function sidesLine(t: Pick<LiveTournament, "home" | "away">, shown: { a: string; b: string } | null): string | null {
  if (!t.home || !t.away) return null;
  if (shown && ((same(t.home, shown.a) && same(t.away, shown.b)) || (same(t.home, shown.b) && same(t.away, shown.a)))) return null;
  return `${t.home} v ${t.away}`;
}

/** "Next: Match 4 · Strikers v Kings · Sat 28 Nov, 7:30 pm"; a playoff place not filled yet is just "Next: Final". */
export function nextLine(n: NextMatch): string {
  const when = [n.day ? dayLabel(n.day) : null, n.time ? timeLabel(n.time) : null].filter(Boolean).join(", ");
  return `Next: ${[matchName(n), n.home && n.away ? `${n.home} v ${n.away}` : null, when || null].filter(Boolean).join(" · ")}`;
}

export type Banner = {
  /** The tournament's name. */
  name: string;
  /** "League · Match 3 of 6" */
  place: string;
  /** "Titans v Strikers", when the scorecard under it names them differently. */
  sides: string | null;
  /** Once this match is over: "Next: Match 4 · Strikers v Kings". */
  next: string | null;
  href: string;
  /** What the link is to. */
  link: string;
};

/**
 * Everything the banner says. shown: the two sides as the scorecard on
 * screen names them (null: no score on screen). over: the scorecard is
 * finished, so the next match is worth saying.
 */
export function bannerOf(t: LiveTournament, o: { shown: { a: string; b: string } | null; over: boolean }): Banner {
  // A series is often named for its two sides ("Titans v Strikers"): the name already says them.
  const named = !!t.home && !!t.away && [`${t.home} v ${t.away}`, `${t.home} vs ${t.away}`, `${t.away} v ${t.home}`, `${t.away} vs ${t.home}`].some((x) => same(x, t.name));
  return {
    name: t.name,
    place: matchPlace(t),
    sides: named ? null : sidesLine(t, o.shown),
    next: o.over && t.next ? nextLine(t.next) : null,
    href: `/tournament/${t.code}`,
    link: t.format === "bilateral" ? "Series score and fixtures" : "Points table and fixtures",
  };
}
