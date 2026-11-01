import { patchWhatsapp } from "@/lib/profile/routes";
import { profileDeps } from "@/lib/profile/deps";

// "Let players I've played with see my WhatsApp", off until the person
// turns it on. lib/profile/types.ts has the API.

export function PATCH(req: Request) {
  return patchWhatsapp(req, profileDeps);
}
