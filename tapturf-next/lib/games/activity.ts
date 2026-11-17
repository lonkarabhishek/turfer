import { agoWords, clockWords, dayWords, instant, stampWords } from "./when";
import { updatesOf } from "./updates";

/**
 * A game's activity, for the timeline at the foot of its page (the site
 * owner, 17 Nov 2026: "Show activity log at the very bottom too of the
 * game"). What the page already knows is worked out here: the game was
 * posted (games.created_at), a player joined (game_participants.joined_at,
 * by the name the lineup shows), the host posted an update (games.updates).
 * What leaves no other trace is read from games.activity, noted by the
 * database as it happens (20261118_game_updates.sql: a new day or time, a
 * move, spots, turf booked, more people confirmed, filled up, called off).
 * Everything here is, or was, on the page for anyone: never a request or
 * its note, never someone who asked and was not accepted, never a number;
 * people a host confirmed are a count ("+3 confirmed with Asha"), never a
 * typed name or a tagged player; someone who took themselves off leaves
 * nothing. A game from before the file shows what can be worked out and
 * nothing made up. Pure; relative imports only (npm run test:games).
 */

/** Entries shown before "Show all". */
export const ACTIVITY_SHOWN = 5;
/** Confirmed people noted this close together are one entry (a create notes its names and its tags apart). */
const MERGE_MS = 120_000;
const TEXT_MAX = 80;

export type ActivityKind = "posted" | "joined" | "update" | "time" | "venue" | "spots" | "booked" | "confirmed" | "full" | "cancelled";

export type ActivityEntry = {
  /** Stable for a list key. */
  key: string;
  /** When (ms). */
  at: number;
  kind: ActivityKind;
  text: string;
};

type Person = { user_id?: unknown; joined_at?: unknown; name?: unknown };

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, TEXT_MAX) : null);
const int = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 1000 ? x : null);
const cut = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return [...one].length > n ? `${[...one].slice(0, n - 1).join("").trimEnd()}…` : one;
};

/** "Sat 15 Nov, 7 PM", from a stored date and start. */
function whenWords(date: unknown, start: unknown): string | null {
  const d = dayWords(date);
  const c = clockWords(start);
  return d && c ? `${d}, ${c}` : d || c || null;
}

/** One stored entry in words, or null when it is not one this code knows (a newer kind, a bad row). */
function storedText(e: Record<string, unknown>, host: string, clean: (name: string) => string): { kind: ActivityKind; text: string } | null {
  switch (e.k) {
    case "time": {
      const from = whenWords(e.fd, e.fs);
      const to = whenWords(e.td, e.ts);
      if (!from || !to) return null;
      if (from !== to) return { kind: "time", text: `${e.fd === e.td ? "Time" : "Day"} changed: ${from} → ${to}` };
      const fe = clockWords(e.fe);
      const te = clockWords(e.te);
      return fe && te && fe !== te ? { kind: "time", text: `End time changed: ${fe} → ${te}` } : null;
    }
    case "venue": {
      const from = str(e.from);
      const to = str(e.to);
      return from && to ? { kind: "venue", text: `Venue changed: ${clean(from)} → ${clean(to)}` } : null;
    }
    case "spots": {
      const from = int(e.from);
      const to = int(e.to);
      return from !== null && to !== null && from !== to ? { kind: "spots", text: `Spots changed: ${from} → ${to}` } : null;
    }
    case "booked":
      return { kind: "booked", text: `${host} said the turf is booked` };
    case "confirmed": {
      const n = int(e.n);
      return n ? { kind: "confirmed", text: `+${n} confirmed with ${host === "The host" ? "the host" : host}` } : null;
    }
    case "full":
      return { kind: "full", text: "Game filled up" };
    case "cancelled":
      return { kind: "cancelled", text: `${host} called the game off` };
    default:
      return null;
  }
}

/**
 * The timeline, newest first. hostFirst: firstName() ("Asha", or "the
 * host"). participants: the lineup as the page shows it (the host's own
 * row is the game being posted, not a join). clean: how the page writes a
 * venue's name (cleanVenueName).
 */
export function activityLog(i: {
  game: { id?: unknown; created_at?: unknown; creator_id?: unknown; activity?: unknown; updates?: unknown };
  hostFirst: string;
  participants: readonly Person[];
  clean?: (name: string) => string;
}): ActivityEntry[] {
  const host = !i.hostFirst || i.hostFirst === "the host" ? "The host" : i.hostFirst;
  const clean = i.clean ?? ((s: string) => s);
  const out: (ActivityEntry & { order: number })[] = [];
  let order = 0;
  const add = (key: string, at: number | null, kind: ActivityKind, text: string) => {
    if (at !== null) out.push({ key, at, kind, text, order: order++ });
  };

  add("posted", instant(i.game.created_at), "posted", `${host} posted the game`);

  // The stored log, oldest first; confirmed people noted together are one entry.
  let last: { at: number; n: number; index: number } | null = null;
  const stored = Array.isArray(i.game.activity) ? (i.game.activity as unknown[]) : [];
  stored.forEach((raw, n) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const at = instant(e.at);
    if (at === null) return;
    if (e.k === "confirmed" && last && at - last.at <= MERGE_MS && int(e.n)) {
      last.n += int(e.n) as number;
      out[last.index].text = `+${last.n} confirmed with ${host === "The host" ? "the host" : host}`;
      return;
    }
    const t = storedText(e, host, clean);
    if (!t) return;
    add(`s${n}`, at, t.kind, t.text);
    last = t.kind === "confirmed" ? { at, n: int(e.n) as number, index: out.length - 1 } : null;
  });

  for (const u of updatesOf(i.game)) add(`u${u.id}`, instant(u.at), "update", `${host} posted an update: “${cut(u.text, 60)}”`);

  const seen = new Set<string>();
  for (const p of i.participants) {
    const id = typeof p.user_id === "string" ? p.user_id : null;
    if (!id || id === i.game.creator_id || seen.has(id)) continue;
    seen.add(id);
    add(`j${id}`, instant(p.joined_at), "joined", `${str(p.name) ?? "A player"} joined`);
  }

  // Newest first; at the same moment, the later one noted first.
  return out.sort((a, b) => b.at - a.at || b.order - a.order).map((e) => ({ key: e.key, at: e.at, kind: e.kind, text: e.text }));
}

/** The first five, and how many more "Show all" shows. */
export function activityView(log: readonly ActivityEntry[], all: boolean): { shown: readonly ActivityEntry[]; more: number } {
  return all || log.length <= ACTIVITY_SHOWN ? { shown: log, more: 0 } : { shown: log.slice(0, ACTIVITY_SHOWN), more: log.length - ACTIVITY_SHOWN };
}

/** "2 h ago" and "Mon 17 Nov, 3:40 PM" (India) for an entry. */
export function activityWhen(e: Pick<ActivityEntry, "at">, now: number): { ago: string; stamp: string; iso: string } {
  return { ago: agoWords(e.at, now), stamp: stampWords(e.at, now), iso: new Date(e.at).toISOString() };
}
