import { MEDALS, type MedalDef } from "./medals";

/**
 * The medal on a player's photo (the site owner, 20 Nov 2026: "my profile
 * should be highlighted so that others are motivated"): a player's best
 * earned medal, small, on the lower right of their picture wherever other
 * players see them (a game's lineup and host card, the Me tab's Played
 * with), linking to their public profile. Only for people whose profile is
 * public ("Let others find and tag me" on): the database answers for
 * nobody else (public.player_badges_for, 20261121_player_badges.sql), and
 * asks that switch again on every read.
 *
 * Medals are worked out here in TypeScript, never in SQL, so the database
 * only keeps each player's best one (private.player_badges), sent by the
 * server whenever it works out that player's medals anyway
 * (createBadgeSync, from GET /api/me/played and /api/me/passport). Pure.
 * Relative imports only (npm run test:profile).
 */

/** What a page needs to draw one badge: the medal's id (lib/profile/medals.ts), how many medals they have, and their profile. */
export type PlayerBadge = { medal: string; medals: number; username: string };

/** Badges by account id. */
export type PlayerBadges = ReadonlyMap<string, PlayerBadge>;

export const NO_BADGES: PlayerBadges = new Map<string, PlayerBadge>();

/** How many ids one read takes (the function reads the first 60 it is sent). */
export const BADGE_IDS_MAX = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// lib/profile/playedWith.ts USERNAME_RE.
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

const byId = new Map(MEDALS.map((m) => [m.id, m]));

/** The medal with this id, or null: an id this build doesn't know draws nothing. */
export function medalOf(id: string | null | undefined): MedalDef | null {
  return (id && byId.get(id)) || null;
}

/** The ids to ask about: real account ids, each once, in the order given, at most `max`. */
export function badgeIds(ids: readonly (string | null | undefined)[], max = BADGE_IDS_MAX): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.toLowerCase() : "";
    if (UUID_RE.test(id)) out.add(id);
    if (out.size >= max) break;
  }
  return [...out];
}

/** The same ids give the same key, whatever their order: one read is kept per set of people. */
export function badgeKey(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

/**
 * What public.player_badges_for answered ([{id, m, n, u}]), by account id.
 * Anything that isn't a badge is left out, never guessed: a medal this
 * build doesn't know, a count under 1, a username that can't be a profile.
 */
export function parseBadges(data: unknown): Map<string, PlayerBadge> {
  const out = new Map<string, PlayerBadge>();
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.toLowerCase() : "";
    const medal = typeof o.m === "string" ? medalOf(o.m) : null;
    const n = o.n;
    const u = o.u;
    if (!UUID_RE.test(id) || !medal) continue;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 99) continue;
    if (typeof u !== "string" || !USERNAME_RE.test(u)) continue;
    out.set(id, { medal: medal.id, medals: n, username: u });
  }
  return out;
}

/** The badge of this account, if it has one. */
export function badgeOf(badges: PlayerBadges | null | undefined, id: string | null | undefined): PlayerBadge | null {
  return (id && badges?.get(id.toLowerCase())) || null;
}

/** What the badge says to a screen reader and as a tooltip: "Turf Veteran medal, 7 medals earned". "" for a medal this build doesn't know. */
export function badgeLabel(b: Pick<PlayerBadge, "medal" | "medals">): string {
  const medal = medalOf(b.medal);
  if (!medal) return "";
  return b.medals > 1 ? `${medal.name} medal, ${b.medals} medals earned` : `${medal.name} medal`;
}

/** What the database keeps for a player: their best medal (none: null) and how many they have, from their earned medals best first. */
export function bestBadge(earnedBestFirst: readonly string[]): { medal: string | null; medals: number } {
  return { medal: earnedBestFirst[0] ?? null, medals: earnedBestFirst.length };
}

/** ok: stored (or already the same); missing: the database has no such function yet; failed: try again another time. */
export type BadgeSent = "ok" | "missing" | "failed";
export type BadgeSend = (userId: string, medal: string | null, medals: number) => Promise<BadgeSent>;

/** sent: the database was told; same: this instance already told it exactly that; waiting: the function isn't there yet; failed. */
export type BadgeSynced = "sent" | "same" | "waiting" | "failed";

/**
 * Keeps private.player_badges in step with no job of its own: call it
 * with a player's earned medals (best first) whenever they are worked out.
 * It sends the best one unless this server instance already sent exactly
 * that for that player; a database without the function is left alone for
 * `missingWaitMs`; a failure is forgotten, so the next time tries again.
 * Never throws.
 */
export function createBadgeSync(send: BadgeSend, opts: { max?: number; missingWaitMs?: number; now?: () => number } = {}) {
  const max = opts.max ?? 5_000;
  const wait = opts.missingWaitMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  const sent = new Map<string, string>();
  let missingUntil = 0;
  return async function sync(userId: string, earnedBestFirst: readonly string[]): Promise<BadgeSynced> {
    const { medal, medals } = bestBadge(earnedBestFirst);
    const value = `${medal ?? ""}|${medals}`;
    const had = sent.get(userId);
    if (had === value) return "same";
    if (now() < missingUntil) return "waiting";
    // Remembered before the answer, so two reads at once (played and passport) send one.
    if (had === undefined && sent.size >= max) sent.delete(sent.keys().next().value as string);
    sent.set(userId, value);
    let r: BadgeSent;
    try {
      r = await send(userId, medal, medals);
    } catch {
      r = "failed";
    }
    if (r === "ok") return "sent";
    if (sent.get(userId) === value) {
      if (had === undefined) sent.delete(userId);
      else sent.set(userId, had);
    }
    if (r === "missing") {
      missingUntil = now() + wait;
      return "waiting";
    }
    return "failed";
  };
}
