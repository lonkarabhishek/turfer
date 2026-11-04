import type { Game } from "../../types/game";
import { SITE_URL } from "../seo/defaults";
import { formatGameDay, formatTimeRange, gameVenue, isGameExpired, venuePlace } from "../utils/game";
import { sportLabel } from "../utils/sport";

/**
 * A game's share card (GET /api/og/game/<id>, lib/og/gameCardImage.tsx):
 * what it says, the version its URLs carry, and those URLs. The game
 * page's og:image and twitter:image, and the image of its SportsEvent
 * JSON-LD there and on /games (lib/seo/gameJsonLd.ts).
 *
 * - It says the sport, the venue (its TapTurf turf or the venue its host
 *   typed), the area and city, the day and time as stored (India
 *   wall-clock, never converted, never "Today": a card is seen later than
 *   it is made), and the spots left. No price (the bundled font has no
 *   rupee sign), no urgency, nothing invented.
 * - Drawn only in the font next/og bundles (Noto Sans, Latin): a glyph it
 *   lacks makes next/og fetch a font from Google Fonts (or an emoji from a
 *   CDN) while it renders, so every line goes through ogText first, and a
 *   name it cannot draw whole (a Devanagari venue name) is left off, never
 *   drawn in part.
 * - The version is a hash of every line drawn and the template, so a URL
 *   names one picture: when spots change, the URL changes, and share
 *   previews and Google fetch the new one. The route draws a URL's picture
 *   only while its version is current (an older one redirects to the
 *   current), so a long cache is safe.
 *
 * Pure (relative imports), so node --test runs it (npm run test:seo).
 */

/** Bump when the drawing changes, so every card URL changes with it. */
export const GAME_CARD_TEMPLATE = 1;

/** og: the share card (1.91:1); 4x3 and 1x1: the other shapes Google asks for in an Event's image. */
export const GAME_CARD_SHAPES = {
  og: { width: 1200, height: 630 },
  "4x3": { width: 1200, height: 900 },
  "1x1": { width: 1200, height: 1200 },
} as const;
export type GameCardShape = keyof typeof GAME_CARD_SHAPES;

export function isGameCardShape(s: unknown): s is GameCardShape {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(GAME_CARD_SHAPES, s);
}

/** Each shape's padding in px, [top and bottom, each side] (lib/og/gameCardImage.tsx): a line of text is the width less both sides. */
export const GAME_CARD_PADDING: Record<GameCardShape, readonly [number, number]> = {
  og: [56, 72],
  "4x3": [72, 76],
  "1x1": [88, 80],
};

// What a word is taken to need per character, in em: the bundled Noto Sans's capitals average 0.63 (small letters 0.53).
const EM_PER_CHAR = 0.64;

/**
 * The title's font size: by its length, then smaller (to the smallest
 * size at most) while its longest word would not fit on one line, so a
 * typed name without spaces ("PlayArenaSportsHub") stays whole on the
 * card instead of running off its edge. A word still too long at the
 * smallest size wraps inside itself (wordBreak in gameCardImage.tsx).
 */
export function cardTitleSize(title: string, shape: GameCardShape): number {
  const n = [...title].length;
  const k = shape === "1x1" ? 1.22 : shape === "4x3" ? 1.1 : 1;
  const bySize = Math.round((n <= 18 ? 96 : n <= 28 ? 80 : n <= 42 ? 64 : 54) * k);
  const longest = Math.max(1, ...title.split(/[ \u200b\u2013\u2014-]+/u).map((w) => [...w].length));
  const line = GAME_CARD_SHAPES[shape].width - 2 * GAME_CARD_PADDING[shape][1];
  return Math.max(Math.round(54 * k), Math.min(bySize, Math.floor(line / (longest * EM_PER_CHAR))));
}

// What noto-sans-v27-latin-regular.ttf (next/dist/compiled/@vercel/og) has a glyph for, read from its cmap.
const COVERED = /^[ -~\u00a0-\u00ff\u0131\u0152\u0153\u02bb\u02bc\u02c6\u02da\u02dc\u2002\u2009\u200b\u2013\u2014\u2018-\u201a\u201c-\u201e\u2022\u2026\u2032\u2033\u2039\u203a\u2044\u2074\u20ac\u2122\u2212\u2215]$/u;
const covered = (ch: string) => COVERED.test(ch) && ch !== "\u00ad";

// Runs of white space but the no-break space (a time range keeps "7\u00a0PM" together).
const SPACES = /[^\S\u00a0]+/g;

/**
 * `raw` as the bundled font can draw it: spaces squashed (no-break ones kept), a Latin letter
 * with a mark the font lacks as its base letter ("Ā" -> "A"), anything
 * else it lacks (an emoji, a symbol) left out. lost: a letter or digit
 * had to go (another script), so the text is not what was typed.
 */
