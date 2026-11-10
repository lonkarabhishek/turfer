import { getEmailPrefs, patchEmailPrefs } from "@/lib/email/server";

// The signed-in caller's own emails, for the Me tab's Emails block: the
// address we email (only one Google confirmed) and the three switches.
// lib/email/server.ts; lib/email/types.ts has the API.

export function GET(req: Request) {
  return getEmailPrefs(req);
}

export function PATCH(req: Request) {
  return patchEmailPrefs(req);
}
