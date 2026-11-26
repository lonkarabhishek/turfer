import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { outcomeReads } from "@/lib/admin/outcomeTotals.server";

// "Every answer" on the admin's "Did you get a slot?" card (components/admin/OutcomeTotals.tsx). The site owner
// only: isAdmin() here, and the database function checks the caller again (20261127_contact_outcome_totals.sql,
// admin_contact_outcome_list). GET ?days=7|30|0&limit=&closed=1: the answers one by one, newest first, 200 at
// most, each with its turf, the tap, what was said and the slot. Nothing about who answered: a row has none.

export const dynamic = "force-dynamic";

const notAllowed = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

export async function GET(req: Request) {
  if (!(await isAdmin())) return notAllowed();
  return outcomeReads.list(await ownerTokenRpc(), req);
}
