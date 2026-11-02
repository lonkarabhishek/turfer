import { TURF_PHOTOS_BUCKET, sitePhotoKey } from "@/lib/utils/images";

// GET /photos/turf/owner/<turf id>/<24 hex>.jpg (and .webp, and the
// -card copies) -> that photo a turf owner added on myTapturf, from the
// public turf-photos bucket, at tapturf.in. Supabase answers every object
// with "x-robots-tag: none", so Google indexes none of the bucket; this
// answers the same bytes without it (lib/utils/images.ts sitePhotoUrl
// points pages here). Owners' photos only, the site owner's call (2 Nov
// 2026): the copies of Google Maps photos the old mirror job made are
// never served from tapturf.in and keep their Supabase links.
//
// - Only that bucket and only the names owner_photo_start hands out
//   (sitePhotoKey): a mirrored photo's name, any query, encoded
//   character, other bucket or folder is a 404 before anything is
//   fetched, so this is no proxy for anything else. The upstream URL is
//   the bucket's base plus that name. (Next itself 308s a doubled or
//   back slash to the cleaned path first.)
// - Of Supabase's answer only the bytes, the type (an image type, else
//   the one the name says), the length, ETag and Last-Modified go out:
//   never its x-robots-tag, cookies or other headers, and no request
//   header is passed on.
// - A photo's bytes never change under its name (owner uploads never
//   overwrite), but it can be removed (by the owner, the site owner or
//   the check's sweep) and nothing purges the CDN then, so it is kept a
//   day there and an hour in browsers: a removed one is a 404 within a
//   day, and Google drops it. Tagged for a purge if a photo must go at
//   once: vercel cache dangerously-delete --tag turf-photo-<turf id>.
// - A missing photo is a 404 kept 5 minutes; Supabase failing is a 502 kept nowhere.
//
// A plain dynamic handler (no revalidate or dynamic export), so Next
// passes the Cache-Control below through untouched (as for
// /api/turf-list/...). The proxy never runs here (paths with a file
// extension are outside its matcher).

const OWNER_PHOTO = "public, max-age=3600, s-maxage=86400";
const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg" };
const UPSTREAM_TIMEOUT_MS = 15_000;

function notFound(cache: string): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  });
}

async function serve(req: Request, method: "GET" | "HEAD"): Promise<Response> {
  // Any query refuses: one name, one cached copy, so no query can make it
  // fetch again. (Next hands a bare "?" over as no query at all.)
  const { pathname, search } = new URL(req.url);
  const key = sitePhotoKey(pathname, search);
  // A name that is no owner's photo stays a 404: a day.
  if (!key) return notFound("public, max-age=86400, s-maxage=86400");
  let up: Response;
  try {
    up = await fetch(TURF_PHOTOS_BUCKET + key, { method, cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    return new Response("Photo unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!up.ok) {
    await up.body?.cancel().catch(() => {});
    // Storage answers a missing object 400 or 404 ({"statusCode":"404","error":"not_found"}).
    if (up.status === 400 || up.status === 404) return notFound("public, max-age=300, s-maxage=300");
    return new Response("Photo unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const upType = (up.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const headers = new Headers({
    "Content-Type": Object.values(TYPES).includes(upType) ? upType : TYPES[key.slice(key.lastIndexOf(".") + 1)],
    "Cache-Control": OWNER_PHOTO,
    "X-Content-Type-Options": "nosniff",
    "Vercel-Cache-Tag": `turf-photos,turf-photo-${key.replace(/^owner\//, "").slice(0, 36)}`,
  });
  // fetch() decodes a compressed body, so a compressed answer's length is not this body's.
  const length = up.headers.get("content-length");
  if (length && !up.headers.get("content-encoding")) headers.set("Content-Length", length);
  for (const h of ["etag", "last-modified"]) {
    const v = up.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(method === "HEAD" ? null : up.body, { status: 200, headers });
}

export function GET(req: Request) {
  return serve(req, "GET");
}

export function HEAD(req: Request) {
  return serve(req, "HEAD");
}
