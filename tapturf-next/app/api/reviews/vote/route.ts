import { postVote } from "@/lib/reviews/server";

// { review_id, on }: Helpful on or off on someone else's TapTurf report
// (lib/reviews/server.ts postVote).

export function POST(req: Request) {
  return postVote(req);
}
