import { postUnsubscribe } from "@/lib/push/server";

// The signed-in caller's phone notifications (lib/push/server.ts).

/** { endpoint }: off for this browser. */
export function POST(req: Request) {
  return postUnsubscribe(req);
}
