import { DEFAULT_TOURNAMENT_POINTS, MAX_SERIES, NAME_MAX, type CreateBody, type Fixture, type ManualResult, type Op, type Tournament } from "../tournament/types";
import { dayLabel } from "./plan";
import { playedCount } from "./session";
import type { LiveState, Session, SessionMatch } from "./types";

/**
 * A session's live link: an ordinary bilateral live tournament
 * (/tournament/<code>, lib/tournament/types.ts), team 1 the session's side
 * a and team 2 its side b, match n its fixture of round n. Results go up
 * as typed results (ManualResult, with the session's own words for the
 * margin in text), never player names. The phone sends one change at a
 * time and decides the next from the tournament as the last reply showed
 * it (nextOp): so a reply lost on the way is just sent again, and a new
 * fixture is only added against a view known to be fresh, never twice.
 * Pure, relative imports only, tested in sync.test.ts
 * (npm run test:session).
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Match n's result as a typed tournament result: home a, away b, the margin in the session's words. */
export function manualOf(m: SessionMatch | null | undefined): ManualResult | null {
  if (!m?.result) return null;
  const r = m.result;
  const inn = (x: ManualResult["a"]) => ({ runs: x.runs, wickets: x.wickets, balls: x.balls, allOut: !!x.allOut });
  const text = r.text.replace(/\s+/g, " ").trim().slice(0, 120).trim();
  return { a: inn(r.a), b: inn(r.b), result: r.outcome, battedFirst: m.battedFirst, ...(text ? { text } : {}) };
}

/** A result in a few characters, to tell whether the live page has it already; "-" is none. */
export function hashResult(r: ManualResult | null | undefined): string {
  if (!r) return "-";
  const i = (x: ManualResult["a"]) => `${x.runs}/${x.wickets}/${x.balls}/${x.allOut ? 1 : 0}`;
  return `${i(r.a)}|${i(r.b)}|${r.result}|${r.battedFirst}|${r.text ?? ""}`;
}

const namesKey = (s: Pick<Session, "sides">) => `${s.sides.a.name}\u0000${s.sides.b.name}`;

/** "Turf session: Sai Sports Arena, Sun 8 Nov", or "Turf session: Titans vs Strikers" with no venue; 60 at most. */
export function sessionName(s: Pick<Session, "venue" | "day" | "sides">): string {
  const venue = s.venue.replace(/\s+/g, " ").trim();
  const name = venue ? `Turf session: ${venue}, ${dayLabel(s.day)}` : `Turf session: ${s.sides.a.name} vs ${s.sides.b.name}`;
  return name.slice(0, NAME_MAX).trim();
}

/** The series length the live page shows: the plan, else one more than played (3 at least); 1 to 9. */
export function seriesLength(s: Session): number {
  return clamp(s.plan ?? Math.max(3, playedCount(s) + 1), 1, MAX_SERIES);
}

/**
 * The create request for the session's live link, and what the live page
 * will have once it is accepted (pushed, by match number). Every match
 * planned is a fixture, played ones with their results.
 */
export function toCreateBody(s: Session, secret: string): { body: CreateBody; pushed: Record<string, string>; teamsPushed: string } {
  const matches = seriesLength(s);
  const n = Math.min(30, Math.max(matches, s.matches.length));
  const pushed: Record<string, string> = {};
  const fixtures: NonNullable<CreateBody["fixtures"]> = [];
  for (let r = 1; r <= n; r++) {
    const result = manualOf(s.matches.find((m) => m.n === r));
    fixtures.push({ id: r, stage: "league", slot: null, round: r, seq: r, home: 1, away: 2, day: s.day, time: null, result });
    pushed[String(r)] = hashResult(result);
  }
  return {
    body: {
      secret,
      name: sessionName(s),
      settings: { format: "bilateral", legs: 1, matches, playoffs: "none", overs: clamp(s.overs, 1, 50), points: { ...DEFAULT_TOURNAMENT_POINTS }, venue: s.turf, starts: s.day, ends: s.day },
      teams: [
        { name: s.sides.a.name, short: null },
        { name: s.sides.b.name, short: null },
      ],
      fixtures,
    },
    pushed,
    teamsPushed: namesKey(s),
  };
}

/** What a change accepted means for the phone's record: a result the page now has. */
export type Mark = { round: number; hash: string } | { teams: string };
export type Step = { op: Op; mark?: Mark } | { read: true } | null;

