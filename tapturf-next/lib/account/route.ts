import { after, NextResponse } from "next/server";
import { identify, type Identity } from "./identity";
import { PRIVATE_HEADERS } from "./server";
import type { AccountError } from "./types";

/** HTTP status per account error. */
export const STATUS: Record<AccountError, number> = {
  sign_in: 401,
  unavailable: 503,
  slow: 429,
  bad: 400,
  new: 404,
  name: 422,
  conflict: 409,
  reserved: 422,
  taken: 409,
  limit: 429,
  email: 422,
  linking: 409,
  replaced: 409,
  not_allowed: 409,
  has_account: 409,
  other_account: 409,
  mismatch: 409,
  used: 409,
  expired: 410,
  unverified: 422,
  proof: 422,
  reauth: 403,
  stale: 403,
  refused: 422,
  unchecked: 503,
};

export function accountReply(body: object, error?: AccountError): NextResponse {
  return NextResponse.json(error ? { ...body, error } : body, { status: error ? STATUS[error] : 200, headers: PRIVATE_HEADERS });
}

export const accountError = (error: AccountError) => accountReply({}, error);

/**
 * The verified caller, or the reply to send instead. The limiter runs
 * first, so a flood costs neither a token check nor the database.
 */
export async function caller(req: Request, allow: (req: Request) => boolean): Promise<{ id: Identity } | { reply: NextResponse }> {
  if (!allow(req)) return { reply: accountError("slow") };
  const r = await identify(req);
  if ("ok" in r) return { id: r.ok };
  return { reply: accountError("invalid" in r ? "sign_in" : "unavailable") };
}

/**
 * Work for after the reply (Next's `after`). Never throws and never
 * affects the answer. Outside a request (unit tests) it runs at once, in
 * the background.
 */
export function later(task: () => Promise<unknown>): void {
  const run = () => task().catch((e) => console.warn("account: after-reply task failed", e));
  try {
    after(run);
  } catch {
    void run();
  }
}
