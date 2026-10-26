import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/queries/turfs";
import { summarizeToolUsage, type CountedTool, type LiveRow, type ToolUsage, type UseRow } from "@/lib/tools/usage";
import type { ToolActivityRow, ToolUserRow, WhoFilter } from "@/lib/tools/users";

export type { ToolUsage };

export type ToolUsersResult =
  | { ok: true; rows: ToolUserRow[]; activity: ToolActivityRow[] }
  | { ok: false; reason: "not_set_up" | "not_allowed" | "error" };

type RpcError = { code?: string; message?: string } | null;
const reasonOf = (error: RpcError): "not_set_up" | "not_allowed" | "error" =>
  error?.code === "42501" ? "not_allowed" : error?.code === "PGRST202" || error?.code === "42883" ? "not_set_up" : "error";

/**
 * Who used the free tools and what they used (logged from 27 Oct 2026,
 * supabase/migrations/20261027_tool_users.sql), for /admin/tools: every
 * person and tool (admin_tool_users, paged like fetchAllRows), and the
 * latest uses, for one tool and signed in or guests when asked
 * (admin_tool_activity). Site owner only, with the visitor's own session
 * and Firebase token. Says why when it can't read; never throws.
 */
export async function getToolUsers(tool: CountedTool | null, who: WhoFilter, recent = 100): Promise<ToolUsersResult> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const PAGE = 500;
    const rows: ToolUserRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.rpc("admin_tool_users", { p_firebase_token: token }).range(from, from + PAGE - 1);
      if (error) {
        console.warn("admin_tool_users failed", error.code, error.message);
        return { ok: false, reason: reasonOf(error) };
      }
      const page = (data ?? []) as ToolUserRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    const { data, error } = await supabase.rpc("admin_tool_activity", {
      p_firebase_token: token,
      p_tool: tool,
      p_who: who === "all" ? null : who,
      p_limit: recent,
    });
    if (error) {
      console.warn("admin_tool_activity failed", error.code, error.message);
      return { ok: false, reason: reasonOf(error) };
    }
    return { ok: true, rows, activity: (data ?? []) as ToolActivityRow[] };
  } catch (e) {
    console.warn("admin tool users threw", e);
    return { ok: false, reason: "error" };
  }
}

/**
 * How much the free tools are used, for the admin: live scoreboard links
 * (public.live_matches, by day and status) and the counted uses of every
 * tool (private.tool_uses, counted since 26 Oct 2026). Through
 * admin_live_matches() and admin_tool_uses(), which answer only the site
 * owner, with the visitor's own session and Firebase token. A part that
 * can't be read is null; never throws.
 */

export async function getToolUsage(): Promise<ToolUsage> {
  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  let token: string | null;
  try {
    supabase = await createServerClient();
    token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  } catch (e) {
    console.warn("admin tool usage: no client", e);
    return { live: null, uses: null };
  }
  const read = <T,>(fn: string) =>
    fetchAllRows<T>((from, to) => supabase.rpc(fn, { p_firebase_token: token }).range(from, to)).catch((e) => {
      console.warn(`${fn} failed`, e);
      return null;
    });
  const [liveRows, useRows] = await Promise.all([read<LiveRow>("admin_live_matches"), read<UseRow>("admin_tool_uses")]);
  return summarizeToolUsage(liveRows, useRows);
}

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
  done: "Finished",
  stopped: "Stopped or expired",
} as const;
export type LiveFilter = keyof typeof LIVE_FILTERS;

/** Every live scoreboard link, newest first (admin_live_links, owner only); null when it can't be read. */
export async function getAdminLiveLinks(filter: LiveFilter = "all"): Promise<AdminLiveLink[] | null> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const rows = await fetchAllRows<AdminLiveLink>((from, to) => supabase.rpc("admin_live_links", { p_firebase_token: token }).range(from, to));
    if (filter === "all") return rows;
    return rows.filter((r) => (filter === "stopped" ? r.status === "stopped" || r.status === "expired" : r.status === filter));
  } catch (e) {
    console.warn("admin_live_links failed", e);
    return null;
  }
}
