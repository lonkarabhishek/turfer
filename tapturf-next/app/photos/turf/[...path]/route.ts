import { TURF_PHOTOS_BUCKET, sitePhotoKey } from "@/lib/utils/images";

// GET /photos/turf/<turf id>/<name>.webp (and <name>-card.webp, and
// owner/<turf id>/<name>.jpg) -> that object of the public turf-photos
// bucket, from tapturf.in. Supabase answers every object with
// "x-robots-tag: none", so Google indexed none of our turf photos; this
// answers the same bytes without it (lib/utils/images.ts sitePhotoUrl
// points pages here).
//
// - Only that bucket and only names of the bucket's own shape
//   (sitePhotoKey): any query, encoded character, other bucket or folder
//   is a 404 before anything is fetched, so this is no proxy for anything
//   else. The upstream URL is the bucket's base plus that name. (Next
//   itself 308s a doubled or back slash to the cleaned path first.)
// - Of Supabase's answer only the bytes, the type (an image type, else
//   the one the name says), the length, ETag and Last-Modified go out:
//   never its x-robots-tag, cookies or other headers, and no request
//   header is passed on.
// - A photo's bytes never change under its name (mirrored names are a
//   hash of the source, owner uploads never overwrite), so Vercel's CDN and
//   browsers keep it a year: a function call per photo per CDN region,
//   then none. Tagged for a purge if a photo must go at once:
//   vercel cache dangerously-delete --tag turf-photo-<turf id>.
// - A missing photo is a 404 kept 5 minutes; Supabase failing is a 502 kept nowhere.
//
// A plain dynamic handler (no revalidate or dynamic export), so Next
// passes the Cache-Control below through untouched (as for
// /api/turf-list/...). The proxy never runs here (paths with a file
// extension are outside its matcher).

const YEAR = "public, max-age=31536000, s-maxage=31536000, immutable";
const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
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
  // A name that can never be one of ours stays a 404: a day.
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
    "Cache-Control": YEAR,
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
