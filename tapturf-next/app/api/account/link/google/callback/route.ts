import { linkCallback } from "@/lib/account/linkRoutes";

/**
 * Google comes back here for a leg of adding Google to a phone account,
 * never to /api/auth/callback. The code is exchanged with the verifier in
 * the leg's httpOnly cookie, the Google account recorded on the leg, and
 * the session revoked: no Supabase session reaches the browser.
 */
export function GET(req: Request) {
  return linkCallback(req);
}
