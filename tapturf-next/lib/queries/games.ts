import { createClient } from "@/lib/supabase/client";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { usableTurfPhotos } from "@/lib/utils/images";
import { venueMoveNotice, venueMoveRecipients, venueProblem, type VenueOption } from "@/lib/utils/gameVenue";
import type { Game, GameRequest, GameParticipant, CreateGameData } from "@/types/game";

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
export async function getMyRequestForGame(gameId: string, userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("game_requests")
    .select("id,status")
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return { data: (row as { id: string; status: GameRequest["status"] } | undefined) ?? null, error: error?.message || null };
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

export async function createGame(gameData: CreateGameData, user: { id: string; name: string; phone?: string; profile_image_url?: string }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("games")
    .insert([{
      creator_id: user.id,
      turf_id: gameData.turfId,
      title: `${gameData.sport} Game`,
      description: gameData.description || gameData.notes || `${gameData.sport} game`,
      sport: gameData.sport,
      skill_level: gameData.skillLevel,
      max_players: gameData.maxPlayers,
      current_players: 1,
      date: gameData.date,
      start_time: gameData.startTime,
      end_time: gameData.endTime,
      price_per_player: gameData.costPerPerson,
      status: "open",
      host_name: user.name || "Player",
      host_phone: user.phone || "",
      host_profile_image_url: user.profile_image_url || "",
      turf_booked: gameData.turfBooked || false,
    }])
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Add creator as first participant
  if (data) {
    const { error: participantError } = await supabase.from("game_participants").insert([{
      game_id: data.id,
      user_id: user.id,
    }]);
    if (participantError) {
      console.error("Failed to add creator as participant:", participantError.message);
    }
  }

  return { data: data as Game, error: null };
}

export async function updateGame(gameId: string, userId: string, updates: {
  date?: string;
  start_time?: string;
  end_time?: string;
  max_players?: number;
  price_per_player?: number;
  description?: string;
  turf_booked?: boolean;
  skill_level?: string;
  /** A new venue (the host's "Change venue"): saved only when it is a listed turf. */
  turf_id?: string;
}) {
  const supabase = createClient();
  if (updates.turf_id) {
    // Read again at save time: the sheet's list can be minutes old.
    const { data: turf } = await supabase.from("turfs").select("id").eq("id", updates.turf_id).eq("is_active", true).maybeSingle();
    const problem = venueProblem({ id: updates.turf_id }, null, turf);
    if (problem) return { data: null, error: problem };
  }
  const { data, error } = await supabase
    .from("games")
    .update(updates)
    .eq("id", gameId)
    .eq("creator_id", userId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Game, error: null };
}

/**
 * The game moved (updateGame saved a new turf_id): a notification for
 * everyone playing and everyone with a request still waiting, never the
 * host ("Asha moved Football on Sat 7 Nov to Dribble Den, Begur"). Best
 * effort: the move is saved either way.
 */
export async function notifyVenueMove(
  game: Pick<Game, "id" | "creator_id" | "host_name" | "sport" | "date">,
  to: VenueOption,
  fromTurfId: string | null,
) {
  const supabase = createClient();
  const [{ data: players }, { data: asks }] = await Promise.all([
    supabase.from("game_participants").select("user_id").eq("game_id", game.id),
    supabase.from("game_requests").select("user_id, status").eq("game_id", game.id).in("status", ["pending", "accepted"]),
  ]);
  const ids = venueMoveRecipients(game.creator_id, players ?? [], asks ?? []);
  if (ids.length === 0) return { sent: 0, error: null };
  const { title, message } = venueMoveNotice(game, to);
  const { error } = await supabase.from("notifications").insert(ids.map((user_id) => ({
    user_id,
    type: "game_venue_changed",
    title,
    message,
    metadata: { gameId: game.id, turfId: to.id, fromTurfId },
    is_read: false,
  })));
  if (error) console.error("Venue change notifications failed:", error.message);
  return { sent: error ? 0 : ids.length, error: error?.message || null };
}

export async function deleteGame(gameId: string, userId: string) {
  const supabase = createClient();
  // Delete in order: notifications, requests, participants, game
  await supabase.from("notifications").delete().eq("metadata->>gameId", gameId);
  await supabase.from("game_requests").delete().eq("game_id", gameId);
  await supabase.from("game_participants").delete().eq("game_id", gameId);

  const { error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId)
    .eq("creator_id", userId);

  return { success: !error, error: error?.message || null };
}

// ── Game Requests ──────────────────────────────────────

export async function sendJoinRequest(gameId: string, userId: string, note?: string, requesterName?: string) {
  const supabase = createClient();
  // Check for existing request
  const { data: existing } = await supabase
    .from("game_requests")
    .select("id, status")
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.status === "pending") {
    return { data: null, error: "You already have a pending request" };
  }
  if (existing?.status === "accepted") {
    return { data: null, error: "You have already joined this game" };
  }

  const { data, error } = await supabase
    .from("game_requests")
    .insert([{
      game_id: gameId,
      user_id: userId,
      note: note || null,
      status: "pending",
      requester_name: requesterName || "Player",
    }])
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Notify the host
  const { data: game } = await supabase
    .from("games")
    .select("creator_id, sport")
    .eq("id", gameId)
    .single();

  if (game?.creator_id) {
    await supabase.from("notifications").insert([{
      user_id: game.creator_id,
      type: "game_request",
      title: "New Join Request",
      message: `${requesterName || "Someone"} wants to join your ${game.sport || "game"}`,
      metadata: { gameId, requestId: data.id },
      is_read: false,
    }]);
  }

  return { data: data as GameRequest, error: null };
}

