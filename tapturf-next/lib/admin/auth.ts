import { cookies } from "next/headers";
import { requestServerClient } from "@/lib/supabase/server";
import { perKey } from "@/lib/supabase/oneClient";
import { verifyFirebaseIdToken } from "@/lib/firebase/verifyIdToken";

/** Cookie holding the phone user's Firebase ID token (about 1 hour). */
export const ADMIN_TOKEN_COOKIE = "tt_fid";

// The site owner. Signing in via EITHER of these paths unlocks /admin:
//   - Google OAuth with this email
//   - Phone OTP with this Indian number (the 10 digits after +91)
export const ADMIN_EMAILS = ["lonkarabhishek00@gmail.com"];
export const ADMIN_PHONES = ["9403612979"];

/**
 * The 10 digits of a verified Indian number, or "". Only "+91" and exactly
 * 10 digits count: matching the last 10 digits of any number would let a
 * foreign number that ends the same way (+1 940 ...) pass as the owner.
 */
export function indianPhone10(raw: string | null | undefined): string {
  const m = /^\+91(\d{10})$/.exec(raw ?? "");
  return m ? m[1] : "";
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
 *
 * Asked once per request (the page and every read in it, or a route
 * handler, share the answer), with the request's one Supabase client: its
 * getUser() is the request's single token refresh, and every admin read
 * after it uses the refreshed session (lib/supabase/oneClient.ts).
 */
export async function isAdmin(): Promise<boolean> {
  return checkOnce(await cookies());
}

const checkOnce = perKey<object, Promise<boolean>>(() => checkAdmin());

async function checkAdmin(): Promise<boolean> {
  // Path 1: Google OAuth via Supabase.
  try {
    const supabase = await requestServerClient();
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email?.toLowerCase().trim();
    // Only a Google sign-in counts: the app signs in by email through Google alone.
    const providers = (data?.user?.app_metadata as { providers?: unknown } | undefined)?.providers;
    const google = Array.isArray(providers) && providers.includes("google");
    if (email && google && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
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
    const phone = indianPhone10(claims?.phone_number);
    if (phone && ADMIN_PHONES.includes(phone)) return true;
  } catch {
    // fall through
  }

  return false;
}
