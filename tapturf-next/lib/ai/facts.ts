import { areaFor } from "../utils/area";
import { labelFor } from "../city";
import { getPhone, getWhatsAppPhone } from "../utils/seo";
import { normaliseOpeningHours, formatSpan } from "../utils/hours";
import { priceUnitSuffix } from "../utils/prices";
import { ownerPriceNote } from "../turfPage/owner";
import { googleMapsUrl, priceFigures, publicLink, scrubBookingApps } from "../utils/bookingApps";
import { ASPECT_ORDER, aspectShort } from "../reviews/catalog";
import { barWords, pickChips } from "../reviews/insights";
import { playersSayOf } from "../reviews/playersSay";
import type { AspectCount, Aspects, PlayAgainCounts } from "../reviews/types";
import type { Turf } from "../../types/turf";

/**
 * The fact sheet Ask's compare and question answers are written from
 * (lib/ai/compare.ts): everything the model may say about a venue, and
 * nothing else. Pure, relative imports only, so npm run test:ask compiles it.
 *
 * What people say comes in three parts, each said as whose it is:
 * - tapturf_reports: TapTurf players' own live reports (turf_page's
 *   review_stats, review_aspects and reviews), their stars, would play
 *   again, the scorecard and their latest tips.
 * - google: the venue's Google rating and count, and whether the page links
 *   to the Google reviews.
 * - players_say: TapTurf's summary of a few written reviews (Google's or
 *   TapTurf's, per its sources), as the page's "What players say" shows it,
 *   and only while the live reports still back it (lib/reviews/playersSay.ts
 *   backedBy); google_reviews: the Google review texts TapTurf holds, apart
 *   from the players' own.
 * - google_reviewers_reported_prices: the figures Google reviewers wrote,
 *   apart from reported_prices_unverified (a listing's rate grid and other
 *   pages), which are nobody's words.
 */

/** Everything the model may say about a venue. */
export type TurfFacts = Record<string, unknown>;

/** A review row as Ask reads it: turf_page's (live only), or any row that says its status. */
export type FactsReview = {
  rating: number;
  comment: string | null;
  /** null: a TapTurf player's report; "google": an imported Google review. */
  source?: string | null;
  /** turf_page sends live rows only, without a status; a row whose status isn't live is never read. */
  status?: string | null;
  /** A TapTurf report's scorecard: with 2 or more rated parts it counts as written for the summary (writtenEnough). */
  aspects?: Aspects | null;
};

/** What turf_page holds about the venue's reviews (lib/queries/turfPage.ts). */
export type FactsReviews = {
  reviews?: readonly FactsReview[];
  /** TapTurf players' live reports: count and average (review_stats). */
  stats?: { count: number; average: number } | null;
  /** Each part's Great, Okay and Needs work over the last 12 months (review_aspects). */
  aspects?: readonly AspectCount[];
  /** Would play again [no, maybe, yes], last 12 months (review_stats.play_again). */
  playAgain?: PlayAgainCounts | null;
};

/** Up to this many of the players' latest tips, and of the Google texts. */
const TAPTURF_TIPS = 5;
const GOOGLE_TEXTS = 3;

/**
 * One line of review text, without any booking app; null when shorter
 * than min. A TapTurf player's tip counts from its first letter, as the
 * page shows any ("Nice turf"); a Google text from 11, as the summary pass
 * reads them.
 */
function reviewText(comment: string | null | undefined, max: number, min = 11): string | null {
  const s = scrubBookingApps(comment)?.replace(/\s+/g, " ").trim();
  return s && s.length >= min ? s.slice(0, max) : null;
}

/** "1,442" as the page writes Google's count (GoogleCard). */
const countWords = (n: number) => n.toLocaleString("en-IN");

/** TapTurf players' reports, or null before the first. */
function tapturfReports(t: Turf, r: FactsReviews, rows: readonly FactsReview[]): Record<string, unknown> | null {
  const own = rows.filter((x) => !x.source);
  const count = r.stats?.count ? r.stats.count : own.length;
  if (count <= 0) return null;
  const average = r.stats?.count ? r.stats.average : own.reduce((n, x) => n + x.rating, 0) / own.length;
  const out: Record<string, unknown> = { players: count, average_stars: (Math.round(average * 10) / 10).toFixed(1) };
  const [no, maybe, yes] = r.playAgain ?? [0, 0, 0];
  if (no + maybe + yes > 0) out.would_play_again = { yes, maybe, no };
  // The parts most rated, in the page's words ("Lights: 3 of 3 say great", its chips).
  const parts = [...(r.aspects ?? [])]
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || ASPECT_ORDER.indexOf(a.aspect) - ASPECT_ORDER.indexOf(b.aspect))
    .slice(0, 4)
    .map((c) => {
      const chips = pickChips(c.aspect, c.tags, 2).map((x) => `${x.label} (${x.n})`);
      return { part: aspectShort(c.aspect, null, t.sports), says: barWords(c).words, ...(chips.length ? { mentions: chips } : {}) };
    });
  if (parts.length) out.scorecard = parts;
  const tips = own.flatMap((x) => {
    const text = reviewText(x.comment, 240, 1);
    return text ? [{ stars: x.rating, text }] : [];
  });
  if (tips.length) out.recent = tips.slice(0, TAPTURF_TIPS);
  return out;
}

