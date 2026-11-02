import { revalidateSecretOk } from "@/lib/cache/secret";
import { dispatch } from "@/lib/push/server";

// POST /api/push/dispatch { id }, from the database (the notifications_push
// trigger in 20261102_web_push.sql) with the x-revalidate-secret header,
// checked as /api/revalidate checks it (lib/cache/secret.ts). Sends that
// notification to the phones of its account (lib/push/server.ts).

export function POST(req: Request) {
  return dispatch(req, revalidateSecretOk);
}
