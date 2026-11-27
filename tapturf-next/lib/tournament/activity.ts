import { describeResult, type ResultChoice } from "../cricket/nrr";
import { agoWords, instant, istDayNumber } from "../games/when";
import { stampWords, startVerb } from "./about";
import { dayLabel, rangeLabel, timeLabel } from "./format";
import { cleanText, readDay, readTime } from "./payload";
import { formatLabel, type Resolution } from "./standings";
import type { Format, LiveNow, Playoffs, Team, Tournament, TournamentHost } from "./types";

/**
 * A live tournament's activity, for the Activity tab of its page (the
 * site owner, 28 Nov 2026: "give an activity tab for tournaments page";
 * the game page's log, lib/games/activity.ts, is the model). What the
 * page already knows is worked out here with nothing stored: that the
 * tournament was started (created_at; by whom only when the page was
 * served an organiser to name, lib/tournament/host.ts) and a result that
 * came from a finished live scorecard (at that scorecard's own last
 * update). What leaves no other trace is read from the database's log
 * (private.tournaments.activity through public.tournament_activity,
 * 20261128_tournament_activity.sql): renames, fixtures added, moved or
 * taken out, a match scored live, results and corrections, the playoffs
 * drawn, the settings followers see, the tournament finished. Everything
 * here is, or was, on the page for anyone: never an account, a secret, a
 * network, a number or an email, and nothing about who manages it beyond
 * the organiser the masthead already names. A tournament from before the
 * file shows what can be worked out and nothing made up; a kind this
 * build doesn't know (a newer database) draws nothing. Times are said the
 * way the masthead's "Updated" line says them. Pure, relative imports
 * only, tested in activity.test.ts (npm run test:tournament).
 */

/** Lines shown before "Show all". */
export const ACTIVITY_SHOWN = 10;
/** What the database keeps: the newest this many. */
export const ACTIVITY_KEPT = 100;
/** What rides in every poll: the newest this many; the rest are fetched when "Show all" is tapped. */
export const ACTIVITY_POLL_MAX = 30;

type Place = "s1" | "s2" | "f";
/** A fixture as the log names it: its id, the two teams' names as they were then, and its playoff place. */
type Fx = { f: number; h?: string; a?: string; p?: Place };

/** One stored entry, as the database noted it (at: ms). */
export type LogEntry = { at: number } & (
  | { k: "name"; to: string }
  | { k: "venue"; from?: string; to?: string }
  | { k: "dates"; fs?: string; fe?: string; ts?: string; te?: string }
  | { k: "overs"; from?: number; to?: number }
  | { k: "points"; p: [number, number, number, number] }
  | { k: "format"; legs: 1 | 2; playoffs: Playoffs }
  | { k: "team"; from: string; to: string }
  | { k: "team_add"; to: string }
  | ({ k: "fx_add"; d?: string; t?: string } & Fx)
  | ({ k: "fx_move"; fd?: string; ft?: string; d?: string; t?: string } & Fx)
  | ({ k: "fx_teams" | "fx_out" | "clear" | "live" } & Fx)
  | ({ k: "res" | "fix"; live?: true; x?: string; s?: [number, number, number, number]; w?: ResultChoice; bf?: "a" | "b" } & Fx)
  | { k: "draw"; to: "semis" | "final" }
  | { k: "done" }
);

/** What the server's read came to. known false: it could not be asked (no function yet, or the read failed), so only what can be worked out shows. */
export type ActivityRead = { known: boolean; log: LogEntry[] };
export const ACTIVITY_UNKNOWN: ActivityRead = { known: false, log: [] };

/** What GET /api/tournament/<code> carries: the newest entries, oldest first, and how many there are in all. */
export type ActivityWire = { log: LogEntry[]; total: number };

