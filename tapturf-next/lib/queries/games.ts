import { createClient } from "@/lib/supabase/client";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { usableTurfPhotos } from "@/lib/utils/images";
import {
  answerRequestCall,
  createGameCall,
  gameProblem,
  myRequestsCall,
  requestsForGameCall,
  sendRequestCall,
  updateGameCall,
  withdrawRequestCall,
  type GameAnswer,
  type GetToken,
} from "@/lib/games/client";
import type { GameChanges } from "@/lib/games/types";
import type { Game, GameRequest, GameParticipant, CreateGameData } from "@/types/game";

// Public reads (games, lineups, turfs) use the anon key, as the pages
// always have. Every write, and every read of join requests, goes through
// the games routes as the signed-in caller (lib/games/client.ts): pass
// useAuth().getToken. The database lets nothing else write.

/** The body when the call went through, else the page's words for what went wrong. */
function outcome<T extends object>(a: GameAnswer<T>, has: keyof T): { ok: T } | { error: string } {
  const b = a.body as T;
  return a.status === 200 && b && has in b ? { ok: b } : { error: gameProblem(a) ?? "Something went wrong. Please try again." };
}

// ── Game CRUD ──────────────────────────────────────────

export async function getAvailableGames(filters?: {
  sport?: string;
  skillLevel?: string;
  date?: string;
}) {
  const supabase = createClient();
  let query = supabase
    .from("games")
    .select("*")
    .in("status", ["open", "upcoming", "active"])
    .order("date", { ascending: true });

  if (filters?.sport) query = query.eq("sport", filters.sport);
  if (filters?.skillLevel && filters.skillLevel !== "all") {
    query = query.eq("skill_level", filters.skillLevel);
  }
  if (filters?.date) query = query.eq("date", filters.date);

  const { data, error } = await query;

  if (error || !data) return { data: [] as Game[], error: error?.message || null };

  // Batch-fetch turf data
  const turfIds = [...new Set(data.map((g) => g.turf_id).filter(Boolean))];
  if (turfIds.length > 0) {
    const { data: turfs } = await supabase
      .from("turfs")
      .select('id, slug, name, address, city, lat, lng, "Gmap Embed link"')
      .in("id", turfIds);

    if (turfs) {
      const turfsMap = Object.fromEntries(turfs.map((t) => [t.id, { ...t, name: cleanVenueName(t.name) }]));
      data.forEach((game: Record<string, unknown>) => {
        if (game.turf_id && turfsMap[game.turf_id as string]) {
          game.turfs = turfsMap[game.turf_id as string];
        }
      });
    }
  }

  return { data: data as Game[], error: null };
}

/**
 * Upcoming games at one turf (soonest first). Past games are dropped
 * by date here and by start time via filterNonExpiredGames in the UI,
 * since stored status stays "open" after a game ends.
 */
export async function getUpcomingGamesForTurf(turfId: string) {
  const supabase = createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("turf_id", turfId)
    .in("status", ["open", "upcoming", "active"])
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(20);
  if (error || !data) return [] as Game[];
  return data as Game[];
}

export async function getGameById(gameId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error || !data) return { data: null, error: error?.message || "Game not found" };

  // Fetch turf info separately. The photo columns ride on this same
  // read; the page gets up to 3 cleaned photos, never the raw arrays.
  if (data.turf_id) {
    const { data: turf } = await supabase
      .from("turfs")
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link", cover_image, images, image_review')
      .eq("id", data.turf_id)
      .single();
    if (turf) {
      const { cover_image, images, image_review, ...rest } = turf;
      (data as Record<string, unknown>).turfs = {
        ...rest,
        name: cleanVenueName(turf.name),
        photos: usableTurfPhotos({ cover_image, images, image_review }, 3),
      };
    }
  }

  return { data: data as Game, error: null };
}

/**
 * The signed-in player's latest request for this game ({ id, status }),
 * so a reload still says "Request sent" or "Request declined". Read only
 * for someone who is neither the host nor already playing.
 */
export async function getMyRequestForGame(getToken: GetToken, gameId: string) {
  const r = outcome(await requestsForGameCall(getToken, gameId), "host");
  if ("error" in r) return { data: null, error: r.error };
  return { data: r.ok.host ? null : r.ok.mine, error: null };
}

