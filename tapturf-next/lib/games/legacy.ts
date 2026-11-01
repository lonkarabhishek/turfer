import { anonDb as db } from "./db";
import { venueMoveRecipients } from "../utils/gameVenue";
import type { Rpc } from "../account/server";
import { CHANGE_FIELDS, DAYS_AHEAD, addDays, fieldProblem, gameOver, isUuid, istToday, parseCreate, parseNote } from "./payload";

/**
 * The games routes' fallback, for the minutes between the app going live
 * and 20261030_games_lockdown.sql being applied: while the database has
 * no game functions yet (PGRST202), each route does here what its
 * function does (the same rules, the same answer), on the server, with
 * the anon key and today's grants. Never reached once step 1 is in; after
 * step 2 it could not write anyway. Remove it then (a follow-up). It has
 * no locks, as the browser's writes had none. Relative imports only
 * (npm run test:games).
 */

type Row = Record<string, unknown>;
type Answer = Record<string, unknown>;

/** A failed read or write: the whole call is unavailable, as the function would be. */
class Failed extends Error {}

function rows<T = Row>(res: { data: unknown; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new Failed(`${what}: ${res.error.message}`);
  return (Array.isArray(res.data) ? res.data : res.data ? [res.data] : []) as T[];
}
function first<T = Row>(res: { data: unknown; error: { message: string } | null }, what: string): T | null {
  return rows<T>(res, what)[0] ?? null;
}
function count(res: { count: number | null; error: { message: string } | null }, what: string): number {
  if (res.error || typeof res.count !== "number") throw new Failed(`${what}: ${res.error?.message ?? "no count"}`);
  return res.count;
}

const REQUEST_COLUMNS = "id, game_id, user_id, note, status, requester_name, requester_avatar, created_at, responded_at";
const NOTIFICATION_COLUMNS = "id, user_id, type, title, message, metadata, is_read, created_at";
const open = (status: unknown) => status == null || status === "open" || status === "full";
const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

async function notify(userId: unknown, type: string, title: string, message: string, metadata: Row): Promise<void> {
  if (typeof userId !== "string") return;
  rows(await db().from("notifications").insert([{ user_id: userId, type, title: title.slice(0, 120), message: message.slice(0, 400), metadata, is_read: false }]), "notify");
}

async function players(gameId: string): Promise<number> {
  return count(await db().from("game_participants").select("id", { count: "exact", head: true }).eq("game_id", gameId), "players");
}

async function activeTurf(id: unknown): Promise<boolean> {
  return !!first(await db().from("turfs").select("id").eq("id", id).eq("is_active", true).limit(1), "turf");
}

const FALLBACKS: Record<string, (a: Row) => Promise<Answer>> = {
  async game_create(a) {
    const p = parseCreate(a.p_game as Row);
    if ("bad" in p) return { r: "bad", field: p.bad };
    const g = p.ok;
    const user = first<{ name: string | null; profile_image_url: string | null }>(await db().from("users").select("name, profile_image_url").eq("id", a.p_user_id).limit(1), "user");
    if (!user) return { r: "bad" };
    if (!(await activeTurf(g.turf_id))) return { r: "venue" };
    if (count(await db().from("games").select("id", { count: "exact", head: true }).eq("creator_id", a.p_user_id).gt("created_at", dayAgo()), "limit") >= 10) return { r: "limit" };
    const game = first(
      await db()
        .from("games")
        .insert([{
          creator_id: a.p_user_id,
          turf_id: g.turf_id,
          title: `${g.sport} Game`,
          description: g.description || `${g.sport} game`,
          sport: g.sport,
          skill_level: g.skill_level,
          max_players: g.max_players,
          current_players: 1,
          date: g.date,
          start_time: g.start_time,
          end_time: g.end_time,
          price_per_player: g.price_per_player,
          status: "open",
          host_name: user.name?.trim() || "Player",
          host_phone: g.host_phone ?? "",
          host_profile_image_url: user.profile_image_url ?? "",
          turf_booked: g.turf_booked ?? false,
        }])
        .select(),
      "game",
    );
    if (!game) throw new Failed("game: none made");
    rows(await db().from("game_participants").upsert([{ game_id: game.id, user_id: a.p_user_id }], { onConflict: "game_id,user_id", ignoreDuplicates: true }), "host");
    return { r: "ok", game };
  },

  async game_update(a) {
    const changes = a.p_changes as Row;
    const bad = fieldProblem(changes, CHANGE_FIELDS);
    if (bad) return { r: "bad", field: bad };
    const old = first(await db().from("games").select("*").eq("id", a.p_game_id).limit(1), "game");
    if (!old) return { r: "gone" };
    if (old.creator_id !== a.p_user_id) return { r: "not_host" };
    if (!open(old.status)) return { r: "closed" };
    const today = istToday();
    if (typeof changes.date === "string" && changes.date !== old.date && (changes.date < today || changes.date > addDays(today, DAYS_AHEAD))) return { r: "bad", field: "date" };
    const n = await players(String(old.id));
    if (typeof changes.max_players === "number" && changes.max_players < n) return { r: "too_few", players: n };
    const moved = typeof changes.turf_id === "string" && changes.turf_id !== old.turf_id;
    if (moved && !(await activeTurf(changes.turf_id))) return { r: "venue" };
    const patch: Row = { ...changes, updated_at: new Date().toISOString() };
    if (typeof changes.description === "string") patch.description = changes.description.trim() || null;
    if (n > 0) patch.current_players = n;
    const game = first(await db().from("games").update(patch).eq("id", old.id).eq("creator_id", a.p_user_id).select(), "edit");
    if (!game) throw new Failed("edit: no row");
    let notified = 0;
    if (moved) {
      const [lineup, asks] = await Promise.all([
        db().from("game_participants").select("user_id").eq("game_id", old.id),
        db().from("game_requests").select("user_id, status").eq("game_id", old.id).in("status", ["pending", "accepted"]),
      ]);
      const ids = venueMoveRecipients(String(old.creator_id), rows(lineup, "lineup"), rows(asks, "asks"));
      const notice = (a.p_move_notice ?? {}) as Row;
      const title = (typeof notice.title === "string" && notice.title.trim().slice(0, 80)) || "Venue changed";
      const message = (typeof notice.message === "string" && notice.message.trim().slice(0, 300)) || "Your game moved to another venue";
      if (ids.length) {
        rows(await db().from("notifications").insert(ids.map((user_id) => ({
          user_id, type: "game_venue_changed", title, message, metadata: { gameId: old.id, turfId: changes.turf_id, fromTurfId: old.turf_id }, is_read: false,
        }))), "move notices");
      }
      notified = ids.length;
    }
    return { r: "ok", game, notified };
  },

  async game_cancel(a) {
    const g = first(await db().from("games").select("id, creator_id, status, host_name, sport, date").eq("id", a.p_game_id).limit(1), "game");
    if (!g) return { r: "gone" };
    if (g.creator_id !== a.p_user_id) return { r: "not_host" };
    if (g.status === "cancelled") return { r: "ok" };
    if (!open(g.status)) return { r: "closed" };
    rows(await db().from("games").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", g.id).select("id"), "cancel");
    const [lineup, asks] = await Promise.all([
      db().from("game_participants").select("user_id").eq("game_id", g.id),
      db().from("game_requests").select("user_id, status").eq("game_id", g.id).eq("status", "pending"),
    ]);
    const ids = venueMoveRecipients(String(g.creator_id), rows(lineup, "lineup"), rows(asks, "asks"));
    const day = new Date(`${g.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
    const host = String(g.host_name ?? "").trim().split(/\s+/)[0] || "Your host";
    for (const id of ids) await notify(id, "game_cancelled", "Game cancelled", `${host} cancelled ${String(g.sport ?? "").trim() || "the game"} on ${day}`, { gameId: g.id });
    return { r: "ok" };
  },

  async game_request_send(a) {
    const note = parseNote(a.p_note);
    if ("bad" in note) return { r: "bad", field: "note" };
    const user = first<{ name: string | null; profile_image_url: string | null }>(await db().from("users").select("name, profile_image_url").eq("id", a.p_user_id).limit(1), "user");
    if (!user) return { r: "bad" };
    const g = first(await db().from("games").select("id, creator_id, status, sport, date, start_time, end_time, max_players").eq("id", a.p_game_id).limit(1), "game");
    if (!g) return { r: "gone" };
    if (g.creator_id === a.p_user_id) return { r: "own" };
    if (!open(g.status) || gameOver({ date: String(g.date), start_time: g.start_time as string, end_time: g.end_time as string })) return { r: "closed" };
    if (first(await db().from("game_participants").select("id").eq("game_id", g.id).eq("user_id", a.p_user_id).limit(1), "in")) return { r: "joined" };
    const had = first(await db().from("game_requests").select("id, status").eq("game_id", g.id).eq("user_id", a.p_user_id).order("created_at", { ascending: false }).limit(1), "had");
    if (had?.status === "pending") return { r: "pending" };
    if (had?.status === "accepted") return { r: "joined" };
    if (g.status === "full" || (await players(String(g.id))) >= Number(g.max_players)) return { r: "full" };
    // Sends, not rows (asking again reuses the row): the hosts' notes about this player's requests.
    // Every send sets its row's created_at, so the rows sent in the last day are the ones to look at.
    const since = dayAgo();
    const sent = rows<{ id: string }>(await db().from("game_requests").select("id").eq("user_id", a.p_user_id).gt("created_at", since).limit(100), "sent");
    if (sent.length && count(await db().from("notifications").select("id", { count: "exact", head: true }).eq("type", "game_request").gt("created_at", since).in("metadata->>requestId", sent.map((r) => r.id)), "limit") >= 30) {
      return { r: "limit" };
    }
    const name = user.name?.trim() || "Player";
    const fields = { status: "pending", note: note.ok, requester_name: name, requester_avatar: user.profile_image_url };
    const req = had
      ? first(await db().from("game_requests").update({ ...fields, created_at: new Date().toISOString(), responded_at: null }).eq("id", had.id).select("id, status, created_at"), "ask again")
      : first(await db().from("game_requests").insert([{ ...fields, game_id: g.id, user_id: a.p_user_id }]).select("id, status, created_at"), "ask");
    if (!req) throw new Failed("ask: no row");
    await notify(g.creator_id, "game_request", "New Join Request", `${name} wants to join your ${g.sport || "game"}`, { gameId: g.id, requestId: req.id });
    return { r: "ok", request: req };
  },

  async game_request_withdraw(a) {
    const req = first(await db().from("game_requests").select("id, user_id, status").eq("id", a.p_request_id).limit(1), "request");
    if (!req || req.user_id !== a.p_user_id) return { r: "gone" };
    if (req.status === "withdrawn") return { r: "ok" };
    if (req.status !== "pending") return { r: "answered", status: req.status };
    rows(await db().from("game_requests").update({ status: "withdrawn" }).eq("id", req.id).eq("status", "pending").select("id"), "withdraw");
    return { r: "ok" };
  },

  async game_request_answer(a) {
    const req = first(await db().from("game_requests").select("id, game_id, user_id, status").eq("id", a.p_request_id).limit(1), "request");
    if (!req?.game_id) return { r: "gone" };
    const g = first(await db().from("games").select("id, creator_id, status, date, start_time, end_time, max_players, current_players").eq("id", req.game_id).limit(1), "game");
    if (!g) return { r: "gone" };
    if (g.creator_id !== a.p_user_id) return { r: "not_host" };
    if (req.status !== "pending") return { r: "answered", status: req.status };
    const now = new Date().toISOString();
    if (a.p_accept === true) {
      if (typeof req.user_id !== "string") return { r: "bad" };
      if (!open(g.status) || gameOver({ date: String(g.date), start_time: g.start_time as string, end_time: g.end_time as string })) return { r: "closed" };
      const isIn = first(await db().from("game_participants").select("id").eq("game_id", g.id).eq("user_id", req.user_id).limit(1), "in");
      if (!isIn) {
        if ((await players(String(g.id))) >= Number(g.max_players)) return { r: "full" };
        rows(await db().from("game_participants").upsert([{ game_id: g.id, user_id: req.user_id }], { onConflict: "game_id,user_id", ignoreDuplicates: true }), "add");
      }
      rows(await db().from("game_requests").update({ status: "accepted", responded_at: now }).eq("id", req.id).select("id"), "accept");
      const n = await players(String(g.id));
      if (n !== g.current_players) rows(await db().from("games").update({ current_players: n }).eq("id", g.id).select("id"), "count");
      await notify(req.user_id, "game_request_accepted", "Request Accepted!", "Your request to join the game has been accepted!", { gameId: g.id, requestId: req.id });
      return { r: "ok", status: "accepted", current_players: n };
    }
    rows(await db().from("game_requests").update({ status: "declined", responded_at: now }).eq("id", req.id).select("id"), "decline");
    await notify(req.user_id, "game_request_declined", "Request Declined", "Your request to join the game was declined.", { gameId: g.id, requestId: req.id });
    return { r: "ok", status: "declined", current_players: g.current_players };
  },

  async game_requests_for(a) {
    const g = first(await db().from("games").select("id, creator_id").eq("id", a.p_game_id).limit(1), "game");
    if (!g) return { r: "gone" };
    if (g.creator_id === a.p_user_id) {
      const list = rows(await db().from("game_requests").select(REQUEST_COLUMNS).eq("game_id", g.id).neq("status", "withdrawn").order("created_at", { ascending: false }), "requests");
      return { r: "ok", host: true, requests: list };
    }
    const mine = first(await db().from("game_requests").select("id, status").eq("game_id", g.id).eq("user_id", a.p_user_id).neq("status", "withdrawn").order("created_at", { ascending: false }).limit(1), "mine");
    return { r: "ok", host: false, mine };
  },

  async game_requests_mine(a) {
    return { r: "ok", requests: rows(await db().from("game_requests").select(REQUEST_COLUMNS).eq("user_id", a.p_user_id).neq("status", "withdrawn").order("created_at", { ascending: false }).limit(200), "mine") };
  },

  async game_requests_incoming(a) {
    const games = rows<{ id: string }>(await db().from("games").select("id").eq("creator_id", a.p_user_id).in("status", ["open", "full"]), "games");
    if (games.length === 0) return { r: "ok", requests: [] };
    const list = rows(await db().from("game_requests").select(REQUEST_COLUMNS).in("game_id", games.map((g) => g.id)).eq("status", "pending").order("created_at", { ascending: false }).limit(100), "incoming");
    return { r: "ok", requests: list };
  },

  async notifications_mine(a) {
    const limit = Math.min(Math.max(Number(a.p_limit) || 50, 1), 100);
    const [list, unread] = await Promise.all([
      db().from("notifications").select(NOTIFICATION_COLUMNS).eq("user_id", a.p_user_id).order("created_at", { ascending: false }).limit(limit),
      db().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", a.p_user_id).eq("is_read", false),
    ]);
    return { r: "ok", notifications: rows(list, "notifications"), unread: count(unread, "unread") };
  },

  async notifications_unread(a) {
    return { r: "ok", unread: count(await db().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", a.p_user_id).eq("is_read", false), "unread") };
  },

  async notifications_read(a) {
    if (a.p_id != null) {
      if (!isUuid(a.p_id)) return { r: "bad" };
      if (!first(await db().from("notifications").select("id").eq("id", a.p_id).eq("user_id", a.p_user_id).limit(1), "one")) return { r: "gone" };
      return { r: "ok", marked: rows(await db().from("notifications").update({ is_read: true }).eq("id", a.p_id).eq("user_id", a.p_user_id).eq("is_read", false).select("id"), "read").length };
    }
    return { r: "ok", marked: rows(await db().from("notifications").update({ is_read: true }).eq("user_id", a.p_user_id).eq("is_read", false).select("id"), "read all").length };
  },
};

/** What the function `fn` would answer, worked out here (see the top). Never throws. */
export async function legacyRpc(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const run = FALLBACKS[fn];
  if (!run) return { unavailable: true };
  try {
    return { data: await run(args) };
  } catch (e) {
    console.warn(`games: fallback ${fn} failed`, e instanceof Error ? e.message : e);
    return { unavailable: true };
  }
}
