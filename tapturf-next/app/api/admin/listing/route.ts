import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { isAskConfigured } from "@/lib/ai/ask";
import { checkListing } from "@/lib/ai/listing";
import { getTurfById } from "@/lib/queries/turfs";

// Admin only. GET: progress. POST: check the next few listings.
// Runs on turfs never checked, or edited since their last check.

export const maxDuration = 60;

async function ownerClient() {
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  return { supabase, token };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("listing_check_progress", { p_firebase_token: token });
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

  const { data: batch, error } = await supabase.rpc("get_listing_check_batch", { p_limit: limit, p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = ((batch ?? []) as { id: string }[]).map((r) => r.id);

  const results: { id: string; name: string; line: string; tone: "ok" | "warn" }[] = [];
  for (const id of ids) {
    const turf = await getTurfById(id);
    if (!turf) continue;
    try {
      const review = await checkListing(turf);
      if (!review) throw new Error("no review");
      const { error: werr } = await supabase.rpc("set_listing_review", { p_turf_id: id, p_review: review, p_firebase_token: token });
      if (werr) throw werr;
      const n = review.issues.length;
      results.push({ id, name: turf.name, line: review.ok ? "Looks fine" : `${review.summary} (${n} issue${n === 1 ? "" : "s"})`, tone: review.ok ? "ok" : "warn" });
    } catch (e) {
      console.error("listing check: failed for", id, e);
      results.push({ id, name: turf.name, line: "Could not check, will retry", tone: "warn" });
    }
  }

  const { data: prog } = await supabase.rpc("listing_check_progress", { p_firebase_token: token });
  const progress = Array.isArray(prog) ? prog[0] : prog;
  return NextResponse.json({ results, progress });
}
