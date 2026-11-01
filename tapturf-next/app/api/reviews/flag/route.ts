import { postFlag } from "@/lib/reviews/server";

// { review_id, reason, detail }: "Report this review" on someone else's
// TapTurf report, for the signed-in caller (lib/reviews/server.ts postFlag).

export function POST(req: Request) {
  return postFlag(req);
}
