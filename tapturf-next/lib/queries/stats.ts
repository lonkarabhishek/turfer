import { createClient } from "@/lib/supabase/client";
import type { Game } from "@/types/game";

export interface UserStats {
  totalGames: number;      // hosted + joined (deduped via game_participants)
  peopleMet: number;       // distinct co-players across all games
  sportsPlayed: number;    // distinct sports
  nextGame: Game | null;   // soonest upcoming game
  upcomingCount: number;   // how many games ahead
}

/**
 * One-round-trip user stats for the home welcome-back panel.
 * All queries are anon-key + RLS-permissive against public.game_participants,
 * public.games — same pattern the rest of the app uses.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const supabase = createClient();

  // 1. Every game the user is a participant in.
  const { data: partRows } = await supabase
    .from("game_participants")
    .select("game_id")
    .eq("user_id", userId);
  const gameIds = (partRows ?? []).map((r) => r.game_id as string);

  if (gameIds.length === 0) {
    return { totalGames: 0, peopleMet: 0, sportsPlayed: 0, nextGame: null, upcomingCount: 0 };
  }

  // 2. Games themselves (for sport count + next game).
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, creator_id, turf_id, title, description, sport, skill_level, date, start_time, end_time, max_players, current_players, price_per_player, host_name, host_phone, host_profile_image_url, status, turf_booked, created_at, turfs(id, name, address)")
    .in("id", gameIds);
  const games = (gameRows ?? []) as unknown as Game[];

  const sports = new Set(games.map((g) => g.sport));

  // 3. Distinct co-players from all shared games (excluding self).
  const { data: coRows } = await supabase
    .from("game_participants")
    .select("user_id")
    .in("game_id", gameIds)
    .neq("user_id", userId);
  const coPlayers = new Set((coRows ?? []).map((r) => r.user_id as string));

  // 4. Upcoming games — anything today-or-later whose kickoff hasn't passed.
  const now = new Date();
  const upcoming = games
    .filter((g) => {
      if (!g.date || !g.start_time) return false;
      const kickoff = new Date(`${g.date}T${g.start_time}`);
      return kickoff.getTime() >= now.getTime();
    })
    .sort((a, b) =>
      `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)
    );

  return {
    totalGames: games.length,
    peopleMet: coPlayers.size,
    sportsPlayed: sports.size,
    nextGame: upcoming[0] ?? null,
    upcomingCount: upcoming.length,
  };
}
