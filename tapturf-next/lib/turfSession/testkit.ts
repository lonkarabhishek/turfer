import { apply, DEFAULT_RULES, derive, newMatch, type Match, type MatchEvent, type MatchView } from "../cricket/scoring";
import { addScored, newSession, nextSetup, recordFinal, recordScored, type NewSession } from "./session";
import type { Session, SideKey } from "./types";

/**
 * Sessions and matches for the turf session tests (*.test.ts here,
 * npm run test:session). Not used by the app.
 */

export const T0 = Date.parse("2026-11-08T19:00:00+05:30");

export function aSession(over: Partial<NewSession> = {}): Session {
  return newSession(
    {
      format: "box",
      venue: "Sai Sports Arena",
      turf: null,
      day: "2026-11-08",
      overs: 1,
      playersPerSide: 6,
      rules: DEFAULT_RULES,
      pick: false,
      sides: { a: { name: "Titans", players: ["Rohan", "Amit", "Sahil"] }, b: { name: "Strikers", players: ["Vikas", "Sameer", "Arjun"] } },
      firstBat: "a",
      plan: 6,
      game: null,
      ...over,
    },
    T0,
    "s1",
  );
}

const ball = (runs: number, wicket = false): MatchEvent => ({ type: "ball", runs, extra: "none", ...(wicket ? { wicket: { kind: "bowled" as const } } : {}) });

/** Play one innings: the openers and bowler in, then each ball (-1 is a wicket). */
function innings(m: Match, balls: number[]): Match {
  const v = derive(m);
  const bat = v.current.batting;
  const bowl = v.current.bowling;
  const roster = (side: SideKey) => v.teams[side].players;
  let x = m;
  const add = (e: MatchEvent) => {
    const y = apply(x, e);
    if (y === x) throw new Error(`refused: ${JSON.stringify(e)}`);
    x = y;
  };
  const batters = roster(bat);
  add({ type: "setBatter", player: batters[0]?.id ?? `${bat}1`, ...(batters[0] ? {} : { name: "Batter 1" }), end: "striker" });
  add({ type: "setBatter", player: batters[1]?.id ?? `${bat}2`, ...(batters[1] ? {} : { name: "Batter 2" }), end: "nonStriker" });
  add({ type: "setBowler", player: roster(bowl)[0]?.id ?? `${bowl}1`, ...(roster(bowl)[0] ? {} : { name: "Bowler 1" }) });
  let next = 2;
  for (const b of balls) {
    if (derive(x).status === "done" || derive(x).current.batting !== bat) break;
    add(b < 0 ? ball(0, true) : ball(b));
    const w = derive(x);
    if (w.status === "live" && w.current.batting === bat && w.needs.some((n) => n !== "bowler")) {
      const p = roster(bat)[next];
      add({ type: "setBatter", player: p?.id ?? `${bat}${next + 1}`, ...(p ? {} : { name: `Batter ${next + 1}` }) });
      next++;
    }
  }
  return x;
}

/** A whole match of 1 over a side: the first innings' balls, then the chase's. */
export function playMatch(m: Match, first: number[], second: number[]): Match {
  const one = innings(m, first);
  return innings(one, second);
}

/** Match n+1 scored on the scorer and finished with these balls; the session with it in. */
export function withScored(s: Session, first: number[], second: number[], now = T0): { session: Session; match: Match; view: MatchView } {
  const setup = nextSetup(s);
  const m0 = newMatch(setup, { id: `m${s.matches.length + 1}`, now });
  let session = addScored(s, m0.id, setup.battingFirst ?? "a", now);
  const m = playMatch(m0, first, second);
  const view = derive(m);
  session = recordScored(session, session.matches.length, view, now);
  return { session, match: m, view };
}

/** A typed final score for the next match. */
export function withFinal(s: Session, a: number, b: number, opts: { wa?: number; wb?: number; battedFirst?: SideKey; noResult?: boolean } = {}): Session {
  return recordFinal(s, { n: null, battedFirst: opts.battedFirst ?? "a", a: { runs: a, wickets: opts.wa ?? 3, balls: 6 }, b: { runs: b, wickets: opts.wb ?? 4, balls: 6 }, noResult: !!opts.noResult }, T0).session;
}
