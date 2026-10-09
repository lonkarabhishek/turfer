import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { isAskConfigured } from "@/lib/ai/ask";
import { reviewSuggestion, type PendingSuggestion } from "@/lib/ai/suggestions";
import { getPendingSuggestions } from "@/lib/queries/adminSuggestions";

// Admin only. POST {action: "review", ids?: string[]} runs Claude on
// pending suggestions (all unreviewed when ids is absent, max 10 per
// call). POST {action: "moderate", id, decision: "approve"|"reject",
// apply: {...}} applies the ticked columns and closes the suggestion.
// The DB functions re-check the owner themselves.

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: string[];
    id?: string;
    decision?: string;
    apply?: Record<string, unknown>;
  };
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;

  if (body.action === "review") {
    if (!isAskConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
    const pending = await getPendingSuggestions(500);
    if (!pending.ok) return NextResponse.json({ error: pending.reason }, { status: 500 });
    const wanted = new Set(body.ids ?? []);
    const todo = pending.rows.filter((r) => (wanted.size ? wanted.has(r.id) : !r.reviewed_at)).slice(0, 10);
    const results: { id: string; ok: boolean; review?: PendingSuggestion["ai_review"] }[] = [];
    for (const s of todo) {
      try {
        const review = await reviewSuggestion(s);
        if (!review) throw new Error("declined");
        const { error } = await supabase.rpc("set_suggestion_review", { p_id: s.id, p_review: review, p_firebase_token: token });
        if (error) throw error;
        results.push({ id: s.id, ok: true, review });
      } catch (e) {
        console.error("suggestions: review failed", s.id, e);
        results.push({ id: s.id, ok: false });
      }
    }
    const remaining = pending.rows.filter((r) => !r.reviewed_at && !results.some((x) => x.id === r.id && x.ok)).length;
    return NextResponse.json({ results, remaining });
  }

  if (body.action === "moderate") {
    const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
    if (!body.id || !decision) return NextResponse.json({ error: "id and decision are required" }, { status: 400 });
    const { error } = await supabase.rpc("moderate_suggestion", {
      p_id: body.id,
      p_action: decision,
      p_apply: body.apply ?? {},
      p_firebase_token: token,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
