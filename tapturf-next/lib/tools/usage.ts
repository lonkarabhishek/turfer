/**
 * The free tools' uses, counted for the admin (private.tool_uses, see
 * supabase/migrations/20261026_tool_uses.sql): a tool's own "started"
 * and "finished" analytics events, a short tag (a Live Scoreboard's
 * sport) and nothing about who. Pure, so the browser's beacon and
 * /api/tools/use read events the same way.
 */

/** The tools counted: the same list as tool_use_count. */
export const COUNTED_TOOLS = ["live_scorer", "live_scoreboard", "scorecard_maker", "tournament_scorer", "toss", "nrr_calculator", "team_generator"] as const;
export type CountedTool = (typeof COUNTED_TOOLS)[number];
export type ToolUse = { tool: CountedTool; event: "started" | "finished"; detail: string | null };

const TAG = /^[a-z0-9_-]{1,24}$/;

/** The use an analytics event counts as: tool_used is started, tool_result_generated is finished; anything else is none. */
export function toolUseOf(event: string, tool: string, params: Record<string, unknown> = {}): ToolUse | null {
  const t = COUNTED_TOOLS.find((x) => x === tool);
  const e = event === "tool_used" ? "started" : event === "tool_result_generated" ? "finished" : null;
  if (!t || !e) return null;
  const sport = typeof params.sport === "string" ? params.sport.toLowerCase() : "";
  return { tool: t, event: e, detail: TAG.test(sport) ? sport : null };
}

/** A request body for /api/tools/use as a use, or null when it isn't one. */
export function readUse(body: unknown): ToolUse | null {
  if (!body || typeof body !== "object") return null;
  const { tool, event, detail } = body as Record<string, unknown>;
  const t = COUNTED_TOOLS.find((x) => x === tool);
  if (!t || (event !== "started" && event !== "finished")) return null;
  return { tool: t, event, detail: typeof detail === "string" && TAG.test(detail) ? detail : null };
}

// ---------------------------------------------------------------------------
// The admin's summary (lib/queries/adminTools.ts reads the rows)

export type UseRow = { day: string; tool: string; event: string; detail: string; n: number };
export type LiveRow = { day: string; status: string; n: number };

export type ToolUsage = {
  live: { total: number; last7: number; liveNow: number; first: string | null } | null;
  uses: { started: Record<CountedTool | string, number>; finished: Record<CountedTool | string, number>; started7: Record<string, number>; boardSports: Record<string, number>; since: string | null } | null;
};

/** The day in India, days ago (YYYY-MM-DD). */
function istDay(daysAgo: number, now = Date.now()): string {
  return new Date(now + 330 * 60_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function summarizeToolUsage(liveRows: LiveRow[] | null, useRows: UseRow[] | null, now = Date.now()): ToolUsage {
  const weekAgo = istDay(7, now);
  const live = liveRows
    ? {
        total: liveRows.reduce((s, r) => s + r.n, 0),
        last7: liveRows.filter((r) => r.day > weekAgo).reduce((s, r) => s + r.n, 0),
        liveNow: liveRows.filter((r) => r.status === "live").reduce((s, r) => s + r.n, 0),
        first: liveRows[0]?.day ?? null,
      }
    : null;
  let uses: ToolUsage["uses"] = null;
  if (useRows) {
    const started: Record<string, number> = {};
    const finished: Record<string, number> = {};
    const started7: Record<string, number> = {};
    const boardSports: Record<string, number> = {};
    for (const r of useRows) {
      const into = r.event === "started" ? started : r.event === "finished" ? finished : null;
      if (!into) continue;
      into[r.tool] = (into[r.tool] ?? 0) + r.n;
      if (r.event === "started" && r.day > weekAgo) started7[r.tool] = (started7[r.tool] ?? 0) + r.n;
      if (r.event === "started" && r.tool === "live_scoreboard" && r.detail) boardSports[r.detail] = (boardSports[r.detail] ?? 0) + r.n;
    }
    uses = { started, finished, started7, boardSports, since: useRows[0]?.day ?? null };
  }
  return { live, uses };
}
