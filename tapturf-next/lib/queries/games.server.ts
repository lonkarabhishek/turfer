import { cache } from "react";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { cardGame, filterNonExpiredGames, sortGamesByDateTime } from "@/lib/utils/game";
import type { Game } from "@/types/game";

/**
 * Server-side game queries — used by SSG/ISR pages so Google indexes
 * live game listings. Uses the read-only anon client (no cookies).
 */

export async function getAvailableGamesServer(): Promise<Game[]> {
  const supabase = createReadOnlyClient();
  const { data } = await supabase
    .from("games")
    .select("*")
    .in("status", ["open", "upcoming", "active"])
    .order("date", { ascending: true });

  if (!data || data.length === 0) return [];

  // Batch-fetch related turfs
  const turfIds = [...new Set(data.map((g) => g.turf_id).filter(Boolean))];
  if (turfIds.length > 0) {
    const { data: turfs } = await supabase
      .from("turfs")
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link", cover_image, images, image_review')
      .in("id", turfIds);
    if (turfs) {
      const map = Object.fromEntries(turfs.map((t) => [t.id, { ...t, name: cleanVenueName(t.name) }]));
      data.forEach((g: Record<string, unknown>) => {
        if (g.turf_id && map[g.turf_id as string]) g.turfs = map[g.turf_id as string];
      });
    }
  }

  return data as Game[];
}

export async function getGameByIdServer(gameId: string): Promise<Game | null> {
  const supabase = createReadOnlyClient();
  const { data } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .limit(1);
  const g = data?.[0];
  if (!g) return null;

  if (g.turf_id) {
    const { data: turfs } = await supabase
      .from("turfs")
      .select('id, slug, name, address, city, lat, lng, "Gmap Embed link"')
      .eq("id", g.turf_id)
      .limit(1);
    if (turfs?.[0]) (g as Record<string, unknown>).turfs = { ...turfs[0], name: cleanVenueName(turfs[0].name) };
  }

  return g as Game;
}

/**
 * Open games, soonest first, for /games and every per-city /games
 * variant. Deliberately not wrapped in unstable_cache: the pages' own
 * 60 s ISR window is the only staleness, so a game a host just created
 * shows up within a minute instead of two. Each variant regenerates at
 * most once a minute and only when visited, far fewer reads than the old
 * per-visitor browser fetch. React cache() dedupes calls within a render.
 * `at` is the load time, which the list reads "Today" against until it
 * hydrates.
 */
export const getOpenGamesCached = cache(async (): Promise<{ games: Game[]; at: number }> => {
  const at = Date.now();
  return { games: sortGamesByDateTime(filterNonExpiredGames(await getAvailableGamesServer(), at)).map(cardGame), at };
});
