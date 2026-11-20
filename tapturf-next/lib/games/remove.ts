import { getGameStatus } from "../utils/game";
import { confirmedIn } from "./confirmed";
import { joinedOnTapTurf } from "./progress";
import { clockWords, dayWords } from "./when";

/**
 * A host deletes a game they posted (the site owner, 20 Nov 2026: "give
 * an option to delete a hosted game"; 20261122_game_remove.sql). Deleting
 * is "call it off if needed, then hide it from everyone": a game not
 * started yet is first called off as any game is (its players and waiting
 * requests are told), then it leaves TapTurf; a game already called off
 * just leaves; a game that has started or is over can go only when nobody
 * but the host was in it, because it counts on the other players'
 * Passports. The row is kept, hidden (public.games.removed_at).
 *
 * The database decides (public.game_remove) and says beforehand what it
 * would do (public.game_remove_check, GET /api/games/<id>/removal); this
 * file has what the routes send, the words of the confirm step, and
 * whether a page offers the option at all. Pure; relative imports only
 * (npm run test:games).
 */

/** What deleting would do, as the database worked it out for this game's host. */
export type Removal = {
  /** False: played with other people, so it stays. */
  can: boolean;
  /** upcoming: called off first, people are told. off: already called off. played: started or over. */
  state: "upcoming" | "off" | "played";
  /** Other accounts in the game. */
  players: number;
  /** Other accounts with a request waiting, who are not in it. */
  requests: number;
  /** Tagged accounts still to answer, who are neither. */
  tags: number;
  /** One game of a repeat. */
  repeat: boolean;
};

const STATES = ["upcoming", "off", "played"] as const;
const count = (x: unknown): number => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? Math.min(x, 999) : 0);

/** game_remove_check's answer (or the route's body) as the page reads it: these keys only, or null when it is not one. */
export function parseRemoval(x: unknown): Removal | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const state = STATES.find((s) => s === o.state);
  if (!state || typeof o.can !== "boolean") return null;
  return { can: o.can, state, players: count(o.players), requests: count(o.requests), tags: count(o.tags), repeat: o.repeat === true };
}

/** What a delete answered: how many people were told the game is off. */
export type Removed = { r: "ok"; state: Removal["state"] | null; told: number };

/** game_remove's ok answer as the route sends it. */
export function removedView(d: Record<string, unknown>): Removed {
  return { r: "ok", state: STATES.find((s) => s === d.state) ?? null, told: count(d.told) };
}

type Row = {
  status?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  current_players?: number | null;
  confirmed_names?: unknown;
  confirmed_extra?: unknown;
  confirmed_tagged?: unknown;
  confirmed_named?: unknown;
};

/** Whether the database can delete games (the row carries removed_at, 20261122_game_remove.sql): before that no page offers it. */
export function removeReady(row: object | null | undefined): boolean {
  return !!row && "removed_at" in row;
}

/** One line, where a page would offer Delete but the game was played with other people. */
export const REMOVE_BLOCKED = "It can't be deleted: other players were in it, and it counts on their Passports.";
/** The same, once, over a list of past games some of which have no Delete. */
export const REMOVE_BLOCKED_LIST = "Games other players were in can't be deleted: they count on those players' Passports.";

/**
 * What a page does about Delete for its host, before asking the server:
 * "none" (the database has no delete yet), "blocked" (started or over, not
 * called off, and somebody else was in it: the page says why instead of
 * offering a button that would be refused) or "offer". `others`: the
 * other players in it, from the lineup when the page has one, else from
 * the row's own numbers. The server decides again either way.
 */
export function removeOffer(row: Row | null | undefined, others?: number, now: number = Date.now()): "none" | "offer" | "blocked" {
  if (!row || !removeReady(row)) return "none";
  if (row.status === "cancelled") return "offer";
  const started = row.status === "completed" || getGameStatus(row, now) !== "upcoming";
  if (!started) return "offer";
  const n = others ?? joinedOnTapTurf(row);
  return n > 0 ? "blocked" : "offer";
}

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/** "A, B and C". */
function listed(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Who is told when an upcoming game is deleted: "3 players and 1 waiting request will be told it's off." */
export function toldLine(r: Pick<Removal, "players" | "requests" | "tags">): string {
  const parts = [
    r.players > 0 ? many(r.players, "player", "players") : "",
    r.requests > 0 ? many(r.requests, "waiting request", "waiting requests") : "",
    r.tags > 0 ? many(r.tags, "player you added", "players you added") : "",
  ].filter(Boolean);
  if (parts.length === 0) return "Nobody else is in it yet, so there is nobody to tell.";
  return `${listed(parts)} will be told it's off.`;
}

/** After a delete: "Game deleted. 4 people were told it's off." */
export function removedLine(told: number): string {
  return told > 0 ? `Game deleted. ${many(told, "person was", "people were")} told it's off.` : "Game deleted.";
}

export const REMOVE_COPY = {
  /** The option, in the edit sheet and on a hosted game's row. */
  action: "Delete game",
  title: "Delete this game?",
  checking: "Checking who is in this game…",
  confirm: "Delete game",
  deleting: "Deleting…",
  keep: "Keep game",
  close: "Close",
  /** The database has no delete yet (before 20261122_game_remove.sql). */
  off: "Deleting a game isn't available yet.",
  failed: "Couldn't check this game. Please try again.",
} as const;

/** "Football · Sat 21 Nov, 7 PM · Kings Turf": which game the sheet is about. */
export function removeGameLine(g: { sport?: string | null; date?: string | null; start_time?: string | null }, venue?: string | null): string {
  const when = [dayWords(g.date), clockWords(g.start_time)].filter(Boolean).join(", ");
  return [g.sport?.trim(), when, venue?.trim()].filter(Boolean).join(" · ");
}

/**
 * The confirm step's lines for THIS game, in order: who is told, that it
 * leaves TapTurf, what it takes from the host's own Passport (a played
 * game), that a repeat goes on, and that it can't be undone from the app.
 * For a game that can't go (played with others): the one line why.
 */
export function removeLines(r: Removal, row?: Pick<Row, "confirmed_names" | "confirmed_extra"> | null): { blocked: string } | { lines: string[] } {
  if (!r.can) return { blocked: REMOVE_BLOCKED };
  const lines: string[] = [];
  if (r.state === "upcoming") {
    lines.push(toldLine(r));
    const c = row ? confirmedIn(row) : null;
    const friends = c ? c.names.length + c.extra : 0;
    if (friends > 0) lines.push(`TapTurf can't tell the ${many(friends, "friend", "friends")} you added by name: let them know yourself.`);
  } else if (r.state === "off") {
    lines.push("It's already called off, so nobody is told again.");
  } else {
    lines.push("Nobody else was in it, so there is nobody to tell.");
  }
  lines.push("It comes off TapTurf at once: the lists, its page and its share link.");
  if (r.state === "played") lines.push("It leaves your Passport too: it stops counting toward your games, streak and medals, so a medal can go with it.");
  if (r.repeat) lines.push("Only this one game is deleted. The rest of the repeat stays as it is.");
  lines.push("You can't undo this from the app.");
  return { lines };
}
