import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { isAskConfigured } from "@/lib/ai/ask";
import { digestAsks, type DigestRow } from "@/lib/ai/digest";
import { getAskTranscripts } from "@/lib/queries/adminAsks";

// Admin only. POST { days } makes a fresh digest of the Ask chats in
// that window and caches it; the page reads the cache server-side.

export const maxDuration = 60;
const MAX_ROWS = 300;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!isAskConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { days?: number };
  const days = body.days === 30 ? 30 : 7;

  const res = await getAskTranscripts(days);
  if (!res.ok) return NextResponse.json({ error: `Couldn't load chats (${res.reason})` }, { status: 500 });
  const rows: DigestRow[] = res.rows
    .filter((r) => r.query && r.query.trim().length >= 2)
    .slice(0, MAX_ROWS)
    .map((r) => ({
      query: r.query.slice(0, 160),
      intent: r.intent,
      results: r.results,
      city: typeof r.filters?.city === "string" ? (r.filters.city as string) : null,
    }));
  if (rows.length < 3) return NextResponse.json({ error: "Not enough chats in this window yet." }, { status: 422 });

  const digest = await digestAsks(rows, days);
  if (!digest) return NextResponse.json({ error: "Claude couldn't summarise this window. Try again." }, { status: 502 });

  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  const { error } = await supabase.rpc("save_ask_digest", { p_days: days, p_rows: rows.length, p_digest: digest, p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ days, rows_seen: rows.length, digest, created_at: new Date().toISOString() });
}
