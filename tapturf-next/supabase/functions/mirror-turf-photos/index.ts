// mirror-turf-photos: copies Google-hosted turf photos (lh3, which can
// expire) into the public turf-photos bucket and swaps the links on the
// turf. Two WebP sizes per photo: <hash>.webp (1280x960, pages and the
// gallery) and <hash>-card.webp (640x480, cards; lib/utils/images.ts
// imageUrlForCard picks it). A photo that fails keeps its Google link
// and the turf is retried later (claim_photo_batch).
//
// Called by pg_cron every 30 seconds with the x-mirror-secret header.
// verify_jwt is off; the gate is that header, checked against
// app_secrets.mirror_photos (made in the database, readable only by the
// service role and the cron job).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "turf-photos";
const LH3 = /^https?:\/\/lh\d+\.googleusercontent\.com\//i;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

/** The photo without Google's size options: everything after the "=" in the last path segment goes. */
function base(url: string): string {
  const cut = url.search(/[?#]/);
  let path = cut === -1 ? url : url.slice(0, cut);
  const eq = path.indexOf("=", path.lastIndexOf("/") + 1);
  if (eq !== -1) path = path.slice(0, eq);
  return path;
}

async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function grab(url: string): Promise<{ buf: Uint8Array; type: string }> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TapTurfPhotoMirror/1.0)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) throw new Error(`not an image: ${type}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 1500) throw new Error("too small");
  return { buf, type };
}

async function put(path: string, f: { buf: Uint8Array; type: string }) {
  const { error } = await sb.storage.from(BUCKET).upload(path, f.buf, { contentType: f.type, cacheControl: "31536000", upsert: true });
  if (error) throw new Error(`upload: ${error.message}`);
}

/** Copy one Google photo; returns our public URL for the full size. */
async function mirror(turfId: string, src: string): Promise<string> {
  const b = base(src);
  const h = await hash(b);
  // "-rw" asks Google for WebP: about a third of the JPEG size.
  const [full, card] = await Promise.all([grab(`${b}=w1280-h960-k-no-rw`), grab(`${b}=w640-h480-k-no-rw`)]);
  const ext = full.type === "image/webp" ? "webp" : "jpg";
  await Promise.all([put(`${turfId}/${h}.${ext}`, full), put(`${turfId}/${h}-card.${ext}`, card)]);
  return sb.storage.from(BUCKET).getPublicUrl(`${turfId}/${h}.${ext}`).data.publicUrl;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

type Review = { url: string } & Record<string, unknown>;

async function doTurf(id: string) {
  const { data: t, error } = await sb.from("turfs").select("id, images, cover_image, image_review").eq("id", id).single();
  if (error || !t) return { id, mirrored: 0, error: error?.message ?? "not found" };
  const images: string[] = Array.isArray(t.images) ? t.images.filter((u: unknown): u is string => typeof u === "string") : [];
  const srcs = [...new Set([...images, t.cover_image].filter((u): u is string => !!u && LH3.test(u)))];

  // Keyed by the size-free URL, so "=w1600-h1200" and "=w1600-h1200-k-no" spellings of one photo match.
  const done = new Map<string, string>();
  const errors: string[] = [];
  await pool(srcs, 4, async (u) => {
    const b = base(u);
    if (done.has(b)) return;
    try {
      done.set(b, await mirror(id, u));
    } catch (e) {
      errors.push(`${(e as Error).message}`);
    }
  });
  const swap = (u: string) => (LH3.test(u) ? done.get(base(u)) ?? u : u);

  if (done.size > 0) {
    const review = Array.isArray(t.image_review) ? (t.image_review as Review[]).map((r) => (typeof r?.url === "string" ? { ...r, url: swap(r.url) } : r)) : t.image_review;
    const { error: upErr } = await sb
      .from("turfs")
      .update({ images: images.map(swap), cover_image: t.cover_image ? swap(t.cover_image) : t.cover_image, image_review: review })
      .eq("id", id);
    if (upErr) errors.push(`update: ${upErr.message}`);
  }
  await sb.rpc("finish_photo_job", { p_turf_id: id, p_mirrored: done.size, p_error: errors.length ? [...new Set(errors)].slice(0, 3).join("; ") : null });
  return { id, mirrored: done.size, failed: errors.length };
}

let secret: string | null = null;
async function getSecret(): Promise<string | null> {
  if (secret) return secret;
  const { data } = await sb.from("app_secrets").select("value").eq("name", "mirror_photos").single();
  secret = (data?.value as string | undefined) ?? null;
  return secret;
}

Deno.serve(async (req) => {
  const s = await getSecret();
  if (!s || req.headers.get("x-mirror-secret") !== s) return new Response("not allowed", { status: 401 });
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n")) || 4, 1), 10);
  const { data: ids, error } = await sb.rpc("claim_photo_batch", { p_n: n });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const out = [];
  for (const id of (ids ?? []) as string[]) out.push(await doTurf(id));
  return new Response(JSON.stringify({ turfs: out }), { headers: { "Content-Type": "application/json" } });
});
