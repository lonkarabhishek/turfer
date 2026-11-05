import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin/auth";
import { ownerDb } from "@/lib/admin/db";
import { signalsByClaim, withSignals } from "@/lib/admin/claimSignals";
import { claimDecisionNotice } from "@/lib/my/claimNotice";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { contactFieldsOf, hasUsableContact } from "@/lib/utils/contact";
import { turfPagePaths } from "@/lib/queries/turfs";

// Admin only. GET: myTapturf claims, pending first, each waiting one with what points to a player
// (lib/admin/claimSignals.ts). POST: approve, reject or revoke one; approving or rejecting a waiting
// claim tells the claimant in the app (lib/my/claimNotice.ts, 20261106_owner_claims_clarity.sql).

// The request's one client, the one isAdmin() used: one session refresh per request (lib/supabase/oneClient.ts).
const ownerClient = ownerDb;

/** The function isn't on the database yet (before 20261106_owner_claims_clarity.sql). */
const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const { supabase, token } = await ownerClient();
  const { data, error } = await supabase.rpc("admin_owner_claims", { p_firebase_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const claims: unknown[] = Array.isArray(data) ? data : [];
  // Waiting claims' turfs: whether each page shows Call or WhatsApp, by the page's own rule.
  const waiting = [...new Set(claims.flatMap((c) => (c && typeof c === "object" && (c as { status?: unknown }).status === "pending" && typeof (c as { turf_id?: unknown }).turf_id === "string" ? [(c as { turf_id: string }).turf_id] : [])))];
  const [sig, turfs] = await Promise.all([
    waiting.length ? supabase.rpc("admin_owner_claim_signals", { p_firebase_token: token }) : Promise.resolve({ data: [], error: null }),
    waiting.length
      ? supabase.from("turfs").select("id, owner_phone, contact_info, landline_phone, whatsapp_phone").in("id", waiting)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  // Neither read fails the queue: without them the cards show no player line.
  if (sig.error && !missingFn(sig.error.code)) console.warn("admin_owner_claim_signals failed", sig.error.code);
  const hasNumber = new Map<string, boolean>();
  for (const t of (turfs.data ?? []) as Record<string, unknown>[]) if (typeof t.id === "string") hasNumber.set(t.id, hasUsableContact(contactFieldsOf(t)));
  const out = withSignals(claims, sig.error ? new Map() : signalsByClaim(sig.data), hasNumber);
  return NextResponse.json({ claims: out }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { turfId?: string; userKey?: string; status?: string; message?: unknown };
  if (!body.turfId || !body.userKey || !["active", "rejected", "revoked"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "turfId, userKey and status are required" }, { status: 400 });
  }
  const { supabase, token } = await ownerClient();
  const decide = { p_firebase_token: token, p_turf_id: body.turfId, p_user_key: body.userKey, p_status: body.status };
  // What the claimant is told: approved, or not confirmed with the admin's own kind line (nothing for a revoke).
  // A rejection's "Want to play there?" line only where the turf's page shows the booking line (a number, not a members' club).
  const { data: turf } = await supabase.from("turfs").select("name, owner_phone, contact_info, landline_phone, whatsapp_phone, membership_required").eq("id", body.turfId).maybeSingle();
  const row = (turf ?? null) as Record<string, unknown> | null;
  const page = row ? { hasNumber: hasUsableContact(contactFieldsOf(row)), membersOnly: row.membership_required === true } : undefined;
  const notice = claimDecisionNotice(body.status ?? "", cleanVenueName(typeof row?.name === "string" ? row.name : ""), body.status === "rejected" ? body.message : null, page);
  let res = await supabase.rpc("admin_answer_owner_claim", { ...decide, p_title: notice?.title ?? null, p_message: notice?.message ?? null });
  // Before the migration: decided as before, nobody told.
  if (res.error && missingFn(res.error.code)) res = await supabase.rpc("admin_decide_owner_claim", decide);
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  for (const p of await turfPagePaths(body.turfId)) revalidatePath(p);
  return NextResponse.json(res.data);
}
