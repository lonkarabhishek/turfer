import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE, isAdmin } from "@/lib/admin/auth";

// Admin only. GET: myTapturf claims, pending first. POST: approve, reject or revoke one.

async function ownerClient() {
  const supabase = await createServerClient();
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
  return { supabase, token };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_owner_claims", { p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: Array.isArray(data) ? data : [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { turfId?: string; userKey?: string; status?: string };
  if (!body.turfId || !body.userKey || !["active", "rejected", "revoked"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "turfId, userKey and status are required" }, { status: 400 });
  }
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_decide_owner_claim", {
    p_firebase_token: token,
    p_turf_id: body.turfId,
    p_user_key: body.userKey,
    p_status: body.status,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
