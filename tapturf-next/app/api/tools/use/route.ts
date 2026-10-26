import { after } from "next/server";
import { countToolUse, createAccountLimiter, readSmallJson } from "@/lib/account/server";
import { readUse } from "@/lib/tools/usage";

// One use of a free tool, for the admin's counts (lib/tools/usage.ts).
// The browser sends it as a beacon; the count is written after the reply.

const allow = createAccountLimiter(30);

export async function POST(req: Request) {
  if (!allow(req)) return new Response(null, { status: 429 });
  const use = readUse(await readSmallJson(req, 300));
  if (!use) return new Response(null, { status: 400 });
  after(() => countToolUse(use));
  return new Response(null, { status: 204 });
}
