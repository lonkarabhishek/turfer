import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/queries/turfs";
import { summarizeToolUsage, type LiveRow, type ToolUsage, type UseRow } from "@/lib/tools/usage";

export type { ToolUsage };

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
