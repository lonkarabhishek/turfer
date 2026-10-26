import type { NextResponse } from "next/server";
import { checkFirebaseIdToken } from "../firebase/verifyIdToken";
import { freshGoogle, freshPhone, nowSeconds } from "./fresh";
import type { GoogleIdentity } from "./identity";
import { accountError, accountReply, caller } from "./route";
import { createAccountLimiter, readSmallJson, removePhone, setPhone } from "./server";

/**
 * A Google account adds, confirms, changes or removes its phone number
 * (design: flow B). app/api/account/phone calls these. Relative imports
 * only (npm run test:account).
 *
 *   POST   /api/account/phone { proof }  the Firebase token of a fresh OTP for the number
 *   DELETE /api/account/phone            takes the number off
 *
 * Both need the Supabase token of a Google sign-in from the last 10
 * minutes (403 reauth: the page sends the person through Google again).
 * Only an account Google is the own way into may change its number: a
 * phone account reached through its Google link answers not_allowed (a
 * lost SIM goes to support).
 */

const allowSet = createAccountLimiter(10);
const allowRemove = createAccountLimiter(10);

const MAX_PROOF = 8_000;

/** The verified caller of a Google sign-in in the last 10 minutes, or the reply. A phone sign-in gets 400 bad. */
async function freshGoogleCaller(req: Request, allow: (req: Request) => boolean): Promise<{ id: GoogleIdentity } | { reply: NextResponse }> {
  const who = await caller(req, allow);
  if ("reply" in who) return who;
  if (who.id.kind !== "google") return { reply: accountError("bad") };
  if (!freshGoogle(who.id, nowSeconds())) return { reply: accountError("reauth") };
  return { id: who.id };
}

/** POST /api/account/phone { proof }: add, confirm or change the number. */
export async function addPhone(req: Request): Promise<NextResponse> {
  const who = await freshGoogleCaller(req, allowSet);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req, MAX_PROOF + 1_000);
  if (!body || typeof body.proof !== "string" || !body.proof) return accountError("bad");
  if (body.proof.length > MAX_PROOF) return accountError("proof");
  const c = await checkFirebaseIdToken(body.proof);
  if ("unavailable" in c) return accountError("unavailable");
  if ("invalid" in c) return accountError("proof");
  const fresh = freshPhone(c.ok, nowSeconds());
  if (!fresh) return accountError("proof");
  const r = await setPhone(who.id.uid, fresh.phone, fresh.proofKey);
  if ("unavailable" in r) return accountError("unavailable");
  if ("ok" in r) return accountReply({ profile: r.ok });
  if (r.r === "taken") {
    const { r: error, ...holder } = r;
    return accountReply(holder, error);
  }
  if (r.r === "limit") return accountReply(r.until ? { until: r.until } : {}, "limit");
  return accountError(r.r);
}

/** DELETE /api/account/phone: take the number off. Not limited by the database. */
export async function deletePhone(req: Request): Promise<NextResponse> {
  const who = await freshGoogleCaller(req, allowRemove);
  if ("reply" in who) return who.reply;
  const r = await removePhone(who.id.uid);
  if ("unavailable" in r) return accountError("unavailable");
  if ("ok" in r) return accountReply({ profile: r.ok });
  return accountError(r.r);
}