const lc = (x: string) => x.toLowerCase();

/**
 * The next change the live page needs, one at a time, in this order:
 *  1. a team's new name (the one that does not clash with the other
 *     team's name on the page first; a swap goes through a stand-in name);
 *  2. a fixture for a match the page lacks (only against a fresh view:
 *     a lost reply may have added it already), or a second fixture of a
 *     round taken off;
 *  3. a match's result the page does not have, or null when it is no
 *     longer finished;
 *  4. a result left on a fixture past the last match (one taken out);
 *  5. after the end, the fixtures past the last match taken off and the
 *     series set to the matches played; before it, the series grown to
 *     the matches played (up to 9).
 * { read: true }: read the page first. null: nothing to send.
 */
export function nextOp(s: Session, view: Tournament | null, fresh: boolean): Step {
  if (!s.live.code || !s.live.secret) return null;
  if (!view || view.status !== "on") return view ? null : { read: true };
  const t1 = view.teams.find((t) => t.id === 1);
  const t2 = view.teams.find((t) => t.id === 2);
  if (!t1 || !t2) return null;

  const want1 = s.sides.a.name;
  const want2 = s.sides.b.name;
  const need1 = t1.name !== want1;
  const need2 = t2.name !== want2;
  if (need1 || need2) {
    const mark = { teams: namesKey(s) };
    if (need1 && lc(want1) !== lc(t2.name)) return { op: { op: "team", id: 1, name: want1, short: null }, mark };
    if (need2 && lc(want2) !== lc(t1.name)) return { op: { op: "team", id: 2, name: want2, short: null }, mark };
    // Each wants the other's name: team 1 steps aside first.
    if (need1) return { op: { op: "team", id: 1, name: `${want1.slice(0, 26)} (1)`, short: null } };
  }

  const count = s.matches.length;
  const league = view.fixtures.filter((f) => f.stage === "league");
  const byRound = new Map<number, Fixture>();
  const extra: Fixture[] = [];
  for (const f of league) {
    if (byRound.has(f.round)) extra.push(f);
    else byRound.set(f.round, f);
  }
  for (let r = 1; r <= count; r++) {
    if (byRound.has(r)) continue;
    if (!fresh) return { read: true };
    return { op: { op: "fixture_add", stage: "league", slot: null, round: r, home: 1, away: 2, day: s.day, time: null } };
  }
  if (extra.length) return fresh ? { op: { op: "fixture_remove", id: extra[0].id } } : { read: true };

  const has = (f: Fixture) => s.live.pushed[String(f.round)] ?? hashResult(f.result);
  for (let r = 1; r <= count; r++) {
    const f = byRound.get(r)!;
    const want = manualOf(s.matches.find((m) => m.n === r));
    const hash = hashResult(want);
    if (has(f) !== hash) return { op: { op: "result", id: f.id, result: want }, mark: { round: r, hash } };
  }
  for (const f of [...byRound.values()].sort((x, y) => x.round - y.round)) {
    if (f.round > count && has(f) !== "-") return { op: { op: "result", id: f.id, result: null }, mark: { round: f.round, hash: "-" } };
  }

  const settings = (matches: number): Step => ({ op: { op: "settings", name: view.name || sessionName(s), settings: { ...view.settings, matches } } });
  if (s.ended) {
    const beyond = [...byRound.values()].filter((f) => f.round > count).sort((x, y) => x.round - y.round);
    if (beyond.length) return fresh ? { op: { op: "fixture_remove", id: beyond[0].id } } : { read: true };
    const len = clamp(count, 1, MAX_SERIES);
    if (view.settings.matches !== len) return settings(len);
  } else if (count > view.settings.matches && view.settings.matches < MAX_SERIES) {
    return settings(clamp(count, 1, MAX_SERIES));
  }
  return null;
}

/** The phone's record after a change was accepted. */
export function markPushed(live: LiveState, mark: Mark | undefined): LiveState {
  if (!mark) return live;
  if ("teams" in mark) return { ...live, teamsPushed: mark.teams };
  return { ...live, pushed: { ...live.pushed, [String(mark.round)]: mark.hash } };
}

/** Results waiting to go up: matches whose result the page does not have yet. */
export function waiting(s: Session): number {
  if (!s.live.code) return 0;
  return s.matches.filter((m) => (s.live.pushed[String(m.n)] ?? "-") !== hashResult(manualOf(m))).length;
}
