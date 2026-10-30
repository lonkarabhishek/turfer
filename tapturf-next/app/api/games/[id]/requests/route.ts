import { getGameRequests, postGameRequest } from "@/lib/games/server";

// One game's join requests (lib/games/server.ts).

type Ctx = { params: Promise<{ id: string }> };

/** The host: every request, with notes. Anyone else: their own latest. */
export async function GET(req: Request, { params }: Ctx) {
  return getGameRequests(req, (await params).id);
}

/** { note }: ask to join, as the signed-in caller. */
export async function POST(req: Request, { params }: Ctx) {
  return postGameRequest(req, (await params).id);
}
