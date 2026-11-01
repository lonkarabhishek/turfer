import { getRequests } from "@/lib/games/server";

// ?mine=1: the signed-in caller's join requests; ?incoming=1: the pending
// ones on the games they host (lib/games/server.ts getRequests).

export function GET(req: Request) {
  return getRequests(req);
}
