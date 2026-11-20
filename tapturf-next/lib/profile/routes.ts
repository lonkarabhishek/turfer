import { buildPassport, latestPlayedByTurf, type Passport } from "./passport";
import { playedGames, type GameRow, type PlayedGame } from "./history";
import { bestFirst } from "./medals";
import { coPlayers, playedWithList, type CoPlayerExtra } from "./playedWith";
import type { PlayerBadge } from "./playerBadge";
import { turfersOf } from "./turfers";
import type { History, WhatsAppResult } from "./server";
import type { PassportResponse, PlayedResponse, WhatsAppResponse } from "./types";
import { taggedGames } from "../games/played";

// The passport routes (lib/profile/types.ts has the API), for
// app/api/me/*. Who is asking and every read come in as deps
// (lib/profile/deps.ts wires the real ones: the account routes' verified
// caller, lib/profile/server.ts), so the tests call neither. Relative
// imports only (npm run test:profile).

export type Caller = { userId: string; since: string | null };

export type ProfileDeps = {
  /** The verified caller's account, or the reply to send instead (signed out, too many tries, can't check). */
  who: (req: Request, kind: "read" | "badge" | "write") => Promise<Caller | { reply: Response }>;
  history: (userId: string) => Promise<History>;
  rosters: (games: readonly Pick<GameRow, "id" | "creator_id">[]) => Promise<Map<string, string[]>>;
  people: (ids: readonly string[]) => Promise<Map<string, { name: string | null; photo: string | null }>>;
  extras: (userId: string) => Promise<Map<string, CoPlayerExtra> | null>;
  whatsapp: (userId: string, on: boolean | null) => Promise<WhatsAppResult>;
  /** The games this account was tagged in and never answered about, as public.game_tags_played sends them (lib/games/played.ts checks them again); null: can't say. */
  tagged?: (userId: string) => Promise<unknown[] | null>;
  /**
   * The caller's earned medals, best first, each time they are worked out: the database keeps the best one for the
   * badge on their photo (lib/profile/playerBadge.ts). Not waited for, and nothing it does changes the answer.
   */
  badge?: (userId: string, earnedBestFirst: readonly string[]) => void;
  /** The medal on the photo of each of these people who has one and a public profile, by account id; null: can't say. */
  badges?: (ids: readonly string[]) => Promise<ReadonlyMap<string, PlayerBadge> | null>;
  now: () => number;
};

const PRIVATE = { "Cache-Control": "private, no-store" };
const STATUS = { bad: 400, not_allowed: 409, unavailable: 503 } as const;

function reply(body: object, error?: keyof typeof STATUS): Response {
  return Response.json(error ? { ...body, error } : body, { status: error ? STATUS[error] : 200, headers: PRIVATE });
}

/** The summary of played games every page shares (PlayedResponse), from the passport. people: their Turfers (lib/profile/turfers.ts). */
function summary(passport: Passport, played: readonly PlayedGame[], people: number): PlayedResponse {
  return {
    turfs: latestPlayedByTurf(played),
    streak: passport.streak,
    games: passport.numbers.games,
    people,
    sports: passport.numbers.sports,
    medals: bestFirst(passport.medals.filter((m) => m.earned)).map((m) => m.id),
    toReview: passport.reviewMore.map((s) => s.turfId),
  };
}

/**
 * The caller's best medal goes to the database for their badge. Never holds a reply up or fails one. Not when the
 * tool uses could not be read this time: the medals worked out may be short of some, and a badge must not lose its
 * medal, or its count drop, over one failed read (the next read tells it).
 */
function noteBadge(deps: ProfileDeps, userId: string, played: PlayedResponse, history: Pick<History, "toolsFailed">): void {
  if (history.toolsFailed) return;
  try {
    deps.badge?.(userId, played.medals);
  } catch {
    // The badge catches up the next time their medals are worked out.
  }
}