export async function getGameRequests(gameId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("game_requests")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  return { data: (data as GameRequest[]) || [], error: error?.message || null };
}

export async function getMyRequests(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("game_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data: (data as GameRequest[]) || [], error: error?.message || null };
}

export async function acceptRequest(requestId: string, gameId: string, userId: string) {
  const supabase = createClient();

  // Check if game is full before accepting.
  // .limit(1) instead of .single() — never crash on 0-row RLS results.
  const { data: gameRows } = await supabase
    .from("games")
    .select("current_players, max_players")
    .eq("id", gameId)
    .limit(1);

  const game = gameRows?.[0];
  if (!game) return { success: false, error: "Game not found" };
  if (game.current_players >= game.max_players) return { success: false, error: "Game is full" };

  const { data: updatedRows, error } = await supabase
    .from("game_requests")
    .update({ status: "accepted" })
    .eq("id", requestId)
    .select();

  if (error) return { success: false, error: error.message };
  const updatedRequest = updatedRows?.[0];
  if (!updatedRequest) return { success: false, error: "Couldn't update the request. Please refresh and try again." };

  // Increment player count
  await supabase
    .from("games")
    .update({ current_players: game.current_players + 1 })
    .eq("id", gameId);

  // Add as participant
  await supabase.from("game_participants").insert([{
    game_id: gameId,
    user_id: updatedRequest.user_id,
  }]);

  // Notify the requester
  await supabase.from("notifications").insert([{
    user_id: updatedRequest.user_id,
    type: "game_request_accepted",
    title: "Request Accepted!",
    message: "Your request to join the game has been accepted!",
    metadata: { gameId, requestId },
    is_read: false,
  }]);

  return { success: true, error: null };
}

export async function declineRequest(requestId: string, gameId: string) {
  const supabase = createClient();
  const { data: updatedRows, error } = await supabase
    .from("game_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .select();

  if (error) return { success: false, error: error.message };
  const updatedRequest = updatedRows?.[0];
  if (!updatedRequest) return { success: false, error: "Couldn't update the request. Please refresh and try again." };

  // Notify the requester
  await supabase.from("notifications").insert([{
    user_id: updatedRequest.user_id,
    type: "game_request_declined",
    title: "Request Declined",
    message: "Your request to join the game was declined.",
    metadata: { gameId, requestId },
    is_read: false,
  }]);

  return { success: true, error: null };
}

export async function cancelMyRequest(requestId: string, userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("game_requests")
    .delete()
    .eq("id", requestId)
    .eq("user_id", userId)
    .eq("status", "pending");

  return { success: !error, error: error?.message || null };
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
