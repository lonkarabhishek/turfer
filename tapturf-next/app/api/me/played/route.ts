import { getPlayed } from "@/lib/profile/routes";
import { profileDeps } from "@/lib/profile/deps";

// Where and when the signed-in person last played (by turf), their weekly
// streak, counts, medals and what to review: the "You played here" badges, the home's tiles and nudge, the Me card. Read
// once per tab session (lib/profile/playedStore.ts). lib/profile/types.ts has the API.

export function GET(req: Request) {
  return getPlayed(req, profileDeps);
}
