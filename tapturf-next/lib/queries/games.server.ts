import { cache } from "react";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { cardGame, filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import type { Game } from "@/types/game";
import { readAvailableGames, readGameTurfs } from "@/lib/build/reads";
import { buildData } from "@/lib/build/data";
import { markThinRender } from "@/lib/queries/turfs";
import { Unavailable } from "@/lib/cache/unavailable";
import { codeRange, gameCode, gamePath, gameSlugPath, parseGameParam, resolveGameParam } from "@/lib/utils/gamePath";

/**
 * Server-side game queries — used by SSG/ISR pages so Google indexes
 * live game listings. Uses the read-only anon client (no cookies).
 */

export async function getAvailableGamesServer(): Promise<Game[]> {
  return availableGames(true);
}

/**
 * Every open game's readable path by its id (lib/utils/gamePath.ts), for
 * the sitemap: the same rows /games reads (while building, the build-data
 * step's). A failed read gives none, and the sitemap lists those games by
 * id (which redirects) until its next regeneration.
 */
export async function openGamePaths(): Promise<Map<string, string>> {
  try {
    const games = await availableGames(false);
    // Two open games sharing a code: each at its whole-id URL, as its page says (resolveGameParam).
    const codes = new Map<string, number>();
    for (const g of games) codes.set(gameCode(g.id), (codes.get(gameCode(g.id)) ?? 0) + 1);
    return new Map(games.map((g) => [g.id, (codes.get(gameCode(g.id)) ?? 0) > 1 ? gameSlugPath(g, { whole: true }) : gamePath(g)]));
  } catch {
    return new Map();
  }
}

/** `thin`: a page's read (a failed one keeps the page a minute); false for a route's (the sitemap). */
async function availableGames(thin: boolean): Promise<Game[]> {
  // While building: the games and turfs the build-data step read (lib/build/data.ts), copied (the rows get their turf below).
  const built = buildData("games")?.available;
  const supabase = createReadOnlyClient();
  const read = built ? null : await readAvailableGames(supabase);
  const data = built ? built.games.map((g) => ({ ...g })) : read!.data;

  // A failed read lists no games: that page is kept a minute only
  // (markThinRender, as before 10 Nov when the page's own timer was a
  // minute), not its 10 minutes.
  if (read?.error && thin) await markThinRender();
  if (!data || data.length === 0) return [];

  // Batch-fetch related turfs
  const turfIds = [...new Set(data.map((g) => g.turf_id as string).filter(Boolean))];
  if (turfIds.length > 0) {
    const turfs = built ? built.turfs : (await readGameTurfs(supabase, turfIds, { card: true })).data;
    if (turfs) {
      const map = Object.fromEntries(turfs.map((t) => [t.id, { ...t, name: cleanVenueName(t.name as string) }]));
      data.forEach((g: Record<string, unknown>) => {
        if (g.turf_id && map[g.turf_id as string]) g.turfs = map[g.turf_id as string];
      });
    }
  }

  return data as unknown as Game[];
}

/**
 * One game and its turf, or null when there is no such game. `strict`
 * (the game page, an ISR copy kept 10 minutes): a failed read throws
 * Unavailable instead of reading as "no such game", so a regeneration
 * keeps the last good page and a first render answers 503, never a cached
 * "Game not found" (noindex) or a venue-less page.
 */
export async function getGameByIdServer(gameId: string, { strict = false }: { strict?: boolean } = {}): Promise<Game | null> {
  const supabase = createReadOnlyClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .limit(1);
  // An id that is not a uuid is a 22P02 from Postgres: no such game, not a failed read.
  if (strict && error && error.code !== "22P02") throw new Unavailable(`game ${gameId.slice(0, 40)}`, error.message);
  const g = data?.[0];
  if (!g) return null;

  if (g.turf_id) {
    const { data: turfs, error: turfError } = await supabase
      .from("turfs")
      // area: the share card's place line, as /games' cards have it (lib/og/gameCard.ts).
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link"')
      .eq("id", g.turf_id)
      .limit(1);
    if (strict && turfError) throw new Unavailable(`game ${gameId.slice(0, 40)} turf`, turfError.message);
    if (turfs?.[0]) (g as Record<string, unknown>).turfs = { ...turfs[0], name: cleanVenueName(turfs[0].name) };
  }

  return g as Game;
}

/** The most games read for one code: one, but for a shared code (lib/utils/gamePath.ts). */
const SAME_CODE_MAX = 10;

export type GameByParam = {
  game: Game;
  /** The game page's own path now (its canonical). */
  path: string;
  /** Where the request should go instead (the old uuid link, old words), or null when it is at `path`. */
  redirect: string | null;
};

/**
 * The game a /game/<param> names (a uuid, <words>-<code>, <words>-<uuid>;
 * lib/utils/gamePath.ts), its turf, its page's path now and whether the
 * param should redirect there; null when there is no such game. Found by
 * the code alone: a range on the primary key, so the words may be old.
 * `strict` as getGameByIdServer: a failed read throws Unavailable.
 */
export async function getGameByParam(param: string, { strict = false }: { strict?: boolean } = {}): Promise<GameByParam | null> {
  const parsed = parseGameParam(param);
  if (!parsed) return null;
  const supabase = createReadOnlyClient();
  const { from, to } = codeRange(parsed.code);
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .gte("id", from)
    .lte("id", to)
    .order("created_at", { ascending: true })
    .limit(SAME_CODE_MAX);
  if (strict && error) throw new Unavailable(`game ${parsed.code}`, error.message);
  const games = (data ?? []) as Record<string, unknown>[];
  if (games.length === 0) return null;

  const turfIds = [...new Set(games.map((g) => g.turf_id as string | null).filter(Boolean))] as string[];
  if (turfIds.length > 0) {
    const { data: turfs, error: turfError } = await supabase
      .from("turfs")
      // area: the share card's place line, as /games' cards have it (lib/og/gameCard.ts).
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link"')
      .in("id", turfIds);
    if (strict && turfError) throw new Unavailable(`game ${parsed.code} turf`, turfError.message);
    const byId = new Map((turfs ?? []).map((t) => [t.id as string, { ...t, name: cleanVenueName(t.name) }]));
    for (const g of games) {
      const t = g.turf_id ? byId.get(g.turf_id as string) : undefined;
      if (t) g.turfs = t;
    }
  }

  return resolveGameParam(param, games as unknown as Game[]);
}

/**
 * Open games, soonest first, for /games and every per-city /games
 * variant. Deliberately not wrapped in unstable_cache: the pages' own ISR
 * copy is the only staleness. Since 10 Nov that is 10 minutes, and the
 * games key (the games trigger, close_past_games through it) marks every
 * page carrying the games tag stale (GamesView, app/api/revalidate), so a
 * game a host just created still shows within about a minute. Each
 * variant regenerates only when visited, far fewer reads than the old
 * per-visitor browser fetch. React cache() dedupes calls within a render.
 * `at` is the load time, which the list reads "Today" against until it
 * hydrates.
 */
export const getOpenGamesCached = cache(async (): Promise<{ games: Game[]; at: number }> => {
  const at = Date.now();
  return { games: sortGamesByDateTime(filterNonExpiredGames(await getAvailableGamesServer(), at)).map(cardGame), at };
});
