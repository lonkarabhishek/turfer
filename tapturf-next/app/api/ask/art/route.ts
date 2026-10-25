import { NextResponse } from "next/server";
import { isAskConfigured } from "@/lib/ai/ask";
import { drawArt } from "@/lib/ai/blogArt";
import { readArt } from "@/lib/ask/artToken";
import { clientNetwork, windowCounter } from "@/lib/limits";

// GET /api/ask/art?t=<token> -> 200 { svg } | 202 { status: "drawing" } | 503 { error: "retry" } | 502 { error: "no_art" }
// The drawing an answer about a blog post asked for (lib/ai/blogArt.ts).
// The token is signed by /api/ask (lib/ask/artToken.ts), so this only
// ever draws a brief our own answerer wrote. The database decides whether
// one is drawn (made once, failures remembered, a daily cap). A drawing
// doesn't change, so browsers keep it for a day and the CDN for a month.
// 202 means another request is drawing it: the chat asks again shortly.
// 503 means nothing was drawn this time for reasons that may pass (the
// model or the store unavailable): the chat may ask on a later open. 502
// means it won't be drawn. Only a drawing goes in the HTTP caches.

// Opus gets 45 s for the call, then the sanitiser and the store.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// Per-instance soft limit per network, for floods of requests. Generous:
// many phones share one carrier address, and a drawing in progress is
// asked for again every few seconds. What a drawing costs is limited by
// the store, not by this.
const ART_PER_MIN = 60;
const allow = windowCounter(ART_PER_MIN, 60_000, Date.now);

export async function GET(req: Request) {
  if (!allow(clientNetwork(req))) return NextResponse.json({ error: "busy" }, { status: 429, headers: NO_STORE });
  const art = readArt(new URL(req.url).searchParams.get("t") ?? "");
  if (!art) return NextResponse.json({ error: "bad_token" }, { status: 400, headers: NO_STORE });
  if (!isAskConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  // The token's alt text is for the chat only: it never reaches the model.
  const got = await drawArt(art.slug, art.brief, clientNetwork(req));
  if (got.status === "drawing") return NextResponse.json({ status: "drawing" }, { status: 202, headers: NO_STORE });
  if (got.status === "retry") return NextResponse.json({ error: "retry" }, { status: 503, headers: NO_STORE });
  if (got.status !== "ok") return NextResponse.json({ error: "no_art" }, { status: 502, headers: NO_STORE });
  return NextResponse.json({ svg: got.svg }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=2592000" } });
}
