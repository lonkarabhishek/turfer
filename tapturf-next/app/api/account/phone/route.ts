import { addPhone, deletePhone } from "@/lib/account/phoneRoutes";

// A Google account's own phone number (lib/account/phoneRoutes.ts has the handlers, lib/account/types.ts the API).

/** Add, confirm or change the number: a Google sign-in from the last 10 minutes and a fresh OTP for the number. */
export function POST(req: Request) {
  return addPhone(req);
}

/** Take the number off: a Google sign-in from the last 10 minutes. */
export function DELETE(req: Request) {
  return deletePhone(req);
}
