import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";

export type LoginRow = {
  user_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  method: "phone" | "google";
  logged_in_at: string;
};

export type LoginsResult =
  | { ok: true; rows: LoginRow[] }
  | { ok: false; reason: "not_set_up" | "not_allowed" | "error" };

export const LOGIN_FILTERS = {
  all: "All",
  today: "Last 24 hours",
  week: "Last 7 days",
  phone: "Phone",
  google: "Google",
} as const;
export type LoginFilter = keyof typeof LOGIN_FILTERS;

/**
 * Latest sign-ins. The read goes through get_recent_logins(), which
 * answers only the site owner: the DB checks the Google session's email
 * or asks Google about the phone owner's Firebase token. So this runs
 * with the visitor's own session, not the anon read-only client.
 */
export async function getRecentLogins(limit = 300): Promise<LoginsResult> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const { data, error } = await supabase.rpc("get_recent_logins", {
      p_limit: limit,
      p_firebase_token: token,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "not_allowed" };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, reason: "not_set_up" };
      return { ok: false, reason: "error" };
    }
    return { ok: true, rows: (data ?? []) as LoginRow[] };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function filterLogins(rows: LoginRow[], f: LoginFilter): LoginRow[] {
  const now = Date.now();
  const since = (h: number) => (r: LoginRow) => now - new Date(r.logged_in_at).getTime() <= h * 3600_000;
  switch (f) {
    case "today": return rows.filter(since(24));
    case "week": return rows.filter(since(24 * 7));
    case "phone": return rows.filter((r) => r.method === "phone");
    case "google": return rows.filter((r) => r.method === "google");
    default: return rows;
  }
}

export function loginStats(rows: LoginRow[]) {
  const day = filterLogins(rows, "today");
  const week = filterLogins(rows, "week");
  return {
    today: day.length,
    week: week.length,
    peopleWeek: new Set(week.map((r) => r.user_id)).size,
    latest: rows[0] ?? null,
  };
}
