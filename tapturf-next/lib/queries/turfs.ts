import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient as createServerClient } from "@/lib/supabase/server";
import { createRowStore, type ListMeta, type ListPart, type RowStore } from "@/lib/cache/rowStore";
import { convertImageUrls, firstImageUrl } from "@/lib/utils/images";
import { cleanPriceMentions } from "@/lib/utils/bookingApps";
import { compareTopRated } from "@/lib/utils/ranking";
import { turfPlaysSport, type SportPage } from "@/lib/sports";
import { guessCityFromAddress, isCity, type CityId } from "@/lib/city";
import type { PriceBand, Turf } from "@/types/turf";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Columns for list pages (cards, search, sort, near-me). select("*")
 * shipped descriptions, data_sources and field_confidence for 240+
 * turfs on every listing: /turfs was 3.4 MB of HTML. Detail pages
 * still use "*" via getTurfById().
 *
 * The list snapshot carries the same columns (v_cols in
 * private.build_turf_list(), 20261026_cache_list_snapshot.sql; keys.test.ts
 * checks they agree). To add a column, replace that function first: a
 * snapshot with extra columns still serves this code. A column added here
 * first makes this app read the table itself (once per list build per
 * process) until the snapshot has it.
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
  // An owner manages it on myTapturf: the card's Managed by the owner mark.
  "claimed",
].join(", ");

