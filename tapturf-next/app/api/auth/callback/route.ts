import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/";

  // OAuth provider returned an error (user denied, provider mis-configured, ...)
  if (error) {
    console.error("[OAuth Callback] Provider error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(`${origin}/?auth_error=true`);
  }

  if (code) {
    // On success, redirect with ?welcome=1 so the client can fire the
    // welcome animation. Home page reads and strips this param.
    const successUrl = new URL(next, origin);
    successUrl.searchParams.set("welcome", "1");
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

  return NextResponse.redirect(`${origin}/?auth_error=true`);
}