const int = (x: unknown, lo: number, hi: number): number | undefined => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : undefined);
const text = (x: unknown, max: number): string | undefined => cleanText(x, max) || undefined;
const PLACES: readonly Place[] = ["s1", "s2", "f"];
const CHOICES: readonly ResultChoice[] = ["auto", "a", "b", "tie", "nr"];
const four = (x: unknown, hi: number): [number, number, number, number] | undefined => {
  if (!Array.isArray(x) || x.length !== 4) return undefined;
  const n = x.map((v) => int(v, 0, hi));
  return n.every((v) => v !== undefined) ? (n as [number, number, number, number]) : undefined;
};
/** Keys with nothing to say are left out, so the answer stays small. */
const lean = (e: LogEntry): LogEntry => {
  const o = e as unknown as Record<string, unknown>;
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return e;
};

function readFx(o: Record<string, unknown>): Fx | null {
  const f = int(o.f, 1, 999);
  if (f === undefined) return null;
  return { f, h: text(o.h, 30), a: text(o.a, 30), p: PLACES.find((p) => p === o.p) };
}

/** One stored entry rebuilt field by field, or null when it is not one this build knows (a newer kind, a bad row). */
function readEntry(raw: unknown): LogEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const at = instant(o.at);
  if (at === null) return null;
  const fx = readFx(o);
  const k = o.k;
  switch (k) {
    case "name": {
      const to = text(o.to, 60);
      return to ? { at, k: "name", to } : null;
    }
    case "venue": {
      const from = text(o.from, 80);
      const to = text(o.to, 80);
      return from || to ? lean({ at, k: "venue", from, to }) : null;
    }
    case "dates":
      return lean({ at, k: "dates", fs: readDay(o.fs) ?? undefined, fe: readDay(o.fe) ?? undefined, ts: readDay(o.ts) ?? undefined, te: readDay(o.te) ?? undefined });
    case "overs": {
      const from = int(o.from, 1, 50);
      const to = int(o.to, 1, 50);
      return from !== to ? lean({ at, k: "overs", from, to }) : null;
    }
    case "points": {
      const p = four(o.p, 99);
      return p ? { at, k: "points", p } : null;
    }
    case "format": {
      const playoffs = o.playoffs === "final" || o.playoffs === "semis" || o.playoffs === "none" ? o.playoffs : null;
      return playoffs && (o.legs === 1 || o.legs === 2) ? { at, k: "format", legs: o.legs, playoffs } : null;
    }
    case "team": {
      const from = text(o.from, 30);
      const to = text(o.to, 30);
      return from && to && from !== to ? { at, k: "team", from, to } : null;
    }
    case "team_add": {
      const to = text(o.to, 30);
      return to ? { at, k: "team_add", to } : null;
    }
    case "fx_add":
      return fx ? lean({ at, k: "fx_add", ...fx, d: readDay(o.d) ?? undefined, t: readTime(o.t) ?? undefined }) : null;
    case "fx_move":
      return fx ? lean({ at, k: "fx_move", ...fx, fd: readDay(o.fd) ?? undefined, ft: readTime(o.ft) ?? undefined, d: readDay(o.d) ?? undefined, t: readTime(o.t) ?? undefined }) : null;
    case "fx_teams":
    case "fx_out":
    case "clear":
    case "live":
      return fx ? lean({ at, k, ...fx }) : null;
    case "res":
    case "fix": {
      if (!fx) return null;
      const s = four(o.s, 999);
      const w = CHOICES.find((c) => c === o.w);
      return lean({ at, k, ...fx, live: o.live === true ? (true as const) : undefined, x: text(o.x, 120), s: s && w ? s : undefined, w: s && w ? w : undefined, bf: s && w ? (o.bf === "b" ? ("b" as const) : ("a" as const)) : undefined });
    }
    case "draw":
      return o.to === "semis" || o.to === "final" ? { at, k: "draw", to: o.to } : null;
    case "done":
      return { at, k: "done" };
    default:
      return null;
  }
}

