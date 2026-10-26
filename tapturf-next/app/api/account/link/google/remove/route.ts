import { removeGoogle } from "@/lib/account/linkRoutes";

/** Take the Google account off this phone account, after a fresh OTP. */
export function POST(req: Request) {
  return removeGoogle(req);
}
