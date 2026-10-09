import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { isAskConfigured } from "@/lib/ai/ask";
import { pickCover } from "@/lib/ai/covers";
import { convertImageUrls } from "@/lib/utils/images";

// Admin only. GET: progress. POST: review the next few turfs.
// The DB functions re-check the owner themselves, so a forged cookie
// gets a 42501 from Postgres even if this file were bypassed.

export const maxDuration = 60;

async function ownerClient() {
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  return { supabase, token };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("cover_review_progress", { p_firebase_token: token });
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

  const { data: batch, error } = await supabase.rpc("get_cover_review_batch", { p_limit: limit, p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (batch ?? []) as { id: string; name: string; images: unknown; cover_image: string | null }[];

  const results: { id: string; name: string; cover: string | null; changed: boolean; flagged: number; broken: number }[] = [];
  for (const row of rows) {
    const images = convertImageUrls(Array.isArray(row.images) ? (row.images as string[]) : []);
    try {
      const pick = await pickCover(images);
      const { error: werr } = await supabase.rpc("set_turf_cover", {
        p_turf_id: row.id,
        p_cover: pick.cover,
        p_review: pick.review,
        p_firebase_token: token,
      });
      if (werr) throw werr;
      results.push({
        id: row.id,
        name: row.name,
        cover: pick.cover,
        changed: !!pick.cover && pick.cover !== row.cover_image,
        flagged: pick.review.filter((r) => !r.usable).length,
        broken: pick.broken.length,
      });
    } catch (e) {
      console.error("covers: failed for", row.id, e);
      results.push({ id: row.id, name: row.name, cover: null, changed: false, flagged: 0, broken: 0 });
      // Leave cover_reviewed_at null so it is retried next run.
    }
  }

  const { data: prog } = await supabase.rpc("cover_review_progress", { p_firebase_token: token });
  const progress = Array.isArray(prog) ? prog[0] : prog;
  return NextResponse.json({ results, progress });
}
