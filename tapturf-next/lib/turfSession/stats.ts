import type { Session } from "./types";

/**
 * The session's stars, from the matches scored ball by ball: each
 * player's runs and wickets over every match and either side (a reshuffle
 * moves people; a name is a person, so two people typed with one name
 * count as one). Placeholders ("Batter 2", "Bowler 1") are nobody. Pure,
 * relative imports only, tested in stats.test.ts (npm run test:session).
 */

export type BatTotal = { name: string; runs: number; balls: number; innings: number };
export type BowlTotal = { name: string; wickets: number; runs: number; balls: number };

const PLACEHOLDER = /^(batter|bowler|player) \d+$/i;
const key = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
export const isPlaceholder = (name: string) => PLACEHOLDER.test(name.trim());

type Lines = Pick<Session, "matches">;

export function batTotals(s: Lines): BatTotal[] {
  const by = new Map<string, BatTotal>();
  for (const m of s.matches) {
    if (!m.result) continue;
    for (const [name, , runs, balls] of m.bat) {
      if (!name.trim() || isPlaceholder(name)) continue;
      const k = key(name);
      const t = by.get(k) ?? { name: name.trim(), runs: 0, balls: 0, innings: 0 };
      t.runs += runs;
      t.balls += balls;
      t.innings += 1;
      by.set(k, t);
    }
  }
  return [...by.values()];
}

export function bowlTotals(s: Lines): BowlTotal[] {
  const by = new Map<string, BowlTotal>();
  for (const m of s.matches) {
    if (!m.result) continue;
    for (const [name, , wickets, runs, balls] of m.bowl) {
      if (!name.trim() || isPlaceholder(name)) continue;
      const k = key(name);
      const t = by.get(k) ?? { name: name.trim(), wickets: 0, runs: 0, balls: 0 };
      t.wickets += wickets;
      t.runs += runs;
      t.balls += balls;
      by.set(k, t);
    }
  }
  return [...by.values()];
}

/** The top run scorers: most runs, then fewer balls. Nobody on 0. */
export function topBatters(s: Lines, n = 3): BatTotal[] {
  return batTotals(s)
    .filter((t) => t.runs > 0)
    .sort((x, y) => y.runs - x.runs || x.balls - y.balls || x.name.localeCompare(y.name))
    .slice(0, n);
}

/** The top wicket takers: most wickets, then fewer runs, then fewer balls. Nobody on 0. */
export function topBowlers(s: Lines, n = 3): BowlTotal[] {
  return bowlTotals(s)
    .filter((t) => t.wickets > 0)
    .sort((x, y) => y.wickets - x.wickets || x.runs - y.runs || x.balls - y.balls || x.name.localeCompare(y.name))
    .slice(0, n);
}

/** Whether any real name batted or bowled in a finished match: the stars are worth showing. */
export function hasNames(s: Lines): boolean {
  return s.matches.some((m) => !!m.result && [...m.bat.map((b) => b[0]), ...m.bowl.map((b) => b[0])].some((name) => name.trim() && !isPlaceholder(name)));
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Rohan · 96 runs (52 balls)" */
export const batText = (t: BatTotal) => `${t.name} · ${plural(t.runs, "run")} (${plural(t.balls, "ball")})`;
/** "Sameer · 7 wickets (61 runs)" */
export const bowlText = (t: BowlTotal) => `${t.name} · ${plural(t.wickets, "wicket")} (${plural(t.runs, "run")})`;
