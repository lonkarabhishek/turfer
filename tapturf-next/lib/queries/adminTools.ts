import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { readAllPages, rowsOf, type Reason, type Section } from "@/lib/admin/section";
import { toAdminLiveLink, type AdminLiveLink } from "@/lib/admin/live";
import { summarizeToolUsage, type CountedTool, type LiveRow, type ToolUsage, type UseRow } from "@/lib/tools/usage";
import type { ToolActivityRow, ToolCountRow, ToolUserRow, WhoFilter } from "@/lib/tools/users";

export type { ToolUsage };

export type ToolUsersResult =
  | { ok: true; rows: ToolUserRow[]; counts: ToolCountRow[]; activity: ToolActivityRow[] }
  | { ok: false; reason: Reason };

/**
 * Who used the free tools and what they used (logged from 27 Oct 2026,
 * supabase/migrations/20261027_tool_users.sql), for /admin/tools, in three
 * bounded reads at once: the newest people (at most `people`, one row
 * each with their tools; for one tool and signed in or guests when asked,
 * admin_tool_users), how many people and uses each tool has
 * (admin_tool_counts, for the filters and totals), and the latest uses
 * (admin_tool_activity). Site owner only, with the visitor's own session
 * and Firebase token. Says why when it can't read; never throws.
 */
export async function getToolUsers(tool: CountedTool | null, who: WhoFilter, people = 300, recent = 100): Promise<ToolUsersResult> {
  const p_who = who === "all" ? null : who;
  const [users, counts, activity] = await Promise.all([
    ownerRead("admin_tool_users", async ({ supabase, token }, signal) =>
      rowsOf<ToolUserRow>(await supabase.rpc("admin_tool_users", { p_firebase_token: token, p_tool: tool, p_who, p_limit: people }).abortSignal(signal), "admin_tool_users"),
    ),
    ownerRead("admin_tool_counts", async ({ supabase, token }, signal) =>
      rowsOf<ToolCountRow>(await supabase.rpc("admin_tool_counts", { p_firebase_token: token, p_who }).abortSignal(signal), "admin_tool_counts"),
    ),
    ownerRead("admin_tool_activity", async ({ supabase, token }, signal) =>
      rowsOf<ToolActivityRow>(await supabase.rpc("admin_tool_activity", { p_firebase_token: token, p_tool: tool, p_who, p_limit: recent }).abortSignal(signal), "admin_tool_activity"),
    ),
  ]);
  if (!users.ok) return users;
  if (!counts.ok) return counts;
  if (!activity.ok) return activity;
  return { ok: true, rows: users.data, counts: counts.data, activity: activity.data };
}

/**
 * How much the free tools are used, for the admin: live scoreboard links
 * (public.live_matches, by day and status) and the counted uses of every
 * tool (private.tool_uses, counted since 26 Oct 2026). Through
 * admin_live_matches() and admin_tool_uses(), which answer only the site
 * owner, with the visitor's own session and Firebase token. A part that
 * can't be read is null; never throws.
 */

export const getToolUsage = cache(async (): Promise<ToolUsage> => {
  const read = async <T,>(fn: string): Promise<T[] | null> => {
    const s = await ownerRead(fn, ({ supabase, token }, signal) =>
      readAllPages<T>((from, to) => supabase.rpc(fn, { p_firebase_token: token }).range(from, to).abortSignal(signal), fn),
    );
    return s.ok ? s.data : null;
  };
  const [liveRows, useRows] = await Promise.all([read<LiveRow>("admin_live_matches"), read<UseRow>("admin_tool_uses")]);
  return summarizeToolUsage(liveRows, useRows);
});

export type { AdminLiveLink };

export const LIVE_FILTERS = {
  all: "All links",
  live: "Live now",
  done: "Finished",
  stopped: "Stopped or expired",
} as const;
export type LiveFilter = keyof typeof LIVE_FILTERS;

/**
 * Live links newest first, with who started each (admin_live_links2,
 * owner only), every one or the first `limit`. Before
 * 20261029_live_link_starts.sql is applied that read is not there: the
 * links come from admin_live_links, every starter "Not recorded".
 */
async function readLiveLinks(limit: number | null): Promise<Section<AdminLiveLink[]>> {
  const read = (fn: string) =>
    ownerRead(fn, async ({ supabase, token }, signal): Promise<Record<string, unknown>[]> =>
      limit === null
        ? readAllPages<Record<string, unknown>>((from, to) => supabase.rpc(fn, { p_firebase_token: token }).range(from, to).abortSignal(signal), fn)
        : rowsOf<Record<string, unknown>>(await supabase.rpc(fn, { p_firebase_token: token }).range(0, limit - 1).abortSignal(signal), fn),
    );
  let s = await read("admin_live_links2");
  if (!s.ok && s.reason === "not_set_up") s = await read("admin_live_links");
  return s.ok ? { ok: true, data: s.data.map(toAdminLiveLink) } : s;
}

/** Every live scoreboard link, newest first, with its starter; or why it can't be read. */
export async function getAdminLiveLinks(filter: LiveFilter = "all"): Promise<Section<AdminLiveLink[]>> {
  const s = await readLiveLinks(null);
  if (!s.ok || filter === "all") return s;
  return { ok: true, data: s.data.filter((r) => (filter === "stopped" ? r.status === "stopped" || r.status === "expired" : r.status === filter)) };
}

/** The newest live link and who started it, for the admin home (null: none yet). */
export const getLatestLiveLink = cache(async (): Promise<Section<AdminLiveLink | null>> => {
  const s = await readLiveLinks(1);
  return s.ok ? { ok: true, data: s.data[0] ?? null } : s;
});
