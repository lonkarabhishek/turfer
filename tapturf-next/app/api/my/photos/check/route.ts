import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkOwnerPhotos } from "@/lib/my/photoJudge";

// POST /api/my/photos/check { turfId, token } -> { ok, checked, live, held }.
// Runs right after an owner adds photos: the judge looks at the new ones,
// the good ones go on the page and anything that isn't the venue is kept
// off it. Only for callers who manage the turf (checked as
// /api/my/revalidate does) and only photos due a check are judged, so a
// repeat call costs nothing. Whatever this misses, /api/my/photos/sweep
// checks within minutes.

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { turfId?: unknown; token?: unknown };
  const turfId = typeof body.turfId === "string" && UUID.test(body.turfId) ? body.turfId.toLowerCase() : null;
  const token = typeof body.token === "string" && body.token.length < 4000 ? body.token : null;
  if (!turfId) return NextResponse.json({ error: "turfId is required" }, { status: 400 });
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("owner_can_manage", { p_token: token, p_turf_id: turfId });
  if (error || data !== true) return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const r = await checkOwnerPhotos(turfId);
  if (!r.ok) return NextResponse.json({ ok: false, checked: 0, live: [], held: [], error: r.error }, { status: 503, headers: PRIVATE });
  return NextResponse.json(r, { headers: PRIVATE });
}
