import { cache } from "react";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { cardGame, filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import type { Game } from "@/types/game";
import { readAvailableGames, readGameTurfs } from "@/lib/build/reads";
import { buildData } from "@/lib/build/data";
import { markThinRender } from "@/lib/queries/turfs";
import { Unavailable } from "@/lib/cache/unavailable";

/**
 * Server-side game queries — used by SSG/ISR pages so Google indexes
 * live game listings. Uses the read-only anon client (no cookies).
 */

export async function getAvailableGamesServer(): Promise<Game[]> {
  // While building: the games and turfs the build-data step read (lib/build/data.ts), copied (the rows get their turf below).
  const built = buildData("games")?.available;
  const supabase = createReadOnlyClient();
  const read = built ? null : await readAvailableGames(supabase);
  const data = built ? built.games.map((g) => ({ ...g })) : read!.data;

  // A failed read lists no games: that page is kept a minute only
  // (markThinRender, as before 10 Nov when the page's own timer was a
  // minute), not its 10 minutes.
  if (read?.error) await markThinRender();
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
