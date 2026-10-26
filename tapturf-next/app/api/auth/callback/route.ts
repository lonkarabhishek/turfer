import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";
import { googleCallback, type PendingCookie } from "@/lib/auth/googleCallback";

// The normal Google sign-in comes back here. lib/auth/googleCallback.ts has
// the steps: the code exchange, then the account (made if needed, before
// the session reaches the browser), then /login/complete, or /login with a
// reason when this Google account opens no account right now.

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return googleCallback(request, {
    supabaseUrl: url,
    anonKey: anon,
    session(pending: PendingCookie[]) {
      // The session's cookies are held in `pending` until the account is known.
      const supabase = createServerClient(url!, anon!, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            pending.push(...cookiesToSet);
          },
        },
      });
      return {
        async exchange(code: string) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return { error };
          return { user: data.user, accessToken: data.session?.access_token ?? null };
        },
        async logLogin(uid: string) {
          // Runs with the new session, so the database can check it's really this user.
          await supabase.rpc("log_user_login", { p_user_id: uid, p_method: "google" });
        },
      };
    },
  });
}
