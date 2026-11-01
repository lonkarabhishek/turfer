import { getPlayed } from "@/lib/profile/routes";
import { profileDeps } from "@/lib/profile/deps";

// Where and when the signed-in person last played (by turf), and their
// weekly streak: the "You played here" badges and the home's nudge. Read
// once per tab session (lib/profile/client.ts). lib/profile/types.ts has the API.

export function GET(req: Request) {
  return getPlayed(req, profileDeps);
}
