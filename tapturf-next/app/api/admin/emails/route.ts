import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { emailSetMode, emailStatus } from "@/lib/email/admin";

// The admin's Emails card (components/admin/EmailsCard.tsx; lib/email/mode.ts has the API). The site owner only:
// isAdmin() here, and the database functions check the caller again (20261110_email.sql, admin_email_*).
// GET: the mode, the counts for the last 24 hours and 7 days, the last test. POST { mode }: off, owner_only or on,
// at once, no deploy.

export const dynamic = "force-dynamic";

const notAllowed = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  if (!(await isAdmin())) return notAllowed();
  return emailStatus(await ownerTokenRpc());
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return notAllowed();
  return emailSetMode(await ownerTokenRpc(), req);
}
