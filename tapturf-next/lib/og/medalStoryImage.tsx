import { loadPublicPassport, readPublicProfile } from "../profile/publicProfile";
import { appMark } from "./appMark";
import { medalStoryResponse } from "./medalStory";
import { medalStoryPng } from "./medalStoryDesign";

/**
 * GET /api/og/medals/<username>[?v=<version>]: a player's medals as a
 * picture for an Instagram story (1080 x 1920 PNG). What it says and what
 * the route answers: lib/og/medalStory.ts (medalStoryResponse); how it
 * looks: lib/og/medalStoryDesign.tsx.
 *
 * - Who has one: exactly who has a public profile page (readPublicProfile,
 *   the page's own read) with an earned medal; it draws publicPassport,
 *   which is what that page shows.
 * - Nothing third-party: the drawing fetches no font, emoji or picture
 *   (no profile photo either); the app icon is read from public/.
 * - Under /api, so proxy.ts never runs for it. Every answer is noindex.
 */
export function medalStoryAnswer(req: Request, username: string): Promise<Response> {
  return medalStoryResponse(req, username, {
    profile: readPublicProfile,
    passport: loadPublicPassport,
    draw: async (facts, headers) => medalStoryPng(facts, await appMark(), headers),
  });
}
