import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerDb } from "@/lib/admin/db";
import { isAskConfigured } from "@/lib/ai/ask";
import { checkListing } from "@/lib/ai/listing";
import { getTurfById } from "@/lib/queries/turfs";

// Admin only. GET: progress. POST: check the next few listings.
// Runs on turfs never checked, or edited since their last check.

export const maxDuration = 60;

// The request's one client, the one isAdmin() used: one session refresh per request (lib/supabase/oneClient.ts).
const ownerClient = ownerDb;

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
    let name = id;
    try {
      // A failed read throws and the turf is retried on a later batch; null (no active turf by that id) is skipped.
      // The name as stored: the check flags a booking app in it ("… - by SPORLOC").
      const turf = await getTurfById(id, { storedName: true });
      if (!turf) continue;
      name = turf.name;
      const review = await checkListing(turf);
      if (!review) throw new Error("no review");
      const { error: werr } = await supabase.rpc("set_listing_review", { p_turf_id: id, p_review: review, p_firebase_token: token });
      if (werr) throw werr;
      const n = review.issues.length;
      results.push({ id, name: turf.name, line: review.ok ? "Looks fine" : `${review.summary} (${n} issue${n === 1 ? "" : "s"})`, tone: review.ok ? "ok" : "warn" });
    } catch (e) {
      console.error("listing check: failed for", id, e);
      results.push({ id, name, line: "Could not check, will retry", tone: "warn" });
    }
  }

  const { data: prog } = await supabase.rpc("listing_check_progress", { p_firebase_token: token });
  const progress = Array.isArray(prog) ? prog[0] : prog;
  return NextResponse.json({ results, progress });
}
