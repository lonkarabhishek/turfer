import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { isCity } from "@/lib/city";
import { forCard } from "@/lib/utils/cardTurf";
import {
  applyAskFilters,
  areasFromTurfs,
  isAskConfigured,
  keywordFilters,
  parseAsk,
  relaxedLabel,
  type AskFilters,
} from "@/lib/ai/ask";

// GET /api/ask?q=...&city=pune&lat=..&lng=..
// Sentence in, matching turfs out. See lib/ai/ask.ts for the shape.

const allTurfs = unstable_cache(() => getAllActiveTurfs(), ["ask-all-turfs"], { revalidate: 600 });
const MAX_Q = 160;

function ipHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`${process.env.ASK_SALT ?? "tapturf"}|${ip}`).digest("hex").slice(0, 32);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_Q);
  if (q.length < 2) return NextResponse.json({ error: "q is required" }, { status: 400 });
  const cityParam = searchParams.get("city");
  const prefCity = isCity(cityParam) ? cityParam : null;
  const lat = Number(searchParams.get("lat") || NaN);
  const lng = Number(searchParams.get("lng") || NaN);
  const loc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

  const started = Date.now();
  const supabase = createReadOnlyClient();

  // Per-IP budget: ask_begin returns null when this IP has asked too often lately.
  let logId: number | null = null;
  try {
    const { data } = await supabase.rpc("ask_begin", { p_ip_hash: ipHash(req), p_query: q });
    if (data === null) return NextResponse.json({ error: "Too many searches, try again in a few minutes" }, { status: 429 });
    logId = typeof data === "number" ? data : null;
  } catch {
    /* logging is best effort */
  }

  const turfs = await allTurfs();
  let filters: AskFilters;
  let source: "claude" | "keywords" = "keywords";
  if (isAskConfigured()) {
    try {
      const parsed = await parseAsk(q, areasFromTurfs(turfs));
      if (parsed) {
        filters = parsed.filters;
        source = "claude";
      } else {
        filters = keywordFilters(q);
      }
    } catch (e) {
      console.error("ask: claude failed, falling back to keywords", e);
      filters = keywordFilters(q);
    }
  } else {
    filters = keywordFilters(q);
  }

  const result = filters.off_topic
    ? { turfs: [], total: 0, relaxed: [] as string[] }
    : applyAskFilters(turfs, filters, { prefCity, loc, limit: 12 });

  if (logId != null) {
    void supabase
      .rpc("ask_finish", { p_id: logId, p_filters: filters, p_results: result.total, p_ms: Date.now() - started, p_source: source })
      .then(() => {}, () => {});
  }

  return NextResponse.json(
    {
      query: q,
      summary: filters.summary,
      offTopic: filters.off_topic,
      source,
      filters: {
        city: filters.city,
        sport: filters.sport,
        areas: filters.areas,
        maxPrice: filters.max_price_per_hour,
        time: filters.time,
        open24x7: filters.open_24x7,
        wantsNearby: filters.wants_nearby,
        needs: filters.needs,
        players: filters.players,
        sort: filters.sort,
      },
      needsLocation: filters.wants_nearby && !loc,
      relaxed: result.relaxed.map(relaxedLabel),
      total: result.total,
      turfs: result.turfs.map((t) => ({ ...forCard(t), ...(t.distanceKm != null ? { distanceKm: t.distanceKm } : {}) })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
