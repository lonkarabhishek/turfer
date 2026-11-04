import { gameCardResponse } from "@/lib/og/gameCardImage";

// GET /api/og/game/<id>?v=<version>: the game's share card, 1200x630 PNG,
// its page's og:image and twitter:image and the first image of its
// SportsEvent JSON-LD. The 4:3 and 1:1 cards are at ./4x3 and ./1x1.
// A plain dynamic handler: Next passes its Cache-Control through
// (lib/og/gameCardImage.tsx says what is kept how long, and why).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return gameCardResponse(req, id, "og");
}
