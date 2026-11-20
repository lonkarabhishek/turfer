import { medalStoryAnswer } from "@/lib/og/medalStoryImage";

// GET /api/og/medals/<username>?v=<version>: the player's medals as an
// Instagram story picture, 1080x1920 PNG ("Flaunt my medals",
// components/profile/FlauntMedals.tsx). Only for a public profile with an
// earned medal; noindex. A plain dynamic handler: Next passes its
// Cache-Control through (lib/og/medalStory.ts says what is kept how long).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return medalStoryAnswer(req, username);
}
