import { cancelLink, linkState, startLink } from "@/lib/account/linkRoutes";

// Adding Google to a phone account (lib/account/linkRoutes.ts has the handlers, lib/account/types.ts the API).

/** Start: a phone sign-in from the last 5 minutes (or a proof). Answers Google's URL and sets the link cookie. */
export function POST(req: Request) {
  return startLink(req);
}

/** Where the attempt stands, for /account/link. */
export function GET(req: Request) {
  return linkState(req);
}

/** Cancel (and logout): ends the attempt its cookie names. Same-origin only. */
export function DELETE(req: Request) {
  return cancelLink(req);
}
