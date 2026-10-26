import { deleteReview, getReviews, postReview } from "@/lib/reviews/server";

// A signed-in player's own game report on a turf: lib/reviews/server.ts has
// the handlers, lib/reviews/types.ts the API.

/** ?turf=<uuid>: their report (any status, with the note), their Helpful votes there, a hint for the rate card. */
export function GET(req: Request) {
  return getReviews(req);
}

/** Save the report: the first one, an edit, or posting it again after removing it. */
export function POST(req: Request) {
  return postReview(req);
}

/** ?turf=<uuid>: take it off the page. Nothing is deleted. */
export function DELETE(req: Request) {
  return deleteReview(req);
}
