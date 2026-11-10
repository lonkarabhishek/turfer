import { getOff, postOff } from "@/lib/email/server";

// The "Turn off these emails" link in every email (lib/email/token.ts signs
// it): GET shows which emails it turns off and a Turn off button; POST
// turns them off, from that button or a mail app's one-click unsubscribe
// (RFC 8058). Not for search engines (noindex). lib/email/server.ts.

export function GET(req: Request) {
  return getOff(req);
}

export function POST(req: Request) {
  return postOff(req);
}
