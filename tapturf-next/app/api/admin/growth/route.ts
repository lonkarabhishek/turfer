import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { growthReads } from "@/lib/admin/growth.server";

// The admin's "People, contacts and bookings" card (components/admin/GrowthNumbers.tsx; lib/admin/growth.ts has the
// words, the parse and the estimate). The site owner only: isAdmin() here, and the database functions check the
// caller again (20261130_growth_numbers.sql, admin_growth and admin_growth_slots). GET: unique turf contacts, repeat
// users, the bookings TapTurf can see and an estimate of their value at each turf's listed price, for the last 7
// days, the last 30 and all time. Counts, turfs and rupee totals only: never an account, a name or a number. Before
// that file is applied it answers 200 { ok: false, error: "not_set_up" } and asks the database again only after a minute.

export const dynamic = "force-dynamic";

const notAllowed = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  if (!(await isAdmin())) return notAllowed();
  return growthReads.numbers(await ownerTokenRpc());
}
