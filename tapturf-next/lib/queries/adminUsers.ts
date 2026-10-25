import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import { toPeople, type ContactEmailRow, type DetailsRow, type Person } from "@/lib/admin/people";
import { fetchAllRows } from "@/lib/queries/turfs";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

/**
 * Users with email and phone, for the admin pages. Through
 * admin_users(), which answers only the site owner (the same check as
 * get_recent_logins), so it runs with the visitor's own session and
 * Firebase token, never the anon client. Newest first. One read per
 * render for each set of ids; [] when not allowed or failing.
 */
const load = cache(async (key: string): Promise<AdminUserRow[]> => {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const ids = key === "*" ? null : key.split(",");
    const { data, error } = await supabase.rpc("admin_users", { p_firebase_token: token, p_ids: ids });
    if (error) {
      console.warn("admin_users failed", error.code, error.message);
      return [];
    }
    return (data ?? []) as AdminUserRow[];
  } catch (e) {
    console.warn("admin_users threw", e);
    return [];
  }
});

export function adminUserRows(ids?: string[]): Promise<AdminUserRow[]> {
  if (ids && ids.length === 0) return Promise.resolve([]);
  return load(ids ? [...new Set(ids)].sort().join(",") : "*");
}

/**
 * Everyone, with everything the admin sign-ups chart and list show
 * (sign-up time, contact, username, sign-ins, activity, sign-up context),
 * through admin_people() with the same owner check. Newest first.
 * people is null when not allowed or failing, so the section can say so;
 * never throws. Paged: PostgREST caps a function's rows too (1,000 on
 * Supabase), and the chart and the list are both built from this read;
 * the function's order (sign-up time, then id) keeps pages from
 * overlapping. readAt is the chart's "now": taken after the read and
 * never before the newest sign-up, so every bar and the total agree.
 */
export const signupPeople = cache(async (): Promise<{ people: Person[] | null; readAt: number }> => {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    // The typed emails come separately (admin_people's columns can't grow); without them the list still loads.
    const [rows, contacts] = await Promise.all([
      fetchAllRows<DetailsRow>((from, to) => supabase.rpc("admin_people", { p_firebase_token: token }).range(from, to)),
      fetchAllRows<ContactEmailRow>((from, to) => supabase.rpc("admin_contact_emails", { p_firebase_token: token }).range(from, to)).catch((e) => {
        console.warn("admin_contact_emails failed", e);
        return [] as ContactEmailRow[];
      }),
    ]);
    const people = toPeople(rows, contacts);
    return { people, readAt: Math.max(Date.now(), people[0]?.joinedAt ?? 0) };
  } catch (e) {
    console.warn("admin_people failed", e);
    return { people: null, readAt: Date.now() };
  }
});
