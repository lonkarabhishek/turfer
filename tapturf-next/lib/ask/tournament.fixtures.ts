import { apply, check, derive, newMatch, type Match, type MatchEvent } from "../cricket/scoring";
import { makeFixtures } from "../tournament/fixtures";
import { liveNowOf, liveResultOf } from "../tournament/live";
import type { Fixture, LiveNow, ManualResult, Settings, TournamentGetResponse } from "../tournament/types";
import { matchCard, type MatchCard } from "./tournament";

/**
 * Three made-up tournaments for Ask's tournament answers, built with the
 * real engines: the fixtures by makeFixtures, each scored match ball by
 * ball through the Live Cricket Scorer's own apply(), its kept result and
 * live card by lib/tournament/live.ts, exactly as the server makes them.
 *  - league: a league of four with a final, mid-way: two matches scored
 *    live and finished, one result typed in, one being scored now, two to
 *    come with their days set.
 *  - cup: a finished league of four with semi-finals and a final: four
 *    matches scored live, five typed, a champion.
 *  - typed: a league of three with typed results only, one match to come.
 * Used by lib/ask/tournament.test.ts, by the eval set's tournament-*
 * questions (scripts/ask-eval/questions.json, their `tournament` key) and
 * by the stand-in server the screenshots are taken from. Nobody real is
 * named. Relative imports only (npm run test:ask).
 */

export type TournamentFixture = {
  view: TournamentGetResponse;
  /** Per live link code, the match as live_match_get_k returns it. */
  matches: Record<string, { match: Match; status: "live" | "done"; updated_at: string; rev: number }>;
  /** Per fixture id, what lib/ask/tournament.server.ts hands tournamentFacts. */
  cards: Record<string, MatchCard | null>;
};

type Innings = { overs: string; bowlers: string[] };
type Script = { home: string; away: string; rosterHome: string[]; rosterAway: string[]; overs: number; first: Innings; second: Innings; title: string; venue: string };

/**
 * A match scored ball by ball. An innings is its overs, split by "|",
 * each ball a token: "." a dot, a digit its runs, "W" bowled, "C" caught
 * (by the fielding side's first player), "wd" a wide. bowlers: who bowls
 * each over, by name. The next batter in the order walks in when one is
 * needed. Every event passes the engine's own check, or this throws.
 */
export function scoreMatch(s: Script, id: string): Match {
  let m = newMatch({ teamA: s.home, teamB: s.away, overs: s.overs, playersPerSide: s.rosterHome.length, players: { a: s.rosterHome, b: s.rosterAway }, title: s.title, venue: s.venue }, { id, now: 0 });
  const go = (e: MatchEvent) => {
    const err = check(m, e).error;
    if (err) throw new Error(`fixture ${id}: ${err} at ${JSON.stringify(e)}`);
    m = apply(m, e);
  };
  const innings = (inn: Innings, bat: "a" | "b") => {
    const field = bat === "a" ? "b" : "a";
    const fielders = field === "a" ? s.rosterHome : s.rosterAway;
    let next = 1;
    const walkIn = () => {
      for (let v = derive(m); v.status === "live" && !v.inningsBreak && v.current.batting === bat && v.needs.some((n) => n !== "bowler"); v = derive(m)) go({ type: "setBatter", player: `${bat}${next++}` });
    };
    go({ type: "setBatter", player: `${bat}${next++}` });
    go({ type: "setBatter", player: `${bat}${next++}` });
    inn.overs.split("|").forEach((over, n) => {
      go({ type: "setBowler", player: `${field}${fielders.indexOf(inn.bowlers[n]) + 1}` });
      for (const t of over.trim().split(/\s+/)) {
        if (t === "wd") go({ type: "ball", runs: 0, extra: "wide" });
        else if (t === "W") go({ type: "ball", runs: 0, extra: "none", wicket: { kind: "bowled" } });
        else if (t === "C") go({ type: "ball", runs: 0, extra: "none", wicket: { kind: "caught", fielder: `${field}1` } });
        else go({ type: "ball", runs: t === "." ? 0 : Number(t), extra: "none" });
        walkIn();
      }
    });
  };
  innings(s.first, "a");
  if (s.second.overs) innings(s.second, "b");
  return m;
}

