import { gameVenue } from "./game";

/**
 * A game's page: /game/<words>-<code>, for example
 * /game/football-dn-parande-dhanori-pune-sat-15-nov-7pm-4b63fb76.
 *
 * - words: the sport, the venue's name (its turf's, or the one its host
 *   typed), its area and city (each left out when the words before already
 *   say it), the India day ("sat-15-nov") and start time ("7pm",
 *   "7-30pm", "12am"); lower case, ascii, hyphens. They are for people and
 *   search engines only.
 * - code: the first 8 hex characters of the game's id. The page finds the
 *   game by the code alone (app/game/[id]/page.tsx, lib/queries/games.server.ts
 *   getGameByParam), so a game whose venue, day or time is edited keeps
 *   every link ever shared: old words answer 308 to the current ones, as
 *   does the old /game/<uuid>.
 * - Two games sharing a code (none on 12 Nov 2026; about 1 in 100 by
 *   10,000 games): the page's URL for each ends in its whole id instead
 *   (/game/<words>-<uuid>), and a link with the short code goes to the
 *   game whose words it has (resolveGameParam).
 *
 * Only the page URL: every API route, /api/og/game/<id>, tournaments and
 * /tools/turf-session?game=<id> keep the id.
 *
 * Links, share text, the sitemap, the canonical and JSON-LD all come
 * through gamePath / gameUrl, never `/game/${id}` by hand. A caller that
 * has only the id (a notification, a push, a request row) passes { id }:
 * that link is /game/<uuid>, which the page 308s to the readable URL.
 *
 * Pure (relative imports), so node --test runs it (npm run test:game).
 */

const SITE = "https://www.tapturf.in";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORDS_UUID = /^([a-z0-9-]*?)-?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const WORDS_CODE = /^(?:([a-z0-9-]*?)-)?([0-9a-f]{8})$/;

/** What a game's words are made from: a Game, a card's game, an email's game. */
export type GamePathSource = {
  id: string;
  sport?: string | null;
  /** YYYY-MM-DD, India time, as stored. */
  date?: string | null;
  /** HH:MM[:SS], India time, as stored. */
  start_time?: string | null;
  turf_id?: string | null;
  turfs?: { name?: string | null; address?: string | null; area?: string | null; city?: string | null } | null;
  venue_name?: string | null;
  venue_area?: string | null;
  venue_city?: string | null;
};

const MAX_SPORT = 20;
const MAX_VENUE = 36;
const MAX_PLACE = 20;

