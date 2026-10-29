import { NextResponse } from "next/server";
import { mintLiveCode } from "@/lib/live/codes";
import { createLiveLimiter, liveIpHash, liveSigner, liveWriteKey } from "@/lib/live/server";
import type { LiveNewResponse } from "@/lib/live/types";

// POST /api/live/new -> { code }. A code for a new live scorecard link
// (lib/live/codes.ts), for a scorer with a sign-in the server verifies
// (lib/live/gate.ts; login otherwise, unavailable while sign-ins cannot be
// checked). No database call for a cached sign-in: the row is made by the
// first PUT /api/live/<code>, which checks the sign-in again and is where
// the real limits are.

const limits = createLiveLimiter();

const reply = (body: LiveNewResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const key = liveWriteKey();
  if (!key) return reply({ error: "unavailable" }, 503);
  if (!limits.mint(liveIpHash(req, key))) return reply({ error: "limit" }, 429);
  const who = await liveSigner(req);
  if ("unavailable" in who) return reply({ error: "unavailable" }, 503);
  if (!("ok" in who)) return reply({ error: "login" }, 401);
  return reply({ code: mintLiveCode(key) });
}
