import type { Game } from "../../types/game";
import { SITE_URL } from "../seo/defaults";
import { firstName, formatGameDay, formatTimeRange, gameVenue, isGameExpired, skillInfo, turfInfo, venuePlace } from "../utils/game";
import { sportFamily, sportLabel } from "../utils/sport";

/**
 * A game's share card (GET /api/og/game/<id>, lib/og/gameCardImage.tsx;
 * drawn by lib/og/gameCardDesigns.tsx): what it says, which design is
 * live, the version its URLs carry, and those URLs. The game
 * page's og:image and twitter:image, and the image of its SportsEvent
 * JSON-LD there and on /games (lib/seo/gameJsonLd.ts).
 *
 * - It says the sport, the day and time as stored (India wall-clock, never
 *   converted, never "Today": a card is seen later than it is made), the
 *   venue (its TapTurf turf or the venue its host typed), the area and
 *   city, who is in of how many and the spots left, and what the game's
 *   own page says in public: the price each ("Free" or the rupees), the
 *   skill level, "Turf booked" when the host said so, and the host's first
 *   name. Never a confirmed friend's or a tagged player's name. No urgency
 *   ("Almost full" only with 1 or 2 spots left in a game mostly full),
 *   nothing invented; a full, played or cancelled game says so.
 * - Drawn only in the font next/og bundles (Noto Sans, Latin, one weight):
 *   a glyph it lacks makes next/og fetch a font from Google Fonts (or an
 *   emoji from a CDN) while it renders, so every line goes through ogText
 *   first, and a name it cannot draw whole (a Devanagari venue name) is
 *   left off, never drawn in part. The font has no rupee sign and no tick:
 *   the drawing makes both as shapes (lib/og/gameCardArt.tsx).
 * - The version is a hash of every line drawn, the template and the
 *   design, so a URL names one picture: when spots change, the URL changes, and share
 *   previews and Google fetch the new one. The route draws a URL's picture
 *   only while its version is current (an older one redirects to the
 *   current), so a long cache is safe.
 *
 * Pure (relative imports), so node --test runs it (npm run test:seo).
 */

/** Bump when the drawing changes, so every card URL changes with it. */
export const GAME_CARD_TEMPLATE = 2;

/** The card's designs (lib/og/gameCardDesigns.tsx): a night turf, b match ticket, c matchday poster. */
export type GameCardDesign = "a" | "b" | "c";

/** The design that is live: change this one line to switch (it is in the version, so every card URL changes with it). */
export const CARD_DESIGN: GameCardDesign = "a";

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

// Advance widths of the bundled Noto Sans, U+0020 to U+007E, in 1/1000 em (its hmtx).
const ASCII_EM = [
  260, 269, 408, 646, 572, 831, 732, 225, 300, 300, 551, 572, 268, 322, 268, 372, 572, 572, 572, 572, 572, 572, 572, 572, 572, 572, 268, 268, 572,
  572, 572, 434, 899, 639, 650, 632, 730, 556, 519, 728, 741, 339, 273, 619, 524, 907, 760, 781, 605, 781, 622, 549, 556, 731, 600, 930, 586, 566,
  572, 329, 372, 329, 572, 444, 281, 561, 615, 480, 615, 564, 344, 615, 618, 258, 258, 534, 258, 935, 618, 605, 615, 615, 413, 479, 361, 618, 508,
  786, 529, 510, 470, 380, 551, 380, 572,
];
// The few others the card's own lines use; any other letter is taken as a wide capital.
const OTHER_EM: Record<string, number> = { "\u00a0": 260, "\u00b7": 268, "\u2013": 500, "\u2014": 1000, "\u2026": 791 };

/** How wide `text` is in em in the bundled font; `track` em more per character (letter spacing, or the stroke that makes it bold). */
export function textEm(text: string, track = 0): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    w += (c >= 0x20 && c <= 0x7e ? ASCII_EM[c - 0x20] : (OTHER_EM[ch] ?? 760)) / 1000 + track;
  }
  return w;
}

