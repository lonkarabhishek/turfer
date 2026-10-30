import { cancelGame } from "@/lib/games/server";

// The host calls their game off: status cancelled, the players told (lib/games/server.ts cancelGame).

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return cancelGame(req, (await params).id);
}