/**
 * `v10`: router v10's lines too (lib/ai/routerVersion.ts): whether the
 * page is Claimed (turf_page's claimed), whether the owner set the prices,
 * and how many photos it shows. Without it the sheet is v9's, key for key.
 */
export function buildFacts(t: Turf, r: FactsReviews = {}, v10?: { claimed: boolean }): TurfFacts {
  const unit = priceUnitSuffix(t, { short: true });
  const rates: Record<string, string> = {};
  const add = (k: string, v: number | null) => {
    if (v != null && v > 0) rates[k] = `₹${v}${unit}`;
  };
  add("weekday_morning", t.morning_price);
  add("weekday_afternoon", t.afternoon_price);
  add("weekday_evening", t.evening_price);
  add("weekend_morning", t.weekend_morning_price);
  add("weekend_afternoon", t.weekend_afternoon_price);
  add("weekend_evening", t.weekend_evening_price);

  const hoursRows = normaliseOpeningHours(t.opening_hours, { start_time: t.start_time, end_time: t.end_time, is_24x7: t.is_24x7 });
  const hours = t.is_24x7
    ? "Open 24 hours"
    : hoursRows.length
      ? [...new Set(hoursRows.map((r) => (r.closed ? "closed" : r.spans.map(formatSpan).join(", "))))].join(" / ")
      : null;

  // Reported prices as numbers only: a note's words said where it came
  // from ("booking-app listing: …"), and the sheet names no booking app.
  // priceFigures reads ₹-marked amounts and bare ones said as a price
  // ("Rates are 1000 per hour", "800/-"), as most Google quotes are.
  // What a Google reviewer wrote ("900 per hour charged. (Google review, 3
  // years ago)") apart from the rest (a listing's rate grid, a club's fee
  // page): only the first are what people say.
  const figures = (ms: NonNullable<Turf["price_mentions"]>) =>
    [...new Set(ms.flatMap((m) => (m.price_inr ? [`₹${m.price_inr}`] : priceFigures(m.text))))].slice(0, 4);
  const byReviewer = (m: NonNullable<Turf["price_mentions"]>[number]) => /\bgoogle review\b/i.test(m.text ?? "");
  const mentions = t.price_mentions ?? [];
  const reviewerPrices = figures(mentions.filter(byReviewer));
  const reported = figures(mentions.filter((m) => !byReviewer(m)));

  // Live rows only, whatever the caller read; the players' own apart from Google's.
  const rows = (r.reviews ?? []).filter((x) => x.status == null || x.status === "live");
  const rating = Number(t.rating) || 0;
  // The summary only while the live reports back it: a removed report's words never come back (when the rows are known).
  const said = playersSayOf(t.review_summary, r.reviews ? rows : undefined);
  const googleTexts = rows
    .filter((x) => x.source === "google")
    .flatMap((x) => {
      const text = reviewText(x.comment, 200);
      return text ? [{ stars: x.rating, text }] : [];
    })
    .slice(0, GOOGLE_TEXTS);

  // Every free-text field without booking apps (lib/utils/bookingApps.ts):
  // the model repeats what the sheet says.
  const facts: TurfFacts = {
    name: t.name,
    area: areaFor(t),
    city: t.city ? labelFor(t.city as never) : null,
    address: scrubBookingApps(t.address),
    sports: t.sports,
    // Said as the page says it (components/turf/OwnerPanel.tsx): who keeps the page, never a rating.
    ...(v10
      ? {
          claimed: v10.claimed
            ? "yes: the owner runs this page on TapTurf (the Claimed pill and TapTurf verified stamp); TapTurf checked the claim"
            : "no: no owner runs this page on TapTurf yet",
          // Only when the page says "From the owner" (ownerPriceNote: claimed, with the owner's real prices).
          prices_from_owner: ownerPriceNote(t, v10.claimed, Date.now()) ? "yes: the owner set these prices on TapTurf" : null,
          photos_on_tapturf: new Set([...(t.cover_image ? [t.cover_image] : []), ...(t.images ?? [])]).size,
        }
      : {}),
    tapturf_reports: tapturfReports(t, r, rows),
    // The rating with or without a count (a score alone is still one, as the page shows it);
    // reviews_link: the page links "Read them on Google" (Google Maps only).
    google:
      rating > 0
        ? {
            rating: rating.toFixed(1),
            reviews: t.total_reviews > 0 ? countWords(t.total_reviews) : null,
            reviews_link: googleMapsUrl(t.external_review_url) ? "yes" : "no",
          }
        : null,
    players_say: said
      ? {
          from: `${said.sources.join(" and ")} reviews`,
          written_reviews: said.based_on > 0 ? said.based_on : null,
          summary: said.summary || null,
          likes: said.likes.length ? said.likes : null,
          gripes: said.gripes.length ? said.gripes : null,
        }
      : null,
    google_reviews: googleTexts,
    rates: Object.keys(rates).length ? rates : null,
    reported_prices_unverified: reported.length ? reported : null,
    google_reviewers_reported_prices: reviewerPrices.length ? reviewerPrices : null,
    hours,
    floodlights: t.has_floodlights === true ? "yes" : null,
    covered: t.is_covered === true ? "yes" : null,
    surface: t.surface_type,
    equipment_provided: t.equipment_provided === true ? "yes" : null,
    size: t.length_feet && t.width_feet ? `${t.length_feet} ft x ${t.width_feet} ft${t.height_feet ? `, ${t.height_feet} ft high` : ""}` : null,
    grounds: t.number_of_grounds && t.number_of_grounds > 1 ? `${t.number_of_grounds} grounds` : null,
    formats: t.formats?.length ? t.formats : t.ground_format ? [t.ground_format] : null,
    // has_nets means boundary nets or a net cage (the column's own
    // definition), not practice nets; the page shows it as "Boundary nets".
    nets: t.has_nets
      ? t.net_condition
        ? `boundary nets, ${t.net_condition.toLowerCase()} condition`
        : "boundary nets"
      : t.net_condition
        ? `nets, ${t.net_condition.toLowerCase()} condition`
        : null,
    listed_prices_per_hour: bandSummary(t.pricing_bands),
    good_to_know: scrubBookingApps(t.good_to_know),
    parking: t.parking_available === true ? "yes" : null,
    washroom: t.washroom_available === true ? "yes" : null,
    changing_room: t.changing_room_available === true ? "yes" : null,
    cafeteria: t.has_cafeteria === true ? "yes" : null,
    sitting_area: t.sitting_area_available === true ? "yes" : null,
    amenities: t.amenities?.length ? t.amenities : null,
    members_only: t.membership_required ? "yes" : null,
    access_notes: scrubBookingApps(t.access_notes),
    phone_listed: getPhone(t) ? "yes, on the TapTurf page" : getWhatsAppPhone(t) ? "WhatsApp only, on the TapTurf page" : "no",
    // The page shows no booking app's page as the venue's website.
    website: publicLink(t.website_url) ? "yes" : null,
    // Without "bookable on Playo" lines: players book by call or WhatsApp.
    description: scrubBookingApps(t.description)?.slice(0, 500) ?? null,
  };
  const drop = (o: Record<string, unknown>) => {
    for (const k of Object.keys(o)) if (o[k] == null || (Array.isArray(o[k]) && (o[k] as unknown[]).length === 0)) delete o[k];
  };
  for (const k of ["google", "players_say"]) if (facts[k]) drop(facts[k] as Record<string, unknown>);
  drop(facts);
  return facts;
}

/** Listed per-hour prices by format: { "6-a-side": "₹800 to ₹1100, weekday mornings cheapest" }. */
function bandSummary(bands: Turf["pricing_bands"]): Record<string, string> | null {
  if (!bands?.length) return null;
  const by = new Map<string, number[]>();
  for (const b of bands) {
    const k = b.format ?? "standard";
    by.set(k, [...(by.get(k) ?? []), b.price_per_hour]);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of [...by].slice(0, 6)) {
    const lo = Math.min(...v), hi = Math.max(...v);
    out[k] = lo === hi ? `₹${lo}` : `₹${lo} to ₹${hi}`;
  }
  return out;
}

/** Any written word about the venue in the sheet: TapTurf players' tips, the summary, Google texts. Stars and counts alone are not. */
export function hasReviewText(f: TurfFacts): boolean {
  const tt = f.tapturf_reports as { recent?: unknown[] } | undefined;
  return !!(tt?.recent?.length || f.players_say || (f.google_reviews as unknown[] | undefined)?.length);
}
