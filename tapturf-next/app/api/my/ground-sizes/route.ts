import { revalidatePath } from "next/cache";
import { getGroundSizes, postGroundSizes } from "@/lib/my/groundSizes";
import { turfPagePaths } from "@/lib/queries/turfs";

// A turf's ground sizes on myTapturf: lib/my/groundSizes.ts has the
// handlers, lib/turfSize/api.ts the API. Only the turf's owners (the
// database decides, for the account the sign-in opens).

/** ?turf=<uuid>: what the form starts from. */
export function GET(req: Request) {
  return getGroundSizes(req);
}

/** Save the grounds; the public page is rebuilt at once (the cache queue would within minutes). */
export function POST(req: Request) {
  return postGroundSizes(req, async (turfId) => {
    for (const p of await turfPagePaths(turfId)) revalidatePath(p);
  });
}
