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
  resolveTurfNames,
  type AskContext,
  type AskFilters,
  type AskTurn,
} from "@/lib/ai/ask";
import { applyGameFilters, loadOpenGames } from "@/lib/ai/games";
import { answerQuestion, compareTurfs, loadFacts } from "@/lib/ai/compare";
import type { Turf } from "@/types/turf";

// GET /api/ask?q=...&city=pune&lat=..&lng=..
// One box, four intents: find a turf, find a game, compare venues,
// ask about one venue. See lib/ai/ask.ts for how the sentence is read.

const allTurfs = unstable_cache(() => getAllActiveTurfs(), ["ask-all-turfs"], { revalidate: 600 });
const MAX_Q = 160;

function ipHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`${process.env.ASK_SALT ?? "tapturf"}|${ip}`).digest("hex").slice(0, 32);
}

const card = (t: Turf & { distanceKm?: number }) => ({ ...forCard(t), ...(t.distanceKm != null ? { distanceKm: t.distanceKm } : {}) });

/** What page the player is on, trimmed. */
function parseContext(raw: string | null): AskContext {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as { turf?: unknown; city?: unknown };
    return {
      turf: typeof o.turf === "string" ? o.turf.slice(0, 80) : null,
      city: isCity(typeof o.city === "string" ? o.city : null) ? (o.city as AskContext["city"]) : null,
    };
  } catch {
    return {};
  }
}

/** Last three turns from the client, trimmed so a hostile client can't pad the prompt. */
function parseHistory(raw: string | null): AskTurn[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(-3).flatMap((h) => {
      if (!h || typeof h.user !== "string") return [];
      const f = (h.filters && typeof h.filters === "object" ? h.filters : {}) as Record<string, unknown>;
      const keep: Record<string, unknown> = {};
      for (const k of ["intent", "city", "sport", "areas", "turf_names", "max_price_per_hour", "time", "when", "skill", "open_24x7", "wants_nearby", "needs", "sort"]) {
        if (f[k] != null && f[k] !== false && !(Array.isArray(f[k]) && (f[k] as unknown[]).length === 0)) keep[k] = f[k];
      }
      return [{ user: String(h.user).slice(0, MAX_Q), reply: String(h.reply ?? "").slice(0, 200), filters: keep as AskTurn["filters"] }];
    });
  } catch {
    return [];
  }
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
  const history = parseHistory(searchParams.get("h"));
  const ctx = parseContext(searchParams.get("ctx"));

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
      const parsed = await parseAsk(q, areasFromTurfs(turfs), history, ctx);
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

  const base = {
    query: q,
    intent: filters.intent,
    summary: filters.summary,
    reply: filters.reply,
    followups: filters.followups.slice(0, 3),
    source,
    filters: {
      city: filters.city,
      sport: filters.sport,
      areas: filters.areas,
      maxPrice: filters.max_price_per_hour,
      time: filters.time,
      when: filters.when,
      skill: filters.skill,
      open24x7: filters.open_24x7,
      wantsNearby: filters.wants_nearby,
      needs: filters.needs,
      players: filters.players,
      sort: filters.sort,
    },
    needsLocation: filters.wants_nearby && !loc,
    /** Sent back on the next turn so follow-ups can refine this one. */
    memo: {
      intent: filters.intent,
      city: filters.city,
      sport: filters.sport,
      areas: filters.areas,
      turf_names: filters.turf_names,
      max_price_per_hour: filters.max_price_per_hour,
      time: filters.time,
      when: filters.when,
      skill: filters.skill,
      open_24x7: filters.open_24x7,
      wants_nearby: filters.wants_nearby,
      needs: filters.needs,
      sort: filters.sort,
    },
  };
  let body: Record<string, unknown> = { ...base, relaxed: [], total: 0 };

  try {
    switch (filters.intent) {
      case "find_game": {
        const r = applyGameFilters(await loadOpenGames(), filters, { prefCity, loc, limit: 10 });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, games: r.games };
        break;
      }
      case "compare": {
        const cmpNames = ctx.turf && filters.turf_names.length === 1 ? [ctx.turf, ...filters.turf_names] : filters.turf_names;
        const resolved = resolveTurfNames(turfs, cmpNames.slice(0, 3), prefCity);
        const found = resolved.filter((r) => r.turf) as { name: string; turf: Turf }[];
        const missing = resolved.filter((r) => !r.turf).map((r) => r.name);
        if (found.length < 2 || !source.startsWith("claude")) {
          body = { ...base, relaxed: [], total: found.length, missing, turfs: found.map((r) => card(r.turf)), compare: null };
          break;
        }
        const sheets = (await Promise.all(found.map((r) => loadFacts(r.turf.id)))).filter((s) => s) as { turf: Turf; facts: Record<string, unknown> }[];
        const out = await compareTurfs(sheets.map((s) => s.facts));
        body = { ...base, relaxed: [], total: sheets.length, missing, turfs: sheets.map((s) => card(s.turf)), compare: out };
        break;
      }
      case "question": {
        const names = filters.turf_names.length ? filters.turf_names : ctx.turf ? [ctx.turf] : [];
        const [hit] = resolveTurfNames(turfs, names.slice(0, 1), prefCity);
        if (!hit?.turf || !source.startsWith("claude")) {
          body = { ...base, relaxed: [], total: 0, missing: filters.turf_names, answer: null };
          break;
        }
        const sheet = await loadFacts(hit.turf.id);
        const out = sheet ? await answerQuestion(filters.question ?? q, sheet.facts) : null;
        body = { ...base, relaxed: [], total: 1, missing: [], turfs: [card(hit.turf)], answer: out };
        break;
      }
      case "other":
        body = { ...base, relaxed: [], total: 0 };
        break;
      default: {
        const r = applyAskFilters(turfs, filters, { prefCity, loc, limit: 12 });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, turfs: r.turfs.map(card) };
      }
    }
  } catch (e) {
    console.error("ask: intent handler failed", filters.intent, e);
    body = { ...base, relaxed: [], total: 0, failed: true };
  }

  if (logId != null) {
    void supabase
      .rpc("ask_finish", {
        p_id: logId,
        p_filters: filters,
        p_results: Number(body.total) || 0,
        p_ms: Date.now() - started,
        p_source: source,
        p_reply: filters.reply,
        p_intent: filters.intent,
      })
      .then(() => {}, () => {});
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
