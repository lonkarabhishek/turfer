import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect with welcome flag so the app can show a toast
      const separator = next.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${origin}${next}${separator}welcome=true`);
    }
  }

  // Auth error — redirect home
  return NextResponse.redirect(`${origin}/?auth_error=true`);
}
