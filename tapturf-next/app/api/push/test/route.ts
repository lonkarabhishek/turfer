import { postTest } from "@/lib/push/server";

// The signed-in caller's phone notifications (lib/push/server.ts).

/** "Send me a test": to the caller's own phones, 5 an hour. */
export function POST(req: Request) {
  return postTest(req);
}
