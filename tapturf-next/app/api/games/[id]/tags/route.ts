import { getGameTags, postGameTag } from "@/lib/games/server";

// The TapTurf players a game's host tagged as confirmed (lib/games/server.ts, lib/games/confirmed.ts).

type Ctx = { params: Promise<{ id: string }> };

/** The host: the tagged players still to answer. Anyone else: whether they are one. */
export async function GET(req: Request, { params }: Ctx) {
  return getGameTags(req, (await params).id);
}

/** { answer: "yes" | "no" }: the tagged caller's answer. */
export async function POST(req: Request, { params }: Ctx) {
  return postGameTag(req, (await params).id);
}
