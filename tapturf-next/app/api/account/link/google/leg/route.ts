import { newLeg } from "@/lib/account/linkRoutes";

/** Another Google round trip on the same attempt ("Try again", "Try a different Google account"). */
export function POST(req: Request) {
  return newLeg(req);
}
