import { postStatus } from "@/lib/push/server";

// The signed-in caller's phone notifications (lib/push/server.ts).

/** { endpoint | null }: whether they can be turned on yet, and whether this phone's are on. */
export function POST(req: Request) {
  return postStatus(req);
}
