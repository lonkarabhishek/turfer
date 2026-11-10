import { revalidateSecretOk } from "@/lib/cache/secret";
import { dispatch } from "@/lib/email/server";

// POST /api/email/dispatch, from the database's email-flush job (pg_net,
// 20261110_email.sql), only when an email is due, with the
// x-revalidate-secret header, checked as /api/revalidate checks it
// (lib/cache/secret.ts). Sends the due emails through Resend
// (lib/email/server.ts); without RESEND_API_KEY it sends nothing.

// Up to 40 seconds of sends (2 a second), then the next minute's call.
export const maxDuration = 60;

export function POST(req: Request) {
  return dispatch(req, revalidateSecretOk);
}