/**
 * The font size for `text` in a box `width` px wide: `max`, smaller (to
 * `min` at most) until the whole of it fits on `lines` lines (1 unless
 * said) and its longest word on one, so a typed name without spaces
 * ("PlayArenaSportsHub") stays whole on the card instead of running off
 * its edge. A text still too long at `min` wraps inside its box, which
 * the drawing clamps (wordBreak and lineClamp in gameCardDesigns.tsx).
 */
export function fitSize(text: string, o: { width: number; max: number; min: number; lines?: number; track?: number }): number {
  const lines = Math.max(1, o.lines ?? 1);
  const longest = Math.max(0.01, ...text.split(/[ \u200b\u2013\u2014-]+/u).map((w) => textEm(w, o.track)));
  // Lines break at spaces, so each after the first loses up to a word's end: a tenth of the width.
  const room = lines === 1 ? o.width : o.width * lines * 0.9;
  const size = Math.min(o.width / longest, room / Math.max(0.01, textEm(text, o.track)));
  return Math.max(o.min, Math.min(o.max, Math.floor(size)));
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

export type GameCardSpots = {
  /** "5 spots left", "1 spot left", "Full"; "Joining closed" once played; "Cancelled". */
  text: string;
  kind: "open" | "full" | "closed" | "cancelled";
  /** Players in (never more than max) and the game's size: the meter's filled and all dots. */
  in: number;
  max: number;
  /** "11 of 14 in"; "11 of 14 joined" once played; null when the game has no size or is cancelled. */
  count: string | null;
  /** "Almost full": 1 or 2 spots left and they are a quarter of the game or less (never 1 of 2, or 2 of 4). Else null. */
  note: string | null;
};

/** Which sport's lines and ball the card draws (lib/og/gameCardArt.tsx); turf: plain mown turf, for any other sport. */
export type GameCardArt = "football" | "cricket" | "badminton" | "tennis" | "pickleball" | "volleyball" | "basketball" | "turf";

export type GameCardFacts = {
  /** "Football", or "Game" when the sport cannot be drawn. */
  sport: string;
  /**
   * "BOX CRICKET", the card's big label: uppercased here, never by the
   * renderer (textTransform), since a drawable letter's capital can be one
   * the font lacks ("µ" -> Greek "Μ", "ÿ" -> "Ÿ"), which next/og would
   * fetch from Google Fonts. "GAME" when the capitals cannot be drawn.
   */
  label: string;
  art: GameCardArt;
  /** The venue's name; its place when the name cannot be drawn; else "<Sport> game". */
  title: string;
  /** "Baner, Pune" under it (null when it is the title, or cannot be drawn). */
  place: string | null;
  /** "Sat 7 Nov" and "7 – 9 PM": the stored India day and time, never relative. */
  day: string;
  time: string;
  spots: GameCardSpots;
  /** "Free", or the rupees each as digits ("150", "1,200": the drawing puts its own rupee sign before them); null when the row has no price. */
  price: string | null;
  /** "All levels", "Beginners", "Intermediate", "Advanced"; null when the row has no level. */
  skill: string | null;
  /** "Turf booked" ("Venue booked" at a typed venue) when the host said so, as the game page says it; else null. */
  booked: string | null;
  /** The host's first name, for "Hosted by Asha"; null when there is none or it cannot be drawn. Nobody else is ever named. */
  host: string | null;
};

export type CardGame = Pick<Game, "sport" | "date" | "start_time" | "end_time" | "current_players" | "max_players" | "status"> &
  Partial<Pick<Game, "turfs" | "venue_name" | "venue_address" | "venue_area" | "venue_city" | "venue_maps_url" | "price_per_player" | "skill_level" | "turf_booked" | "host_name">>;

/** Who is in and what is left: "11 of 14 in" and "3 spots left", "Full", "Joining closed" once played, "Cancelled". */
export function cardSpots(g: CardGame, now: number = Date.now()): GameCardSpots {
  const max = Math.max(0, Math.floor(Number(g.max_players) || 0));
  const cur = Math.min(max, Math.max(0, Math.floor(Number(g.current_players) || 0)));
  const base = { in: cur, max, note: null };
  if (g.status === "cancelled") return { ...base, text: "Cancelled", kind: "cancelled", count: null };
  if (g.status === "completed" || isGameExpired(g, now)) {
    return { ...base, text: "Joining closed", kind: "closed", count: max ? `${cur} of ${max} joined` : null };
  }
  const count = max ? `${cur} of ${max} in` : null;
  const open = max - cur;
  if (open === 0 || g.status === "full") return { ...base, text: "Full", kind: "full", count };
  return { ...base, text: open === 1 ? "1 spot left" : `${open} spots left`, kind: "open", count, note: open <= 2 && open * 4 <= max ? "Almost full" : null };
}

/** "Sat 7 Nov": the stored India date, never relative. */
export function cardDay(g: Pick<Game, "date">, now: number = Date.now()): string {
  return g.date ? formatGameDay(g.date, now).plain : "";
}

/**
 * A drawn day ("Sat 7 Nov", "Sat 2 Jan 2027") as a calendar tile's three
 * lines, in capitals made here (plain Latin letters, so the font has
 * them): "SAT", "7", "NOV" or "JAN 2027". null for anything else.
 */
export function cardDayParts(day: string): { weekday: string; dom: string; month: string } | null {
  const m = /^([A-Za-z]{3}) (\d{1,2}) ([A-Za-z]{3})( \d{4})?$/.exec(day);
  return m ? { weekday: m[1].toUpperCase(), dom: m[2], month: `${m[3].toUpperCase()}${m[4] ?? ""}` } : null;
}

/** "7 – 9 PM": the stored India time. */
export function cardTime(g: Pick<Game, "start_time" | "end_time">): string {
  return g.start_time ? formatTimeRange(g.start_time, g.end_time) : "";
}

/** "Sat 7 Nov · 7 – 9 PM", for the alt text. */
export function cardWhen(g: Pick<Game, "date" | "start_time" | "end_time">, now: number = Date.now()): string {
  return [cardDay(g, now), cardTime(g)].filter(Boolean).join(" \u00b7 ");
}

/** The sport's drawing: its own court or pitch, or plain turf (table tennis has no court to draw). */
export function cardArt(sport: string | null | undefined): GameCardArt {
  const s = String(sport ?? "").toLowerCase();
  const family = sportFamily(s);
  if (family === "cricket" || family === "football" || family === "basketball") return family;
  if (family !== "court" || s.includes("table")) return "turf";
  if (s.includes("badminton")) return "badminton";
  if (s.includes("pickleball")) return "pickleball";
  if (s.includes("volleyball")) return "volleyball";
  return "tennis";
}

/** The longest first name "Hosted by" takes. */
const HOST_MAX = 16;

/** "Free", "150", "1,200" (rupees each, grouped the Indian way); null when the row has no price. */
function cardPrice(price: number | string | null | undefined): string | null {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return n === 0 ? "Free" : (Math.round(n * 100) / 100).toLocaleString("en-IN");
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
  // The host's first name whole or not at all: one too long for its line is left off, never cut.
  const first = g.host_name ? firstName(g.host_name) : "the host";
  const host = first === "the host" ? null : drawable(first);
  return {
    sport: short,
    label: drawable(short.toUpperCase()) ?? "GAME",
    art: cardArt(g.sport),
    title,
    place: name && place ? clip(place, 56) : null,
    day: ogText(cardDay(g, now)).text,
    time: ogText(cardTime(g)).text,
    spots: cardSpots(g, now),
    price: drawable(cardPrice(g.price_per_player)),
    skill: g.skill_level === undefined || g.skill_level === null ? null : skillInfo(g.skill_level).chip,
    booked: g.turf_booked === true ? turfInfo(true, v?.listed ?? true).title : null,
    host: host && [...host].length <= HOST_MAX ? host : null,
  };
}

/** The card's version: FNV-1a of what is drawn, the template and the design, in base 36 (the label and the drawing are the sport's, the note the spots', so those stand for them). */
export function gameCardVersion(f: GameCardFacts, design: GameCardDesign = CARD_DESIGN): string {
  const s = JSON.stringify([
    GAME_CARD_TEMPLATE, design, f.sport, f.title, f.place, f.day, f.time,
    f.spots.text, f.spots.kind, f.spots.in, f.spots.max, f.price, f.skill, f.booked, f.host,
  ]);
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
