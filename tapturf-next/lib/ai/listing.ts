import { z } from "zod";
import type { Turf } from "@/types/turf";
import { getPhone } from "@/lib/utils/seo";
import { ROUTER_MODEL, structured } from "./ask";
import { buildFacts } from "./compare";

/**
 * Listing gap checker for data ops. Haiku reads one turf row and flags
 * what a careful editor would: the name says cricket but sports lists
 * football only, the city does not match the address, hours missing,
 * a description that reads like an advert. It reports; it never edits.
 */

export const ListingIssue = z.object({
  /** Which field, in our column names where possible. */
  field: z.string(),
  /** fix: clearly wrong. check: probably wrong, needs a look. gap: missing. */
  severity: z.enum(["fix", "check", "gap"]),
  note: z.string(),
  /** What to change it to, when the row itself makes that obvious. Null otherwise. */
  suggested: z.string().nullable(),
});

export const ListingReview = z.object({
  ok: z.boolean(),
  /** One line for the queue. */
  summary: z.string(),
  issues: z.array(ListingIssue),
});
export type ListingReview = z.infer<typeof ListingReview>;

const SYSTEM = `You check one venue listing on TapTurf, an Indian sports venue directory, the way a careful editor would before it goes live. Reply only with the JSON object.

Look for:
- Mismatches inside the row: the name says cricket or box cricket but sports does not include it; the name says arena, academy or club without a sport; the address names a city or area that does not match the city field; sports lists a sport the description says is not offered; pickleball or badminton listed for an open turf with no mention of courts.
- Gaps that hurt a player: no hours, no rate at all, no phone, no photos, no sports, a description under 20 words. Report a gap only once each.
- Bad text: a description written as an advert ("best in town", "world class"), copied from Google, mentions another venue's name, has phone numbers or URLs inside it, or is in all caps.
- Odd values: rates under ₹200 or over ₹5,000 an hour, hours like 00:00 to 00:00 unless 24x7 is set, duplicate photos, a rating with zero reviews.

Rules:
- field: the column, one of name, sports, city, address, hours, rates, phone, images, description, amenities, rating, other.
- severity: fix for clearly wrong, check for probably wrong, gap for missing.
- note: under 20 words, plain, specific. suggested: the corrected value only when the row itself makes it obvious ("add Box Cricket to sports"), else null. Never invent rates, hours, phone numbers or facilities.
- ok: true only when there is nothing of severity fix or check and at most one gap.
- summary: under 15 words for the queue ("Sports missing Box Cricket, no hours").
- At most 6 issues, most important first. Indian English, no hedging.`;

export function listingFacts(t: Turf): Record<string, unknown> {
  const facts = buildFacts(t, []);
  delete facts.recent_reviews;
  return {
    ...facts,
    sports_raw: t.sports,
    city_field: t.city,
    is_24x7: t.is_24x7 === true,
    opening_hours_raw: t.opening_hours ?? null,
    start_end_raw: t.start_time || t.end_time ? `${t.start_time ?? "?"} to ${t.end_time ?? "?"}` : null,
    rating_raw: t.rating,
    review_count: t.total_reviews,
    phone_present: !!getPhone(t),
    images_count: Array.isArray(t.images) ? t.images.length : 0,
    images_unique: Array.isArray(t.images) ? new Set(t.images).size : 0,
    has_coordinates: typeof t.lat === "number" && typeof t.lng === "number",
    description_full: t.description ?? null,
  };
}

export async function checkListing(t: Turf): Promise<ListingReview | null> {
  return structured(
    ListingReview,
    {
      model: ROUTER_MODEL,
      max_tokens: 900,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(listingFacts(t)) }],
    },
    "listing",
  );
}
