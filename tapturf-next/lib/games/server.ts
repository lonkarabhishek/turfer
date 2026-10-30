import type { NextResponse } from "next/server";
import { accountError, accountReply, caller } from "../account/route";
import { accountRpcOrMissing, createAccountLimiter, readSmallJson, resolveAccount, type Rpc } from "../account/server";
import { cleanVenueName } from "../utils/bookingApps";
import { venueMoveNotice } from "../utils/gameVenue";
import { anonDb } from "./db";
import { legacyRpc } from "./legacy";
import { isUuid, parseChanges, parseCreate, parseNote } from "./payload";
import type { GameChanges } from "./types";

// Games, join requests and notifications, for app/api/games,
// app/api/game-requests and app/api/notifications (lib/games/types.ts has
// the API). Every write and every private read goes: the verified caller
// (lib/account/route.ts caller) -> the account it opens (resolveAccount,
// never made here) -> a server-key function (20261030_games_lockdown.sql)
// that takes that account's id and checks the rule itself. The browser
// never names a user id. Until the database has the functions, the same
// is done here (lib/games/legacy.ts). Relative imports only (npm run test:games).

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

type Who = { userId: string } | { reply: NextResponse };

/** The account this sign-in opens, or the reply to send instead. */
async function who(req: Request, allow: (req: Request) => boolean): Promise<Who> {
  const c = await caller(req, allow);
  if ("reply" in c) return c;
  const r = await resolveAccount(c.id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id };
}

/** A game function; while the database doesn't have it yet, the same worked out here. */
async function gameRpc(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const res = await accountRpcOrMissing(fn, args);
  return "missing" in res ? legacyRpc(fn, args) : res;
}

const FIELD = /^[a-z_]{1,24}$/;

/** A refusal from the game functions, as the routes send it. */
function refusal(d: Record<string, unknown>): NextResponse {
  switch (d.r) {
    case "gone":
    case "venue":
      return accountReply({ reason: d.r }, "bad");
    case "too_few":
      return accountReply({ reason: "too_few", players: typeof d.players === "number" ? d.players : 0 }, "bad");
    case "bad":
      return accountReply(typeof d.field === "string" && FIELD.test(d.field) ? { field: d.field } : {}, "bad");
    case "not_host":
    case "own":
    case "closed":
    case "full":
      return accountReply({ reason: d.r }, "not_allowed");
    case "joined":
    case "pending":
      return accountReply({ reason: d.r }, "conflict");
    case "answered":
      return accountReply({ reason: "answered", status: typeof d.status === "string" ? d.status : null }, "conflict");
    case "limit":
      return accountError("limit");
    default:
      return accountError("unavailable");
  }
}

/** One call: the function's ok answer as `ok` makes it, else its refusal. */
async function run(fn: string, args: Record<string, unknown>, ok: (d: Record<string, unknown>) => object): Promise<NextResponse> {
  const res = await gameRpc(fn, args);
  if ("unavailable" in res) return accountError("unavailable");
  return res.data.r === "ok" ? accountReply(ok(res.data)) : refusal(res.data);
}

const list = (x: unknown) => (Array.isArray(x) ? x : []);

const REQUEST_KEYS = ["id", "game_id", "user_id", "note", "status", "requester_name", "requester_avatar", "created_at", "responded_at"] as const;

/** Join requests as a host or a player reads them: these keys only, so no phone number ever goes out with one. */
function requestViews(x: unknown): Record<string, unknown>[] {
  return list(x)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => Object.fromEntries(REQUEST_KEYS.filter((k) => k in r).map((k) => [k, r[k]])));
}

/** A player's own request on a game page: its id and status only. */
function mineOf(x: unknown): { id: string; status: string } | null {
  const r = (x ?? {}) as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.status === "string" ? { id: r.id, status: r.status } : null;
}

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */

/** POST /api/games: the caller hosts a new game. */
export async function postGame(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const p = parseCreate(await readSmallJson(req, 4_000));
  if ("bad" in p) return accountReply({ field: p.bad }, "bad");
  return run("game_create", { p_user_id: w.userId, p_game: p.ok }, (d) => ({ r: "ok", game: d.game }));
}

/**
 * What the players are told when the host moves the game: "Asha moved
 * Football on Sat 7 Nov to Dribble Den, Begur", from the public game and
 * turf rows (lib/utils/gameVenue.ts venueMoveNotice), the day the save
 * sets. Null when it isn't a move or the rows can't be read: the
 * database then says it plainly. Who hears it is the database's call.
 */
export async function moveNotice(gameId: string, changes: GameChanges): Promise<{ title: string; message: string } | null> {
  if (!changes.turf_id) return null;
  try {
    const db = anonDb();
    const [g, t] = await Promise.all([
      db.from("games").select("host_name, sport, date, turf_id").eq("id", gameId).limit(1),
      db.from("turfs").select("name, area, city, address").eq("id", changes.turf_id).limit(1),
    ]);
    const game = g.data?.[0] as { host_name: string | null; sport: string | null; date: string | null; turf_id: string | null } | undefined;
    const turf = t.data?.[0] as { name: string | null; area: string | null; city: string | null; address: string | null } | undefined;
    if (g.error || t.error || !game || !turf?.name || game.turf_id === changes.turf_id) return null;
    return venueMoveNotice({ ...game, date: changes.date ?? game.date }, { ...turf, name: cleanVenueName(turf.name) });
  } catch {
    return null;
  }
}

