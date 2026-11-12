import { createClient } from "@/lib/supabase/client";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import { usableTurfPhotos } from "@/lib/utils/images";
import {
  answerRequestCall,
  createGameCall,
  createSeriesCall,
  gameProblem,
  incomingRequestsCall,
  myRequestsCall,
  mySeriesCall,
  requestsForGameCall,
  sendRequestCall,
  stopSeriesCall,
  updateGameCall,
  withdrawRequestCall,
  type GameAnswer,
  type GetToken,
} from "@/lib/games/client";
import type { Repeat } from "@/lib/games/repeat";
import { missingVenueColumn } from "@/lib/games/otherVenue";
import type { CreateGameBody, GameChanges, GameSeries, SeriesInfo } from "@/lib/games/types";
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
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link"')
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
      .select('id, slug, name, address, area, city, lat, lng, "Gmap Embed link"')
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

/** The create flow's game as the API takes it: at its turf, or at the venue the host typed (lib/games/otherVenue.ts). */
function createBody(gameData: CreateGameData, hostPhone: string): CreateGameBody {
  const v = gameData.venue;
  const place = v
    ? { venue_name: v.name, venue_address: v.address, venue_area: v.area, venue_city: v.city, venue_maps_url: v.mapsUrl }
    : { turf_id: gameData.turfId };
  return {
    ...place,
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
  };
}

/** The signed-in caller hosts a new game (they become its first player). hostPhone: "" or +91 and 10 digits. */
export async function createGame(getToken: GetToken, gameData: CreateGameData, hostPhone: string) {
  const r = outcome(await createGameCall(getToken, createBody(gameData, hostPhone)), "game");
  return "error" in r ? { data: null, error: r.error } : { data: r.ok.game, error: null };
}

// ── Repeats ────────────────────────────────────────────

/**
 * The signed-in caller starts a repeat: the game, from its date on, as
 * `repeat` says. Its first games go up at once (the host the first player
 * of each), soonest first.
 */
export async function createSeries(getToken: GetToken, gameData: CreateGameData, hostPhone: string, repeat: Repeat) {
  const r = outcome(await createSeriesCall(getToken, { game: createBody(gameData, hostPhone), repeat }), "series");
  return "error" in r ? { data: null, error: r.error } : { data: { series: r.ok.series, games: r.ok.games }, error: null };
}

/** The signed-in host's repeats, newest first; ready false while the database has none to offer. */
export async function getMySeries(getToken: GetToken) {
  const a = await mySeriesCall(getToken);
  const r = outcome(a, "series");
  return "error" in r ? { data: [] as GameSeries[], ready: false, error: r.error } : { data: r.ok.series, ready: r.ok.ready === true, error: null };
}

/** The host stops a repeat; cancel: its games not started yet are called off too (their players are told). */
export async function stopSeries(getToken: GetToken, seriesId: string, cancel: boolean) {
  const r = outcome(await stopSeriesCall(getToken, seriesId, cancel), "series");
  return "error" in r ? { data: null, error: r.error } : { data: r.ok, error: null };
}

/** A repeat's games still open from today (India), soonest first: a public read, as every game is. */
export async function getSeriesGames(seriesId: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { data, error } = await createClient()
    .from("games")
    .select("id, date, start_time, end_time, status, current_players, max_players")
    .eq("series_id", seriesId)
    .in("status", ["open", "full"])
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(12);
  if (error || !data) return [] as Pick<Game, "id" | "date" | "start_time" | "end_time" | "status" | "current_players" | "max_players">[];
  return data as Pick<Game, "id" | "date" | "start_time" | "end_time" | "status" | "current_players" | "max_players">[];
}

/** What the game pages show of these repeats (a public read, as the games are), by id; none while the database has no repeats. */
export async function getSeriesInfo(ids: (string | null | undefined)[]): Promise<Map<string, SeriesInfo>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 50);
  if (want.length === 0) return new Map();
  const { data, error } = await createClient().rpc("game_series_public", { p_ids: want });
  if (error || !Array.isArray(data)) return new Map();
  return new Map((data as SeriesInfo[]).map((s) => [s.id, s]));
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

