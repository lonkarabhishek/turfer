import type { TokenCheck } from "../account/client";
import type {
  CreateGameBody,
  CreateSeriesBody,
  SeriesCreatedResponse,
  SeriesListResponse,
  SeriesStoppedResponse,
  GameChanges,
  GameErrorBody,
  GameResponse,
  MarkedResponse,
  NotificationsResponse,
  RequestAnsweredResponse,
  RequestSentResponse,
  RequestsForResponse,
  RequestsResponse,
  UnreadResponse,
} from "./types";

/**
 * Browser side of games, repeats, join requests and notifications: calls to the
 * games routes (lib/games/types.ts) with this device's sign-in token. Never
 * a user id: the server works out the account from the token. status 0
 * means offline or no answer; a sign-in that is gone answers 401.
 */

/** useAuth().getToken, or for a background read that must never sign anyone out, firebaseToken / supabaseToken. */
export type GetToken = () => Promise<TokenCheck>;

export type GameAnswer<T> = { status: number; body: T | GameErrorBody };

async function call<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<GameAnswer<T>> {
  let t: TokenCheck;
  try {
    t = await getToken();
  } catch {
    t = { unknown: true };
  }
  if (!("token" in t)) return "none" in t ? { status: 401, body: { error: "sign_in" } } : { status: 0, body: { error: "unavailable" } };
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${t.token}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: a proxy page */
    }
    if (!body || typeof body !== "object") return { status: res.status || 0, body: { error: "unavailable" } };
    return { status: res.status, body: body as T };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const at = (id: string) => encodeURIComponent(id);

export const createGameCall = (getToken: GetToken, game: CreateGameBody) => call<GameResponse>(getToken, "/api/games", json("POST", game));
export const updateGameCall = (getToken: GetToken, gameId: string, changes: GameChanges) => call<GameResponse>(getToken, `/api/games/${at(gameId)}`, json("PATCH", changes));
export const cancelGameCall = (getToken: GetToken, gameId: string) => call<{ r: "ok" }>(getToken, `/api/games/${at(gameId)}/cancel`, json("POST", {}));
export const requestsForGameCall = (getToken: GetToken, gameId: string) => call<RequestsForResponse>(getToken, `/api/games/${at(gameId)}/requests`);
export const sendRequestCall = (getToken: GetToken, gameId: string, note: string | null) =>
  call<RequestSentResponse>(getToken, `/api/games/${at(gameId)}/requests`, json("POST", { note }));
export const answerRequestCall = (getToken: GetToken, requestId: string, accept: boolean) =>
  call<RequestAnsweredResponse>(getToken, `/api/game-requests/${at(requestId)}`, json("PATCH", { action: accept ? "accept" : "decline" }));
export const withdrawRequestCall = (getToken: GetToken, requestId: string) => call<{ r: "ok" }>(getToken, `/api/game-requests/${at(requestId)}`, { method: "DELETE" });
export const myRequestsCall = (getToken: GetToken) => call<RequestsResponse>(getToken, "/api/game-requests?mine=1");
export const incomingRequestsCall = (getToken: GetToken) => call<RequestsResponse>(getToken, "/api/game-requests?incoming=1");
export const notificationsCall = (getToken: GetToken, limit = 50) => call<NotificationsResponse>(getToken, `/api/notifications?limit=${limit}`);
export const unreadCall = (getToken: GetToken) => call<UnreadResponse>(getToken, "/api/notifications?count=unread");
export const markReadCall = (getToken: GetToken, read: string | "all") => call<MarkedResponse>(getToken, "/api/notifications", json("POST", { read }));
export const createSeriesCall = (getToken: GetToken, body: CreateSeriesBody) => call<SeriesCreatedResponse>(getToken, "/api/game-series", json("POST", body));
export const mySeriesCall = (getToken: GetToken) => call<SeriesListResponse>(getToken, "/api/game-series");
export const stopSeriesCall = (getToken: GetToken, seriesId: string, cancel: boolean) =>
  call<SeriesStoppedResponse>(getToken, `/api/game-series/${at(seriesId)}/stop`, json("POST", { cancel }));

const FIELD_TEXT: Record<string, string> = {
  date: "Pick a date from today on.",
  start_time: "Check the start and end time.",
  end_time: "Check the start and end time.",
  max_players: "Max players must be 2 to 50.",
  price_per_player: "The price must be ₹0 to ₹10,000.",
  description: "Keep the note to 500 characters.",
  note: "Keep the note to 300 characters.",
  host_phone: "Enter a 10-digit mobile number for players, or leave it empty.",
  turf_id: "Pick the turf again.",
  sport: "Pick a sport.",
  repeat: "Check how it repeats.",
  rule: "Check how it repeats.",
  interval: "Repeat every 1 to 4 weeks.",
  days: "Pick at least one day of the week.",
  month: "Pick the monthly day again.",
  ends: "Check when it ends: at least 2 games, within a year of the first.",
};

/**
 * What went wrong, in the page's words, or null when the call went
 * through. The server's reasons are lib/games/server.ts refusal.
 */
export function gameProblem(a: GameAnswer<unknown>): string | null {
  const b = (a.body ?? {}) as Partial<GameErrorBody>;
  if (a.status >= 200 && a.status < 300 && !b.error) return null;
  switch (b.reason) {
    case "gone":
      return "This game isn't on TapTurf any more.";
    case "not_host":
      return "Only the host can do that.";
    case "own":
      return "This is your own game.";
    case "closed":
      return "This game is over or cancelled.";
    case "full":
      return "This game is full.";
    case "joined":
      return "You're already in this game.";
    case "pending":
      return "You already have a pending request.";
    case "answered":
      return "This request was already answered. Refresh to see it.";
    case "too_few":
      return `${b.players ?? "More"} players are in already: max players can't be fewer.`;
    case "venue":
      return "That venue isn't listed on TapTurf any more. Pick another one.";
    case "many":
      return "You have 3 repeating games running. Stop one from the Me tab to start another.";
    case "not_ready":
      return "Repeating games aren't on yet. Post this as a single game for now.";
  }
  if (b.error === "bad") return (b.field && FIELD_TEXT[b.field]) || "Something there doesn't look right. Check it and try again.";
  if (b.error === "sign_in") return "Your login ended. Please log in again.";
  if (b.error === "new") return "Couldn't load your TapTurf account. Check your connection and try again.";
  if (b.error === "limit" || b.error === "slow") return "That's a lot for one day. Try again later.";
  return "Couldn't reach TapTurf. Check your connection and try again.";
}