// Exported for lib/queries/turfPage.ts (turf pages read the row through
// the turf_page RPC).
export function transformTurf(raw: any): Turf {
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
  // convertImageUrls splits comma-joined entries, drops placeholders,
  // booking apps' photos (playo.gumlet.io, cdn.district.in…) and
  // duplicates, and normalizes Google / Drive links. firstImageUrl does
  // the same for the cover, so an app's cover is no cover.
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
    // Without booking apps' names, grids and links (bookingApps.ts), so the
    // card, the page's header and its Pricing section agree on what is reported.
    price_mentions: cleanPriceMentions(raw.price_mentions),
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
    claimed: raw.claimed === true,
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
 * A failed page throws rather than return part of the list, because a
 * partial list gets cached and shows wrong counts (a home title once
 * said 51 cities instead of 54). A throw keeps the last good cached page
 * or snapshot in place. No retries while serving: on 20 Oct three
 * retries per page turned one slow statement into four against a
 * database that was already overloaded. A production build retries a
 * page once, since a failed page there fails the whole deploy.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const retries = process.env.NEXT_PHASE === "phase-production-build" ? 1 : 0;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let res = await page(from, from + PAGE - 1);
    for (let attempt = 1; res.error && attempt <= retries; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await page(from, from + PAGE - 1);
    }
    if (res.error) {
      console.error("Paged fetch failed:", res.error);
      throw new Error(`Paged fetch failed at row ${from}`);
    }
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Rating high to low (no rating first, as Postgres sorts DESC), then id: the order the query returns. */
function byRatingThenId(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ra = a.rating == null ? Infinity : Number(a.rating);
  const rb = b.rating == null ? Infinity : Number(b.rating);
  if (ra !== rb) return rb - ra;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

type Row = Record<string, unknown>;

/**
 * One retry while `next build` prerenders (a failed read there fails the
 * whole deploy), none while serving: on 20 Oct retries turned one slow
 * statement into four against a database that was already overloaded.
 * Same rule as fetchAllRows.
 */
async function buildRetry<T extends { error: unknown }>(call: () => PromiseLike<T>): Promise<T> {
  let res = await call();
  if (res.error && process.env.NEXT_PHASE === "phase-production-build") {
    await new Promise((r) => setTimeout(r, 1500));
    res = await call();
  }
  return res;
}

/**
 * unstable_cache keys an entry on cb.toString() as well as its key parts,
 * and the minifier names things differently in the page bundle, the
 * route-handler bundle and each build: the same list meta was stored under
 * two keys, so a cold route handler read the database even with the entry
 * cached. A fixed toString leaves the key parts to name the entry, in every
 * bundle and across deploys. Bump a key part when the cached shape changes.
 */
function cacheKeyed<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const cb = (...args: A) => fn(...args);
  cb.toString = () => name;
  return cb;
}

/** The list snapshot's version, or null before the first build. A failed read throws. */
async function readListMeta(): Promise<ListMeta | null> {
  const { data, error } = await buildRetry(() => createServerClient().rpc("turf_list_version"));
  if (error) {
    console.error("turf_list_version failed:", error);
    throw new Error("Turf list version read failed");
  }
  return (data ?? null) as ListMeta | null;
}

async function readListPart(i: number): Promise<ListPart<Row> | null> {
  const { data, error } = await buildRetry(() => createServerClient().rpc("turf_list_part", { p_part: i }));
  if (error) {
    console.error("turf_list_part failed:", { part: i, error });
    throw new Error(`Turf list part ${i} read failed`);
  }
  return (data ?? null) as ListPart<Row> | null;
}

/**
 * Part i of version v, shared through Next's data cache. A version's parts
 * never change once built, so an entry is keyed by the version (and the
 * database) and kept with no tag and no timer: revalidate false never
 * lowers a page's revalidate, and it adds no tag. This is the copy that a
 * process without the rows in memory starts from (route handlers, a
 * page's first render, a new instance), and it still answers while the
 * database is failing, as the 32 row pieces did before 26 Oct. A
 * regeneration skips the read and fetches the part from the database
 * (once per process per version), then stores it here.
 *
 * Only a part of version v is stored. When the database answers with
 * another build (it built again since the meta was read) or no part, the
 * callback throws, which stores nothing, and the answer is handed back to
 * the store, which checks it. The fetch inside never lands in Next's fetch
 * cache (Next treats fetches inside unstable_cache as no-store), so a
 * build cannot pick up parts another build stored. Each part stays under
 * 1.5 MB (private.turf_list_state.part_bytes), below the data cache's 2 MB
 * per entry.
 */
const listPartCached = unstable_cache(
  cacheKeyed("turf-list-part", async (v: number, i: number): Promise<ListPart<Row>> => {
    const part = await readListPart(i);
    if (part && part.v === v) return part;
    throw Object.assign(new Error(`turf list part ${i}: not from v${v}`), { otherBuild: part });
  }),
  ["turf-list-part-v1", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""],
  { revalidate: false },
);

async function readSnapshotPart(i: number, v: number): Promise<ListPart<Row> | null> {
  try {
    return await listPartCached(v, i);
  } catch (e) {
    if (e && typeof e === "object" && "otherBuild" in e) return (e as { otherBuild: ListPart<Row> | null }).otherBuild;
    throw e;
  }
}

const INSTANCE = Math.random().toString(36).slice(2, 8);
let liveReadNo = 0;

/**
 * Every active turf straight from the table: only while no snapshot is
 * usable. While `next build` prerenders, a page's own fetches go into
 * Next's fetch cache, keyed by URL and headers, kept between builds and
 * judged fresh by each reader's revalidate: pages of rows from an earlier
 * build or an earlier read could come back, mixed with fresh ones. A header
 * unique to each build-time read keeps it its own. Serving, those fetches
 * are never cached.
 */
function readLiveRows(): Promise<Row[]> {
  const tag = process.env.NEXT_PHASE === "phase-production-build" ? `${INSTANCE}.${++liveReadNo}` : null;
  return fetchAllRows<Row>((from, to) => {
    const query = createServerClient()
      .from("turfs")
      .select(CARD_COLUMNS)
      .eq("is_active", true)
      .order("rating", { ascending: false })
      .order("id")
      .range(from, to);
    return (tag ? query.setHeader("x-tapturf-read", tag) : query) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
}

/**
 * The version, as one tiny entry in Next's data cache. Every list page
 * that reads the rows gets its "turf-data" tag (so a list purge still marks
 * them all stale) and its 3600 s ceiling, exactly as the 32 row pieces gave
 * them. A regeneration that skips the data cache reads the version fresh,
 * which is the point: it is the one read such a regeneration makes. A
 * missing RPC fails the build, so the migration goes first.
 */
const listMeta = unstable_cache(cacheKeyed("turf-list-meta", readListMeta), ["turf-list-meta-v1", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""], {
  revalidate: 3600,
  tags: ["turf-data"],
});

/**
 * Every active turf row, from one copy per server process, keyed by the
 * list snapshot's version (lib/cache/rowStore.ts has the rules).
 *
 * Until 26 Oct the rows sat in Next's data cache as 32 unstable_cache
 * pieces (turf-rows-v2) and this comment promised one full read an hour or
 * per purge. A page that Vercel regenerates skips every unstable_cache read
 * (next's unstable-cache.js: isOnDemandRevalidate), so the pieces never
 * served a regeneration: each one read every turf again (7 sorted
 * statements, about 8.6 MB for 3,183 rows). On the 26 Oct import day that
 * was 11 to 100 full reads per purge batch, 8 to 16 s each when they piled
 * up, and 5 s timeouts. The in-flight sharing helped only reads that
 * overlapped in one process; a crawler walking pages one at a time, the
 * page and its RSC request landing on two instances, and the 600 s timers
 * each paid a full read.
 *
 * Now the database builds the list once per list purge
 * (private.build_turf_list, which the cache queue's flush runs just
 * before it posts the purge), a regeneration reads only the version, and a
 * process fetches the prebuilt parts once per version (from the data cache
 * when it can, see listPartCached). A regeneration with an unchanged
 * version makes no other read; the first one after a purge waits for the
 * new rows (a version this process cannot load throws, so the last good
 * page keeps serving instead of old rows being stored as fresh). On
 * globalThis, so the page runtime and the route-handler runtime (which
 * bundles its own copy of this module) share one copy and one load.
 */
const makeRowStore = () =>
  createRowStore<Row>({
    cols: CARD_COLUMNS,
    readPart: readSnapshotPart,
    readLive: readLiveRows,
    order: byRatingThenId,
    // inst tells instances apart in the logs (the region field there is the edge PoP, not where this ran).
    log: (msg, extra) => console.info(msg, { ...extra, inst: INSTANCE, region: process.env.VERCEL_REGION ?? null }),
  });
const shared = globalThis as typeof globalThis & { __tapturfTurfRowsV1?: RowStore<Row> };
// next dev evaluates this module again after every edit, while globalThis
// stays: a kept store would keep the old columns, readers and sort. So dev
// makes a new store per evaluation (no sharing with route handlers there).
const rowStore = process.env.NODE_ENV === "development" ? makeRowStore() : (shared.__tapturfTurfRowsV1 ??= makeRowStore());

/**
 * The rows, once per render: React cache() shares them between
 * generateMetadata, the page and every getAllActiveTurfs(city) call in it
 * (/turf-near-me asks once per city). The array is frozen and sorted
 * (rating, then id); callers copy before they sort. Outside a render
 * (route handlers) this is a plain call.
 */
const activeRows = cache(async (): Promise<readonly Row[]> => rowStore.rowsFor(await listMeta()));

/** The raw active rows (card columns), for lib/queries/cities.ts. Read-only. */
export const activeTurfRows = activeRows;

export async function getAllActiveTurfs(cityFilter?: CityId | null): Promise<Turf[]> {
  const city = cityFilter && isCity(cityFilter) ? cityFilter : null;
  const rows = await activeRows();
  const data = city ? rows.filter((r) => r.city === city) : rows;
  // Default order is "top rated" with the minimum-review rule, so a
  // 5.0 from a handful of reviews doesn't lead city / listing pages.
  return data.map((r) => transformTurf(r as never)).sort(compareTopRated);
}

/**
 * One active turf by id, or null when there is none. A failed read
 * throws: .single() reported a missing row as an error too, so this
 * once read an outage as "no such turf" (the 20 Oct turf page 404s came
 * from the same pattern).
 */
export async function getTurfById(id: string): Promise<Turf | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Turf read failed for ${id}: ${error.message}`);
  return data ? transformTurf(data) : null;
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

/** URL keys for the active turf pages built at deploy: the slug, or the id for a turf without one. */
/**
 * URL keys of the turf pages built at deploy: the most reviewed active
 * turfs (the ones people and Google open most). Every other turf page
 * renders on its first visit and is cached from then on, so a deploy no
 * longer renders some 2,500 pages against the database.
 */
export async function getTopTurfKeys(limit: number): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("id, slug")
    .eq("is_active", true)
    .order("total_reviews", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(limit);
  if (error) throw new Error(`Top turf keys failed: ${JSON.stringify(error)}`);
  return (data ?? []).map((t) => t.slug || t.id);
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
