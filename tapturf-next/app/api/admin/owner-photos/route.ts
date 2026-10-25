import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";
import { turfPagePaths } from "@/lib/queries/turfs";
import { checkOwnerPhotos } from "@/lib/my/photoJudge";

// Admin only. GET: the latest photos owners added. POST { action, id, turfId }:
// restore a photo the check held, remove one, or check a turf's unchecked photos now.
// The database functions check the site owner themselves.

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };

async function ownerClient() {
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  return { supabase, token };
}

async function refresh(turfId: string) {
  for (const p of await turfPagePaths(turfId)) revalidatePath(p);
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_owner_photos", { p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "not_set_up" : error.message }, { status: 500 });
  if (data && !Array.isArray(data) && (data as { error?: string }).error) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  return NextResponse.json({ photos: Array.isArray(data) ? data : [] }, { headers: PRIVATE });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; turfId?: string };
  const turfId = typeof body.turfId === "string" && UUID.test(body.turfId) ? body.turfId.toLowerCase() : null;
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id.toLowerCase() : null;
  if (!turfId || !["restore", "remove", "check"].includes(body.action ?? "") || (body.action !== "check" && !id)) {
    return NextResponse.json({ error: "action, id and turfId are required" }, { status: 400 });
  }
  const { supabase, token } = await ownerClient();

  if (body.action === "check") {
    const r = await checkOwnerPhotos(turfId, true);
    if (r.ok && r.held.length + r.live.length > 0) await refresh(turfId);
    return NextResponse.json(r, { status: r.ok ? 200 : 503, headers: PRIVATE });
  }

  if (body.action === "restore") {
    const { data, error } = await supabase.rpc("admin_owner_photo_restore", { p_firebase_token: token, p_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if ((data as { ok?: boolean } | null)?.ok) await refresh(turfId);
    return NextResponse.json(data, { headers: PRIVATE });
  }

  // remove: the site owner manages every turf, so the owner function takes them too.
  const { data, error } = await supabase.rpc("owner_photo_remove", { p_token: token, p_turf_id: turfId, p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; paths?: unknown };
  if (r.ok) {
    const paths = Array.isArray(r.paths) ? r.paths.filter((p): p is string => typeof p === "string") : [];
    // Best effort: the photo is off the page either way, and the sweep removes what's left.
    if (paths.length) await supabase.storage.from("turf-photos").remove(paths).catch(() => null);
    await refresh(turfId);
  }
  return NextResponse.json({ ok: r.ok === true, error: (data as { error?: string } | null)?.error }, { headers: PRIVATE });
}
