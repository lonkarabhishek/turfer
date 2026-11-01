import { getNotifications, postNotifications } from "@/lib/games/server";

// The signed-in caller's own notifications (lib/games/server.ts).

/** The newest and the unread count; ?count=unread: the count only (the header's badge). */
export function GET(req: Request) {
  return getNotifications(req);
}

/** { read: <id> | "all" }: mark them read. */
export function POST(req: Request) {
  return postNotifications(req);
}
