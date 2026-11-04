import { gameCardResponse } from "@/lib/og/gameCardImage";

// GET /api/og/game/<id>/4x3?v=<version> (1200x900) and /1x1 (1200x1200):
// the game's share card in the other shapes Google asks for in an Event's
// image (lib/og/gameCard.ts GAME_CARD_SHAPES); any other shape is a 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; shape: string }> }) {
  const { id, shape } = await params;
  return gameCardResponse(req, id, shape === "og" ? "" : shape);
}
