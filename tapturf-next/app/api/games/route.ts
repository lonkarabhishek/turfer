import { postGame } from "@/lib/games/server";

// Host a new game, as the signed-in caller (lib/games/server.ts postGame,
// lib/games/types.ts has the API).

export function POST(req: Request) {
  return postGame(req);
}
