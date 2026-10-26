import { completeLink } from "@/lib/account/linkRoutes";

/** The person confirmed "Add this Google account?": the link is made. */
export function POST(req: Request) {
  return completeLink(req);
}
