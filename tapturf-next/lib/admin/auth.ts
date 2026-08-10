import { createServerClient } from "@/lib/supabase/server";

// Only this email can view the admin dashboard. Case-insensitive.
export const ADMIN_EMAIL = "lonkarabhishek00@gmail.com";

/**
 * Returns true if the currently-signed-in user (from Supabase auth cookies)
 * is the site owner. Runs server-side only.
 *
 * We deliberately do NOT trust anything the browser sends beyond the
 * Supabase auth cookies, which are HTTP-only and signed by Supabase.
 * The email comes from getUser() which round-trips to Supabase.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    const email = data.user.email?.toLowerCase().trim();
    return email === ADMIN_EMAIL.toLowerCase();
  } catch {
    return false;
  }
}
