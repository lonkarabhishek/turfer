import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { readAllPages, rowsOf, type Reason, type Section } from "@/lib/admin/section";
import { summarizeToolUsage, type CountedTool, type LiveRow, type ToolUsage, type UseRow } from "@/lib/tools/usage";
import type { ToolActivityRow, ToolCountRow, ToolUserRow, WhoFilter } from "@/lib/tools/users";
import { liveStatusAt } from "@/lib/live/types";

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

/** One live scoreboard link, as admin_live_links returns it. */
export type AdminLiveLink = {
  code: string;
  status: string;
  sport: string | null;
  team_a: string | null;
  team_b: string | null;
  title: string | null;
  venue: string | null;
  events: number;
  writes: number;
  created_at: string;
  updated_at: string;
};

export const LIVE_FILTERS = {
  all: "All links",
  live: "Live now",
  closed: "Closed (idle)",
  done: "Finished",
  stopped: "Stopped or expired",
} as const;
export type LiveFilter = keyof typeof LIVE_FILTERS;

/**
 * A link's status as the admin shows it (liveStatusAt): a live one with no
 * update for 2 hours is "closed", not live, though the database still says
 * live (20261029_live_idle_close.sql works it out the same way).
 */
export function adminLiveStatus(l: Pick<AdminLiveLink, "status" | "updated_at">, now: number): string {
  return liveStatusAt(l.status, Date.parse(l.updated_at), now);
}

/** Every live scoreboard link, newest first (admin_live_links, owner only); or why it can't be read. */
export async function getAdminLiveLinks(filter: LiveFilter = "all", now = Date.now()): Promise<Section<AdminLiveLink[]>> {
  const s = await ownerRead("admin_live_links", ({ supabase, token }, signal) =>
    readAllPages<AdminLiveLink>((from, to) => supabase.rpc("admin_live_links", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_live_links"),
  );
  if (!s.ok || filter === "all") return s;
  return { ok: true, data: s.data.filter((r) => (filter === "stopped" ? r.status === "stopped" || r.status === "expired" : adminLiveStatus(r, now) === filter)) };
}
