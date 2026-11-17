import { postGameUpdate } from "@/lib/games/server";

// Updates from a game's host (lib/games/server.ts, lib/games/updates.ts, 20261118_game_updates.sql).

type Ctx = { params: Promise<{ id: string }> };

/** { text }: the host posts an update; the game's players and waiting requests are told once, in the app. */
export async function POST(req: Request, { params }: Ctx) {
  return postGameUpdate(req, (await params).id);
}
