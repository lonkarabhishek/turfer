import { createReadOnlyClient } from "@/lib/supabase/server";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { isGameExpired } from "@/lib/utils/game";
import type { Game } from "@/types/game";
import { istToday, readGameTurfs, readOpenGames, ymd } from "@/lib/build/reads";
import { buildData } from "@/lib/build/data";

/**
 * Open games for Ask TapTurf, server side. Same rows the /games page
 * shows, joined to their turf for city and distance. Host phone
 * numbers never leave the server here: the game page shows them to
 * signed-in players only. The search over them is lib/ai/gameFilters.ts.
 */

export { applyGameFilters, type AskGame, type GamesResult } from "./gameFilters";

/**
 * A failed read returns [] (Ask just finds no games), or throws with
 * `strict` for callers that cache the answer: the home's shared copy
 * must not store "no games" for a failure (20 Oct follow-up).
 */
export async function loadOpenGames({ strict = false }: { strict?: boolean } = {}): Promise<Game[]> {
  // While building: the games and turfs the build-data step read (lib/build/data.ts); expired ones drop below.
  const built = buildData("games")?.open;
  const supabase = createReadOnlyClient();
  const { data, error } = built ? { data: built.games, error: null } : await readOpenGames(supabase, ymd(istToday()));
  if (error || !data) {
    if (strict) throw new Error(`open games read failed: ${error?.message ?? "no data"}`);
    return [];
  }
  const turfIds = [...new Set(data.map((g) => g.turf_id as string).filter(Boolean))];
  const turfsMap: Record<string, Game["turfs"]> = {};
  if (turfIds.length) {
    const { data: turfs, error: turfsError } = built ? { data: built.turfs, error: null } : await readGameTurfs(supabase, turfIds);
    // Without their turfs the games have no city, so the home would list none.
    if (turfsError && strict) throw new Error(`open games turfs read failed: ${turfsError.message}`);
    // Names without a booking app's attribution, as on the turf's own page.
    for (const t of turfs ?? []) turfsMap[(t as { id: string }).id] = { ...(t as NonNullable<Game["turfs"]>), name: cleanVenueName((t as { name: string }).name) };
  }
  return (data as unknown as Game[])
    .map((g) => ({ ...g, host_phone: "", turfs: g.turf_id ? turfsMap[g.turf_id] : undefined }))
    .filter((g) => !isGameExpired(g));
}
