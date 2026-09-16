import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // `next` is where the user wanted to end up. We forward it through
  // /login/complete so the light landing page handles the auth handoff
  // (vs. bouncing them straight to the huge home render).
  const next = searchParams.get("next") ?? "/";

  // OAuth provider returned an error (user denied, provider mis-configured, ...)
  if (error) {
    console.error("[OAuth Callback] Provider error:", error, searchParams.get("error_description"));
    const errUrl = new URL("/login", origin);
    errUrl.searchParams.set("error", "oauth");
    errUrl.searchParams.set("next", next);
    return NextResponse.redirect(errUrl);
  }

  if (code) {
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

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      return response;
    }

    console.error("[OAuth Callback] Exchange error:", exchangeError?.message);
  }

  const failUrl = new URL("/login", origin);
  failUrl.searchParams.set("error", "callback");
  failUrl.searchParams.set("next", next);
  return NextResponse.redirect(failUrl);
}
