import { z } from "zod";
import { imageUrlForCard } from "@/lib/utils/images";
import { ROUTER_MODEL, structured } from "./ask";

/**
 * Cover photo pass: Claude Haiku looks at a turf's photos (downsized
 * to 800px, sent as bytes so a dead link is simply skipped) and says
 * which one best shows the playing surface, and which ones are logos,
 * screenshots or blur that shouldn't lead a card. About 600 tokens
 * per image, so a whole city costs a few rupees.
 */

export const MAX_IMAGES = 6;
const MAX_BYTES = 4 * 1024 * 1024;

export const ImageReview = z.object({
  index: z.number(),
  /** False for logos, text-only posters, screenshots, maps, blur, unrelated scenes. */
  usable: z.boolean(),
  /** 1 poor to 5 excellent, as a listing cover. */
  quality: z.number(),
  shows: z.enum(["pitch", "facility", "people_playing", "entrance", "logo_or_poster", "screenshot_or_map", "other"]),
  note: z.string(),
});
export const CoverPick = z.object({
  images: z.array(ImageReview),
  /** Index of the best usable photo, or null when none is usable. */
  best_index: z.number().nullable(),
});
export type CoverPick = z.infer<typeof CoverPick>;

const SYSTEM = `You judge photos for a sports venue directory in India. Each image is numbered from 0 in the order given. Reply only with the JSON object.

For every image give usable, quality 1 to 5, what it shows, and a note under 12 words.
- Not usable: logos, posters or price lists that are mostly text, app screenshots, maps, heavily blurred or very dark photos, photos of unrelated things (food, cars, documents), and portrait photos of a single person's face.
- The best cover shows the playing surface (turf, cage, court) clearly, sharp and well lit, ideally landscape, with the whole ground visible. Floodlit night shots are good if the surface is clear. People playing is fine; a crowd blocking the surface is not.
- best_index is the index of the single best usable photo, or null if none is usable.`;

type Fetched = { index: number; url: string; media: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

async function fetchImage(url: string, index: number): Promise<Fetched | null> {
  try {
    const small = imageUrlForCard(url) || url;
    const res = await fetch(small, { headers: { "User-Agent": "TapTurf/1.0 (+https://www.tapturf.in)" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const media = type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif" ? type : null;
    if (!media) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    return { index, url, media, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

export type CoverResult = {
  cover: string | null;
  review: { url: string; usable: boolean; quality: number; shows: string; note: string }[];
  /** URLs we couldn't fetch at all. Treated as unusable. */
  broken: string[];
};

export async function pickCover(images: string[]): Promise<CoverResult> {
  const urls = images.slice(0, MAX_IMAGES);
  const fetched = (await Promise.all(urls.map((u, i) => fetchImage(u, i)))).filter((f): f is Fetched => !!f);
  const broken = urls.filter((u) => !fetched.some((f) => f.url === u));
  if (fetched.length === 0) return { cover: null, review: broken.map((url) => ({ url, usable: false, quality: 1, shows: "other", note: "Could not load" })), broken };

  // Images are renumbered 0..n-1 in the order sent; map back afterwards.
  const content: ({ type: "image"; source: { type: "base64"; media_type: Fetched["media"]; data: string } } | { type: "text"; text: string })[] = [];
  fetched.forEach((f, i) => {
    content.push({ type: "text", text: `Image ${i}` });
    content.push({ type: "image", source: { type: "base64", media_type: f.media, data: f.data } });
  });
  content.push({ type: "text", text: `Judge the ${fetched.length} images above.` });

  const out = await structured(
    CoverPick,
    {
      model: ROUTER_MODEL,
      max_tokens: 800,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    },
    "cover",
  );

  const review: CoverResult["review"] = fetched.map((f, i) => {
    const r = out?.images.find((x) => x.index === i);
    return r
      ? { url: f.url, usable: r.usable, quality: Math.max(1, Math.min(5, Math.round(r.quality))), shows: r.shows, note: r.note }
      : { url: f.url, usable: true, quality: 3, shows: "other", note: "Not judged" };
  });
  for (const url of broken) review.push({ url, usable: false, quality: 1, shows: "other", note: "Could not load" });

  let cover: string | null = null;
  if (out?.best_index != null && fetched[out.best_index] && review[out.best_index]?.usable) cover = fetched[out.best_index].url;
  else {
    const best = review.filter((r) => r.usable).sort((a, b) => b.quality - a.quality)[0];
    cover = best?.url ?? null;
  }
  return { cover, review, broken };
}
