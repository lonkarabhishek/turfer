import { unstable_cache } from "next/cache";
import { createReadOnlyClient as createServerClient } from "@/lib/supabase/server";
import { convertImageUrls, firstImageUrl } from "@/lib/utils/images";
import { compareTopRated } from "@/lib/utils/ranking";
import { turfPlaysSport, type SportPage } from "@/lib/sports";
import { guessCityFromAddress, isCity, type CityId } from "@/lib/city";
import { isTurfId } from "@/lib/utils/turfPath";
import type { PriceBand, Turf } from "@/types/turf";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Columns for list pages (cards, search, sort, near-me). select("*")
 * shipped descriptions, data_sources and field_confidence for 240+
 * turfs on every listing: /turfs was 3.4 MB of HTML. Detail pages
 * still use "*" via getTurfById().
 */
const CARD_COLUMNS = [
  "id", "slug", "name", "address", "area", "city", "sports", "images", "cover_image",
  "rating", "total_reviews", "lat", "lng",
  "morning_price", "afternoon_price", "evening_price",
  "weekend_morning_price", "weekend_afternoon_price", "weekend_evening_price",
  "price_mentions", "price_unit", "slot_minutes", "is_covered", "has_floodlights",
  "start_time", "end_time", "is_24x7", "membership_required", "is_active",
  // Ask TapTurf filters on these; forCard() drops them before pages ship them.
  "amenities", "parking_available", "washroom_available", "changing_room_available", "has_cafeteria", "equipment_provided",
  // AI cover pass: photos judged unusable are dropped from images below.
  "image_review",
].join(", ");

