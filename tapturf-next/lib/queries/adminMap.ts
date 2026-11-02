import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { dataOf, type Section } from "@/lib/admin/section";
import { toMapUsage, type MapUsage } from "@/lib/map/usage";

/** As many signed-in people as admin_map_usage gives (its cap), so the people list can say who used the map. */
const PEOPLE = 1000;

/**
 * How the map is used (counted from 2 Nov 2026, 20261102_map_views.sql),
 * for the admin home's Map section, its glance and the people list: one
 * read per render, through admin_map_usage(), which answers only the site
 * owner, with the visitor's own session and Firebase token. Before the
 * file is applied the reason is not_set_up. Never throws.
 */
export const adminMapUsage = cache(async (): Promise<Section<MapUsage>> => {
  const s = await ownerRead("admin_map_usage", async ({ supabase, token }, signal) =>
    dataOf<unknown>(await supabase.rpc("admin_map_usage", { p_firebase_token: token, p_limit: PEOPLE }).abortSignal(signal), "admin_map_usage"),
  );
  if (!s.ok) return s;
  const usage = toMapUsage(s.data);
  if (!usage) {
    console.warn("admin_map_usage: an answer that isn't one");
    return { ok: false, reason: "error" };
  }
  return { ok: true, data: usage };
});