/** GET /api/me/passport: the Me tab's passport, played-with list and WhatsApp switch. */
export async function getPassport(req: Request, deps: ProfileDeps): Promise<Response> {
  const who = await deps.who(req, "read");
  if ("reply" in who) return who.reply;
  try {
    const now = deps.now();
    const [history, extras, wa, tagged] = await Promise.all([
      deps.history(who.userId),
      deps.extras(who.userId).catch(() => null),
      deps.whatsapp(who.userId, null).catch((): WhatsAppResult => ({ unavailable: true })),
      // "Did you play?": never holds the passport up.
      deps.tagged ? deps.tagged(who.userId).catch(() => null) : null,
    ]);
    const passport = buildPassport({ userId: who.userId, ...history, since: who.since, now });
    const played = playedGames(who.userId, history.games, now);
    const byId = new Map(history.games.map((g) => [g.id, g]));
    const rosters = played.length ? await deps.rosters(played.map((g) => byId.get(g.id) as GameRow)) : new Map<string, string[]>();
    const list = coPlayers(who.userId, played, rosters);
    const ids = list.map((c) => c.userId);
    // Their names and photos, and beside that read the medal on each one's photo (never holds the list up).
    const [people, badges] = list.length
      ? await Promise.all([deps.people(ids), deps.badges ? deps.badges(ids).catch(() => null) : null])
      : [new Map<string, { name: string | null; photo: string | null }>(), null];
    const mine = summary(passport, played, list.length);
    noteBadge(deps, who.userId, mine, history);
    const body: PassportResponse = {
      passport,
      playedWith: playedWithList(list, people, extras, 60, badges),
      whatsapp: "ok" in wa ? wa.ok : null,
      played: mine,
      // Never a game they are in the history of already (they answered, or joined the usual way).
      tagged: taggedGames(tagged, now).filter((t) => !byId.has(t.gameId)),
    };
    return reply(body);
  } catch (e) {
    console.warn("passport: read failed", e);
    return reply({}, "unavailable");
  }
}

/** GET /api/me/played: the latest day they played at each turf, the streak, the counts and the medals. */
export async function getPlayed(req: Request, deps: ProfileDeps): Promise<Response> {
  const who = await deps.who(req, "badge");
  if ("reply" in who) return who.reply;
  try {
    const now = deps.now();
    const history = await deps.history(who.userId);
    const passport = buildPassport({ userId: who.userId, ...history, since: who.since, now });
    const played = playedGames(who.userId, history.games, now);
    // Who was in them, only to count them (the home's Turfers tile opens the list itself).
    const byId = new Map(history.games.map((g) => [g.id, g]));
    const rosters = played.length ? await deps.rosters(played.map((g) => byId.get(g.id) as GameRow)) : new Map<string, string[]>();
    const mine = summary(passport, played, turfersOf(who.userId, played, rosters));
    noteBadge(deps, who.userId, mine, history);
    return reply(mine);
  } catch (e) {
    console.warn("passport: played read failed", e);
    return reply({}, "unavailable");
  }
}

/** A small JSON object body, or null. */
async function smallJson(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length")) > 200) return null;
  try {
    const text = await req.text();
    if (text.length > 200) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/me/whatsapp { on }: "Let players I've played with see my
 * WhatsApp". On only for a number proved with a one-time code (the
 * database checks it again on every read).
 */
export async function patchWhatsapp(req: Request, deps: ProfileDeps): Promise<Response> {
  const who = await deps.who(req, "write");
  if ("reply" in who) return who.reply;
  const body = await smallJson(req);
  if (!body || typeof body.on !== "boolean" || Object.keys(body).length !== 1) return reply({}, "bad");
  const r = await deps.whatsapp(who.userId, body.on).catch((): WhatsAppResult => ({ unavailable: true }));
  if ("unavailable" in r) return reply({}, "unavailable");
  if ("missing" in r) return reply({ whatsapp: null } satisfies WhatsAppResponse);
  if ("refused" in r) return reply({ whatsapp: r.refused } satisfies WhatsAppResponse, "not_allowed");
  return reply({ whatsapp: r.ok } satisfies WhatsAppResponse);
}