/** The host's requests for their game (with notes), each with the player's picture as it is now; [] for anyone else. */
export async function getGameRequests(getToken: GetToken, gameId: string) {
  const r = outcome(await requestsForGameCall(getToken, gameId), "host");
  if ("error" in r) return { data: [] as GameRequest[], error: r.error };
  if (!r.ok.host || r.ok.requests.length === 0) return { data: [] as GameRequest[], error: null };
  await withCurrentPhotos(r.ok.requests);
  return { data: r.ok.requests, error: null };
}

/**
 * Each player's picture as it is now (a request keeps a copy from when it
 * was sent, and older ones have none), from the public users columns.
 */
async function withCurrentPhotos(rows: GameRequest[]) {
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (userIds.length === 0) return;
  const { data: users } = await createClient().from("users").select("id, profile_image_url").in("id", userIds);
  if (!users) return;
  const photos = new Map(users.map((u) => [u.id, u.profile_image_url as string | null]));
  rows.forEach((r) => {
    if (photos.has(r.user_id)) r.requester_avatar = photos.get(r.user_id) ?? undefined;
  });
}

/**
 * Players waiting for the signed-in host's answer, newest first: the
 * pending requests on the games they host (GET /api/game-requests?incoming=1),
 * kept to these games (the Me tab passes the ones not over yet).
 */
export async function getPendingRequestsFor(getToken: GetToken, gameIds: string[]) {
  if (gameIds.length === 0) return { data: [] as GameRequest[], error: null };
  const r = outcome(await incomingRequestsCall(getToken), "requests");
  if ("error" in r) return { data: [] as GameRequest[], error: r.error };
  const ids = new Set(gameIds);
  const data = r.ok.requests.filter((q) => ids.has(q.game_id));
  await withCurrentPhotos(data);
  return { data, error: null };
}

/** A game as a list of requests names it. */
export type GameLine = Pick<Game, "id" | "creator_id" | "turf_id" | "sport" | "date" | "start_time" | "end_time" | "host_name" | "host_profile_image_url"> & {
  venue: string | null;
};

const LINE_COLUMNS = "id, creator_id, turf_id, sport, date, start_time, end_time, host_name, host_profile_image_url";

/** These games, for a list that names them (the Me tab's requests sent): sport, time, host and venue (its turf's, or the one its host typed). */
export async function getGameLines(ids: string[]) {
  if (ids.length === 0) return { data: [] as GameLine[], error: null };
  const supabase = createClient();
  const read = (cols: string) => supabase.from("games").select(cols).in("id", ids);
  let res = await read(`${LINE_COLUMNS}, venue_name`);
  // Before 20261103_game_other_venue.sql there is no venue_name: as before.
  if (missingVenueColumn(res.error)) res = await read(LINE_COLUMNS);
  const { data, error } = res as unknown as { data: (Omit<GameLine, "venue"> & { venue_name?: string | null })[] | null; error: { message: string } | null };
  if (error || !data) return { data: [] as GameLine[], error: error?.message || null };
  const turfIds = [...new Set(data.map((g) => g.turf_id).filter((id): id is string => !!id))];
  const { data: turfs } = turfIds.length > 0 ? await supabase.from("turfs").select("id, name").in("id", turfIds) : { data: [] };
  const names = new Map((turfs ?? []).map((t) => [t.id as string, cleanVenueName(t.name as string)]));
  return {
    data: data.map(({ venue_name, ...g }) => ({ ...g, venue: (g.turf_id ? names.get(g.turf_id) : null) ?? venue_name?.trim() ?? null })) as GameLine[],
    error: null,
  };
}

/**
 * Whether the database takes venues hosts type (games has venue_name,
 * 20261103_game_other_venue.sql): the create flow offers "Add the venue"
 * unless this says no. Null when it can't tell (offline): the server
 * then answers for itself.
 */
export async function otherVenueReady(): Promise<boolean | null> {
  try {
    const { error } = await createClient().from("games").select("venue_name").limit(0);
    if (!error) return true;
    return missingVenueColumn(error) ? false : null;
  } catch {
    return null;
  }
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
