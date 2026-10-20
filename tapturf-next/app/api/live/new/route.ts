import { NextResponse } from "next/server";
import { mintLiveCode } from "@/lib/live/codes";
import { createLiveLimiter, liveIpHash, liveWriteKey } from "@/lib/live/server";
import type { LiveNewResponse } from "@/lib/live/types";

// POST /api/live/new -> { code }. A code for a new live scorecard link
// (lib/live/codes.ts). No database call: the row is made by the first
// PUT /api/live/<code>, which is where the real limits are.

const limits = createLiveLimiter();

const reply = (body: LiveNewResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const key = liveWriteKey();
  if (!key) return reply({ error: "unavailable" }, 503);
  if (!limits.mint(liveIpHash(req, key))) return reply({ error: "limit" }, 429);
  return reply({ code: mintLiveCode(key) });
}
