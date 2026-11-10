import { webhook } from "@/lib/email/server";

// POST /api/email/webhook, from Resend (email.bounced, email.complained),
// signed the Svix way with RESEND_WEBHOOK_SECRET (503 until it is set):
// those addresses are never emailed again (lib/email/server.ts).

export function POST(req: Request) {
  return webhook(req);
}
