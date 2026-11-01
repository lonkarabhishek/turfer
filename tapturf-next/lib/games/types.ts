import type { Game, GameRequest } from "../../types/game";
import type { Notification } from "../../types/notification";
import type { Repeat, RepeatEnds, RepeatRule } from "./repeat";

/**
 * The games API (lib/games/server.ts has the routes, lib/games/client.ts
 * the browser's calls). Every write and every private read goes through
 * it for the signed-in caller; the browser never names a user id.
 *
 *   POST   /api/games                     create (CreateGameBody)
 *   PATCH  /api/games/[id]                the host's edit, a venue move too (GameChanges)
 *   POST   /api/games/[id]/cancel         the host calls it off
 *   GET    /api/games/[id]/requests       the host: every request; anyone else: their own
 *   POST   /api/games/[id]/requests       ask to join ({ note })
 *   PATCH  /api/game-requests/[id]        the host: { action: "accept" | "decline" }
 *   DELETE /api/game-requests/[id]        the requester takes back a pending one
 *   GET    /api/game-requests?mine=1      my requests; ?incoming=1: pending ones on my games
 *   GET    /api/notifications             mine, and the unread count; ?count=unread: the count only
 *   POST   /api/notifications             { read: <id> | "all" }
 *   POST   /api/game-series               start a repeat (CreateSeriesBody): its first games go up
 *   GET    /api/game-series               my repeats; ready: false until the database has them
 *   POST   /api/game-series/[id]/stop     { cancel }: no more games; cancel: also its games not started yet
 * A game page reads its repeat itself (public.game_series_public, the anon key), as it reads the game.
 */

/** What a create sends: the games columns the host picks. */
export type CreateGameBody = {
  turf_id: string;
  sport: string;
  skill_level: Game["skill_level"];
  max_players: number;
  date: string;
  start_time: string;
  end_time: string;
  price_per_player: number;
  description?: string | null;
  turf_booked?: boolean;
  /** "" or +91 and 10 digits: the number players can WhatsApp. */
  host_phone?: string;
};

/** What the edit sheet can change. */
export type GameChanges = Partial<{
  date: string;
  start_time: string;
  end_time: string;
  max_players: number;
  price_per_player: number;
  description: string | null;
  turf_booked: boolean;
  skill_level: Game["skill_level"];
  /** A move: another listed turf. */
  turf_id: string;
}>;

/** Starting a repeat: the first game (its date is the first day) and how it repeats (lib/games/repeat.ts). */
export type CreateSeriesBody = { game: CreateGameBody; repeat: Repeat };

/** A repeat as its host reads it (20261102_game_series.sql game_series_json). */
export type GameSeries = {
  id: string;
  turf_id: string;
  sport: string;
  skill_level: Game["skill_level"];
  max_players: number;
  start_time: string;
  end_time: string;
  price_per_player: number;
  rule: RepeatRule;
  starts_on: string;
  ends: RepeatEnds;
  /** Still putting games up. ended: why not: the host stopped it, or it had no day left. */
  active: boolean;
  ended: "stopped" | "done" | null;
  stopped_at: string | null;
  created_at: string;
  /** In the host's list: its games still to play, and the soonest. */
  upcoming?: number;
  next?: { id: string; date: string; start_time: string } | null;
};

/** What any game page shows of its repeat. */
export type SeriesInfo = Pick<GameSeries, "id" | "rule" | "starts_on" | "ends" | "start_time" | "end_time" | "active">;

/**
 * Why a games route said no (the body's reason, next to its error).
 * many: 3 repeats running already; not_ready: the database has no repeats yet.
 */
export type GameRefusal = "gone" | "not_host" | "own" | "closed" | "full" | "joined" | "pending" | "answered" | "too_few" | "venue" | "many" | "not_ready";

export type GameErrorBody = { error: string; reason?: GameRefusal; field?: string; players?: number; status?: string };

export type GameResponse = { r: "ok"; game: Game; notified?: number };
export type RequestsForResponse =
  | { host: true; requests: GameRequest[] }
  | { host: false; mine: { id: string; status: GameRequest["status"] } | null };
export type RequestSentResponse = { r: "ok"; request: { id: string; status: GameRequest["status"]; created_at: string } };
export type RequestAnsweredResponse = { r: "ok"; status: "accepted" | "declined"; current_players: number };
export type RequestsResponse = { requests: GameRequest[] };
export type NotificationsResponse = { notifications: Notification[]; unread: number };
export type UnreadResponse = { unread: number };
export type MarkedResponse = { r: "ok"; marked: number };
export type SeriesCreatedResponse = { r: "ok"; series: GameSeries; games: Game[]; made: number };
export type SeriesListResponse = { ready: boolean; series: GameSeries[] };
export type SeriesStoppedResponse = { r: "ok"; series: GameSeries; cancelled: number };
