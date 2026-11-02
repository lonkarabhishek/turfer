import { postSubscribe } from "@/lib/push/server";

// The signed-in caller's phone notifications (lib/push/server.ts).

/** This browser's push subscription (PushSubscription.toJSON()): on for the caller. */
export function POST(req: Request) {
  return postSubscribe(req);
}
