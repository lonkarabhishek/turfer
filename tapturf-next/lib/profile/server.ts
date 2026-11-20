import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { accountRpcIfThere } from "../account/server";
import { cityInfo } from "../city";
import { cleanVenueName } from "../utils/bookingApps";
import type { GameRow, ReviewRow, TurfRef } from "./history";
import type { CoPlayerExtra } from "./playedWith";
import { BADGE_IDS_MAX, badgeIds, parseBadges, type BadgeSent, type PlayerBadge } from "./playerBadge";
import { parseToolUses, type ToolUses } from "./toolUses";
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

/**
 * tools: the account's signed-in uses of the free tools, for the tool
 * medals; null or left out when they can't be read. toolsFailed: the read
 * itself failed (not a database that has no such read yet), so the medals
 * worked out this time may be short of ones the player has.
 */
export type History = { games: GameRow[]; turfs: TurfRef[]; reviews: ReviewRow[]; tools?: ToolUses | null; toolsFailed?: boolean };

// A database without public.tool_uses_of (before 20261122_tool_medals.sql) is not asked again for a minute, so the
// tool medals show within a minute of the file being applied and a database without it costs next to nothing.
const TOOLS_MISSING_WAIT_MS = 60_000;
let toolsMissingUntil = 0;

type ToolUsesRead = { ok: ToolUses } | { missing: true } | { failed: true };

/**
 * This account's own signed-in uses of the free tools (public.tool_uses_of,
 * 20261122_tool_medals.sql; server key), for the tool medals. missing:
 * before that file; failed: the read failed. Either way those medals are
 * locked at zero this time and everything else is as it was. Never throws.
 */
async function toolUsesRead(userId: string): Promise<ToolUsesRead> {
  if (Date.now() < toolsMissingUntil) return { missing: true };
  try {
    const r = await accountRpcIfThere("tool_uses_of", { p_user_id: userId });
    if ("missing" in r) {
      toolsMissingUntil = Date.now() + TOOLS_MISSING_WAIT_MS;
      return { missing: true };
    }
    const uses = "data" in r ? parseToolUses(r.data) : null;
    return uses ? { ok: uses } : { failed: true };
  } catch {
    return { failed: true };
  }
}

/**
 * Everything the passport is worked out from, for one account. Throws when
 * the games, turfs or reviews can't be read; the tool uses are read beside
 * them and are simply absent when they can't be.
 */
export async function readHistory(userId: string): Promise<History> {
  const s = db();
  // Started with the first reads and waited for last, so it never adds a round trip of its own.
  const toolUses = toolUsesRead(userId);
  const [joined, hosted, reviews] = await Promise.all([
    rows<{ game_id: string }>(s.from("game_participants").select("game_id").eq("user_id", userId).limit(MAX_ROWS), "participants"),
    rows<GameRow>(s.from("games").select(GAME_COLUMNS).eq("creator_id", userId).limit(MAX_ROWS), "hosted games"),
    rows<ReviewRow>(
      s.from("reviews").select("turf_id, rating, created_at").eq("user_id", userId).is("source", null).eq("status", "live").limit(MAX_ROWS),
      "reviews",
    ),
  ]);
  const have = new Set(hosted.map((g) => g.id));
  const more = [...new Set(joined.map((p) => p.game_id))].filter((id) => id && !have.has(id));
  const others = (await Promise.all(chunks(more).map((ids) => rows<GameRow>(s.from("games").select(GAME_COLUMNS).in("id", ids), "games")))).flat();
  const games = [...hosted, ...others];
  const turfIds = [...new Set([...games.map((g) => g.turf_id), ...reviews.map((r) => r.turf_id)].filter((x): x is string => !!x))];
  const turfRows = (
    await Promise.all(chunks(turfIds).map((ids) => rows<{ id: string; slug: string | null; name: string | null; city: string | null }>(s.from("turfs").select("id, slug, name, city").in("id", ids), "turfs")))
  ).flat();
  const turfs: TurfRef[] = turfRows
    .filter((t) => typeof t.name === "string" && t.name.trim())
    .map((t) => ({ id: t.id, slug: t.slug, name: cleanVenueName(t.name as string), city: t.city, cityLabel: t.city ? cityInfo(t.city).label : null }));
  const tools = await toolUses;
  return { games, turfs, reviews: reviews.filter((r) => typeof r.rating === "number" && !!r.turf_id), tools: "ok" in tools ? tools.ok : null, ...("failed" in tools ? { toolsFailed: true } : {}) };
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

/**
 * The games this account was tagged in and never answered about, that are over
 * (public.game_tags_played, 20261118_game_tags_shown.sql). null: not available (before that file, or it failed):
 * the Passport then has no card.
 */
export async function readTagged(userId: string): Promise<unknown[] | null> {
  const r = await accountRpcIfThere("game_tags_played", { p_user_id: userId });
  if (!("data" in r) || r.data.r !== "ok" || !Array.isArray(r.data.games)) return null;
  return r.data.games as unknown[];
}

/**
 * Tell the database this player's best medal and how many they have
 * (public.player_badge_set, 20261121_player_badges.sql; server key), so a
 * game's lineup can show it on their photo. missing: before that file.
 * Never throws; run it after the reply (lib/profile/deps.ts).
 */
export async function sendBadge(userId: string, medal: string | null, medals: number): Promise<BadgeSent> {
  const r = await accountRpcIfThere("player_badge_set", { p_user_id: userId, p_medal: medal, p_medals: medals });
  if ("missing" in r) return "missing";
  if ("unavailable" in r) return "failed";
  if (r.data.r !== "ok") console.warn("passport: player_badge_set answered", r.data.r);
  return r.data.r === "ok" ? "ok" : "failed";
}

/**
 * The medal on the photo of each of these people who has one and a public
 * profile (public.player_badges_for, which anyone may ask: it answers only
 * for people with "Let others find and tag me" on). At most two reads of
 * 60 ids. null: not available (before the file, or it failed); the list
 * shows without them. Never throws.
 */
export async function readBadges(ids: readonly string[]): Promise<Map<string, PlayerBadge> | null> {
  const all = badgeIds(ids, BADGE_IDS_MAX * 2);
  if (all.length === 0) return new Map();
  try {
    const s = db();
    const parts = await Promise.all(
      [all.slice(0, BADGE_IDS_MAX), all.slice(BADGE_IDS_MAX)].filter((part) => part.length > 0).map((part) => s.rpc("player_badges_for", { p_ids: part })),
    );
    const out = new Map<string, PlayerBadge>();
    for (const { data, error } of parts) {
      if (error) return null;
      for (const [id, b] of parseBadges(data)) out.set(id, b);
    }
    return out;
  } catch {
    return null;
  }
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