const SETTINGS: Settings = { format: "league", legs: 1, matches: 0, playoffs: "none", overs: 3, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const typed = (a: [number, number, number], b: [number, number, number], text?: string): ManualResult => ({
  a: { runs: a[0], wickets: a[1], balls: a[2], allOut: false },
  b: { runs: b[0], wickets: b[1], balls: b[2], allOut: false },
  result: "auto",
  battedFirst: "a",
  ...(text ? { text } : {}),
});

type Plan = { score?: Omit<Script, "home" | "away" | "rosterHome" | "rosterAway" | "overs" | "title" | "venue">; typed?: ManualResult; day?: string; time?: string; home?: number; away?: number };

/** A tournament and its scored matches from a plan per fixture, in makeFixtures' order (playoffs after the league). */
function build(code: string, name: string, settings: Settings, squads: [string, string[]][], plans: Plan[], updatedAt: string): TournamentFixture {
  const teams = squads.map(([team], i) => ({ id: i + 1, name: team, short: null }));
  const made = makeFixtures(settings, teams.map((t) => t.id));
  if (made.length !== plans.length) throw new Error(`fixture ${code}: ${made.length} fixtures, ${plans.length} plans`);
  const matches: TournamentFixture["matches"] = {};
  const live: Record<string, LiveNow> = {};
  const cards: Record<string, MatchCard | null> = {};
  const fixtures: Fixture[] = made.map((f, i) => {
    const p = plans[i];
    const home = p.home ?? f.home;
    const away = p.away ?? f.away;
    const out: Fixture = { ...f, home, away, day: p.day ?? null, time: p.time ?? null, result: p.typed ?? null, live: null, liveResult: null };
    if (p.score && home !== null && away !== null) {
      const liveCode = `${code.slice(0, 6)}live${String(f.id).padStart(2, "0")}`;
      const [h, w] = [squads[home - 1], squads[away - 1]];
      const title = f.stage === "final" ? "Final" : f.stage === "semi" ? (f.slot === "s2" ? "Semi-final 2" : "Semi-final 1") : `Match ${f.id}`;
      const match = scoreMatch({ ...p.score, home: h[0], away: w[0], rosterHome: h[1], rosterAway: w[1], overs: settings.overs ?? 3, title: `${name} · ${title}`, venue: settings.venue?.name ?? "" }, `m${code.slice(0, 4)}${f.id}`);
      const view = derive(match);
      // A finished match was last scored hours ago; one still on, a minute ago.
      const stamp = new Date(Date.parse(updatedAt) - (view.status === "done" ? (made.length - i) * 3_600_000 : 60_000)).toISOString();
      matches[liveCode] = { match, status: view.status, updated_at: stamp, rev: match.events.length };
      out.live = liveCode;
      out.liveResult = liveResultOf(view);
      live[String(f.id)] = liveNowOf({ status: view.status, closed: false, updatedAt: stamp }, view, h[0], w[0]);
      cards[String(f.id)] = matchCard(match);
    }
    return out;
  });
  const at = Date.parse(updatedAt);
  return {
    view: { tournament: { code, status: "on", name, settings, teams, fixtures, rev: 20, createdAt: new Date(at - 6 * 86_400_000).toISOString(), updatedAt }, live, at },
    matches,
    cards,
  };
}

const TITANS: [string, string[]] = ["Titans", ["Amit", "Rahul", "Karan", "Dev", "Om", "Jay"]];
const STRIKERS: [string, string[]] = ["Strikers", ["Sameer", "Vikas", "Nikhil", "Arjun", "Ravi", "Tushar"]];
const ROYALS: [string, string[]] = ["Royals", ["Imran", "Faiz", "Zaid", "Kabir", "Yash", "Tej"]];
const KINGS: [string, string[]] = ["Kings", ["Manoj", "Girish", "Pavan", "Lokesh", "Suresh", "Harsh"]];

/** A league of four with a final, mid-way (27 Nov 2026): Match 1 and 2 scored live, Match 3 typed, Match 4 on now, Match 5 and 6 and the final to come. */
export const LEAGUE = build(
  "leaguefix001",
  "Baner Box League",
  { ...SETTINGS, playoffs: "final", venue: { id: "00000000-0000-4000-8000-000000000001", slug: "kings-turf-arena", name: "Kings Turf Arena", area: "Baner" }, starts: "2026-11-21", ends: "2026-11-29" },
  [TITANS, STRIKERS, ROYALS, KINGS],
  [
    // Match 1, Titans v Kings: scored live. Titans 28/2, Kings 21/2.
    { score: { first: { overs: "4 1 . 6 . 1 | . . W 1 1 4 | 6 . 2 1 W 1", bowlers: ["Manoj", "Girish", "Manoj"] }, second: { overs: "1 . 4 . W 2 | . 1 1 . 4 . | 2 W 1 . 4 1", bowlers: ["Amit", "Rahul", "Amit"] } }, day: "2026-11-21", time: "19:00" },
    // Match 2, Royals v Strikers: scored live. Royals 24/3, Strikers 25/1 in 2.3 overs.
    { score: { first: { overs: "1 1 . 4 W . | 2 . 6 . 1 W | 4 1 . C 2 2", bowlers: ["Sameer", "Vikas", "Sameer"] }, second: { overs: "4 . 1 6 . 1 | 1 W . 2 1 1 | 4 . 4", bowlers: ["Imran", "Faiz", "Imran"] } }, day: "2026-11-21", time: "20:00" },
    // Match 3, Royals v Titans: typed in.
    { typed: typed([31, 4, 18], [32, 2, 16]), day: "2026-11-22", time: "19:00" },
    // Match 4, Strikers v Kings: on now. Strikers 30/2, Kings 12/1 after 1.2 overs.
    { score: { first: { overs: "6 4 . 1 1 W | 2 2 . 4 1 . | 1 6 W . 1 1", bowlers: ["Manoj", "Pavan", "Manoj"] }, second: { overs: "4 . 1 W 2 1 | 4 .", bowlers: ["Sameer", "Vikas"] } }, day: "2026-11-27", time: "19:00" },
    { day: "2026-11-28", time: "19:30" },
    { day: "2026-11-29", time: "17:00" },
    {},
  ],
  "2026-11-27T13:40:00.000Z",
);

const LIONS: [string, string[]] = ["Lions", ["Aarav", "Vihaan", "Reyansh", "Kunal", "Mihir", "Neel"]];
const PANTHERS: [string, string[]] = ["Panthers", ["Rohan", "Sahil", "Tanmay", "Uday", "Varun", "Yuvraj"]];
const EAGLES: [string, string[]] = ["Eagles", ["Aditya", "Bhavesh", "Chirag", "Deepak", "Eshan", "Farhan"]];
const WOLVES: [string, string[]] = ["Wolves", ["Gaurav", "Hitesh", "Ishaan", "Jatin", "Kartik", "Laksh"]];

/** A finished league of four with semi-finals and a final: Match 1 and 4, Semi-final 1 and the Final scored live, the other five typed. Lions are the champions. */
export const CUP = build(
  "cupfixture01",
  "Diwali Cup",
  { ...SETTINGS, playoffs: "semis", venue: { id: "00000000-0000-4000-8000-000000000002", slug: "greenfield-sports-hub", name: "Greenfield Sports Hub", area: "Madhapur" }, starts: "2026-11-07", ends: "2026-11-15" },
  [LIONS, PANTHERS, EAGLES, WOLVES],
  [
    // Match 1, Lions v Wolves: scored live.
    { score: { first: { overs: "4 4 1 . 6 1 | 1 2 . W 4 1 | 6 . 1 1 . 1", bowlers: ["Gaurav", "Hitesh", "Gaurav"] }, second: { overs: ". 1 W . 4 1 | 1 . W 2 . C | 4 1 . W 1 .", bowlers: ["Aarav", "Kunal", "Aarav"] } }, day: "2026-11-07", time: "18:00" },
    // Match 2, Eagles v Panthers: typed.
    { typed: typed([25, 5, 18], [26, 1, 14]), day: "2026-11-07", time: "19:00" },
    // Match 3, Eagles v Lions: typed.
    { typed: typed([22, 4, 18], [23, 0, 12]), day: "2026-11-08", time: "18:00" },
    // Match 4, Panthers v Wolves: scored live.
    { score: { first: { overs: "6 . 4 1 1 . | 4 W 2 6 . 1 | 1 4 . W 6 .", bowlers: ["Gaurav", "Jatin", "Gaurav"] }, second: { overs: "1 4 . . 2 W | 6 . 1 1 W . | 4 1 2 . C 4", bowlers: ["Rohan", "Sahil", "Rohan"] } }, day: "2026-11-08", time: "19:00" },
    // Match 5, Lions v Panthers: typed.
    { typed: typed([35, 2, 18], [30, 4, 18]), day: "2026-11-14", time: "18:00" },
    // Match 6, Wolves v Eagles: typed.
    { typed: typed([20, 5, 17], [21, 2, 15]), day: "2026-11-14", time: "19:00" },
    // Semi-final 1, Lions v Wolves: scored live. Wolves all out.
    { score: { first: { overs: "1 4 . 6 W 1 | 2 . 4 1 . 1 | 6 . C 1 2 1", bowlers: ["Hitesh", "Gaurav", "Hitesh"] }, second: { overs: "4 W . 1 2 W | 1 6 . W 1 . | 4 2 W 1 W", bowlers: ["Kunal", "Aarav", "Kunal"] } }, day: "2026-11-15", time: "16:00", home: 1, away: 4 },
    // Semi-final 2, Panthers v Eagles: typed. Eagles went through.
    { typed: typed([28, 3, 18], [29, 2, 17]), day: "2026-11-15", time: "17:00", home: 2, away: 3 },
    // Final, Lions v Eagles: scored live. Lions 34/3, Eagles 31/4.
    { score: { first: { overs: "4 1 6 . W 1 | 1 4 . 2 1 W | 6 . 4 C 2 2", bowlers: ["Aditya", "Chirag", "Aditya"] }, second: { overs: "6 . 1 4 . W | 1 2 W 4 . 1 | 4 W 2 1 C 5", bowlers: ["Aarav", "Kunal", "Aarav"] } }, day: "2026-11-15", time: "19:00", home: 1, away: 3 },
  ],
  "2026-11-15T15:10:00.000Z",
);

/** A league of three with typed results only: two results entered by hand, one match to come. No scorecard anywhere. */
export const TYPED = build(
  "typedfixtur1",
  "Office Cup",
  { ...SETTINGS, overs: 6 },
  [
    ["Devs", []],
    ["Design", []],
    ["Sales", []],
  ],
  [
    // Match 1, Sales v Design: Sales won by 4 runs.
    { typed: typed([48, 6, 36], [44, 7, 36]) },
    // Match 2, Sales v Devs: Devs won by 7 wickets.
    { typed: typed([55, 5, 36], [56, 3, 32]) },
    // Match 3, Devs v Design: to come.
    { day: "2026-12-04", time: "18:00" },
  ],
  "2026-11-26T12:00:00.000Z",
);

/** By the name the eval set's questions use (their `tournament` key). */
export const TOURNAMENT_FIXTURES: Record<string, TournamentFixture> = { league: LEAGUE, cup: CUP, typed: TYPED };
