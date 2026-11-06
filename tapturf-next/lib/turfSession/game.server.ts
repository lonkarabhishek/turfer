import { anonDb } from "../games/db";
import { formatFor, serverWindowOk } from "./plan";

/**
 * Whether this account may give a game its turf session's live link
 * (POST /api/tournament with game): the game's host or a player in it, a
 * cricket game that is a match (not nets), not cancelled, and today in
 * India from the day before the game to two days after. Two public reads
 * with the anon client, as the browser may make them (games and lineups,
 * 20261030_games_lockdown.sql): the game and the caller's own lineup row.
 * Nothing about the game is written. Server only.
 */
export async function canScoreGame(gameId: string, userId: string, now: number = Date.now()): Promise<"ok" | "forbidden" | "unavailable"> {
  try {
    const db = anonDb();
    const { data: game, error } = await db.from("games").select("creator_id, sport, date, status").eq("id", gameId).maybeSingle();
    if (error) {
      console.warn("turf session: game read failed", error.code, error.message);
      return "unavailable";
    }
    const g = game as { creator_id?: unknown; sport?: unknown; date?: unknown; status?: unknown } | null;
    if (!g || typeof g.date !== "string") return "forbidden";
    if (!formatFor(typeof g.sport === "string" ? g.sport : "") || g.status === "cancelled" || !serverWindowOk(g.date.slice(0, 10), now)) return "forbidden";
    if (g.creator_id === userId) return "ok";
    const { data: row, error: e2 } = await db.from("game_participants").select("user_id").eq("game_id", gameId).eq("user_id", userId).maybeSingle();
    if (e2) {
      console.warn("turf session: lineup read failed", e2.code, e2.message);
      return "unavailable";
    }
    return row ? "ok" : "forbidden";
  } catch (e) {
    console.warn("turf session: game check threw", e);
    return "unavailable";
  }
}
