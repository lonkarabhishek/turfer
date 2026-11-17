import { deleteGameUpdate } from "@/lib/games/server";

type Ctx = { params: Promise<{ id: string; update: string }> };

/** The host takes back an update they posted (lib/games/server.ts). */
export async function DELETE(req: Request, { params }: Ctx) {
  const p = await params;
  return deleteGameUpdate(req, p.id, p.update);
}
