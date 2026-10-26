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