/** The stored list as this build reads it: oldest first, the newest ACTIVITY_KEPT, unknown kinds and bad rows left out. */
export function readLog(data: unknown): LogEntry[] {
  if (!Array.isArray(data)) return [];
  const out: LogEntry[] = [];
  for (const raw of data) {
    const e = readEntry(raw);
    if (e) out.push(e);
  }
  return out.slice(-ACTIVITY_KEPT);
}

/**
 * public.tournament_activity's answer in the app's terms. A list is the
 * log; null (no such tournament, or one taken down) is an empty one. A
 * refusal ({r}) or anything else is "could not be asked".
 */
export function toActivityRead(data: unknown): ActivityRead {
  if (data === null || data === undefined) return { known: true, log: [] };
  if (!Array.isArray(data)) return ACTIVITY_UNKNOWN;
  return { known: true, log: readLog(data) };
}

/** What goes with every poll: the newest ACTIVITY_POLL_MAX, and how many there are. */
export function pollActivity(log: readonly LogEntry[]): ActivityWire {
  return { log: log.slice(-ACTIVITY_POLL_MAX), total: log.length };
}

/** Whether two polls carry the same log (an open page takes a poll's answer only when something differs). */
export function sameActivity(a: ActivityWire | undefined, b: ActivityWire | undefined): boolean {
  if (!a || !b) return a === b;
  const x = a.log[a.log.length - 1];
  const y = b.log[b.log.length - 1];
  return a.total === b.total && a.log.length === b.log.length && x?.at === y?.at && x?.k === y?.k;
}

/** The whole log once fetched, brought up to date by a later poll: the fetched entries older than the poll's, then the poll's. */
export function mergeLogs(full: readonly LogEntry[], poll: readonly LogEntry[]): LogEntry[] {
  if (!poll.length) return [...full];
  const from = poll[0].at;
  return [...full.filter((e) => e.at < from), ...poll];
}

/* ------------------------------------------------------------------ */
/* Lines                                                               */
/* ------------------------------------------------------------------ */

export type ActivityKind = "started" | "settings" | "venue" | "dates" | "team" | "added" | "moved" | "changed" | "out" | "live" | "result" | "fixed" | "cleared" | "draw" | "finished" | "off";

export type ActivityLine = {
  /** Stable for a list key. */
  key: string;
  /** When (ms). */
  at: number;
  kind: ActivityKind;
  text: string;
  /** Where the line links to: the live scorecard, while the page itself still links to it. */
  href?: string;
};

const PLACE_TITLE: Record<Place, string> = { s1: "Semi-final 1", s2: "Semi-final 2", f: "Final" };
const pairOf = (e: Fx): string | null => (e.h && e.a ? `${e.h} v ${e.a}` : null);
/** "Sat 8 Nov, 7:30 pm", as a fixture's card says it. */
const whenWords = (day?: string, time?: string): string => [day ? dayLabel(day) : null, time ? timeLabel(time) : null].filter(Boolean).join(", ");
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A result in a line: "Titans beat Kings by 12 runs" when the page's own
 * words ("Titans won by 12 runs", describeResult's or the scorecard's)
 * name one of the two teams exactly; anything else is said as it is after
 * the two names ("Titans v Kings: Match tied").
 */
export function resultLine(home: string, away: string, words: string): string {
  for (const [who, other] of [[home, away], [away, home]] as const) {
    if (words === `${who} won`) return `${who} beat ${other}`;
    if (words.startsWith(`${who} won by `)) return `${who} beat ${other} by ${words.slice(`${who} won by `.length)}`;
  }
  return `${home} v ${away}: ${words}`;
}

/** The page's own words for a stored result: the sender's (a scorecard's, a turf session's), else describeResult's. */
function resultWords(e: Extract<LogEntry, { k: "res" | "fix" }>): string | null {
  if (e.x) return e.x;
  if (!e.s || !e.w || !e.h || !e.a) return null;
  const inn = (runs: number, wickets: number) => ({ runs, wickets, balls: 0 });
  return describeResult({ id: "", teamA: e.h, teamB: e.a, a: inn(e.s[0], e.s[1]), b: inn(e.s[2], e.s[3]), result: e.w }, e.bf ?? "a");
}

