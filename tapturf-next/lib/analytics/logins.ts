/**
 * Record a phone OTP sign-in for the admin "Latest logins" list.
 * Same fire-and-forget fetch as logContactClick: keepalive survives the
 * redirect that follows sign-in, and it never touches the supabase-js
 * auth lock. Google sign-ins are logged server-side in the OAuth callback.
 */
export function logPhoneLogin(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    void fetch(`${url}/rest/v1/rpc/log_user_login`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_method: "phone" }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