function transformTurf(raw: any): Turf {
  // Parse sports - handle both ["Cricket, Football"] and ["Cricket", "Football"]
  let sports: string[] = [];
  if (Array.isArray(raw.sports)) {
    sports = raw.sports.flatMap((s: string) =>
      typeof s === "string" ? s.split(",").map((x) => x.trim()) : [s]
    );
  }

  // Parse amenities
  let amenities: string[] = [];
  if (Array.isArray(raw.amenities)) {
    amenities = raw.amenities.filter(
      (a: unknown) => typeof a === "string" && a.trim() !== ""
    );
  }

  // Parse images
  const rawImages = Array.isArray(raw.images) ? raw.images : [];
  // convertImageUrls splits comma-joined entries, drops placeholders
  // and duplicates, and normalizes Google / Drive links.
  let images = convertImageUrls(rawImages);
  // Photos the cover pass flagged (logos, screenshots, blur) stay in the
  // row but never reach a card or gallery.
  if (Array.isArray(raw.image_review)) {
    const bad = new Set(
      (raw.image_review as { url?: string; usable?: boolean }[])
        .filter((r) => r && r.usable === false && typeof r.url === "string")
        .map((r) => r.url as string),
    );
    if (bad.size) {
      const kept = images.filter((u) => !bad.has(u));
      if (kept.length) images = kept;
    }
  }

  // Parse contact_info - can be string or object
  let contactInfo = raw.contact_info;
  if (typeof contactInfo === "string") {
    try {
      contactInfo = JSON.parse(contactInfo);
    } catch {
      contactInfo = null;
    }
  }

  return {
    id: raw.id,
    slug: raw.slug ?? null,
    name: raw.name,
    address: raw.address,
    description: raw.description || null,
    sports,
    amenities,
    images,
    cover_image: firstImageUrl(raw.cover_image),
    signboard_image: firstImageUrl(raw.signboard_image),
    entry_parking_image: firstImageUrl(raw.entry_parking_image),
    contact_info: contactInfo || null,
    owner_name: raw.owner_name || null,
    owner_phone: raw.owner_phone || null,
    preferred_booking_channel: raw.preferred_booking_channel || null,
    morning_price: raw.morning_price || null,
    afternoon_price: raw.afternoon_price || null,
    evening_price: raw.evening_price || null,
    weekend_morning_price: raw.weekend_morning_price || null,
    weekend_afternoon_price: raw.weekend_afternoon_price || null,
    weekend_evening_price: raw.weekend_evening_price || null,
    rating: Number(raw.rating) || 0,
    total_reviews: raw.total_reviews || 0,
    external_review_url: raw.external_review_url || null,
    height_feet: raw.height_feet || null,
    length_feet: raw.length_feet || null,
    width_feet: raw.width_feet || null,
    grass_condition: raw.grass_condition || null,
    net_condition: raw.net_condition || null,
    equipment_provided: raw.equipment_provided ?? null,
    parking_available: raw.parking_available ?? null,
    washroom_available: raw.washroom_available ?? null,
    changing_room_available: raw.changing_room_available ?? null,
    sitting_area_available: raw.sitting_area_available ?? null,
    number_of_grounds: raw.number_of_grounds || null,
    unique_features: raw.unique_features || null,
    start_time: raw.start_time || null,
    end_time: raw.end_time || null,
    // Handle the DB column named "Gmap Embed link" (with space)
    gmap_embed_link: raw["Gmap Embed link"] || raw.gmap_embed_link || null,
    nearby_landmark: raw.nearby_landmark || null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    // Fall back to guessing from address for rows not yet backfilled.
    city: raw.city ?? guessCityFromAddress(raw.address),
    area: typeof raw.area === "string" && raw.area.trim() ? raw.area.trim() : null,
    // Trust/provenance fields — all nullable, all pass-through.
    surface_type: raw.surface_type ?? null,
    ground_format: raw.ground_format ?? null,
    is_covered: raw.is_covered ?? null,
    has_floodlights: raw.has_floodlights ?? null,
    has_drinking_water: raw.has_drinking_water ?? null,
    has_cafeteria: raw.has_cafeteria ?? null,
    coaching_available: raw.coaching_available ?? null,
    opening_hours: raw.opening_hours ?? null,
    price_mentions: Array.isArray(raw.price_mentions) ? raw.price_mentions : null,
    data_sources: raw.data_sources ?? null,
    field_confidence: raw.field_confidence ?? null,
    data_verified_at: raw.data_verified_at ?? null,
    // 2026-10-06 research columns, pass-through.
    price_unit: raw.price_unit ?? null,
    slot_minutes: raw.slot_minutes ?? null,
    day_night_cutoff: raw.day_night_cutoff ?? null,
    is_24x7: raw.is_24x7 ?? null,
    closed_days: raw.closed_days || null,
    membership_required: raw.membership_required ?? null,
    access_notes: raw.access_notes || null,
    landline_phone: raw.landline_phone || null,
    whatsapp_phone: raw.whatsapp_phone || null,
    website_url: raw.website_url || null,
    instagram_url: raw.instagram_url || null,
    google_place_id: raw.google_place_id || null,
    description_source: raw.description_source || null,
    description_updated_at: raw.description_updated_at ?? null,
    review_summary: toPlayersSay(raw.review_summary),
    pricing_bands: toBands(raw.pricing_bands),
    price_owner_confirmed: raw.price_owner_confirmed ?? null,
    formats: Array.isArray(raw.formats) ? raw.formats.filter((f: unknown): f is string => typeof f === "string" && !!f.trim()) : null,
    has_nets: raw.has_nets ?? null,
    good_to_know: typeof raw.good_to_know === "string" && raw.good_to_know.trim() ? raw.good_to_know.trim() : null,
    good_to_know_updated_at: raw.good_to_know_updated_at ?? null,
    is_active: raw.is_active ?? true,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * "What players say", from the admin pass or the data team's fill file.
 * Accepts complaints/dislikes for gripes and a missing summary line, so
 * either spelling shows; empty means nothing to show.
 */
function toPlayersSay(raw: unknown): Turf["review_summary"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, 6) : []);
  const likes = list(r.likes);
  const gripes = list(r.gripes ?? r.complaints ?? r.dislikes);
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  if (!summary && likes.length === 0 && gripes.length === 0) return null;
  return {
    summary,
    likes,
    gripes,
    based_on: typeof r.based_on === "number" ? r.based_on : 0,
    sources: list(r.sources).length ? list(r.sources) : ["Google"],
  };
}

const BANDS = new Set(["morning", "day", "evening", "night"]);
const DAYS = new Set(["weekday", "weekend", "all"]);

/** Keep only well-formed price bands with a real per-hour price. */
function toBands(raw: unknown): PriceBand[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter(
    (b): b is PriceBand =>
      !!b && BANDS.has(b.band) && DAYS.has(b.days) && typeof b.price_per_hour === "number" && b.price_per_hour > 0 && b.price_per_hour < 100000,
  );
  return out.length ? out : null;
}

// Supabase returns at most 1,000 rows per request; 500 keeps each
// statement well inside the 3 s timeout the public role has when the
// database is busy (a 1,000-row page of card columns took up to 2.98 s).
const PAGE = 500;

