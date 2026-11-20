import { getGameByIdServer } from "@/lib/queries/games.server";
import { appMark } from "./appMark";
import { gameCardFacts, gameCardPath, gameCardVersion, isGameCardShape, isGameId } from "./gameCard";
import { gameCardPng } from "./gameCardDesigns";

/**
 * GET /api/og/game/<id>[/4x3|/1x1]?v=<version>: a game's share card as a
 * PNG. What it says: lib/og/gameCard.ts; how it looks:
 * lib/og/gameCardDesigns.tsx.
 *
 * - Nothing third-party: the drawing fetches no font, emoji or picture;
 *   the app icon is read from public/ (lib/og/appMark.ts; next.config.ts
 *   traces it).
 * - Caching: a URL whose version is the game's current one gets its
 *   picture, kept a day by the CDN (that URL never shows anything else).
 *   Any other URL of a real game (an older version, none, another query)
 *   is a 307 to the current one, kept a minute, so a share preview or
 *   Google following an old page reaches today's card. Unknown game: 404,
 *   a minute; not a game id or shape: 404, a day.
 * - Under /api, so proxy.ts never runs for it; robots.txt allows it.
 */

const notFound = (cache: string) =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache } });

/** The route handlers' answer for /api/og/game/<id>[/<shape>]. */
export async function gameCardResponse(req: Request, id: string, shape: string): Promise<Response> {
  if (!isGameId(id) || !isGameCardShape(shape)) return notFound("public, max-age=86400, s-maxage=86400");
  const game = await getGameByIdServer(id);
  if (!game) return notFound("public, max-age=60, s-maxage=60");
  const now = Date.now();
  const facts = gameCardFacts(game, now);
  const path = gameCardPath(id, shape, gameCardVersion(facts));
  const { pathname, search } = new URL(req.url);
  if (`${pathname}${search}` !== path) {
    return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "public, max-age=60, s-maxage=60" } });
  }
  return gameCardPng(facts, shape, await appMark(), { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600" });
}
