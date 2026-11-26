import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { outcomeReads } from "@/lib/admin/outcomeTotals.server";

// The admin's "Did you get a slot?" card (components/admin/OutcomeTotals.tsx; lib/admin/outcomeTotals.ts has the
// words and the API). The site owner only: isAdmin() here, and the database function checks the caller again
// (20261127_contact_outcome_totals.sql, admin_contact_outcome_totals). GET: what players answered, all turfs, for
// the last 7 days, the last 30 and all time, with the turfs to look at and the hours. Counts only. Before that
// file is applied it answers 200 { ok: false, error: "not_set_up" } and asks the database again only after a minute.

export const dynamic = "force-dynamic";

const notAllowed = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  if (!(await isAdmin())) return notAllowed();
  return outcomeReads.totals(await ownerTokenRpc());
}