export function ogText(raw: string | null | undefined): { text: string; lost: boolean } {
  let text = "";
  let lost = false;
  for (const ch of String(raw ?? "").normalize("NFC").replace(SPACES, " ")) {
    if (covered(ch)) {
      text += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (base && [...base].every(covered)) {
      text += base;
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(ch)) lost = true;
  }
  return { text: text.replace(SPACES, " ").replace(/^ +| +$/g, ""), lost };
}

/** The drawable text, or null when the font cannot draw it whole. */
function drawable(raw: string | null | undefined): string | null {
  const { text, lost } = ogText(raw);
  return !lost && /[\p{L}\p{N}]/u.test(text) ? text : null;
}

/** At most `max` characters, the cut marked with an ellipsis: after a whole word when one ends in the last third. */
function clip(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  const cut = space >= Math.floor((max * 2) / 3) ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:\u00b7\u2013\u2014-]+$/, "")}\u2026`;
}

export type GameCardSpots = { text: string; kind: "open" | "full" | "closed" | "cancelled" };

export type GameCardFacts = {
  /** "Football", or "Game" when the sport cannot be drawn. */
  sport: string;
  /**
   * "FOOTBALL GAME", the pill at the top: uppercased here, never by the
   * renderer (textTransform), since a drawable letter's capital can be one
   * the font lacks ("µ" -> Greek "Μ", "ÿ" -> "Ÿ"), which next/og would
   * fetch from Google Fonts. "GAME" when the capitals cannot be drawn.
   */
  pill: string;
  /** The big line: the venue's name; its place when the name cannot be drawn; else "<Sport> game". */
  title: string;
  /** "Baner, Pune" under it (null when it is the title, or cannot be drawn). */
  place: string | null;
  /** "Sat 7 Nov · 7 – 9 PM". */
  when: string;
  spots: GameCardSpots;
};

export type CardGame = Pick<Game, "sport" | "date" | "start_time" | "end_time" | "current_players" | "max_players" | "status"> &
  Partial<Pick<Game, "turfs" | "venue_name" | "venue_address" | "venue_area" | "venue_city" | "venue_maps_url">>;

/** "5 spots left", "1 spot left", "Full"; "Joining closed" once played; "Cancelled". */
export function cardSpots(g: CardGame, now: number = Date.now()): GameCardSpots {
  if (g.status === "cancelled") return { text: "Cancelled", kind: "cancelled" };
  if (g.status === "completed" || isGameExpired(g, now)) return { text: "Joining closed", kind: "closed" };
  const max = Math.max(0, Math.floor(Number(g.max_players) || 0));
  const open = Math.max(0, max - Math.max(0, Math.floor(Number(g.current_players) || 0)));
  if (open === 0 || g.status === "full") return { text: "Full", kind: "full" };
  return { text: open === 1 ? "1 spot left" : `${open} spots left`, kind: "open" };
}

/** "Sat 7 Nov · 7 – 9 PM": the stored India date and time, never relative. */
export function cardWhen(g: Pick<Game, "date" | "start_time" | "end_time">, now: number = Date.now()): string {
  const day = g.date ? formatGameDay(g.date, now).plain : "";
  const time = g.start_time ? formatTimeRange(g.start_time, g.end_time) : "";
  return [day, time].filter(Boolean).join(" \u00b7 ");
}

/** Everything the card draws, each line already drawable in the bundled font. */
export function gameCardFacts(g: CardGame, now: number = Date.now()): GameCardFacts {
  const sport = drawable(sportLabel(g.sport)) ?? "Game";
  // "Football game"; just "Game" when the sport is (never "Game game").
  const kind = (s: string) => (s === "Game" ? s : `${s} game`);
  const v = gameVenue(g);
  const name = v ? drawable(v.name) : null;
  const place = v ? drawable(venuePlace(v)) : null;
  const title = clip(name ?? place ?? kind(sport), 64);
  const short = clip(sport, 24);
  return {
    sport: short,
    pill: drawable(kind(short).toUpperCase()) ?? "GAME",
    title,
    place: name && place ? clip(place, 56) : null,
    when: ogText(cardWhen(g, now)).text,
    spots: cardSpots(g, now),
  };
}

/** The card's version: FNV-1a of the lines drawn and the template, in base 36 (the pill is the sport's, so the sport stands for it). */
export function gameCardVersion(f: GameCardFacts): string {
  const s = JSON.stringify([GAME_CARD_TEMPLATE, f.sport, f.title, f.place, f.when, f.spots.text, f.spots.kind]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGameId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

/** The card's path at that version: /api/og/game/<id>?v=<v>, /api/og/game/<id>/1x1?v=<v>. */
export function gameCardPath(id: string, shape: GameCardShape, version: string): string {
  return `/api/og/game/${encodeURIComponent(id)}${shape === "og" ? "" : `/${shape}`}?v=${version}`;
}

/** "Football at Kings Arena, Baner, Pune, Sat 7 Nov, 7 – 9 PM. 5 spots left." (the typed words, for alt text). */
export function gameCardAlt(g: CardGame, now: number = Date.now()): string {
  const v = gameVenue(g);
  const where = v ? [v.name, venuePlace(v)].filter(Boolean).join(", ") : "";
  const when = cardWhen(g, now).replace(/\u00a0/g, " ").replace(" \u00b7 ", ", ");
  return `${sportLabel(g.sport)}${where ? ` at ${where}` : " game"}${when ? `, ${when}` : ""}. ${cardSpots(g, now).text}.`;
}

export type GameShareImages = {
  /** For openGraph.images and twitter.images. */
  og: { url: string; width: number; height: number; alt: string; type: "image/png" };
  /** For the SportsEvent's image: 1200x630, 4:3 and 1:1, absolute www URLs. */
  jsonLd: string[];
};

/** The game's card URLs (absolute, https://www.tapturf.in), all at its current version. */
export function gameShareImages(id: string, g: CardGame, now: number = Date.now()): GameShareImages {
  const v = gameCardVersion(gameCardFacts(g, now));
  const url = (shape: GameCardShape) => `${SITE_URL}${gameCardPath(id, shape, v)}`;
  return {
    og: { url: url("og"), ...GAME_CARD_SHAPES.og, alt: gameCardAlt(g, now), type: "image/png" },
    jsonLd: [url("og"), url("4x3"), url("1x1")],
  };
}
