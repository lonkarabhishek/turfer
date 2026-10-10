import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { isAskConfigured } from "@/lib/ai/ask";
import { loadReviewsFor, summariseReviews } from "@/lib/ai/reviewSummary";

// Admin only. GET: progress. POST: summarise reviews for the next few
// venues that have two or more written reviews and no fresh summary.

export const maxDuration = 60;

async function ownerClient() {
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  return { supabase, token };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("review_summary_progress", { p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "not_set_up" : error.message }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ...row, configured: isAskConfigured() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!isAskConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(8, Math.max(1, Number(body.limit) || 4));
  const { supabase, token } = await ownerClient();

  const { data: batch, error } = await supabase.rpc("get_review_summary_batch", { p_limit: limit, p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (batch ?? []) as { id: string; name: string }[];

  const results: { id: string; name: string; line: string; tone: "ok" | "warn" }[] = [];
  for (const row of rows) {
    try {
      const reviews = await loadReviewsFor(row.id);
      const summary = await summariseReviews(reviews);
      if (!summary) throw new Error("no summary");
      const { error: werr } = await supabase.rpc("set_review_summary", { p_turf_id: row.id, p_summary: summary, p_firebase_token: token });
      if (werr) throw werr;
      results.push({ id: row.id, name: row.name, line: `${summary.summary} (${summary.based_on} reviews)`, tone: "ok" });
    } catch (e) {
      console.error("review summary: failed for", row.id, e);
      results.push({ id: row.id, name: row.name, line: "Could not summarise, will retry", tone: "warn" });
    }
  }

  const { data: prog } = await supabase.rpc("review_summary_progress", { p_firebase_token: token });
  const progress = Array.isArray(prog) ? prog[0] : prog;
  return NextResponse.json({ results, progress });
}
