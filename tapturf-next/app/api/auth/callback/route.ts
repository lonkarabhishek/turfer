import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";
import { exchangeWhy, hasSessionCookie, providerWhy, type Why } from "@/lib/auth/callback";
import { safeNext } from "@/lib/auth/next";

const PROJECT_REF = "hwfsbpzercuoshodmnuf";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // `next` is where the user wanted to end up. We forward it through
  // /login/complete so the light landing page handles the auth handoff
  // (vs. bouncing them straight to the huge home render).
  const next = safeNext(searchParams.get("next"));

  // Back to /login with a reason it can explain, and `next` kept for a one-tap retry. Never the code or an email.
  const back = (kind: "oauth" | "callback", why: Why, detail: Record<string, unknown> = {}) => {
    console.warn("[OAuth Callback]", JSON.stringify({ ok: false, kind, why, ...detail }));
    const url = new URL("/login", origin);
    url.searchParams.set("error", kind);
    url.searchParams.set("why", why);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // OAuth provider returned an error (user denied, provider mis-configured, ...)
  if (error) {
    const why = providerWhy(error, searchParams.get("error_code"), searchParams.get("error_description"));
    return back(why === "denied" ? "oauth" : "callback", why, { error, error_code: searchParams.get("error_code") });
  }

  if (!code) return back("callback", "other", { error: "no_code" });

  // Success: forward to the small /login/complete page. That page
  // watches AuthProvider and pushes the user onwards once the session
  // hydrates, so the huge home page doesn't have to render mid-auth.
  const successUrl = new URL("/login/complete", origin);
  successUrl.searchParams.set("next", next);
  const response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (!exchangeError) {
    // Admin "Latest logins". Runs with the new session, so the DB can
    // check it's really this user. Never blocks the sign-in.
    if (exchanged.user) {
      try {
        await supabase.rpc("log_user_login", { p_user_id: exchanged.user.id, p_method: "google" });
      } catch {
        /* ignore */
      }
    }
    return response;
  }

  const why = exchangeWhy(exchangeError);
  // Back or a refresh onto a code already used, in a browser that is signed in: carry on.
  if (why === "used" && hasSessionCookie(request.cookies.getAll().map((c) => c.name), PROJECT_REF)) {
    return NextResponse.redirect(successUrl);
  }
  const e = exchangeError as { name?: string; code?: string; status?: number };
  return back("callback", why, { code: e.code ?? e.name ?? null, status: e.status ?? null });
}
