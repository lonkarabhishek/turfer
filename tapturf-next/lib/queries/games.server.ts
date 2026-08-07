import { createReadOnlyClient } from "@/lib/supabase/server";
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
      .select('id, name, address, "Gmap Embed link"')
      .in("id", turfIds);
    if (turfs) {
      const map = Object.fromEntries(turfs.map((t) => [t.id, t]));
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
      .select('id, name, address, "Gmap Embed link"')
      .eq("id", g.turf_id)
      .limit(1);
    if (turfs?.[0]) (g as Record<string, unknown>).turfs = turfs[0];
  }

  return g as Game;
}
