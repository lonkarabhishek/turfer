import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { accountRpcIfThere } from "../account/server";
import { cityInfo } from "../city";
import { cleanVenueName } from "../utils/bookingApps";
import type { GameRow, ReviewRow, TurfRef } from "./history";
import type { CoPlayerExtra } from "./playedWith";
import type { WhatsAppState } from "./types";

/**
 * Server side of the passport: a player's games, the turfs they were at,
 * their live player reviews, the people in those games, all from rows the
 * public can read (games, game_participants, turfs, reviews; users' name
 * and photo). Never the host's game number (games.host_phone) or anyone's
 * phone or email. Usernames, the WhatsApp switch and a played-with
 * person's number come only from the account functions of
 * 20261101_played_with.sql (server key), which check who may see what;
 * before that file is applied they answer { missing: true } and the rest
 * works without them. Relative imports only.
 */

// Its own breaker: a slow passport read must not make page refreshes on this instance fail fast.
const profileFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: profileFetch } });
  return client;
}

const GAME_COLUMNS = "id, creator_id, turf_id, sport, date, start_time, end_time, status";
// More than anyone has played (18, 1 Nov 2026); a cap so one account can't make a read unbounded.
const MAX_ROWS = 1000;
const CHUNK = 100;

function chunks<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`passport: ${what} failed: ${error.message}`);
  return (Array.isArray(data) ? data : []) as T[];
}

export type History = { games: GameRow[]; turfs: TurfRef[]; reviews: ReviewRow[] };

/**
 * Everything the passport is worked out from, for one account; gamesOnly:
 * just the games (the "You played here" badges). Throws when it can't be read.
 */
export async function readHistory(userId: string, gamesOnly = false): Promise<History> {
  const s = db();
  const [joined, hosted, reviews] = await Promise.all([
    rows<{ game_id: string }>(s.from("game_participants").select("game_id").eq("user_id", userId).limit(MAX_ROWS), "participants"),
    rows<GameRow>(s.from("games").select(GAME_COLUMNS).eq("creator_id", userId).limit(MAX_ROWS), "hosted games"),
    gamesOnly
      ? Promise.resolve([] as ReviewRow[])
      : rows<ReviewRow>(
          s.from("reviews").select("turf_id, rating, created_at").eq("user_id", userId).is("source", null).eq("status", "live").limit(MAX_ROWS),
          "reviews",
        ),
  ]);
  const have = new Set(hosted.map((g) => g.id));
  const more = [...new Set(joined.map((p) => p.game_id))].filter((id) => id && !have.has(id));
  const others = (await Promise.all(chunks(more).map((ids) => rows<GameRow>(s.from("games").select(GAME_COLUMNS).in("id", ids), "games")))).flat();
  const games = [...hosted, ...others];
  if (gamesOnly) return { games, turfs: [], reviews: [] };
  const turfIds = [...new Set([...games.map((g) => g.turf_id), ...reviews.map((r) => r.turf_id)].filter((x): x is string => !!x))];
  const turfRows = (
    await Promise.all(chunks(turfIds).map((ids) => rows<{ id: string; slug: string | null; name: string | null; city: string | null }>(s.from("turfs").select("id, slug, name, city").in("id", ids), "turfs")))
  ).flat();
  const turfs: TurfRef[] = turfRows
    .filter((t) => typeof t.name === "string" && t.name.trim())
    .map((t) => ({ id: t.id, slug: t.slug, name: cleanVenueName(t.name as string), city: t.city, cityLabel: t.city ? cityInfo(t.city).label : null }));
  return { games, turfs, reviews: reviews.filter((r) => typeof r.rating === "number" && !!r.turf_id) };
}

/** The people in each of these games (participants, and the host), by game id. Throws when it can't be read. */
export async function readRosters(games: readonly Pick<GameRow, "id" | "creator_id">[]): Promise<Map<string, string[]>> {
  const s = db();
  const out = new Map<string, string[]>(games.map((g) => [g.id, g.creator_id ? [g.creator_id] : []]));
  const parts = (
    await Promise.all(chunks(games.map((g) => g.id)).map((ids) => rows<{ game_id: string; user_id: string | null }>(s.from("game_participants").select("game_id, user_id").in("game_id", ids).limit(MAX_ROWS * 4), "rosters")))
  ).flat();
  for (const p of parts) if (p.user_id) out.get(p.game_id)?.push(p.user_id);
  return out;
}

/** Name and photo (the public columns of users) by account id. Throws when it can't be read. */
export async function readPeople(ids: readonly string[]): Promise<Map<string, { name: string | null; photo: string | null }>> {
  const s = db();
  const list = (
    await Promise.all(chunks([...new Set(ids)]).map((part) => rows<{ id: string; name: string | null; profile_image_url: string | null }>(s.from("users").select("id, name, profile_image_url").in("id", part), "people")))
  ).flat();
  return new Map(list.map((u) => [u.id, { name: u.name, photo: u.profile_image_url || null }]));
}

const str = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/**
 * Usernames and shared WhatsApp numbers of the people this account played
 * with (public.played_with_extras). The database decides who is in it:
 * only people in a game both played. null: not available (before the
 * migration, or it failed); the list shows without them.
 */
export async function readExtras(userId: string): Promise<Map<string, CoPlayerExtra> | null> {
  const r = await accountRpcIfThere("played_with_extras", { p_user_id: userId });
  if (!("data" in r) || r.data.r !== "ok" || !Array.isArray(r.data.players)) return null;
  const out = new Map<string, CoPlayerExtra>();
  for (const p of r.data.players as unknown[]) {
    const o = (p ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    if (id) out.set(id, { username: str(o.u), whatsapp: str(o.wa) });
  }
  return out;
}

function whatsappState(d: Record<string, unknown>): WhatsAppState | null {
  const phone = d.phone;
  if (phone !== "ok" && phone !== "unproven" && phone !== "none") return null;
  return { on: d.on === true, phone };
}

export type WhatsAppResult = { ok: WhatsAppState } | { refused: WhatsAppState } | { missing: true } | { unavailable: true };

/** The account's WhatsApp switch (public.account_whatsapp); on: true or false changes it first. */
export async function whatsappSwitch(userId: string, on: boolean | null): Promise<WhatsAppResult> {
  const r = await accountRpcIfThere("account_whatsapp", { p_user_id: userId, p_on: on });
  if ("missing" in r || "unavailable" in r) return r;
  const st = whatsappState(r.data);
  if (!st) return { unavailable: true };
  if (r.data.r === "ok") return { ok: st };
  if (r.data.r === "phone") return { refused: st };
  return { unavailable: true };
}

/**
 * The account behind a public profile's username (public.profile_owner),
 * for the server only: never sent to a browser. Only a current username
 * whose profile is public. null: none; missing: before the migration.
 */
export async function profileOwner(username: string): Promise<{ ok: string | null } | { missing: true } | { unavailable: true }> {
  const r = await accountRpcIfThere("profile_owner", { p_username: username });
  if ("missing" in r || "unavailable" in r) return r;
  if (r.data.r !== "ok") return { unavailable: true };
  return { ok: str(r.data.id) };
}
