import { buildPassport, latestPlayedByTurf } from "./passport";
import { playedGames, type GameRow } from "./history";
import { coPlayers, playedWithList, type CoPlayerExtra } from "./playedWith";
import { streakOf } from "./streak";
import type { History, WhatsAppResult } from "./server";
import type { PassportResponse, PlayedResponse, WhatsAppResponse } from "./types";

// The passport routes (lib/profile/types.ts has the API), for
// app/api/me/*. Who is asking and every read come in as deps
// (lib/profile/deps.ts wires the real ones: the account routes' verified
// caller, lib/profile/server.ts), so the tests call neither. Relative
// imports only (npm run test:profile).

export type Caller = { userId: string; since: string | null };

export type ProfileDeps = {
  /** The verified caller's account, or the reply to send instead (signed out, too many tries, can't check). */
  who: (req: Request, kind: "read" | "badge" | "write") => Promise<Caller | { reply: Response }>;
  history: (userId: string, gamesOnly: boolean) => Promise<History>;
  rosters: (games: readonly Pick<GameRow, "id" | "creator_id">[]) => Promise<Map<string, string[]>>;
  people: (ids: readonly string[]) => Promise<Map<string, { name: string | null; photo: string | null }>>;
  extras: (userId: string) => Promise<Map<string, CoPlayerExtra> | null>;
  whatsapp: (userId: string, on: boolean | null) => Promise<WhatsAppResult>;
  now: () => number;
};

const PRIVATE = { "Cache-Control": "private, no-store" };
const STATUS = { bad: 400, not_allowed: 409, unavailable: 503 } as const;

function reply(body: object, error?: keyof typeof STATUS): Response {
  return Response.json(error ? { ...body, error } : body, { status: error ? STATUS[error] : 200, headers: PRIVATE });
}

/** GET /api/me/passport: the Me tab's passport, played-with list and WhatsApp switch. */
export async function getPassport(req: Request, deps: ProfileDeps): Promise<Response> {
  const who = await deps.who(req, "read");
  if ("reply" in who) return who.reply;
  try {
    const now = deps.now();
    const [history, extras, wa] = await Promise.all([
      deps.history(who.userId, false),
      deps.extras(who.userId).catch(() => null),
      deps.whatsapp(who.userId, null).catch((): WhatsAppResult => ({ unavailable: true })),
    ]);
    const passport = buildPassport({ userId: who.userId, ...history, since: who.since, now });
    const played = playedGames(who.userId, history.games, now);
    const byId = new Map(history.games.map((g) => [g.id, g]));
    const rosters = played.length ? await deps.rosters(played.map((g) => byId.get(g.id) as GameRow)) : new Map<string, string[]>();
    const list = coPlayers(who.userId, played, rosters);
    const people = list.length ? await deps.people(list.map((c) => c.userId)) : new Map();
    const body: PassportResponse = {
      passport,
      playedWith: playedWithList(list, people, extras),
      whatsapp: "ok" in wa ? wa.ok : null,
    };
    return reply(body);
  } catch (e) {
    console.warn("passport: read failed", e);
    return reply({}, "unavailable");
  }
}

/** GET /api/me/played: the latest day they played at each turf, and the streak. */
export async function getPlayed(req: Request, deps: ProfileDeps): Promise<Response> {
  const who = await deps.who(req, "badge");
  if ("reply" in who) return who.reply;
  try {
    const now = deps.now();
    const { games } = await deps.history(who.userId, true);
    const played = playedGames(who.userId, games, now);
    // Who was in them, only to count them (the home's Squad tile opens the list itself).
    const byId = new Map(games.map((g) => [g.id, g]));
    const rosters = played.length ? await deps.rosters(played.map((g) => byId.get(g.id) as GameRow)) : new Map<string, string[]>();
    const body: PlayedResponse = {
      turfs: latestPlayedByTurf(played),
      streak: streakOf(played, now),
      games: played.length,
      people: coPlayers(who.userId, played, rosters).length,
      sports: new Set(played.map((g) => g.sport?.toLowerCase()).filter(Boolean)).size,
    };
    return reply(body);
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
