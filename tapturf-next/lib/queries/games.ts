import { createClient } from "@/lib/supabase/client";
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
      .select('id, name, address, "Gmap Embed link"')
      .in("id", turfIds);

    if (turfs) {
      const turfsMap = Object.fromEntries(turfs.map((t) => [t.id, t]));
      data.forEach((game: Record<string, unknown>) => {
        if (game.turf_id && turfsMap[game.turf_id as string]) {
          game.turfs = turfsMap[game.turf_id as string];
        }
      });
    }
  }

  return { data: data as Game[], error: null };
}

export async function getGameById(gameId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error || !data) return { data: null, error: error?.message || "Game not found" };

  // Fetch turf info separately
  if (data.turf_id) {
    const { data: turf } = await supabase
      .from("turfs")
      .select('id, name, address, "Gmap Embed link"')
      .eq("id", data.turf_id)
      .single();
    if (turf) (data as Record<string, unknown>).turfs = turf;
  }

  return { data: data as Game, error: null };
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
      .select('id, name, address, "Gmap Embed link"')
      .in("id", turfIds);
    if (turfs) {
      const turfsMap = Object.fromEntries(turfs.map((t) => [t.id, t]));
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
}) {
  const supabase = createClient();
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

  // Check if game is full before accepting
  const { data: game } = await supabase
    .from("games")
    .select("current_players, max_players")
    .eq("id", gameId)
    .single();

  if (!game) return { success: false, error: "Game not found" };
  if (game.current_players >= game.max_players) return { success: false, error: "Game is full" };

  const { data: updatedRequest, error } = await supabase
    .from("game_requests")
    .update({ status: "accepted" })
    .eq("id", requestId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

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
  const { data: updatedRequest, error } = await supabase
    .from("game_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

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
