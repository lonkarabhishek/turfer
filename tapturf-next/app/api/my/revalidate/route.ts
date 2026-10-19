import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

// POST /api/my/revalidate { turfId, token } -> rebuilds /turf/[id] after
// an owner edit. Only for callers who manage that turf: the database
// checks the Google session (cookies) or the phone sign-in token.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { turfId?: unknown; token?: unknown };
  const turfId = typeof body.turfId === "string" && UUID.test(body.turfId) ? body.turfId : null;
  const token = typeof body.token === "string" && body.token.length < 4000 ? body.token : null;
  if (!turfId) return NextResponse.json({ error: "turfId is required" }, { status: 400 });
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("owner_can_manage", { p_token: token, p_turf_id: turfId });
  if (error || data !== true) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  revalidatePath(`/turf/${turfId}`);
  return NextResponse.json({ ok: true });
}