function resultText(e: Fx, words: string | null): string {
  const said = e.h && e.a ? (words ? resultLine(e.h, e.a, words) : `${e.h} v ${e.a}: result in`) : (words ?? "Result in");
  return `${e.p ? `${PLACE_TITLE[e.p]}: ` : ""}${said}`;
}

type Ctx = { format: Format; matches: number };

/** One stored entry in words, or null when there is nothing to say (also for a kind this build doesn't know). */
export function logLine(e: LogEntry, ctx: Ctx): { kind: ActivityKind; text: string } | null {
  switch (e.k) {
    case "name":
      return { kind: "settings", text: `Tournament renamed: ${e.to}` };
    case "venue":
      if (e.from && e.to) return e.from === e.to ? null : { kind: "venue", text: `Venue changed: ${e.from} → ${e.to}` };
      return e.to ? { kind: "venue", text: `Venue set: ${e.to}` } : { kind: "venue", text: "Venue taken off" };
    case "dates": {
      const to = rangeLabel(e.ts ?? null, e.te ?? null);
      const from = rangeLabel(e.fs ?? null, e.fe ?? null);
      if (!to) return from ? { kind: "dates", text: "Dates taken off" } : null;
      return { kind: "dates", text: `${from ? "Dates changed" : "Dates set"}: ${lower(to)}` };
    }
    case "overs":
      if (e.from !== undefined && e.to !== undefined) return { kind: "settings", text: `Overs a side changed: ${e.from} → ${e.to}` };
      return e.to !== undefined ? { kind: "settings", text: `Overs a side set: ${e.to}` } : { kind: "settings", text: "Overs a side no longer set" };
    case "points":
      return { kind: "settings", text: `Points changed: win ${e.p[0]}, tie ${e.p[1]}, no result ${e.p[2]}${e.p[3] ? `, loss ${e.p[3]}` : ""}` };
    case "format":
      return { kind: "settings", text: `Format changed: ${formatLabel({ format: ctx.format, legs: e.legs, matches: ctx.matches, playoffs: e.playoffs })}` };
    case "team":
      return { kind: "team", text: `Team renamed: ${e.from} → ${e.to}` };
    case "team_add":
      return { kind: "team", text: `Team added: ${e.to}` };
    case "fx_add": {
      const pair = pairOf(e);
      const when = whenWords(e.d, e.t);
      const tail = `${pair ? `: ${pair}` : ""}${when ? `${pair ? ", " : ": "}${when}` : ""}`;
      return { kind: "added", text: `${e.p ? `${PLACE_TITLE[e.p]} added` : "Match added"}${tail}` };
    }
    case "fx_out": {
      const pair = pairOf(e);
      return { kind: "out", text: `${e.p ? `${PLACE_TITLE[e.p]} taken out` : "Match taken out"}${pair ? `: ${pair}` : ""}` };
    }
    case "fx_teams": {
      const pair = pairOf(e);
      if (e.p) return { kind: "changed", text: pair ? `${PLACE_TITLE[e.p]} set: ${pair}` : `${PLACE_TITLE[e.p]}: teams to be decided` };
      return pair ? { kind: "changed", text: `Match changed: now ${pair}` } : null;
    }
    case "fx_move": {
      const subject = e.p ? PLACE_TITLE[e.p] : (pairOf(e) ?? "A match");
      const from = whenWords(e.fd, e.ft);
      const to = whenWords(e.d, e.t);
      if (from === to) return null;
      if (from && to) return { kind: "moved", text: `${subject} moved: ${from} → ${to}` };
      return { kind: "moved", text: to ? `${subject} set for ${to}` : `${subject}: date to be set` };
    }
    case "live": {
      const pair = pairOf(e);
      return { kind: "live", text: `${e.p ? (pair ? `${PLACE_TITLE[e.p]}: ${pair}` : PLACE_TITLE[e.p]) : (pair ?? "A match")} went live` };
    }
    case "res":
      return { kind: "result", text: resultText(e, resultWords(e)) };
    case "fix":
      return { kind: "fixed", text: `${e.live ? "Result updated" : "Result corrected"}: ${resultText(e, resultWords(e))}` };
    case "clear": {
      const pair = pairOf(e);
      const what = [e.p ? PLACE_TITLE[e.p] : null, pair].filter(Boolean).join(", ");
      return { kind: "cleared", text: `Result cleared${what ? `: ${what}` : ""}` };
    }
    case "draw":
      return { kind: "draw", text: e.to === "semis" ? "League stage over: the semi-finals are set" : "League stage over: the final is set" };
    case "done":
      return { kind: "finished", text: ctx.format === "bilateral" ? "Series finished" : "Tournament finished" };
    default:
      return null;
  }
}

