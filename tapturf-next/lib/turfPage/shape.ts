import type { Game } from "../../types/game";
import type { ReviewSummary, ReviewWithUser } from "../../types/review";
import type { TurfSuggestion } from "../queries/suggestions";

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

/** Latest reviews, players' own first; who upvoted is per viewer, so false here. */
export function shapeReviews(raw: unknown): ReviewWithUser[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.filter(isObj).filter((r) => typeof r.id === "string");
  return rows
    .map((r) => ({
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
