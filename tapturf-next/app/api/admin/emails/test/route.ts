import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { ownerTokenRpc } from "@/lib/admin/db";
import { emailTest } from "@/lib/email/admin";

// "Send me one of each" on the admin's Emails card: the ten emails, "[Test] " before each subject, to the site
// owner's own Google-confirmed address, through the same send as every email, whatever the mode, at most once in
// 10 minutes (lib/email/admin.ts emailTest). The site owner only: isAdmin() here, and admin_email_test checks again.

export const dynamic = "force-dynamic";
// Ten sends, 2 a second at most.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  return emailTest(await ownerTokenRpc(), req);
}
