import { confirmedIn, guestCount } from "./confirmed";

/**
 * How full a game is, as a bar, and whether it is filling fast (the site
 * owner, 17 Nov 2026: "show a progress bar of number of people joined the
 * group and show that its moving fast"). The house rule stands: nothing
 * invented. The bar is games.current_players of max_players, the number
 * every card already says. "Filling fast" is said only when players
 * really joined on TapTurf, quickly; a game its host filled with friends
 * (lib/games/confirmed.ts: names, "+N", tags) moves the bar and never the
 * speed, since none of those has a time. A slow game says nothing: a
 * near-empty game is an invitation. Pure; relative imports only (npm run
 * test:games). components/game/PlayersBar.tsx draws it.
 */

/** The thresholds, in one place. */
export const FAST = {
  /** The game page: players who joined in this many hours count as "just joined". */
  RECENT_HOURS: 24,
  /** How many must have joined in that time: 3 in a game of 10 or more spots, 2 in a smaller one. One join is never "fast". */
  JOINS: 3,
  JOINS_SMALL: 2,
  SMALL_GAME: 10,
  /** Cards (no lineup, so no join times): a game posted at most this many hours ago ... */
  YOUNG_HOURS: 48,
  /** ... that is at least this full ... */
  YOUNG_SHARE: 0.5,
  // ... with that many players (JOINS, JOINS_SMALL) joined on TapTurf besides the host, all of them since it was posted.
  /** "Almost full": this many spots left at most, and at least this full (so 1 of 3 is not "almost full"). */
  ALMOST_SPOTS: 2,
  ALMOST_SHARE: 0.6,
} as const;

const HOUR_MS = 3_600_000;

const whole = (x: unknown) => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** How many joins make a game of `max` spots "fast". */
export function joinsNeeded(max: number): number {
  return whole(max) >= FAST.SMALL_GAME ? FAST.JOINS : FAST.JOINS_SMALL;
}

export type Bar = {
  current: number;
  max: number;
  /** Spots still open (never below 0). */
  open: number;
  /** 0 to 100, whole: the fill's width. A game with anyone in it shows at least a sliver. */
  percent: number;
  full: boolean;
};

/** The bar: `current` of `max`, clamped (an over-full or odd row never draws past the end). */
export function barOf(current: unknown, max: unknown): Bar {
  const cap = whole(max);
  const cur = whole(current);
  const share = cap > 0 ? Math.min(1, cur / cap) : 0;
  const percent = share === 0 ? 0 : Math.max(4, Math.round(share * 100));
  return { current: cur, max: cap, open: Math.max(0, cap - cur), percent, full: cap > 0 && cur >= cap };
}

export type Speed = {
  /** What the small label says, or null: nothing to say. */
  label: string | null;
  /** The plain fact behind "Filling fast", on the game page: "3 joined in the last 24 hours". */
  detail: string | null;
  kind: "full" | "almost" | "fast" | null;
  /** Really filling fast: the bar gets its moving sheen (never when full). */
  fast: boolean;
};

const NOTHING: Speed = { label: null, detail: null, kind: null, fast: false };

export type SpeedInput = {
  current: unknown;
  max: unknown;
  /** Past its start, over or called off: no label at all. */
  closed: boolean;
  /** The moment to read it at; the clock when left out (a list hands over the server's render time until it hydrates). */
  now?: number;
  /** games.created_at. */
  createdAt?: string | number | null;
  /** How many players joined on TapTurf besides the host (the lineup, or current less the host and the confirmed people). */
  joined?: number;
  /** The game page only: when each of those joined (game_participants.joined_at, the host left out). */
  joinedAt?: readonly (string | number | null | undefined)[];
};

const ms = (x: string | number | null | undefined): number | null => {
  const t = typeof x === "number" ? x : typeof x === "string" && x ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * The label beside the bar. Full: "Full". 1 or 2 spots left in a game at
 * least 60% full: "Almost full: 2 spots left". Filling fast, either way:
 *   the game page: 3 or more players (2 in a game under 10 spots) joined
 *     in the last 24 hours, said with the number;
 *   anywhere: the game was posted at most 48 hours ago, is at least half
 *     full, and 3 or more players (2 in a small game) joined on TapTurf
 *     besides the host since.
 * Otherwise nothing. A game that has started, is over or is off: nothing.
 */
export function speedOf(i: SpeedInput): Speed {
  if (i.closed) return NOTHING;
  const now = i.now ?? Date.now();
  const bar = barOf(i.current, i.max);
  if (bar.max === 0) return NOTHING;
  if (bar.full) return { label: "Full", detail: null, kind: "full", fast: false };
  const need = joinsNeeded(bar.max);
  const times = (i.joinedAt ?? []).map(ms).filter((t): t is number => t !== null && t <= now + 60_000);
  const recent = times.filter((t) => now - t <= FAST.RECENT_HOURS * HOUR_MS).length;
  const joined = Math.max(whole(i.joined), times.length);
  const posted = ms(i.createdAt ?? null);
  const young = posted !== null && now - posted >= 0 && now - posted <= FAST.YOUNG_HOURS * HOUR_MS;
  const fast = recent >= need || (young && bar.current / bar.max >= FAST.YOUNG_SHARE && joined >= need);
  const detail = recent >= need ? `${recent} joined in the last ${FAST.RECENT_HOURS} hours` : null;
  if (bar.open <= FAST.ALMOST_SPOTS && bar.current / bar.max >= FAST.ALMOST_SHARE) {
    return { label: `Almost full: ${bar.open} ${bar.open === 1 ? "spot" : "spots"} left`, detail, kind: "almost", fast };
  }
  return fast ? { label: "Filling fast", detail, kind: "fast", fast: true } : NOTHING;
}

/** A list row's game: the counts of its confirmed people, with or without the names (cardGame keeps `confirmed_named`). */
type CountedGame = {
  current_players?: unknown;
  confirmed_names?: unknown;
  confirmed_named?: unknown;
  confirmed_extra?: unknown;
  confirmed_tagged?: unknown;
};

/** How many of a game's people its host confirmed by hand (names, "+N", waiting tags): they have no join time. */
export function confirmedCount(g: CountedGame): number {
  const c = confirmedIn(g);
  return Array.isArray(g.confirmed_names) ? guestCount(c) : whole(g.confirmed_named) + c.extra + c.tagged;
}

/** The players who joined a game on TapTurf besides its host, from the row's own numbers (a card has no lineup). */
export function joinedOnTapTurf(g: CountedGame): number {
  return Math.max(0, whole(g.current_players) - 1 - confirmedCount(g));
}

/** "7 of 14 players going, 7 spots open. Filling fast." for a screen reader (the bar's value text). */
export function barWords(bar: Bar, speed: Speed, over = false): string {
  const base = `${bar.current} of ${bar.max} players ${over ? "joined" : "going"}`;
  if (over) return `${base}.`;
  const open = bar.full ? "no spots left" : bar.open === 1 ? "1 spot open" : `${bar.open} spots open`;
  return `${base}, ${open}.${speed.kind === "fast" ? " Filling fast." : speed.kind === "almost" && speed.fast ? " Filling fast." : ""}`;
}