/**
 * We have more turfs than one request returns. Page with .range()
 * until a page comes back short.
 * The page function must apply a stable order (rating, then id) so
 * rows never straddle two pages.
 *
 * A failed page is retried three times with a growing wait (a busy
 * database answers with a statement timeout; one failed a production
 * build); if it still fails this throws rather than return part of the
 * list, because a partial list gets cached and shows wrong counts (a
 * home title once said 51 cities instead of 54). A throw keeps the last
 * good cached page or snapshot in place.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let res = await page(from, from + PAGE - 1);
    for (let attempt = 1; res.error && attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, [500, 1500, 3000][attempt - 1]));
      res = await page(from, from + PAGE - 1);
    }
    if (res.error) {
      console.error("Paged fetch failed after retries:", res.error);
      throw new Error(`Paged fetch failed at row ${from}`);
    }
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Calls that arrive while the list is being read share that read. Only
// reads in flight are shared, never a finished one, so a turf edit is
// never hidden. Each caller still gets its own transformed rows.
let inflight: Promise<Record<string, unknown>[]> | null = null;

function readActiveRows(): Promise<Record<string, unknown>[]> {
  inflight ??= fetchAllRows<Record<string, unknown>>((from, to) => {
    const supabase = createServerClient();
    return supabase
      .from("turfs")
      .select(CARD_COLUMNS)
      .eq("is_active", true)
      .order("rating", { ascending: false })
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Every active turf row, from one copy in Next's data cache shared by
 * all pages and routes. Before this, each page rebuild read every turf
 * from Supabase (the heaviest query we run: about 2,500 wide rows,
 * sorted on disk). On 20 Oct those reads timed out, the rebuilds retried,
 * and the database stayed overloaded for hours. Now the database sees
 * one full read per 10 minutes, or when the turf webhook expires the
 * "turf-data" tag; while a refresh fails the last copy keeps serving.
 *
 * The rows (about 2.7 KB each) are split by id into 16 pieces, each
 * cached on its own, because the data cache refuses anything over 2 MB.
 */
const SHARDS = 16;
const shardOf = (id: unknown) => (parseInt(String(id).slice(0, 2), 16) || 0) % SHARDS;
const rowPieces = Array.from({ length: SHARDS }, (_, i) =>
  unstable_cache(async () => (await readActiveRows()).filter((r) => shardOf(r.id) === i), ["turf-rows-v1", String(i)], {
    revalidate: 600,
    tags: ["turf-data"],
  }),
);

/** Rating high to low (no rating first, as Postgres sorts DESC), then id: the order the query returns. */
function byRatingThenId(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ra = a.rating == null ? Infinity : Number(a.rating);
  const rb = b.rating == null ? Infinity : Number(b.rating);
  if (ra !== rb) return rb - ra;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

async function activeRows(): Promise<Record<string, unknown>[]> {
  const parts = await Promise.all(rowPieces.map((p) => p()));
  return parts.flat().sort(byRatingThenId);
}

export async function getAllActiveTurfs(cityFilter?: CityId | null): Promise<Turf[]> {
  const city = cityFilter && isCity(cityFilter) ? cityFilter : null;
  const rows = await activeRows();
  const data = city ? rows.filter((r) => r.city === city) : rows;
  // Default order is "top rated" with the minimum-review rule, so a
  // 5.0 from a handful of reviews doesn't lead city / listing pages.
  return data.map((r) => transformTurf(r as never)).sort(compareTopRated);
}

export async function getTurfById(id: string): Promise<Turf | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return transformTurf(data);
}

export async function getTurfsBySport(sport: SportPage): Promise<Turf[]> {
  // Fetch all active turfs and filter here because the sports field
  // stores comma-separated values inside array elements.
  const data = await activeRows();

  // Exact label match: "Cricket" must not pull in "Box Cricket".
  return data
    .map((r) => transformTurf(r as never))
    .filter((t) => turfPlaysSport(t.sports, sport))
    .sort(compareTopRated);
}

/** A turf by its slug or, for old links, its id. */
export async function getTurfBySlugOrId(key: string): Promise<Turf | null> {
  if (isTurfId(key)) return getTurfById(key);
  const { data, error } = await createServerClient().from("turfs").select("*").eq("slug", key.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  return transformTurf(data);
}

/** URL keys for the active turf pages built at deploy: the slug, or the id for a turf without one. */
export async function getAllTurfKeys(): Promise<string[]> {
  const supabase = createServerClient();
  const data = await fetchAllRows<{ id: string; slug: string | null }>((from, to) =>
    supabase.from("turfs").select("id, slug").eq("is_active", true).order("id").range(from, to),
  );
  return data.map((t) => t.slug || t.id);
}

/**
 * The cached paths of one turf's page, for revalidatePath: /turf/<slug>
 * and /turf/<id> (which redirects to it). Pass the slug when the caller
 * has it; otherwise it is looked up.
 */
export async function turfPagePaths(id: string, slug?: string | null): Promise<string[]> {
  let s = slug;
  if (s === undefined) {
    const { data } = await createServerClient().from("turfs").select("slug").eq("id", id).maybeSingle();
    s = (data?.slug as string | undefined) ?? null;
  }
  return s ? [`/turf/${s}`, `/turf/${id}`] : [`/turf/${id}`];
}
