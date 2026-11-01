import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin/auth";
import { ownerDb } from "@/lib/admin/db";
import { turfPagePaths } from "@/lib/queries/turfs";
import { toAdminFlags } from "@/lib/reviews/flags";

// Admin only. GET: players' reports of reviews ("Report this review"), open first.
// POST { id, decision: "hide" | "keep" }: Hide hides the review (as a removal
// request's Remove does), Keep leaves it; either closes every open report of it.
// The database functions check the site owner themselves (20261102_reviews_trust.sql).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };

// The request's one client, the one isAdmin() used: one session refresh per request (lib/supabase/oneClient.ts).
const ownerClient = ownerDb;

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_review_flags", { p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "not_set_up" : error.message }, { status: 500 });
  if ((data as { error?: string } | null)?.error) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!toAdminFlags(data)) return NextResponse.json({ error: "unexpected answer" }, { status: 500 });
  return NextResponse.json(data, { headers: PRIVATE });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; decision?: unknown };
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id.toLowerCase() : null;
  const decision = body.decision === "hide" || body.decision === "keep" ? body.decision : null;
  if (!id || !decision) return NextResponse.json({ error: "id and decision are required" }, { status: 400 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_review_flag_decide", { p_firebase_token: token, p_id: id, p_decision: decision });
  if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "not_set_up" : error.message }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; status?: string; turf_id?: string; already?: boolean; error?: string };
  if (!r.ok) return NextResponse.json({ error: r.error ?? "failed" }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  // The cache queue refreshes the page within a minute too; this is at once.
  if (r.status === "hidden" && !r.already && typeof r.turf_id === "string") {
    for (const p of await turfPagePaths(r.turf_id)) revalidatePath(p);
  }
  return NextResponse.json({ ok: true, status: r.status, already: r.already === true }, { headers: PRIVATE });
}
