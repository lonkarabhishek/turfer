import { splitTeams } from "../tools/teams";
import type { Venue } from "../tournament/types";
import { FORMATS, formatFor, indiaDay, oversThatFit, planMatches, playersFromSpots, slotMinutes } from "./plan";
import type { Format, Side } from "./types";

/**
 * A session filled in from a game: who joined, as short names for the
 * scorer's chips, dealt into two sides with the Cricket Team Generator's
 * split; and the format, overs, players a side and matches planned from
 * the game's sport, spots and slot. Pure, relative imports only, tested in
 * names.test.ts (npm run test:session).
 */

export const NAME_MAX = 40;
export const PLAYERS_MAX = 30;
export const SIDE_NAME_MAX = 30;

const clean = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);

/**
 * First names, for chips on a phone. Two people with the same first name
 * become "Rohan P" and "Rohan K" (their last names' first letters), or
 * "Rohan 2" when that does not tell them apart. A name typed twice is one
 * person; "Player" (an account with no name) is nobody. 40 characters each,
 * 30 at most.
 */
export function shortNames(full: readonly string[]): string[] {
  const seen = new Set<string>();
  const people: { first: string; initial: string }[] = [];
  for (const raw of full) {
    const name = clean(raw);
    const key = name.toLowerCase();
    if (!name || /^player$/i.test(name) || seen.has(key)) continue;
    seen.add(key);
    const words = name.split(" ");
    people.push({ first: cap(words[0]), initial: words.length > 1 ? words[words.length - 1].charAt(0).toUpperCase() : "" });
    if (people.length >= PLAYERS_MAX) break;
  }
  // Same first name: their last names' first letters when those tell them apart, else Rohan, Rohan 2, Rohan 3.
  const groups = new Map<string, number[]>();
  people.forEach((p, i) => groups.set(p.first.toLowerCase(), [...(groups.get(p.first.toLowerCase()) ?? []), i]));
  const labels = people.map((p) => p.first.slice(0, NAME_MAX));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const initials = idx.map((i) => people[i].initial);
    const apart = initials.every(Boolean) && new Set(initials).size === initials.length;
    idx.forEach((i, k) => {
      const first = people[i].first.slice(0, NAME_MAX - 3);
      labels[i] = apart ? `${first} ${people[i].initial}` : k === 0 ? labels[i] : `${first} ${k + 1}`;
    });
  }
  // A typed "Rohan 2" and a made one: the later one moves on.
  const taken = new Set<string>();
  return labels.map((l) => {
    let out = l;
    for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${l.slice(0, NAME_MAX - 3)} ${i}`;
    taken.add(out.toLowerCase());
    return out;
  });
}

/** What the game page hands the session: the game, where it is, and who joined (host included). */
export type GameAsk = {
  game: { id: string; sport: string; date: string; start: string; end: string; spots: number };
  venue: { name: string; turf: Venue | null };
  names: string[];
};

export type Prefill = {
  format: Format;
  overs: number;
  playersPerSide: number;
  /** Matches that fit in the slot: a guess, shown as one. */
  plan: number;
  slot: number;
  venue: string;
  turf: Venue | null;
  day: string;
  /** Null for "Score on this phone instead": filled in from the game, never linked to it. */
  game: { id: string; start: string; end: string } | null;
  sides: { a: Side; b: Side };
};

/**
 * The setup a game asks for: its sport's format (cricket when the sport
 * says nothing more), overs that fit its slot, half its spots a side,
 * the matches that fit, its turf or typed venue and day, and the players
 * who joined dealt into Team A and Team B.
 */
export function prefillFromGame(ask: GameAsk, now: number, rng: () => number = Math.random): Prefill {
  const format = formatFor(ask.game.sport) ?? "cricket";
  const slot = slotMinutes(ask.game.start, ask.game.end);
  const overs = oversThatFit(slot, format);
  const names = shortNames(ask.names);
  const [a, b] = splitTeams(
    names.map((name) => ({ name, rating: 3 })),
    2,
    "random",
    rng,
  );
  const day = /^\d{4}-\d{2}-\d{2}$/.test(ask.game.date) ? ask.game.date : indiaDay(now);
  return {
    format,
    overs,
    playersPerSide: ask.game.spots > 0 ? playersFromSpots(ask.game.spots, format) : FORMATS[format].players,
    plan: planMatches(slot, format, overs),
    slot,
    venue: clean(ask.venue.name).slice(0, 48),
    turf: ask.venue.turf,
    day,
    game: { id: ask.game.id, start: ask.game.start, end: ask.game.end },
    sides: { a: { name: "Team A", players: a.map((p) => p.name) }, b: { name: "Team B", players: b.map((p) => p.name) } },
  };
}

/** Names typed in a box, one per line or with commas: cleaned, each once, 40 characters, 30 at most. */
export function readNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    const n = clean(part).slice(0, NAME_MAX);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
    if (out.length >= PLAYERS_MAX) break;
  }
  return out;
}

/** A side's name as typed: cleaned and cut to 30; blank stays blank (the form says so). */
export const sideName = (s: string) => clean(s).slice(0, SIDE_NAME_MAX).trim();

/** The two sides' names are the same (any case): live tournaments need them different, and so does the tally. */
export const sameNames = (a: string, b: string) => sideName(a).toLowerCase() === sideName(b).toLowerCase();