/** PATCH /api/games/[id]: the host's edit sheet, a venue move too. */
export async function patchGame(req: Request, gameId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(gameId)) return accountError("bad");
  const p = parseChanges(await readSmallJson(req, 4_000));
  if ("bad" in p) return accountReply({ field: p.bad }, "bad");
  const notice = await moveNotice(gameId.toLowerCase(), p.ok);
  return run("game_update", { p_user_id: w.userId, p_game_id: gameId.toLowerCase(), p_changes: p.ok, p_move_notice: notice }, (d) => ({
    r: "ok",
    game: d.game,
    notified: typeof d.notified === "number" ? d.notified : 0,
  }));
}

/** POST /api/games/[id]/cancel: the host calls the game off. */
export async function cancelGame(req: Request, gameId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(gameId)) return accountError("bad");
  return run("game_cancel", { p_user_id: w.userId, p_game_id: gameId.toLowerCase() }, () => ({ r: "ok" }));
}

/* ------------------------------------------------------------------ */
/* Join requests                                                       */
/* ------------------------------------------------------------------ */

/** GET /api/games/[id]/requests: the host gets every request (with notes, never a number); anyone else only their own. */
export async function getGameRequests(req: Request, gameId: string): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  if (!isUuid(gameId)) return accountError("bad");
  return run("game_requests_for", { p_user_id: w.userId, p_game_id: gameId.toLowerCase() }, (d) =>
    d.host === true ? { host: true, requests: requestViews(d.requests) } : { host: false, mine: mineOf(d.mine) },
  );
}

/** POST /api/games/[id]/requests { note }: the caller asks to join. */
export async function postGameRequest(req: Request, gameId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(gameId)) return accountError("bad");
  const body = await readSmallJson(req, 2_000);
  const note = parseNote(body?.note);
  if (!body || "bad" in note) return accountReply({ field: "note" }, "bad");
  return run("game_request_send", { p_user_id: w.userId, p_game_id: gameId.toLowerCase(), p_note: note.ok }, (d) => ({ r: "ok", request: d.request }));
}

/** PATCH /api/game-requests/[id] { action: accept | decline }: the game's host answers. */
export async function patchRequest(req: Request, requestId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(requestId)) return accountError("bad");
  const body = await readSmallJson(req, 500);
  if (!body || (body.action !== "accept" && body.action !== "decline")) return accountError("bad");
  return run("game_request_answer", { p_user_id: w.userId, p_request_id: requestId.toLowerCase(), p_accept: body.action === "accept" }, (d) => ({
    r: "ok",
    status: d.status,
    current_players: typeof d.current_players === "number" ? d.current_players : null,
  }));
}

/** DELETE /api/game-requests/[id]: the requester takes back a pending request (it is kept, as withdrawn). */
export async function deleteRequest(req: Request, requestId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(requestId)) return accountError("bad");
  return run("game_request_withdraw", { p_user_id: w.userId, p_request_id: requestId.toLowerCase() }, () => ({ r: "ok" }));
}

/** GET /api/game-requests?mine=1: the caller's requests; ?incoming=1: the pending ones on the games they host. */
export async function getRequests(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const q = new URL(req.url).searchParams;
  const fn = q.get("incoming") === "1" ? "game_requests_incoming" : q.get("mine") === "1" ? "game_requests_mine" : null;
  if (!fn) return accountError("bad");
  return run(fn, { p_user_id: w.userId }, (d) => ({ requests: requestViews(d.requests) }));
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/** GET /api/notifications: the caller's newest (?limit, at most 100) and the unread count; ?count=unread: the count only. */
export async function getNotifications(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const q = new URL(req.url).searchParams;
  if (q.get("count") === "unread") {
    return run("notifications_unread", { p_user_id: w.userId }, (d) => ({ unread: typeof d.unread === "number" ? d.unread : 0 }));
  }
  const limit = Math.min(Math.max(Number(q.get("limit")) || 50, 1), 100);
  return run("notifications_mine", { p_user_id: w.userId, p_limit: limit }, (d) => ({
    notifications: list(d.notifications),
    unread: typeof d.unread === "number" ? d.unread : 0,
  }));
}

/** POST /api/notifications { read: <id> | "all" }: mark the caller's own read. */
export async function postNotifications(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const body = await readSmallJson(req, 500);
  const read = body?.read;
  if (read !== "all" && !isUuid(read)) return accountError("bad");
  return run("notifications_read", { p_user_id: w.userId, p_id: read === "all" ? null : read.toLowerCase() }, (d) => ({
    r: "ok",
    marked: typeof d.marked === "number" ? d.marked : 0,
  }));
}
