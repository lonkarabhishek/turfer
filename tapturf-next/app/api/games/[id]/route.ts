import { deleteGame, patchGame } from "@/lib/games/server";

// The host's edit of their game, a venue move too (lib/games/server.ts patchGame), and the host deleting it:
// called off first when it hasn't started, then hidden from everyone (deleteGame, 20261122_game_remove.sql).

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return patchGame(req, (await params).id);
}

export async function DELETE(req: Request, { params }: Ctx) {
  return deleteGame(req, (await params).id);
}
