import type { Fixture, Settings, Slot, Stage } from "./types";

/**
 * Fixtures for a new tournament. Pure, relative imports only, tested in
 * fixtures.test.ts (npm run test:tournament).
 *
 * League and tri-series: a round robin by the circle method. One team
 * stays put while the rest turn round it, so every pair meets once per
 * leg and no team plays twice in a round. With an odd number of teams a
 * blank joins the circle: whoever is paired with it that round has a bye
 * (byesIn), each team once per leg. A second leg plays the same rounds
 * with home and away swapped. Playoffs come after the league: a final
 * (1st v 2nd), or semi-finals (1st v 4th, 2nd v 3rd) and a final between
 * their winners; their teams are left empty, the table fills them in when
 * the league is over (lib/tournament/standings.ts).
 *
 * A bilateral series: its matches in order, the two teams taking turns
 * to be listed first.
 */

/** A fixture as it is made, before any result or live link. */
export type NewFixture = Omit<Fixture, "live" | "liveResult">;

/** One round's pairings: every team plays at most once. */
export type Pairing = { home: number; away: number };

/**
 * Round-robin rounds for these team ids, by the circle method: n - 1
 * rounds for an even n, n for an odd one (each with one team on a bye).
 */
export function circleRounds(ids: number[]): Pairing[][] {
  const ring: (number | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const n = ring.length;
  const rounds: Pairing[][] = [];
  let at = ring;
  for (let r = 0; r < n - 1; r++) {
    const pairs: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = at[i];
      const y = at[n - 1 - i];
      if (x === null || y === null) continue;
      // Turn about for the fixed team each round, and down the board, so nobody is always listed first.
      const flip = i === 0 ? r % 2 === 1 : i % 2 === 1;
      pairs.push(flip ? { home: y, away: x } : { home: x, away: y });
    }
    rounds.push(pairs);
    // The first stays; the last moves up behind it and the rest move along one.
    at = [at[0], at[n - 1], ...at.slice(1, n - 1)];
  }
  return rounds;
}

/** The playoffs a format allows with this many teams: semis need four, a final three (a series has none). */
export function allowedPlayoffs(settings: Pick<Settings, "format">, teams: number): Settings["playoffs"][] {
  if (settings.format === "bilateral") return ["none"];
  if (settings.format === "tri") return ["none", "final"];
  return teams >= 4 ? ["none", "final", "semis"] : teams >= 3 ? ["none", "final"] : ["none"];
}

const playoff = (stage: Stage, slot: Slot, round: number): Omit<NewFixture, "id" | "seq"> => ({ stage, slot, round, home: null, away: null, day: null, time: null, result: null });

/**
 * Every fixture for the settings and team ids (1, 2, 3...), numbered from 1
 * in playing order. The playoffs asked for are left out when the teams are
 * too few for them (allowedPlayoffs).
 */
export function makeFixtures(settings: Pick<Settings, "format" | "legs" | "matches" | "playoffs">, ids: number[]): NewFixture[] {
  const out: Omit<NewFixture, "id" | "seq">[] = [];
  if (settings.format === "bilateral") {
    const [x, y] = ids;
    if (x === undefined || y === undefined) return [];
    const n = Math.max(1, Math.min(9, Math.round(settings.matches) || 1));
    for (let i = 0; i < n; i++) out.push({ stage: "league", slot: null, round: i + 1, home: i % 2 ? y : x, away: i % 2 ? x : y, day: null, time: null, result: null });
  } else {
    const rounds = circleRounds(ids);
    const legs = settings.legs === 2 ? 2 : 1;
    for (let leg = 0; leg < legs; leg++) {
      rounds.forEach((pairs, r) => {
        for (const p of pairs) {
          out.push({ stage: "league", slot: null, round: leg * rounds.length + r + 1, home: leg ? p.away : p.home, away: leg ? p.home : p.away, day: null, time: null, result: null });
        }
      });
    }
    const last = legs * rounds.length;
    const po = allowedPlayoffs(settings, ids.length).includes(settings.playoffs) ? settings.playoffs : "none";
    if (po === "semis") out.push(playoff("semi", "s1", last + 1), playoff("semi", "s2", last + 1), playoff("final", "f", last + 2));
    if (po === "final") out.push(playoff("final", "f", last + 1));
  }
  return out.map((f, i) => ({ ...f, id: i + 1, seq: i }));
}

/** How many fixtures the settings make, for the setup screen. */
export function fixtureCount(settings: Pick<Settings, "format" | "legs" | "matches" | "playoffs">, teams: number): { league: number; playoffs: number } {
  const all = makeFixtures(settings, Array.from({ length: teams }, (_, i) => i + 1));
  const league = all.filter((f) => f.stage === "league").length;
  return { league, playoffs: all.length - league };
}

/** The teams with no league match in a round (a bye, with an odd number of teams), of these team ids. */
export function byesIn(fixtures: Pick<Fixture, "stage" | "round" | "home" | "away">[], round: number, ids: number[]): number[] {
  const playing = new Set<number>();
  let any = false;
  for (const f of fixtures) {
    if (f.stage !== "league" || f.round !== round) continue;
    any = true;
    if (f.home !== null) playing.add(f.home);
    if (f.away !== null) playing.add(f.away);
  }
  return any ? ids.filter((id) => !playing.has(id)) : [];
}
