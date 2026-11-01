import { deleteRequest, patchRequest } from "@/lib/games/server";

// One join request (lib/games/server.ts).

type Ctx = { params: Promise<{ id: string }> };

/** { action: "accept" | "decline" }: the game's host answers. */
export async function PATCH(req: Request, { params }: Ctx) {
  return patchRequest(req, (await params).id);
}

/** The requester takes back a pending request. Nothing is deleted: it is kept as withdrawn. */
export async function DELETE(req: Request, { params }: Ctx) {
  return deleteRequest(req, (await params).id);
}
