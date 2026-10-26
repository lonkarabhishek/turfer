import { ASPECT_ORDER, ASPECTS, isAspect, isWhen, MAX_ASPECTS, MAX_TAGS, SPORT_ROWS, sportRow, type AspectId, type Score } from "./catalog";
import { cleanText, NOTE_MAX, TIP_MAX } from "./screen";
import type { Aspects, ReportBody, ReportChannel } from "./types";

/**
 * A report body as the browser sent it, checked and put in the shape the
 * database takes (review_save checks it all again). Pure.
 *
 * Unknown parts and chips are dropped (a catalogue change on the server
 * before the page reloads must not lose a report), and so are rows the
 * sheet would never show: Lights without an evening or night game, a sport
 * row for another sport. Anything malformed is "bad".
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

const CHANNELS: ReportChannel[] = ["turf_page", "link", "edit"];
const isScore = (x: unknown): x is Score => x === -1 || x === 0 || x === 1;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export const PRICE_MIN = 100;
export const PRICE_MAX = 20_000;

export type ParsedReport = { ok: ReportBody } | { bad: string };

/**
 * The scorecard: known parts only, chips that match the score, at most 3,
 * at most one sport row and 6 parts. keepRows: a stored one, read as it is
 * (its Lights and sport row were checked when it was saved).
 */
export function parseAspects(raw: unknown, sport: string | null, when: string | null, opts: { keepRows?: boolean } = {}): Aspects | null | "bad" {
  if (raw == null) return null;
  if (!isObj(raw)) return "bad";
  const out: Aspects = {};
  const wantRow = sportRow(sport);
  let sportRows = 0;
  for (const key of ASPECT_ORDER) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!isObj(v) || !isScore(v.score)) return "bad";
    if (v.tags !== undefined && !Array.isArray(v.tags)) return "bad";
    if (!opts.keepRows && key === "lights" && when !== "evening" && when !== "night") continue;
    if (SPORT_ROWS.includes(key) && (opts.keepRows ? ++sportRows > 1 : key !== wantRow)) continue;
    const allowed = v.score === 1 ? ASPECTS[key].great : v.score === -1 ? ASPECTS[key].needs : [];
    const tags = [...new Set((v.tags ?? []).filter((t): t is string => typeof t === "string"))]
      .filter((t) => allowed.some((a) => a.id === t))
      .slice(0, MAX_TAGS);
    out[key] = tags.length ? { score: v.score, tags } : { score: v.score };
  }
  const keys = Object.keys(out) as AspectId[];
  if (keys.length > MAX_ASPECTS) return "bad";
  return keys.length ? out : null;
}

export function parseReport(body: Record<string, unknown> | null): ParsedReport {
  if (!body) return { bad: "body" };
  const { turf_id, rating } = body;
  if (!isUuid(turf_id)) return { bad: "turf_id" };
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return { bad: "rating" };

  let sport: string | null = null;
  if (body.sport != null) {
    if (typeof body.sport !== "string" || !body.sport.trim() || body.sport.length > 40) return { bad: "sport" };
    sport = body.sport;
  }
  let when: ReportBody["played_when"] = null;
  if (body.played_when != null) {
    if (!isWhen(body.played_when)) return { bad: "played_when" };
    when = body.played_when;
  }
  let again: Score | null = null;
  if (body.play_again != null) {
    if (!isScore(body.play_again)) return { bad: "play_again" };
    again = body.play_again;
  }
  const aspects = parseAspects(body.aspects, sport, when);
  if (aspects === "bad") return { bad: "aspects" };

  let comment: string | null = null;
  if (body.comment != null) {
    if (typeof body.comment !== "string") return { bad: "comment" };
    comment = cleanText(body.comment);
    if (comment && comment.length > TIP_MAX) return { bad: "comment" };
  }

  let note: ReportBody["note"];
  if (body.note !== undefined) {
    if (!isObj(body.note)) return { bad: "note" };
    const nb = body.note.body;
    if (nb != null && typeof nb !== "string") return { bad: "note" };
    const clean = cleanText(nb as string | null);
    if (clean && clean.length > NOTE_MAX) return { bad: "note" };
    note = { body: clean, show_name: body.note.show_name === true };
  }

  let price: number | null = null;
  if (body.price_paid != null) {
    const p = body.price_paid;
    if (typeof p !== "number" || !Number.isInteger(p) || p < PRICE_MIN || p > PRICE_MAX) return { bad: "price_paid" };
    price = p;
  }

  const channel = CHANNELS.includes(body.channel as ReportChannel) ? (body.channel as ReportChannel) : "turf_page";
  const ms = typeof body.ms === "number" && Number.isInteger(body.ms) && body.ms >= 0 && body.ms <= 600_000 ? body.ms : undefined;

  const out: ReportBody = { turf_id, rating, sport, played_when: when, aspects, play_again: again, comment, channel };
  if (note) out.note = note;
  if (price != null) out.price_paid = price;
  if (ms !== undefined) out.ms = ms;
  return { ok: out };
}
