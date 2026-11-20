import { getGameRemoval } from "@/lib/games/server";

// What deleting this game would do, for its host: whether it can go and who would be told (lib/games/server.ts getGameRemoval).

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return getGameRemoval(req, (await params).id);
}
