import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { dataOf, type Section } from "@/lib/admin/section";
import { toTrafficUsage, type TrafficUsage } from "@/lib/traffic/usage";

/** Full days in the Traffic section's chart (the 30 days' totals); today comes after them. */
const DAYS = 30;

/**
 * How much traffic the site has (20261104_traffic.sql, lib/traffic says what
 * counts), for the admin home's Traffic section and its glance: one read per
 * render, through admin_traffic(), which answers only the site owner, with
 * the visitor's own session and Firebase token. Before the file is applied
 * the reason is not_set_up. Never throws.
 */
export const adminTraffic = cache(async (): Promise<Section<TrafficUsage>> => {
  const s = await ownerRead("admin_traffic", async ({ supabase, token }, signal) =>
    dataOf<unknown>(await supabase.rpc("admin_traffic", { p_firebase_token: token, p_days: DAYS }).abortSignal(signal), "admin_traffic"),
  );
  if (!s.ok) return s;
  const usage = toTrafficUsage(s.data);
  if (!usage) {
    console.warn("admin_traffic: an answer that isn't one");
    return { ok: false, reason: "error" };
  }
  return { ok: true, data: usage };
});
