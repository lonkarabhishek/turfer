import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import { toPeople, type DetailsRow, type Person } from "@/lib/admin/people";

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
 * Everyone, with everything the admin sign-ups list shows (contact,
 * username, sign-ins, activity, sign-up context), through
 * admin_user_details() with the same owner check. Newest first; null
 * when not allowed or failing, so the list can say so.
 */
export const signupPeople = cache(async (): Promise<Person[] | null> => {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const { data, error } = await supabase.rpc("admin_user_details", { p_firebase_token: token });
    if (error) {
      console.warn("admin_user_details failed", error.code, error.message);
      return null;
    }
    return toPeople((data ?? []) as DetailsRow[]);
  } catch (e) {
    console.warn("admin_user_details threw", e);
    return null;
  }
});