export async function getUserGames(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return { data: [] as Game[], error: error?.message || null };

  // Batch-fetch turfs
  const turfIds = [...new Set(data.map((g) => g.turf_id).filter(Boolean))];
  if (turfIds.length > 0) {
    const { data: turfs } = await supabase
      .from("turfs")
      .select('id, slug, name, address, city, lat, lng, "Gmap Embed link"')
      .in("id", turfIds);
    if (turfs) {
      const turfsMap = Object.fromEntries(turfs.map((t) => [t.id, { ...t, name: cleanVenueName(t.name) }]));
      data.forEach((game: Record<string, unknown>) => {
        if (game.turf_id && turfsMap[game.turf_id as string]) {
          game.turfs = turfsMap[game.turf_id as string];
        }
      });
    }
  }

  return { data: data as Game[], error: null };
}

export async function getUserJoinedGames(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("game_participants")
    .select("game_id")
    .eq("user_id", userId);

  if (error || !data || data.length === 0) return { data: [] as Game[], error: null };

  const gameIds = data.map((p) => p.game_id);
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .in("id", gameIds)
    .order("date", { ascending: true });

  return { data: (games as Game[]) || [], error: gamesError?.message || null };
}

/** The signed-in caller hosts a new game (they become its first player). hostPhone: "" or +91 and 10 digits. */
export async function createGame(getToken: GetToken, gameData: CreateGameData, hostPhone: string) {
  const r = outcome(
    await createGameCall(getToken, {
      turf_id: gameData.turfId,
      sport: gameData.sport,
      skill_level: gameData.skillLevel,
      max_players: gameData.maxPlayers,
      date: gameData.date,
      start_time: gameData.startTime,
      end_time: gameData.endTime,
      price_per_player: gameData.costPerPerson,
      description: gameData.description || gameData.notes || null,
      turf_booked: gameData.turfBooked || false,
      host_phone: hostPhone,
    }),
    "game",
  );
  return "error" in r ? { data: null, error: r.error } : { data: r.ok.game, error: null };
}

/**
 * The host's edit. A new turf_id moves the game to another listed turf,
 * and the server tells everyone playing or waiting on a request.
 */
export async function updateGame(getToken: GetToken, gameId: string, updates: GameChanges) {
  const r = outcome(await updateGameCall(getToken, gameId, updates), "game");
  return "error" in r ? { data: null, error: r.error } : { data: r.ok.game, error: null };
}

// ── Game Requests ──────────────────────────────────────

/** Ask to join, as the signed-in caller; the host is told. */
export async function sendJoinRequest(getToken: GetToken, gameId: string, note?: string) {
  const r = outcome(await sendRequestCall(getToken, gameId, note?.trim() || null), "request");
  return "error" in r ? { data: null, error: r.error } : { data: r.ok.request, error: null };
}

/** The host's requests for their game (with notes); [] for anyone else. */
export async function getGameRequests(getToken: GetToken, gameId: string) {
  const r = outcome(await requestsForGameCall(getToken, gameId), "host");
  if ("error" in r) return { data: [] as GameRequest[], error: r.error };
  return { data: r.ok.host ? r.ok.requests : [], error: null };
}

/** The signed-in caller's own requests, newest first. */
export async function getMyRequests(getToken: GetToken) {
  const r = outcome(await myRequestsCall(getToken), "requests");
  return "error" in r ? { data: [] as GameRequest[], error: r.error } : { data: r.ok.requests, error: null };
}

/** The host accepts: the player is added (unless the game is full) and told. */
export async function acceptRequest(getToken: GetToken, requestId: string) {
  const r = outcome(await answerRequestCall(getToken, requestId, true), "status");
  return "error" in r ? { success: false, error: r.error } : { success: true, error: null };
}

/** The host declines; the player is told. */
export async function declineRequest(getToken: GetToken, requestId: string) {
  const r = outcome(await answerRequestCall(getToken, requestId, false), "status");
  return "error" in r ? { success: false, error: r.error } : { success: true, error: null };
}

/** Take back the caller's own pending request. */
export async function cancelMyRequest(getToken: GetToken, requestId: string) {
  const r = outcome(await withdrawRequestCall(getToken, requestId), "r");
  return "error" in r ? { success: false, error: r.error } : { success: true, error: null };
}

export async function getGameParticipants(gameId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("game_participants")
    .select("*")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true });

  if (error || !data) return { data: [] as GameParticipant[], error: error?.message || null };

  // Enrich with user data
  const userIds = data.map((p) => p.user_id);
  const { data: users } = await supabase
    .from("users")
    .select("id, name, profile_image_url")
    .in("id", userIds);

  if (users) {
    const usersMap = Object.fromEntries(users.map((u) => [u.id, u]));
    data.forEach((p: Record<string, unknown>) => {
      const u = usersMap[p.user_id as string];
      if (u) {
        p.name = u.name;
        p.profile_image_url = u.profile_image_url;
      }
    });
  }

  return { data: data as GameParticipant[], error: null };
}
