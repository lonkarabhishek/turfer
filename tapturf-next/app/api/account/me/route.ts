import { getMe, patchMe, postMe } from "@/lib/account/meRoutes";
import { isLiveCity } from "@/lib/queries/cities";

// The signed-in person's own account: lib/account/meRoutes.ts has the
// handlers, lib/account/types.ts the API.

export function GET(req: Request) {
  return getMe(req, isLiveCity);
}

/** Sign-in: the account for this sign-in, made if there is none. Logs a phone sign-in. */
export function POST(req: Request) {
  return postMe(req, isLiveCity);
}

/** Change the name, the username and/or the switch; remove a typed email; or say No thanks to the Google ask. */
export function PATCH(req: Request) {
  return patchMe(req);
}
