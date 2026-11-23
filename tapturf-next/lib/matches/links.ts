import { SPORT_LIST } from "../board/sports";
import { agoWords, instant, stampWords } from "../games/when";
import { LIVE_CODE_RE, liveIdleClosed } from "../live/types";

/**
 * "My live matches" on the Me tab's Matches (the site owner, 23 Nov 2026):
 * the live links the signed-in player started, as
 * public.live_links_mine answers them
 * (supabase/migrations/20261124_live_mine.sql) with the score line the
 * server worked out (lib/matches/server.ts), and every word a row says.
 * Shown to that player alone. Pure, relative imports only, tested in
 * matches.test.ts (npm run test:matches).
 */

/** At most this many come back (the migration's own limit). */
export const LINKS_MAX = 30;

export type MineLink = {
  code: string;
  /** cricket: the Live Cricket Scorer; board: the Live Scoreboard. */
  tool: "cricket" | "board";
  /** As the database has it: a live link closed for want of updates still says live (linkState words it). */
  status: "live" | "done";
  startedAt: string;
  updatedAt: string;
  /** A board's sport ("football"); null for cricket. */
  sport: string | null;
  /** The two sides: as now when the score line could be worked out (after renames), else as typed at the start. */
  teamA: string;
  teamB: string;
  title: string;
  /** The tournament it is a fixture of (not taken out, the tournament on), or null. */
  tournament: { code: string; name: string } | null;
  /** The score line or result as the follower page says it; null when it was not worked out. */
  line: string | null;
};

/** GET /api/live/mine. list null: it can't be read right now (before 20261124_live_mine.sql too). */
export type MineLinksResponse = { list: MineLink[] | null };

const clean = (x: unknown, max: number): string => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** live_links_mine's list, row by row; anything that is not a link is left out, never thrown. No score lines yet. */
export function toMineLinks(data: unknown): MineLink[] {
  const list = Array.isArray((data as { list?: unknown } | null)?.list) ? (data as { list: unknown[] }).list : [];
  const out: MineLink[] = [];
  for (const row of list) {
    const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const updated = instant(x.updated_at);
    if (typeof x.code !== "string" || !LIVE_CODE_RE.test(x.code) || updated === null) continue;
    if (x.status !== "live" && x.status !== "done") continue;
    const started = instant(x.started_at);
    const tCode = typeof x.tournament === "string" && LIVE_CODE_RE.test(x.tournament) ? x.tournament : null;
    const tName = clean(x.tournament_name, 60);
    out.push({
      code: x.code,
      tool: x.tool === "board" ? "board" : "cricket",
      status: x.status,
      startedAt: new Date(started ?? updated).toISOString(),
      updatedAt: new Date(updated).toISOString(),
      sport: clean(x.sport, 24) || null,
      teamA: clean(x.team_a, 40),
      teamB: clean(x.team_b, 40),
      title: clean(x.title, 60),
      tournament: tCode ? { code: tCode, name: tName || "Tournament" } : null,
      line: null,
    });
    if (out.length >= LINKS_MAX) break;
  }
  return out;
}

/** GET /api/live/mine's body as the browser reads it: the list, or null. */
export function readMineLinks(body: unknown): MineLink[] | null {
  const list = (body as { list?: unknown } | null)?.list;
  if (!Array.isArray(list)) return null;
  // The route sends MineLink rows; each is checked again, field by field.
  const out: MineLink[] = [];
  for (const row of list) {
    const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const t = (x.tournament && typeof x.tournament === "object" ? x.tournament : null) as Record<string, unknown> | null;
    const [one] = toMineLinks({ list: [{ code: x.code, tool: x.tool, status: x.status, started_at: x.startedAt, updated_at: x.updatedAt, sport: x.sport, team_a: x.teamA, team_b: x.teamB, title: x.title, tournament: t?.code, tournament_name: t?.name }] });
    if (one) out.push({ ...one, line: clean(x.line, 200) || null });
  }
  return out;
}

/** What a link is right now. stopped: live, with no update for 2 hours (it takes no more, and keeps its last score). */
export type LinkState = "live" | "finished" | "stopped";

export function linkState(l: Pick<MineLink, "status" | "updatedAt">, now: number): LinkState {
  if (l.status === "done") return "finished";
  return liveIdleClosed(l.status, instant(l.updatedAt), now) ? "stopped" : "live";
}

export const STATE_WORD: Record<LinkState, string> = { live: "Live", finished: "Finished", stopped: "Stopped" };

/** "Cricket", "Football", "Table Tennis"; a board of a sport this build doesn't know is "Scoreboard". */
export function sportWord(l: Pick<MineLink, "tool" | "sport">): string {
  if (l.tool === "cricket" && !l.sport) return "Cricket";
  const s = SPORT_LIST.find((x) => x.sport === l.sport);
  return s && s.sport !== "other" ? s.label : "Scoreboard";
}

/** "Titans vs Royals", as the scorers and the follower page name a match; one side alone, or what it is when neither is known. */
export function sidesTitle(a: string, b: string, fallback: string): string {
  const A = a.trim();
  const B = b.trim();
  if (A && B) return `${A} vs ${B}`;
  return A || B || fallback;
}

export function linkTitle(l: Pick<MineLink, "teamA" | "teamB" | "tool" | "sport">): string {
  return sidesTitle(l.teamA, l.teamB, `${sportWord(l)} match`);
}

/** When: "Updated 2 min ago" while it is live; the India day and time of the last score once it is not ("Sun 22 Nov, 7:41 PM"). */
export function linkWhen(l: Pick<MineLink, "status" | "updatedAt">, now: number): string {
  const at = instant(l.updatedAt);
  if (at === null) return "";
  return linkState(l, now) === "live" ? `Updated ${agoWords(at, now)}` : stampWords(at, now);
}

/**
 * The line under the two sides: the score line or result as the follower
 * page says it. Left out when it only repeats the title (a match with
 * nothing scored yet reads "Red FC vs Blue FC") or was not worked out;
 * a stopped link's is the last score, and says so.
 */
export function linkLine(l: Pick<MineLink, "line" | "teamA" | "teamB" | "tool" | "sport" | "status" | "updatedAt">, now: number): string | null {
  const line = l.line?.trim();
  if (!line || line === linkTitle(l)) return null;
  return linkState(l, now) === "stopped" ? `Last score: ${line}` : line;
}

/** Live ones first, then the rest; each group by its last update, newest first (then by code, so the order never flickers). */
export function orderLinks<T extends Pick<MineLink, "status" | "updatedAt" | "code">>(list: readonly T[], now: number): T[] {
  const rank = (l: T) => (linkState(l, now) === "live" ? 0 : 1);
  const at = (l: T) => instant(l.updatedAt) ?? 0;
  return [...list].sort((x, y) => rank(x) - rank(y) || at(y) - at(x) || (x.code < y.code ? -1 : x.code > y.code ? 1 : 0));
}

/** How many of the server's list are live right now. */
export function liveLinks(list: readonly Pick<MineLink, "status" | "updatedAt">[] | null, now: number): number {
  return (list ?? []).filter((l) => linkState(l, now) === "live").length;
}
