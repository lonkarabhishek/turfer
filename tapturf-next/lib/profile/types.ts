import type { Passport } from "./passport";
import type { PlayedWithPerson } from "./playedWith";
import type { Streak } from "./streak";

/**
 * The passport routes: what they answer, shared by the routes and the
 * browser. Types only. Each needs `Authorization: Bearer <token>` (as the
 * account routes, lib/account/types.ts): the server verifies the sign-in
 * and works out the account itself; the browser never names a user id.
 * Answers are for one person (Cache-Control: private, no-store). A
 * refusal carries `error` (an AccountError).
 *
 *   GET   /api/me/passport          -> PassportResponse (the Me tab)
 *   GET   /api/me/played            -> PlayedResponse (the "You played here" badges, the home's tiles and streak, the Me card)
 *   PATCH /api/me/whatsapp { on }   -> WhatsAppResponse
 */

/**
 * The WhatsApp switch: whether it is on, and the account's number:
 * ok (proved with a one-time code, so it can be shown), unproven, or none.
 */
export type WhatsAppState = { on: boolean; phone: "ok" | "unproven" | "none" };

export type PassportResponse = {
  passport: Passport;
  playedWith: PlayedWithPerson[];
  /** null: the database has no WhatsApp sharing yet (before 20261101_played_with.sql), or could not say. */
  whatsapp: WhatsAppState | null;
  /** The same summary /api/me/played gives, so every number on the page agrees once the passport is in. */
  played: PlayedResponse;
};

export type PlayedResponse = {
  /** The latest day (India's date) they played at each turf, by turf id. */
  turfs: Record<string, string>;
  streak: Streak;
  /** Played games, the people in them (other than you) and their sports, counted. */
  games: number;
  people: number;
  sports: number;
  /** Earned medals' ids (lib/profile/medals.ts), best first. */
  medals: string[];
  /** Turfs they played at and haven't reviewed (a "Rate it" next to "You played here"). */
  toReview: string[];
};

/** whatsapp null: sharing is not available yet. A refusal for a number that isn't proved: error not_allowed, with the state. */
export type WhatsAppResponse = { whatsapp: WhatsAppState | null };
