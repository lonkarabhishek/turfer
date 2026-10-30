import { z } from "zod";
import { ROUTER_MODEL, isAskConfigured, structured } from "@/lib/ai/ask";
import { judgeFailure } from "@/lib/my/photoCheck";
import type { PhotoProblem } from "./types";

/**
 * Server only. The check of a profile photo, modelled on the check of
 * photos owners add (lib/my/photoJudge.ts): Claude Haiku looks at the
 * photo before it is stored, and one that is sexual, violent, hateful or
 * shows someone's documents is turned down and never kept. A judge that
 * won't look counts as a no; a judge that is down keeps nothing either
 * (the person tries again, or picks an avatar). Used by
 * /api/account/photo (lib/account/photoRoutes.ts).
 */

const SHOWS = ["person", "people", "sport", "animal", "art_or_logo", "scenery_or_object", "text_or_screenshot", "other"] as const;
const PROBLEMS = ["none", "sexual", "violent", "hateful", "drugs_or_weapons", "offensive", "personal_info"] as const;

const Judgement = z.object({
  /** False for anything that must not show next to a name in public. */
  usable: z.boolean(),
  shows: z.enum(SHOWS),
  problem: z.enum(PROBLEMS),
  /** Under 12 words, for the team. */
  note: z.string(),
});

export type PhotoVerdict = z.infer<typeof Judgement>;

export type JudgeAnswer =
  | { ok: true; verdict: PhotoVerdict }
  | { ok: false; problem: PhotoProblem; verdict: PhotoVerdict | { refused: true } }
  /** The file can't be read as an image. */
  | { unreadable: true }
  /** The judge is down or not set up: nothing can be checked now. */
  | { down: true };

const SYSTEM = `You check a profile photo someone uploaded to TapTurf, a sports app in India for finding turfs and pickup games. It shows small and round next to their name on their public profile and on games they host or join, to everyone. Reply only with the JSON object.

- usable is true for ordinary profile pictures: a face or a person, friends or a team, someone playing a sport, a pet, a cartoon or drawing, a logo, a landscape or an object. Blurry, dark or low quality is fine.
- usable is false for: nudity or sexual content (including suggestive poses in underwear), graphic violence, blood or gore, hateful symbols, slurs or gestures, drugs, weapons aimed at the viewer, obscene or abusive text, and anything showing a phone number, ID card, bank card or other personal document, or a QR code.
- problem names the reason when usable is false (personal_info for numbers, documents and QR codes), else none.
- note says what the photo shows in under 12 words.`;

export const photoJudgeReady = (): boolean => isAskConfigured();

/** Check one photo (the bytes the server will store). */
export async function judgeProfilePhoto(bytes: Uint8Array, media: "image/webp" | "image/jpeg"): Promise<JudgeAnswer> {
  if (!isAskConfigured()) return { down: true };
  const info: { refused?: boolean } = {};
  try {
    const out = await structured(
      Judgement,
      {
        model: ROUTER_MODEL,
        max_tokens: 300,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media, data: Buffer.from(bytes).toString("base64") } },
              { type: "text", text: "Check this profile photo." },
            ],
          },
        ],
      },
      "profile-photo",
      undefined,
      info,
      { timeout: 20_000, maxRetries: 1, deadline: Date.now() + 30_000 },
    );
    if (info.refused) return { ok: false, problem: "other", verdict: { refused: true } };
    if (!out) return { down: true };
    if (out.usable && out.problem === "none") return { ok: true, verdict: out };
    return { ok: false, problem: out.problem === "none" ? "other" : out.problem, verdict: out };
  } catch (e) {
    if (judgeFailure(e) === "bad_image") return { unreadable: true };
    console.warn("profile photo: judge down", e);
    return { down: true };
  }
}