/** Entries after which the winner named now may not be the winner of then. */
const MOVES_TITLE: ReadonlySet<LogEntry["k"]> = new Set(["res", "fix", "clear", "fx_add", "fx_out", "fx_teams", "team"]);

export type ActivityInput = {
  tournament: Pick<Tournament, "createdAt" | "settings" | "teams">;
  /** The page's own reading of the fixtures (lib/tournament/standings.ts resolve). */
  res: Pick<Resolution, "fixtures" | "played" | "total" | "leagueDone" | "champion" | "series">;
  /** Who started it, as the page was served them; nobody is named otherwise. */
  host?: Pick<TournamentHost, "name"> | null;
  /** The stored log, oldest first; left out when it could not be asked. */
  log?: readonly LogEntry[];
  /** How many entries the database has; more than `log` holds while only the newest rode in. */
  total?: number;
};

/**
 * The timeline, newest first: what the page can work out, and the stored
 * log. "Finished" and "the playoffs are set" are said once each, by their
 * newest entry, and only while they are true (a match added after a
 * series was level is not a second ending); the winner is named only when
 * nothing has changed the results since.
 */
export function activityLines(i: ActivityInput): ActivityLine[] {
  const t = i.tournament;
  const log = i.log ?? [];
  const partial = (i.total ?? log.length) > log.length;
  const oldest = log[0]?.at ?? 0;
  const ctx: Ctx = { format: t.settings.format, matches: t.settings.matches };
  const out: (ActivityLine & { order: number })[] = [];
  let order = 0;
  const add = (line: ActivityLine) => out.push({ ...line, order: order++ });

  const created = instant(t.createdAt);
  if (created !== null) {
    const verb = startVerb(created, t.settings.starts) === "Set up" ? "set up" : "started";
    add({ key: "started", at: created, kind: "started", text: i.host?.name ? `${i.host.name} ${verb} the tournament` : `Tournament ${verb}` });
  }

  const byId = new Map(i.res.fixtures.map((r) => [r.fixture.id, r]));
  const finished = i.res.total > 0 && i.res.played >= i.res.total;
  const lastOf = (k: LogEntry["k"]) => log.reduce((at, e, n) => (e.k === k ? n : at), -1);
  const lastDone = lastOf("done");
  const lastDraw = lastOf("draw");
  // The newest time each fixture went live, and the newest result a live scorecard gave it: the scorecard the
  // fixture has now is the one those are about (the log keeps no scorecard's code, so an older one is never linked).
  const lastLink = new Map<number, number>();
  const lastLive = new Map<number, number>();
  log.forEach((e, n) => {
    if (e.k === "live") lastLink.set(e.f, n);
    if ((e.k === "res" || e.k === "fix") && e.live) lastLive.set(e.f, n);
  });
  const seen = new Map<string, number>();
  log.forEach((e, n) => {
    if (e.k === "done" && (n !== lastDone || !finished)) return;
    if (e.k === "draw" && (n !== lastDraw || !i.res.leagueDone)) return;
    const said = logLine(e, ctx);
    if (!said) return;
    let text = said.text;
    let href: string | undefined;
    if (e.k === "done" && !log.slice(n + 1).some((x) => MOVES_TITLE.has(x.k))) {
      const champion = i.res.champion && "id" in i.res.champion ? (t.teams.find((x: Team) => x.id === (i.res.champion as { id: number }).id)?.name ?? null) : null;
      if (ctx.format === "bilateral") text += champion ? `. ${champion} won the series` : i.res.champion ? ". Series drawn" : "";
      else text += champion ? `. Champions: ${champion}` : i.res.champion ? ". Title shared" : "";
    }
    if (e.k === "live" && lastLink.get(e.f) === n) {
      // Linked only while the fixture's own card links there: being scored, or finished with the scorecard's result.
      const r = byId.get(e.f);
      if (r?.fixture.live && !r.fixture.result && (r.state === "live" || (r.state === "done" && r.source === "live"))) href = `/live/${r.fixture.live}`;
    }
    if ((e.k === "res" || e.k === "fix") && e.live && lastLive.get(e.f) === n && (lastLink.get(e.f) ?? -1) < n) {
      const r = byId.get(e.f);
      if (r?.fixture.live && r.state === "done" && r.source === "live") href = `/live/${r.fixture.live}`;
    }
    const id = `${e.at}.${e.k}.${"f" in e ? e.f : 0}`;
    const dup = seen.get(id) ?? 0;
    seen.set(id, dup + 1);
    add({ key: `l${id}.${dup}`, at: e.at, kind: said.kind, text, ...(href ? { href } : {}) });
  });

  // A result from a finished live scorecard the log has no entry for (it came in before the log was kept).
  for (const r of i.res.fixtures) {
    const l: LiveNow | null = r.live;
    const at = instant(l?.updatedAt);
    if (!l || l.status !== "done" || !l.result || r.fixture.result || at === null || !r.fixture.live || !r.homeName || !r.awayName) continue;
    if (lastLive.has(r.fixture.id)) continue;
    // Only the newest entries rode in: an older result may be in the part not sent, so it waits for the whole log.
    if (partial && at < oldest) continue;
    const p: Place | undefined = r.fixture.stage === "final" ? "f" : r.fixture.stage === "semi" ? (r.fixture.slot === "s2" ? "s2" : "s1") : undefined;
    add({ key: `d${r.fixture.id}`, at, kind: "result", text: resultText({ f: r.fixture.id, h: r.homeName, a: r.awayName, p }, l.result.text || null), href: `/live/${r.fixture.live}` });
  }

  // Newest first; at the same moment, the later one noted first.
  return out.sort((a, b) => b.at - a.at || b.order - a.order).map((e) => ({ key: e.key, at: e.at, kind: e.kind, text: e.text, ...(e.href ? { href: e.href } : {}) }));
}

