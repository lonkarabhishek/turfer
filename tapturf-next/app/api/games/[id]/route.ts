import { patchGame } from "@/lib/games/server";

// The host's edit of their game, a venue move too (lib/games/server.ts patchGame).

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return patchGame(req, (await params).id);
}
