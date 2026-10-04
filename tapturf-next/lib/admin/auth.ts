import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { verifyFirebaseIdToken } from "@/lib/firebase/verifyIdToken";

/** Cookie holding the phone user's Firebase ID token (about 1 hour). */
export const ADMIN_TOKEN_COOKIE = "tt_fid";

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
 * 2) Phone OTP. No Supabase session, so the browser hands us its
 *    Firebase ID token and we verify Google's signature and the phone.
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
    // Not user_metadata.phone: users can set that themselves.
  } catch {
    // ignore, try phone path
  }

  // Path 2: phone OTP, proven by a Firebase ID token in the `tt_fid`
  // cookie (written by AdminGate on /admin). The token is signed by
  // Google and carries the phone number Firebase verified, so it can't
  // be forged. The old `tt_uid` cookie (a users.id) is NOT trusted here:
  // users rows are publicly readable, so any id is easy to find.
  try {
    const jar = await cookies();
    const claims = await verifyFirebaseIdToken(jar.get(ADMIN_TOKEN_COOKIE)?.value);
    const phone = normalisePhone(claims?.phone_number);
    if (phone && ADMIN_PHONES.includes(phone)) return true;
  } catch {
    // fall through
  }

  return false;
}
