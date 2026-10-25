import { NextResponse } from "next/server";
import { identify, type Identity } from "./identity";
import { PRIVATE_HEADERS } from "./server";
import type { AccountError } from "./types";

/** HTTP status per account error. */
const STATUS: Record<AccountError, number> = {
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
