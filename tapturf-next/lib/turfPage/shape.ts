import type { Game } from "../../types/game";
import type { ReviewSummary, ReviewWithUser } from "../../types/review";
import type { TurfSuggestion } from "../queries/suggestions";
import { isAspect, isWhen } from "../reviews/catalog";
import { parseAspects } from "../reviews/payload";
import type { AspectCount, PlayAgainCounts, ReportFields } from "../reviews/types";

/**
 * Shapes the parts of public.turf_page (one call per turf page render,
 * supabase/migrations/20261020_turf_page.sql) that the page hands to its
 * client components. Pure, so the server loader and the tests share it.
 * Anything malformed becomes "nothing to show", never a crash.
 */

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * What one turf_page call means for the page. Only a null result is "no
 * such turf" (no active row matches the key) and gives a 404, which is
 * cached for a day. Everything else throws: an RPC error, which includes
 * the 5 s guard timeout and the open breaker (supabase-js hands those
 * back as `error`), and a payload without a turf object, such as after a
 * change to the function's shape. A throw keeps the last good page on a
 * revalidation and gives a 500 on a first render, which Google retries.
 * Until 20 Oct a failed read returned null here, and an outage cached
 * 404s for some 120 live turf pages.
 */
export function turfPagePayload(res: { data: unknown; error: { message: string } | null }, key: string): Raw | null {
  if (res.error) throw new Error(`turf_page failed for ${key}: ${res.error.message}`);
  // "No such turf" is said in so many words (20261026_turf_page_found.sql). A bare null is
  // also what an empty reply reads as, so it is a failure, never a 404.
  if (isObj(res.data) && res.data.found === false && !("turf" in res.data)) return null;
  if (res.data === null) throw new Error(`turf_page sent nothing for ${key}`);
  if (!isObj(res.data) || !isObj(res.data.turf)) {
    throw new Error(`turf_page sent no turf for ${key}: ${Array.isArray(res.data) ? "array" : typeof res.data}`);
  }
  return res.data;
}

/**
 * A game report's own fields (20261027_game_reports.sql), copied only when
 * the payload has them, so an older payload shapes exactly as before. A
 * malformed scorecard is dropped, never shown half-read.
 */
export function shapeReportFields(r: Raw): ReportFields {
  const out: ReportFields = {};
  if ("sport" in r) out.sport = str(r.sport);
  if ("played_when" in r) out.played_when = isWhen(r.played_when) ? r.played_when : null;
  if ("aspects" in r) {
    // The stored scorecard as it is: Lights and the sport row were checked when it was saved.
    const a = parseAspects(r.aspects, null, null, { keepRows: true });
    out.aspects = a === "bad" ? null : a;
  }
  if ("play_again" in r) out.play_again = r.play_again === -1 || r.play_again === 0 || r.play_again === 1 ? r.play_again : null;
  if ("verified_via" in r) out.verified_via = r.verified_via === "game" || r.verified_via === "booking" ? r.verified_via : null;
  if ("edited_at" in r) out.edited_at = str(r.edited_at);
  return out;
}

/** Latest reviews, players' own first; who upvoted is per viewer, so false here. */
export function shapeReviews(raw: unknown): ReviewWithUser[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.filter(isObj).filter((r) => typeof r.id === "string");
  return rows
    .map((r) => ({
      ...shapeReportFields(r),
      id: r.id as string,
      user_id: str(r.user_id) ?? "",
      turf_id: str(r.turf_id) ?? "",
      booking_id: null,
      rating: num(r.rating),
      comment: str(r.comment),
      created_at: str(r.created_at),
      updated_at: null,
      source: str(r.source),
      author_name: str(r.author_name),
      author_url: str(r.author_url),
      source_url: str(r.source_url),
      source_date_label: str(r.source_date_label),
      user_name: str(r.user_name),
      user_avatar: str(r.user_avatar),
      upvotes: num(r.upvotes),
      viewer_has_upvoted: false,
    }))
    .sort((a, b) => Number(!!a.source) - Number(!!b.source));
}

export function zeroReviewSummary(): ReviewSummary {
  return { count: 0, average: 0, histogram: [0, 0, 0, 0, 0] };
}

/** In-app review count, average and 1 to 5 star histogram. */
export function shapeReviewStats(raw: unknown): ReviewSummary {
  if (!isObj(raw)) return zeroReviewSummary();
  const count = num(raw.count);
  const h = Array.isArray(raw.histogram) ? raw.histogram.map(num) : [];
  if (count <= 0 || h.length !== 5) return zeroReviewSummary();
  return {
    count,
    average: Math.round(num(raw.average) * 10) / 10,
    histogram: [h[0], h[1], h[2], h[3], h[4]],
  };
}

/**
 * How each part of the turf was rated (turf_page review_aspects): every
 * part rated in the last 12 months, with its chips. The page decides what
 * is enough to show (lib/reviews/insights.ts). Missing on an older payload: [].
 */
export function shapeReviewAspects(raw: unknown): AspectCount[] {
  if (!Array.isArray(raw)) return [];
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const out: AspectCount[] = [];
  for (const a of raw.filter(isObj)) {
    const n = int(a.n);
    const great = int(a.great);
    const okay = int(a.okay);
    const needs = int(a.needs_work);
    if (!isAspect(a.aspect) || !n || great == null || okay == null || needs == null) continue;
    const tags = (Array.isArray(a.tags) ? a.tags : [])
      .filter(isObj)
      .filter((t) => typeof t.tag === "string" && (t.sign === 1 || t.sign === -1) && !!int(t.n))
      .map((t) => ({ tag: t.tag as string, sign: t.sign as 1 | -1, n: t.n as number }));
    out.push({ aspect: a.aspect, n, great, okay, needs_work: needs, tags });
  }
  return out;
}

/** [no, maybe, yes] from review_stats.play_again; null on an older payload or junk. */
export function shapePlayAgain(rawStats: unknown): PlayAgainCounts | null {
  if (!isObj(rawStats) || !Array.isArray(rawStats.play_again) || rawStats.play_again.length !== 3) return null;
  const [no, maybe, yes] = rawStats.play_again.map(num);
  return [no, maybe, yes];
}

/** Same rows and masking as get_turf_suggestions, with the defaults getTurfSuggestions applies. */
export function shapeSuggestions(raw: unknown): TurfSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .filter((s) => typeof s.id === "string")
    .map((s) => ({
      ...(s as unknown as TurfSuggestion),
      submitter_name: str(s.submitter_name) ?? "A player",
      sports: strings(s.sports),
      amenities: strings(s.amenities),
      edit_count: num(s.edit_count),
    }));
}

/**
 * Upcoming games at this turf. GameCard reads the venue from game.turfs,
 * which the page already knows. The RPC leaves host_phone out; it is
 * dropped here too in case an older function version still sends it.
 */
export function shapeGames(raw: unknown, venue: { id: string; name: string; address: string }): Game[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .filter((g) => typeof g.id === "string")
    .map((g) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { host_phone, ...rest } = g;
      return { ...(rest as unknown as Game), turfs: { id: venue.id, name: venue.name, address: venue.address } };
    });
}

/** The city's live trending pick when it is this turf, in this turf's city. */
export function trendingFor(raw: unknown, turfCity: string | null): { city: string; tagline: string | null } | null {
  if (!isObj(raw) || !turfCity) return null;
  const city = str(raw.city);
  if (!city || city !== turfCity) return null;
  return { city, tagline: str(raw.tagline) };
}
