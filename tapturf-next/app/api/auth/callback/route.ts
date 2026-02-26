import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const redirectUrl = `${origin}${next}`;

  if (code) {
    // Create the redirect response FIRST so we can attach cookies to it
    const response = NextResponse.redirect(redirectUrl);

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verify session was created
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // The response already has auth cookies attached via setAll
        return response;
      }
    }

    console.error("[OAuth Callback] Error:", error?.message || "No user after exchange");
  }

  // Auth error — redirect home
  return NextResponse.redirect(`${origin}/`);
}
