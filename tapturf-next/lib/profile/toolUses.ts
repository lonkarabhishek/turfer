import { COUNTED_TOOLS, type CountedTool } from "../tools/usage";
import type { ToolTrack, TrackCount } from "./medals";

/**
 * What the tool medals are worked out from (lib/profile/medals.ts): one
 * account's own uses of the free tools, as public.tool_uses_of answers
 * them from private.tool_use_log (20261122_tool_medals.sql; server key,
 * read by lib/profile/server.ts beside the player's games and reviews).
 *
 * Only uses made while signed in are there: the log keeps an account only
 * for a use whose sign-in the server verified (lib/account/toolRoutes.ts),
 * and a guest's row has none, so a guest's use can never count. Days are
 * India's dates, as every other medal's are.
 *
 * What a "finished" use is, tool by tool (the tools' own events):
 * live_scorer and live_scoreboard, a match scored to its end; a turf
 * session's matches are live_scorer matches. scorecard_maker, a card with
 * both teams and both scores in. toss, a coin that landed. team_generator,
 * a split made. tournament_scorer, a result saved to the table.
 * nrr_calculator, a net run rate worked out.
 *
 * Pure. Relative imports only (npm run test:profile).
 */

/** One tool: the day of its first use of any kind, and how many uses were finished on each day, oldest first. */
export type ToolDays = { first: string; days: [day: string, finished: number][] };

export type ToolUses = {
  tools: Partial<Record<CountedTool, ToolDays>>;
  /** The day each match with a live link on was scored to its end (one per link), oldest first. */
  live: string[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (x: unknown): x is string => typeof x === "string" && DAY.test(x);
/** What the read is capped at (the function's own caps; anything past them is left out here too). */
export const TOOL_DAYS_MAX = 100;
export const TOOL_LIVE_MAX = 20;

/**
 * public.tool_uses_of's answer ({r: "ok", tools: [{t, first, days: [[day,
 * n]]}], live: [day]}) as ToolUses, or null when it isn't one. A tool this
 * build doesn't count, a day that isn't a date or a count that isn't a
 * whole number from 1 up is left out, never guessed.
 */
export function parseToolUses(data: unknown): ToolUses | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.r !== "ok" || !Array.isArray(d.tools)) return null;
  const tools: ToolUses["tools"] = {};
  for (const row of d.tools) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const tool = COUNTED_TOOLS.find((t) => t === o.t);
    if (!tool || !isDay(o.first)) continue;
    const days: ToolDays["days"] = [];
    for (const pair of Array.isArray(o.days) ? o.days : []) {
      if (!Array.isArray(pair)) continue;
      const [day, n] = pair as unknown[];
      if (isDay(day) && typeof n === "number" && Number.isInteger(n) && n >= 1) days.push([day, Math.min(n, 999)]);
      if (days.length >= TOOL_DAYS_MAX) break;
    }
    days.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    tools[tool] = { first: o.first, days };
  }
  const live = (Array.isArray(d.live) ? d.live : []).filter(isDay).slice(0, TOOL_LIVE_MAX).sort();
  return { tools, live };
}

/** The most days a track lists: more than any medal's goal, so the day of the n-th is always there. */
const LISTED = 100;

/** Each finished use's day, oldest first (the first LISTED of them), and how many there were in all. */
function uses(...tools: (ToolDays | undefined)[]): TrackCount {
  const all = tools.flatMap((t) => t?.days ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const days: string[] = [];
  let have = 0;
  for (const [day, n] of all) {
    have += n;
    for (let i = 0; i < n && days.length < LISTED; i++) days.push(day);
  }
  return { have, days };
}

const NONE: Record<ToolTrack, TrackCount> = {
  scored: { have: 0, days: [] },
  cards: { have: 0, days: [] },
  tossDays: { have: 0, days: [] },
  teams: { have: 0, days: [] },
  results: { have: 0, days: [] },
  live: { have: 0, days: [] },
  kit: { have: 0, days: [] },
};

/**
 * How far each tool track has got, with the day each count was reached
 * (the day of the use that reached it). null (the log could not be read,
 * or the database has no read for it yet): every track at zero.
 */
export function toolProgress(u: ToolUses | null | undefined): Record<ToolTrack, TrackCount> {
  if (!u) return NONE;
  const t = u.tools;
  // A day counts once for the toss, however many times the coin was flipped on it.
  const tossed = [...new Set((t.toss?.days ?? []).map(([day]) => day))].sort();
  // A tool counts from its first use of any kind, started or finished.
  const firsts = COUNTED_TOOLS.map((tool) => t[tool]?.first)
    .filter(isDay)
    .sort();
  return {
    scored: uses(t.live_scorer, t.live_scoreboard),
    cards: uses(t.scorecard_maker),
    tossDays: { have: tossed.length, days: tossed },
    teams: uses(t.team_generator),
    results: uses(t.tournament_scorer),
    live: { have: u.live.length, days: [...u.live] },
    kit: { have: firsts.length, days: firsts },
  };
}
