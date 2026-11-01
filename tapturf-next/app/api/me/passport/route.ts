import { getPassport } from "@/lib/profile/routes";
import { profileDeps } from "@/lib/profile/deps";

// The signed-in person's passport for the Me tab: numbers, streak, medals,
// stamps, reviewed turfs, turfs to review and the people they played with.
// lib/profile/types.ts has the API.

export function GET(req: Request) {
  return getPassport(req, profileDeps);
}
