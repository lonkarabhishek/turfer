import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { outreachList, outreachSet } from "@/lib/admin/outreach.server";

// The admin's Owner outreach section (components/admin/OwnerOutreach.tsx; lib/admin/outreach.ts has the API). The
// site owner only: isAdmin() here, and the database functions check the caller again (20261113_owner_outreach.sql,
// admin_owner_outreach*). GET ?city=&days=: the city's turfs, most Call and WhatsApp taps first, each with its own
// listed numbers, its report link and the team's note. POST { turf, status, note?, by? }: one turf's note.

export const dynamic = "force-dynamic";

const notAllowed = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

export async function GET(req: Request) {
  if (!(await isAdmin())) return notAllowed();
  return outreachList(await ownerTokenRpc(), req);
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAllowed();
  return outreachSet(await ownerTokenRpc(), req);
}
