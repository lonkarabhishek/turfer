import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { createReadOnlyClient } from "@/lib/supabase/server";

// The site owner. Signing in via EITHER of these paths unlocks /admin:
//   - Google OAuth with this email
//   - Phone OTP with this number (bare 10-digit; matched against E.164 too)
export const ADMIN_EMAILS = ["lonkarabhishek00@gmail.com"];
export const ADMIN_PHONES = ["9403612979"];

function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip anything non-digit, then drop the leading 91 country code if present.
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Returns true if the currently-signed-in user is the site owner.
 * Runs server-side only.
 *
 * Two paths, matching how people actually sign in on TapTurf:
 *
 * 1) Google OAuth. Supabase auth cookies are HTTP-only and signed by
 *    Supabase; we round-trip via getUser() and check the email.
 *
 * 2) Phone OTP. Phone-auth doesn't create a Supabase auth session (we
 *    verify Firebase OTP client-side and persist an auth_token cookie
 *    keyed to the users.id row). Read that cookie, look up the user
 *    row server-side, and check the phone.
 *
 * Either path returning true unlocks /admin.
 */
export async function isAdmin(): Promise<boolean> {
  // Path 1: Google OAuth via Supabase.
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email?.toLowerCase().trim();
    if (email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      return true;
    }
    // Google users MAY also carry a phone in user_metadata; check that too.
    const metaPhone = normalisePhone(
      (data?.user?.user_metadata as Record<string, unknown> | undefined)?.phone as string | undefined
    );
    if (metaPhone && ADMIN_PHONES.includes(metaPhone)) {
      return true;
    }
  } catch {
    // ignore, try phone path
  }

  // Path 2: phone auth via `tt_uid` cookie.
  //
  // Phone-auth users don't have a Supabase auth session — their identity
  // lives in the public.users row. AuthProvider mirrors the row id to a
  // browser cookie called `tt_uid` (see components/auth/AuthProvider.tsx)
  // so the server has something to look up.
  //
  // Security note: the cookie holds only the user's UUID. Forging it
  // would require guessing a real users.id UUID (128 bits of randomness)
  // AND that user happening to match ADMIN_PHONES. In practice this is
  // effectively unguessable, and the /admin page is read-only.
  try {
    const jar = await cookies();
    const raw = jar.get("tt_uid")?.value;
    if (!raw || !looksLikeUuid(raw)) return false;

    const anon = createReadOnlyClient();
    const { data } = await anon
      .from("users")
      .select("id, email, phone")
      .eq("id", raw)
      .limit(1);
    const row = data?.[0];
    if (!row) return false;

    const email = row.email?.toLowerCase().trim();
    if (email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      return true;
    }
    const phone = normalisePhone(row.phone);
    if (phone && ADMIN_PHONES.includes(phone)) return true;
  } catch {
    // fall through
  }

  return false;
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
