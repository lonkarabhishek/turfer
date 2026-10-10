import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { isCity } from "@/lib/city";
import { isAskConfigured } from "@/lib/ai/ask";
import { draftGame, toPrefill } from "@/lib/ai/gameDraft";

// POST /api/games/draft { text, city?, uid }
// One sentence in, a prefilled game wizard out. Signed-in players only
// (hosting needs an account anyway); the per-IP budget from Ask caps
// abuse and every draft lands in the Ask transcript for review.

const allTurfs = unstable_cache(() => getAllActiveTurfs(), ["ask-all-turfs"], { revalidate: 600 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ipHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`${process.env.ASK_SALT ?? "tapturf"}|${ip}`).digest("hex").slice(0, 32);
}

/** Same as POST, with q, city and uid as query parameters. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return handle(req, { text: searchParams.get("q"), city: searchParams.get("city"), uid: searchParams.get("uid") });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; city?: unknown; uid?: unknown };
  return handle(req, body);
}

async function handle(req: Request, body: { text?: unknown; city?: unknown; uid?: unknown }) {
  if (!isAskConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  if (text.length < 4) return NextResponse.json({ error: "text is required" }, { status: 400 });
  const uid = typeof body.uid === "string" && UUID.test(body.uid) ? body.uid : null;
  if (!uid) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  const started = Date.now();
  const supabase = createReadOnlyClient();
  let logId: number | null = null;
  try {
    const { data } = await supabase.rpc("ask_begin_v2", { p_ip_hash: ipHash(req), p_query: `[game] ${text}`, p_user_id: uid, p_anon_id: null });
    const row = (Array.isArray(data) ? data[0] : data) as { id: number | null } | null;
    if (row && row.id === null) return NextResponse.json({ error: "Too many requests, try again in a few minutes" }, { status: 429 });
    logId = row?.id ?? null;
  } catch {
    /* logging is best effort */
  }

  let draft;
  try {
    draft = await draftGame(text);
  } catch (e) {
    console.error("game draft: claude failed", e);
    return NextResponse.json({ error: "I couldn't read that right now. Try again in a moment." }, { status: 502 });
  }
  if (!draft) return NextResponse.json({ error: "I couldn't make a game out of that. Try: Box cricket Saturday 7pm at Hindu Gymkhana, 10 players, 150 each." }, { status: 422 });

  const cityParam = typeof body.city === "string" ? body.city : null;
  const prefill = toPrefill(draft, await allTurfs(), isCity(cityParam) ? cityParam : null);

  if (logId != null) {
    void supabase
      .rpc("ask_finish", {
        p_id: logId,
        p_filters: draft,
        p_results: prefill.turf ? 1 : 0,
        p_ms: Date.now() - started,
        p_source: "claude",
        p_reply: draft.reply,
        p_intent: "create_game",
      })
      .then(() => {}, () => {});
  }

  return NextResponse.json(prefill, { headers: { "Cache-Control": "private, no-store" } });
}
