import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createReadOnlyClient as createServerClient } from "@/lib/supabase/server";
import { createRowStore, type ListMeta, type ListPart, type LogLevel, type RowStore } from "@/lib/cache/rowStore";
import { createPartReader, dbTag } from "@/lib/cache/partRoute";
import { convertImageUrls, firstImageUrl } from "@/lib/utils/images";
import { cleanPriceMentions, cleanVenueName } from "@/lib/utils/bookingApps";
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
    // Without a booking app's attribution ("FS Turf, Churchgate - by
    // SPORLOC"), so the heading, title, JSON-LD, cards and Ask agree.
    name: cleanVenueName(raw.name),
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

// One line per failed load comes from the row store (with this message in
// it), not one per part: a burst of failed part reads wrote 5 to 7 error
// lines per failed render on 27 Oct.
async function readListPart(i: number): Promise<ListPart<Row> | null> {
  const { data, error } = await buildRetry(() => createServerClient().rpc("turf_list_part", { p_part: i }));
  if (error) {
    const e = error as { message?: unknown; code?: unknown };
    throw new Error(`Turf list part ${i} read failed: ${String(e.message ?? error)}${e.code ? ` (${String(e.code)})` : ""}`);
  }
  return (data ?? null) as ListPart<Row> | null;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** The Supabase database in the part route's URL (lib/cache/partRoute.ts). */
export const TURF_LIST_DB = dbTag(SUPABASE_URL);
// Every reader of the parts' data cache entries uses this name and these
// key parts, so all of them read and fill the same entries.
const PART_ENTRY = "turf-list-part";
const PART_KEY = ["turf-list-part-v1", SUPABASE_URL];

/**
 * Where a regeneration asks for parts other processes already cached: the
 * production site (its own route), never while `next build` runs (the
 * route is not deployed yet) and never on a preview (deployment URLs sit
 * behind Vercel's login). TURF_LIST_ORIGIN overrides it (a URL, or "off").
 */
function partOrigin(): string | null {
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  const set = process.env.TURF_LIST_ORIGIN?.trim();
  if (set) return set === "off" ? null : set.replace(/\/+$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return process.env.VERCEL_ENV === "production" && host ? `https://${host}` : null;
}
const readPartViaRoute = createPartReader<Row>({ origin: partOrigin(), db: TURF_LIST_DB });

/** Where the last part came from, for the load's log line (reads are one at a time per process). */
let partSrc = "cache";

/** Part i from the database, only if it is of version v (else it throws with the other build's part, storing nothing). */
async function dbPartOf(v: number, i: number): Promise<ListPart<Row>> {
  partSrc = "db";
  const part = await readListPart(i);
  if (part && part.v === v) return part;
  throw Object.assign(new Error(`turf list part ${i}: not from v${v}`), { otherBuild: part });
}

/**
 * Part i of version v, shared through Next's data cache. A version's parts
 * never change once built, so an entry is keyed by the version (and the
 * database) and kept with no tag and no timer: revalidate false never
 * lowers a page's revalidate, and it adds no tag. This is the copy that a
 * process without the rows in memory starts from (route handlers, a
 * page's first render, a new instance), and it still answers while the
 * database is failing, as the 32 row pieces did before 26 Oct.
 *
 * A regeneration skips the read and runs the callback. That asks the part
 * route first (GET /api/turf-list/<db>/<v>/<i>: Vercel's CDN, or the data
 * cache read by a route handler, which is no regeneration), and only on a
 * miss the database, once per process per version. Either way the part is
 * stored here again. On 27 Oct, 7 to 30 processes read all 9 parts from
 * the database at once after a purge; the list post now puts the new
 * version in this cache before it marks the pages stale (warmTurfList), so
 * those reads are cache hits.
 *
 * Only a part of version v is stored. When the database answers with
 * another build (it built again since the meta was read) or no part, the
 * callback throws, which stores nothing, and the answer is handed back to
 * the store, which checks it. The fetches inside never land in Next's
 * fetch cache (Next treats fetches inside unstable_cache as no-store), so
 * a build cannot pick up parts another build stored. Each part stays under
 * 1.5 MB (private.turf_list_state.part_bytes), below the data cache's 2 MB
 * per entry.
 */
const listPartCached = unstable_cache(
  cacheKeyed(PART_ENTRY, async (v: number, i: number): Promise<ListPart<Row>> => {
    const shared = await readPartViaRoute(v, i);
    if (shared) {
      partSrc = "route";
      return shared;
    }
    return dbPartOf(v, i);
  }),
  PART_KEY,
  { revalidate: false },
);

/** The same entries, filled from the database without the route: the warm-up after a list post. */
const listPartFromDb = unstable_cache(cacheKeyed(PART_ENTRY, dbPartOf), PART_KEY, { revalidate: false });

const NOT_CACHED = "turf list part: not in the data cache";
/** The same entries, read only: a miss throws and stores nothing, and never reaches the database. */
const listPartCacheOnly = unstable_cache(
  cacheKeyed(PART_ENTRY, async (v: number, i: number): Promise<ListPart<Row>> => {
    throw new Error(`${NOT_CACHED} (v${v}, part ${i})`);
  }),
  PART_KEY,
  { revalidate: false },
);

/**
 * Part i of version v when Next's data cache holds it, else null; never
 * the database. In a regeneration (which skips data cache reads) always
 * null. Only for the part route: it must never ask itself.
 */
export async function cachedListPart(v: number, i: number): Promise<ListPart<Row> | null> {
  try {
    const part = await listPartCacheOnly(v, i);
    return part && part.v === v && Array.isArray(part.rows) ? part : null;
  } catch {
    return null;
  }
}

/**
 * The same entries, read only, through the part route when this render
 * cannot read them itself (a regeneration): never the database. A miss
 * throws and stores nothing. The route is asked inside unstable_cache on
 * purpose: there Next treats the fetch as no-store, where in the page
 * itself a no-store fetch would make the page dynamic (revalidate 0).
 */
const listPartShared = unstable_cache(
  cacheKeyed(PART_ENTRY, async (v: number, i: number): Promise<ListPart<Row>> => {
    const shared = await readPartViaRoute(v, i);
    if (shared) return shared;
    throw new Error(`${NOT_CACHED} (v${v}, part ${i})`);
  }),
  PART_KEY,
  { revalidate: false },
);

/**
 * For a process with no copy whose load failed: part i of version v if a
 * cache already holds it, else null. The store then serves the wanted or a
 * recent version that is cached whole, instead of failing the render.
 */
async function sharedListPart(v: number, i: number): Promise<ListPart<Row> | null> {
  try {
    const part = await listPartShared(v, i);
    return part && part.v === v && Array.isArray(part.rows) ? part : null;
  } catch {
    return null;
  }
}

async function readSnapshotPart(i: number, v: number): Promise<ListPart<Row> | null> {
  partSrc = "cache";
  try {
    const part = await listPartCached(v, i);
    return part && { ...part, src: partSrc };
  } catch (e) {
    if (e && typeof e === "object" && "otherBuild" in e) {
      const other = (e as { otherBuild: ListPart<Row> | null }).otherBuild;
      return other && { ...other, src: "db" };
    }
    throw e;
  }
}

/**
 * Right after a list post built a new version, before its purge marks the
 * pages stale (app/api/revalidate): every part of the current version into
 * Next's data cache, read from the database once, here, instead of by each
 * process that regenerates a page. Parts already cached cost no database
 * read. Stops starting new reads at `deadline` (epoch ms), so the post is
 * answered within pg_net's 15 s. Throws when a read fails; the pages then
 * read the parts themselves, as before.
 */
export async function warmTurfList(deadline: number): Promise<{ v: number | null; parts: number; warmed: number; ms: number }> {
  const t0 = Date.now();
  const meta = await readListMeta(); // fresh: the build that was just posted
  const parts = meta && meta.v > 0 && Number.isInteger(meta.parts) && meta.parts > 0 && meta.parts <= 200 ? meta.parts : 0;
  let warmed = 0;
  for (let i = 0; i < parts && Date.now() < deadline; i++) {
    await listPartFromDb(meta!.v, i);
    warmed++;
  }
  return { v: meta?.v ?? null, parts, warmed, ms: Date.now() - t0 };
}

/**
 * A page rendered with an older copy of the rows than the current version
 * (its read failed) must not be kept for its usual 10 minutes or hour: an
 * unstable_cache entry with revalidate 60 lowers the page's revalidate to
 * a minute, so it is rendered again, with the new rows, soon after the
 * database recovers. Untagged, tiny, and harmless outside a page render.
 */
const staleRenderMark = unstable_cache(cacheKeyed("turf-list-stale", async () => true), ["turf-list-stale-v1"], { revalidate: 60 });

export async function markStaleRender(): Promise<void> {
  try {
    await staleRenderMark();
  } catch {
    // Only shortens the page's life; never fails it.
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
 * or the part route when it can, see listPartCached), one part at a time.
 * A regeneration with an unchanged version makes no other read; the first
 * one after a purge waits for the new rows.
 *
 * When the new version cannot be read (27 Oct: part reads past the 5 s
 * guard right after a purge), the page renders with the copy this process
 * has, or a recent version still whole in the data cache, and is kept for
 * a minute only (markStaleRender), instead of failing: a foreground render
 * no longer shows a 500. The store then waits 20 to 30 s before it reads
 * again and resumes at the part that failed. Only a process with no copy
 * at all still throws (the last good page keeps serving). On globalThis,
 * so the page runtime and the route-handler runtime (which bundles its own
 * copy of this module) share one copy and one load.
 */
const makeRowStore = () =>
  createRowStore<Row>({
    cols: CARD_COLUMNS,
    readPart: readSnapshotPart,
    // Only what is cached already, never the database (sharedListPart). The
    // store asks (part, version); the cache readers take (version, part).
    readCachedPart: (i, v) => sharedListPart(v, i),
    readLive: readLiveRows,
    order: byRatingThenId,
    // A failed read during `next build` is retried with the page (staticGenerationRetryCount): no wait there.
    retryAfterMs: process.env.NEXT_PHASE === "phase-production-build" ? 0 : undefined,
    // inst tells instances apart in the logs (the region field there is the edge PoP, not where this ran).
    log: (msg, extra, level: LogLevel = "info") => console[level](msg, { ...extra, inst: INSTANCE, region: process.env.VERCEL_REGION ?? null }),
  });
const shared = globalThis as typeof globalThis & { __tapturfTurfRowsV2?: RowStore<Row> };
// next dev evaluates this module again after every edit, while globalThis
// stays: a kept store would keep the old columns, readers and sort. So dev
// makes a new store per evaluation (no sharing with route handlers there).
const rowStore = process.env.NODE_ENV === "development" ? makeRowStore() : (shared.__tapturfTurfRowsV2 ??= makeRowStore());

/**
 * The rows, once per render: React cache() shares them between
 * generateMetadata, the page and every getAllActiveTurfs(city) call in it
 * (/turf-near-me asks once per city). The array is frozen and sorted
 * (rating, then id); callers copy before they sort. Outside a render
 * (route handlers) this is a plain call.
 *
 * listMeta is always called, even when its read fails: that call is what
 * gives the page the "turf-data" tag, so the next purge still reaches a
 * page rendered from an older copy. Such a page is kept a minute only.
 */
const activeRows = cache(async (): Promise<readonly Row[]> => {
  let meta: ListMeta | null;
  try {
    meta = await listMeta();
  } catch (e) {
    // The version read failed (a regeneration reads it from the database): this process's copy, or the error.
    const kept = rowStore.orKept(e);
    await markStaleRender();
    return kept.rows;
  }
  const got = await rowStore.read(meta);
  if (got.stale) await markStaleRender();
  return got.rows;
});

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
 * from the same pattern). `storedName` keeps the name as stored, for
 * the admin listing check, which flags a booking app in it.
 */
export async function getTurfById(id: string, { storedName = false }: { storedName?: boolean } = {}): Promise<Turf | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("turfs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Turf read failed for ${id}: ${error.message}`);
  if (!data) return null;
  const turf = transformTurf(data);
  return storedName ? { ...turf, name: data.name } : turf;
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
