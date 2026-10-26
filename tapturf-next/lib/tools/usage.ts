/**
 * The free tools' uses, for the admin: a tool's own "started" and
 * "finished" analytics events. Each is counted per day (private.tool_uses,
 * supabase/migrations/20261026_tool_uses.sql, with a Live Scoreboard's
 * sport) and, from 27 Oct 2026, also kept as one row with who used it and
 * what (private.tool_use_log, 20261027_tool_users.sql): a few short tags
 * the tool already sends (sport, format, overs, players, teams, matches;
 * never typed text) and a live link's code. The browser never names who:
 * the server verifies the sign-in it sends (lib/account/toolRoutes.ts);
 * without one the use is a guest's, under a random device tag. Pure, so
 * the browser and /api/tools/use read events the same way. No imports.
 */

/** The tools counted: the same list as tool_use_count and tool_use_record. */
export const COUNTED_TOOLS = ["live_scorer", "live_scoreboard", "scorecard_maker", "tournament_scorer", "toss", "nrr_calculator", "team_generator"] as const;
export type CountedTool = (typeof COUNTED_TOOLS)[number];
/**
 * detail: the count's tag (a Live Scoreboard's sport), as before. tags: what
 * was used, up to 4 slugs ("football", "6-overs 11-a-side"). code: the live
 * link's code, for the two live tools.
 */
export type ToolUse = { tool: CountedTool; event: "started" | "finished"; detail: string | null; tags: string | null; code: string | null };

const TAG = /^[a-z0-9_-]{1,24}$/;
const TAGS = /^[a-z0-9_-]{1,24}( [a-z0-9_-]{1,24}){0,3}$/;
/** A live link's code (lib/live/types.ts LIVE_CODE_RE). */
const CODE = /^[a-z0-9]{12}$/;
const LIVE_TOOLS: readonly string[] = ["live_scorer", "live_scoreboard"];
/** The browser's device tag for a guest's uses (makeDeviceTag). */
export const DEVICE_RE = /^[a-z0-9]{8,32}$/;

const slug = (x: unknown): string | null => {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return TAG.test(v) ? v : null;
};
const whole = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x > 0 && x < 1000 ? x : null);

/**
 * What a use was, as up to 4 short tags from the event's own params: the
 * sport, format and mode, then the overs, players, teams and matches
 * counts. A cricket match's players are a side. Nothing else is read
 * (names, titles and results never are).
 */
export function tagsOf(tool: string, params: Record<string, unknown>): string | null {
  const out: string[] = [];
  for (const k of ["sport", "format", "mode"]) {
    const v = slug(params[k]);
    if (v) out.push(v);
  }
  const counts: [string, string][] = [["overs", "overs"], ["players", tool === "live_scorer" ? "a-side" : "players"], ["teams", "teams"], ["matches", "matches"]];
  for (const [k, word] of counts) {
    const n = whole(params[k]);
    if (n !== null) out.push(`${n}-${word}`);
  }
  return out.length ? out.slice(0, 4).join(" ") : null;
}

/** A live link's code, for the two live tools only. */
const codeOf = (tool: string, x: unknown): string | null => (LIVE_TOOLS.includes(tool) && typeof x === "string" && CODE.test(x) ? x : null);

/** The use an analytics event counts as: tool_used is started, tool_result_generated is finished; anything else is none. */
export function toolUseOf(event: string, tool: string, params: Record<string, unknown> = {}): ToolUse | null {
  const t = COUNTED_TOOLS.find((x) => x === tool);
  const e = event === "tool_used" ? "started" : event === "tool_result_generated" ? "finished" : null;
  if (!t || !e) return null;
  return { tool: t, event: e, detail: slug(params.sport), tags: tagsOf(t, params), code: codeOf(t, params.code) };
}

/** A request body for /api/tools/use as a use, or null when it isn't one. A bad tag or code is left out. */
export function readUse(body: unknown): ToolUse | null {
  if (!body || typeof body !== "object") return null;
  const { tool, event, detail, tags, code } = body as Record<string, unknown>;
  const t = COUNTED_TOOLS.find((x) => x === tool);
  if (!t || (event !== "started" && event !== "finished")) return null;
  return {
    tool: t,
    event,
    detail: typeof detail === "string" && TAG.test(detail) ? detail : null,
    tags: typeof tags === "string" && TAGS.test(tags) ? tags : null,
    code: codeOf(t, code),
  };
}

/** The device tag in a request body, or null. */
export function readDevice(body: unknown): string | null {
  const d = body && typeof body === "object" ? (body as Record<string, unknown>).device : null;
  return typeof d === "string" && DEVICE_RE.test(d) ? d : null;
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A device tag (12 base36 characters) from random bytes: nothing about the person or the device. */
export function makeDeviceTag(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < 12; i++) out += BASE36[(bytes[i] ?? 0) % 36];
  return out;
}

/** The body /api/tools/use reads (readUse, readDevice). The device tag goes with every use: the server keeps it only for a guest's. */
export function toolUseBody(use: ToolUse, device: string | null): string {
  return JSON.stringify(device ? { ...use, device } : use);
}

/** A signed-in use: a fetch that outlives the page (keepalive) with the sign-in, which a beacon can't carry. */
export function signedInInit(body: string, token: string): RequestInit {
  return { method: "POST", body, keepalive: true, cache: "no-store", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` } };
}

/**
 * How long a match's start waits for its new live link's code at most
 * (LiveScorer, LiveScoreboard). The link's POST can take up to 12 s on a
 * bad network, and a tab closed meanwhile would lose the start: past this
 * it goes without the code, and the match's end carries it.
 */
export const START_CODE_WAIT_MS = 1_500;

/** What p resolves to, or undefined once ms pass first (or p fails). Never rejects. */
export function within<T>(p: PromiseLike<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    const done = (v: T | undefined) => {
      clearTimeout(timer);
      resolve(v);
    };
    p.then(done, () => done(undefined));
  });
}

/** An event's params for Google Analytics: without the live link's code, which is for TapTurf's own log only. */
export function gaParams<T extends Record<string, unknown>>(params: T): Omit<T, "code"> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (k !== "code") out[k] = v;
  return out as Omit<T, "code">;
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