/** Lower case ascii words joined by hyphens, at most `max` characters, cut between words. */
export function slugWords(text: string | null | undefined, max: number): string {
  const s = String(text ?? "")
    // Accents off their letters (é -> e); what is still not ascii (Devanagari, emoji) drops out below.
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf("-");
  return (at > 0 ? cut.slice(0, at) : s.slice(0, max)).replace(/-+$/, "");
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-11-15" -> "sat-15-nov": the stored India day as it is, whatever the server's or the browser's time zone. */
export function dayWords(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  // A day the calendar has not (2026-02-31) names nothing.
  if (!Number.isFinite(t) || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return "";
  return `${DAYS[d.getUTCDay()]}-${+m[3]}-${MONTHS[+m[2] - 1]}`;
}

/** "19:00" -> "7pm", "19:30:00" -> "7-30pm", "00:00" -> "12am", "12:00" -> "12pm". */
export function timeWords(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return "";
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return "";
  return `${h % 12 || 12}${min ? `-${m[2]}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** Whether `part`'s words are already in `words`, whole ("pune" in "turf-up-pune", not in "punekar-turf"). */
function says(words: string, part: string): boolean {
  return `-${words}-`.includes(`-${part}-`);
}

/** The words of a game's URL, without its code: "football-dn-parande-dhanori-pune-sat-15-nov-7pm". */
export function gameWords(g: GamePathSource): string {
  const place = gameVenue(g as Parameters<typeof gameVenue>[0]);
  const parts: string[] = [];
  const add = (w: string) => {
    if (w && !says(parts.join("-"), w)) parts.push(w);
  };
  parts.push(slugWords(g.sport, MAX_SPORT) || "game");
  // The venue's own name always, even when it starts with the sport ("Cricket Hub").
  const venue = slugWords(place?.name, MAX_VENUE);
  if (venue) parts.push(venue);
  add(slugWords(place?.area, MAX_PLACE));
  add(slugWords(place?.cityLabel, MAX_PLACE));
  const day = dayWords(g.date);
  if (day) parts.push(day);
  const time = timeWords(g.start_time);
  if (time) parts.push(time);
  return parts.join("-");
}

/** The first 8 hex characters of a game's id, or "" when it is not a uuid. */
export function gameCode(id: string | null | undefined): string {
  const s = String(id ?? "").toLowerCase();
  return UUID.test(s) ? s.slice(0, 8) : "";
}

/** The first and last id a code can be the start of: the page's lookup is a range on the primary key. */
export function codeRange(code: string): { from: string; to: string } {
  return { from: `${code}-0000-0000-0000-000000000000`, to: `${code}-ffff-ffff-ffff-ffffffffffff` };
}

/**
 * The game page's own path, always with words (the page's canonical).
 * `whole`: ending in the whole id, for a game that shares its code with
 * another.
 */
export function gameSlugPath(g: GamePathSource, { whole = false }: { whole?: boolean } = {}): string {
  const id = String(g.id ?? "").toLowerCase();
  const code = gameCode(id);
  // Not a uuid (never from the database): the link as it always was.
  if (!code) return `/game/${encodeURIComponent(String(g.id ?? ""))}`;
  return `/game/${gameWords(g)}-${whole ? id : code}`;
}

/**
 * Whether these fields are enough to say the game's words as its page
 * does: its sport, day and time, and its venue (a typed one is on the
 * row; a turf's needs the turf). Without them a link is /game/<uuid>.
 */
function knowsWords(g: GamePathSource): boolean {
  if (!g.sport || !dayWords(g.date) || !timeWords(g.start_time)) return false;
  if (g.turfs?.name) return true;
  // A turf's game whose turf is not here: the page would name the venue, this could not.
  if (g.turf_id) return false;
  // A typed venue, or a game known to have no turf: turf_id must be on the row (null), not just missing.
  return g.turf_id === null || Boolean(g.venue_name?.trim());
}

/** The link to a game's page: the readable URL when the game is known, else /game/<uuid> (which redirects to it). */
export function gamePath(g: GamePathSource): string {
  return knowsWords(g) ? gameSlugPath(g) : `/game/${encodeURIComponent(String(g.id ?? "").toLowerCase())}`;
}

/** The same, absolute on the live site. */
export function gameUrl(g: GamePathSource): string {
  return `${SITE}${gamePath(g)}`;
}

/** What a /game/<param> names: a whole id, or a code, each with the words that came with it. */
export type GameParam = { code: string; id: string | null; words: string };

/** Reads /game/<param>: a uuid, <words>-<uuid>, <words>-<code> or a bare code; null for anything else. */
export function parseGameParam(param: string): GameParam | null {
  let p = param;
  try {
    p = decodeURIComponent(param);
  } catch {
    return null;
  }
  if (p.length > 200) return null;
  p = p.toLowerCase();
  const whole = WORDS_UUID.exec(p);
  if (whole) return { code: whole[2].slice(0, 8), id: whole[2], words: whole[1] };
  const short = WORDS_CODE.exec(p);
  if (short) return { code: short[2], id: null, words: short[1] ?? "" };
  return null;
}

/** How many of the URL's words a game's current words have. */
function overlap(urlWords: string, gameWordsNow: string): number {
  const have = new Set(gameWordsNow.split("-"));
  return [...new Set(urlWords.split("-"))].filter((w) => w && have.has(w)).length;
}

export type GameCandidate = GamePathSource & { created_at?: string | null };

/**
 * Which game a /game/<param> is, and where it should be.
 *
 * `candidates`: every game whose id starts with the param's code (one,
 * but for a shared code), each with its turf.
 * - A whole id in the param: that game or none.
 * - A code one game has: that game, whatever the words say.
 * - A code two or more games share: the game whose current words have
 *   the most of the URL's words (an edit changes a few, never all); a tie
 *   goes to the oldest (the code was its alone first), then the lower id.
 * `redirect`: the game's current path when the param is anything else
 * (the old uuid link, old words, capitals, a bare code), else null. A
 * game that shares its code lives at its whole-id path.
 */
export function resolveGameParam<T extends GameCandidate>(param: string, candidates: readonly T[]): { game: T; path: string; redirect: string | null } | null {
  const parsed = parseGameParam(param);
  if (!parsed) return null;
  const same = candidates.filter((c) => gameCode(c.id) === parsed.code);
  let game: T | undefined;
  if (parsed.id) {
    game = same.find((c) => c.id.toLowerCase() === parsed.id);
  } else {
    game = [...same].sort(
      (a, b) =>
        overlap(parsed.words, gameWords(b)) - overlap(parsed.words, gameWords(a)) ||
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
        a.id.localeCompare(b.id),
    )[0];
  }
  if (!game) return null;
  const path = gameSlugPath(game, { whole: same.length > 1 });
  return { game, path, redirect: `/game/${param}` === path ? null : path };
}
