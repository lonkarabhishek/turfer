import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `cookies()` API can only set cookies in a Server Action or Route Handler
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verify the session was actually created
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const separator = next.includes("?") ? "&" : "?";
        return NextResponse.redirect(`${origin}${next}${separator}welcome=true`);
      }
    }

    // Log the error for debugging (will show in Vercel logs)
    console.error("[OAuth Callback] Error:", error?.message || "No user after exchange");
  }

  // Auth error — redirect home with error flag
  return NextResponse.redirect(`${origin}/?auth_error=true`);
}