/** A tournament taken down says only that, and when (tournament_get's updated_at of a removed row is when it was taken down). */
export function takenDownLine(updatedAt: unknown): ActivityLine | null {
  const at = instant(updatedAt);
  return at === null ? null : { key: "off", at, kind: "off", text: "Tournament taken down" };
}

/** The first ten, and how many more "Show all" shows. */
export function activityView(lines: readonly ActivityLine[], all: boolean): { shown: readonly ActivityLine[]; more: number } {
  return all || lines.length <= ACTIVITY_SHOWN ? { shown: lines, more: 0 } : { shown: lines.slice(0, ACTIVITY_SHOWN), more: lines.length - ACTIVITY_SHOWN };
}

/**
 * "2 h ago" with "Sun 22 Nov, 9:14 pm" (India) behind it, as the
 * masthead's "Updated" line says a time; from a week on the day and time
 * say it all (ago null).
 */
export function activityWhen(e: Pick<ActivityLine, "at">, now: number): { ago: string | null; stamp: string; iso: string } {
  const old = now - e.at >= 86_400_000 && istDayNumber(now) - istDayNumber(e.at) > 6;
  return { ago: old ? null : agoWords(e.at, now), stamp: stampWords(e.at, now), iso: new Date(e.at).toISOString() };
}
