import { z } from "zod";
import { ROUTER_MODEL, isAskConfigured, structured } from "@/lib/ai/ask";
import { judgeFailure } from "@/lib/my/photoCheck";
import type { JudgeAnswer } from "./photoRoutes";

/**
 * Server only. The check of a photo a player adds to their report,
 * modelled on the profile photo check (lib/account/photoJudge.ts) and the
 * owners' photo check (lib/my/photoJudge.ts): Claude Haiku looks at the
 * photo and its thumbnail before they are stored. It turns down what the
 * profile check does (sexual, violent, hateful, a document or a number),
 * and what doesn't show the venue or the game: posters, ads, screenshots,
 * text, a close-up selfie, something unrelated. A judge that won't look
 * counts as a no; one that is down keeps nothing either (the player tries
 * again later). Used by /api/reviews/photos (lib/reviews/photoRoutes.ts).
 */

const SHOWS = ["pitch_or_court", "facility", "people_playing", "team_at_venue", "close_up_selfie", "text_or_screenshot", "poster_or_logo", "unrelated", "other"] as const;
const PROBLEMS = ["none", "sexual", "violent", "hateful", "drugs_or_weapons", "spam", "personal_info", "not_venue"] as const;

const Judgement = z.object({
  /** False for anything that must not show under a review in public. */
  usable: z.boolean(),
  /** The thumbnail is the same picture as the photo. */
  same: z.boolean(),
  shows: z.enum(SHOWS),
  problem: z.enum(PROBLEMS),
  /** Under 12 words, for the team. */
  note: z.string(),
});

export type ReviewPhotoVerdict = z.infer<typeof Judgement>;

const SYSTEM = `You check a photo a player added to their review of a sports venue (a turf, a box cricket cage, a court) on TapTurf, a sports app in India. It shows in public under their review on the venue's page, as proof they played there. You get two images: the photo, then a small copy of it. Reply only with the JSON object.

- usable is true for photos from the venue or the game: the pitch, court or cage, nets, goals, lights, the stands, washroom, parking or entrance, the scoreboard, people playing, or a team or friends at the venue. Night, blurry, dark or low quality is fine.
- usable is false for: nudity or sexual content (including suggestive poses), graphic violence, blood or gore, hateful symbols, slurs or gestures, drugs, weapons; posters, ads, banners, price lists, logos, memes, screenshots or images that are mostly text; anything showing a phone number, a QR code, an ID card or another document; a close-up selfie or portrait where the venue can't be seen; things unrelated to the venue or a game there.
- same is false when the small copy is not the same picture as the photo.
- problem names the reason when usable is false: sexual, violent, hateful, drugs_or_weapons, spam (posters, ads, screenshots, text, logos, memes), personal_info (numbers, documents, QR codes) or not_venue (selfies, unrelated things); else none.
- note says what the photo shows in under 12 words.`;

export const reviewPhotoJudgeReady = (): boolean => isAskConfigured();

/** Check one photo and its thumbnail (the bytes the server will store). */
export async function judgeReviewPhoto(full: Uint8Array, thumb: Uint8Array, media: "image/webp" | "image/jpeg"): Promise<JudgeAnswer> {
  if (!isAskConfigured()) return { down: true };
  const info: { refused?: boolean } = {};
  const image = (b: Uint8Array) => ({ type: "image" as const, source: { type: "base64" as const, media_type: media, data: Buffer.from(b).toString("base64") } });
  try {
    const out = await structured(
      Judgement,
      {
        model: ROUTER_MODEL,
        max_tokens: 300,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [image(full), image(thumb), { type: "text", text: "Check this photo for a review." }] }],
      },
      "review-photo",
      undefined,
      info,
      { timeout: 20_000, maxRetries: 1, deadline: Date.now() + 30_000 },
    );
    if (info.refused) return { ok: false, problem: "other", verdict: { refused: true } };
    if (!out) return { down: true };
    if (out.usable && out.same && out.problem === "none") return { ok: true, verdict: out };
    const problem = !out.same ? "other" : out.problem === "spam" || out.problem === "personal_info" || out.problem === "not_venue" ? out.problem : "other";
    return { ok: false, problem, verdict: out };
  } catch (e) {
    if (judgeFailure(e) === "bad_image") return { unreadable: true };
    console.warn("review photo: judge down", e);
    return { down: true };
  }
}
