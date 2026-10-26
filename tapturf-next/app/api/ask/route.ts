import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { getAskTurfs } from "@/lib/queries/turfCache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { isCity } from "@/lib/city";
import { forCard } from "@/lib/utils/cardTurf";
import {
  AskFilters,
  addUsage,
  applyAskFilters,
  areasFromTurfs,
  isAskConfigured,
  keywordFilters,
  newUsage,
  parseAsk,
  relaxedLabel,
  resolveTurfNames,
  type AskContext,
  type AskTurn,
} from "@/lib/ai/ask";
import { quickAnswer } from "@/lib/ai/quick";
import { Declined, parseFresh } from "@/lib/ai/parseCache";
import { applyGameFilters, loadOpenGames } from "@/lib/ai/games";
import { answerQuestion, compareTurfs, loadFacts } from "@/lib/ai/compare";
import type { Turf } from "@/types/turf";
import { toolBySlug, toolPath } from "@/lib/tools/registry";
import { getHomeDataShared } from "@/lib/home/data";
import { askChipsFor } from "@/lib/home/select";
import { getPostBySlug } from "@/content/blog";
import { articleSearchChips, englishChip, hinglishChip, isSummaryAsk, looksLikeSearch } from "@/lib/ask/blog";
import { answerBlog, type BlogResult } from "@/lib/ai/blogAnswer";

// GET /api/ask?q=...&city=pune&lat=..&lng=..
// One box, four intents: find a turf, find a game, compare venues,
// ask about one venue. See lib/ai/ask.ts for how the sentence is read.
//
// A fresh question is read without a model call when it is one of our
// chips or a common shape (lib/ai/quick.ts), else from a cache of
// Claude's readings (lib/ai/parseCache.ts), else by Claude. The
// Server-Timing header and the logged filters (_t, _usage, _src) show
// where the time and tokens went. On a blog post the article answers
// first (lib/ai/blogAnswer.ts): its short version, an answer from it, or
// a web answer when it doesn't say. Only a turf or game search goes on
// to the reading below.

const MAX_Q = 160;

// A blog answer can be an answer and then a web search.
export const maxDuration = 60;

// The chat gives up on an article's answer at 45 s; leave room to send it.
const BLOG_DEADLINE_MS = 40_000;
// A search handed on from an article later than this is read without the
// model: a slow reading on top would run past the chat's wait.
const BLOG_LATE_MS = 20_000;

/** How the sentence was read: a ready answer, a cached reading, Claude now, or keywords; blog: answered from the article on screen. */
type Via = "quick" | "cache" | "claude" | "keywords" | "blog";

function ipHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`${process.env.ASK_SALT ?? "tapturf"}|${ip}`).digest("hex").slice(0, 32);
}

const card = (t: Turf & { distanceKm?: number }) => ({ ...forCard(t), ...(t.distanceKm != null ? { distanceKm: t.distanceKm } : {}) });

/** What page the player is on, trimmed. blog: the slug of the article on screen. */
function parseContext(raw: string | null): AskContext & { blog: string | null } {
  if (!raw) return { blog: null };
  try {
    const o = JSON.parse(raw) as { turf?: unknown; city?: unknown; blog?: unknown };
    return {
      turf: typeof o.turf === "string" ? o.turf.slice(0, 80) : null,
      city: isCity(typeof o.city === "string" ? o.city : null) ? (o.city as AskContext["city"]) : null,
      blog: typeof o.blog === "string" ? o.blog.slice(0, 120) : null,
    };
  } catch {
    return { blog: null };
  }
}

type Db = ReturnType<typeof createReadOnlyClient>;
type Finish = { filters: Record<string, unknown>; results: number; ms: number; source: "claude" | "keywords"; reply: string; intent: string };

/**
 * Fills in the ask's log row. after(): the write runs once the reply is
 * sent, and the function stays alive until it lands (a bare promise
 * could be cut off).
 */
function logFinish(supabase: Db, id: number | null, row: Finish): void {
  if (id == null) return;
  after(async () => {
    await supabase
      .rpc("ask_finish", { p_id: id, p_filters: row.filters, p_results: row.results, p_ms: row.ms, p_source: row.source, p_reply: row.reply, p_intent: row.intent })
      .then(() => {}, () => {});
  });
}

// blog: the article's answerer, when it handed a search on to the reading.
const timingOf = (ms: Record<string, number>, via: Via) =>
  ["budget", "turfs", ...(ms.blog != null ? ["blog"] : []), "parse", "handler", "total"].map((k) => `${k};dur=${ms[k] ?? 0}${k === "parse" ? `;desc="${via}"` : ""}`).join(", ");

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
      for (const k of ["intent", "tool", "city", "sport", "areas", "turf_names", "max_price_per_hour", "time", "when", "skill", "open_24x7", "wants_nearby", "needs", "sort"]) {
        if (f[k] != null && f[k] !== false && !(Array.isArray(f[k]) && (f[k] as unknown[]).length === 0)) keep[k] = f[k];
      }
      if (Array.isArray(f.top)) keep.top = (f.top as unknown[]).filter((x) => typeof x === "string").slice(0, 5).map((x) => String(x).slice(0, 80));
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
  const { blog: blogSlug, ...ctx } = parseContext(searchParams.get("ctx"));
  // Signed-in players send their account id; visitors a browser id and
  // get three answers a day before sign-in. Phone users have no server
  // session, so both are trusted ids; the per-IP budget caps abuse.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uid = searchParams.get("uid") ?? "";
  const aid = searchParams.get("aid") ?? "";
  const userId = UUID.test(uid) ? uid : null;
  const anonId = !userId && UUID.test(aid) ? aid : null;
  if (!userId && !anonId) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  const started = Date.now();
  const supabase = createReadOnlyClient();
  const ms: Record<string, number> = {};
  const timed = <T,>(stage: string, p: Promise<T>): Promise<T> => {
    const t0 = performance.now();
    return p.finally(() => {
      ms[stage] = Math.round(performance.now() - t0);
    });
  };

  // The turf list loads while the budget is checked; the budget still
  // decides before any model call.
  const turfsLoad = timed("turfs", getAskTurfs());
  // A refused ask returns without awaiting it; after() keeps the shared
  // load running until it finishes.
  after(turfsLoad.catch(() => {}));
  // On an article, the chips under the answer load meanwhile too: in
  // memory on a warm instance, else from the data cache.
  const post = blogSlug ? getPostBySlug(blogSlug) : undefined;
  const chipsLoad = post
    ? getHomeDataShared().then(
        // What to ask next: the article's city, else the visitor's.
        (d) => askChipsFor(d, post.city ?? prefCity),
        () => [] as string[],
      )
    : null;
  if (chipsLoad) after(chipsLoad);

  // Budgets: null id means this IP has asked too often; free_left -1
  // means the visitor has used today's free answers.
  let logId: number | null = null;
  let freeLeft: number | null = null;
  try {
    const { data } = await timed("budget", Promise.resolve(supabase.rpc("ask_begin_v2", { p_ip_hash: ipHash(req), p_query: q, p_user_id: userId, p_anon_id: anonId })));
    const row = (Array.isArray(data) ? data[0] : data) as { id: number | null; free_left: number | null } | null;
    if (row?.free_left === -1) return NextResponse.json({ error: "sign_in", freeLeft: 0 }, { status: 401 });
    if (row && row.id === null) return NextResponse.json({ error: "Too many searches, try again in a few minutes" }, { status: 429 });
    logId = row?.id ?? null;
    freeLeft = row?.free_left ?? null;
  } catch {
    /* logging is best effort */
  }

  const usage = newUsage();

  // On an article, the article answers first: no turfs are searched and
  // the sentence isn't read, unless it turns out to be a search.
  // skipModel: the reading below doesn't wait on the model again, because
  // it just failed here or took too long.
  let skipModel = false;
  if (post) {
    const t0 = performance.now();
    const mode = isSummaryAsk(q) ? "summary" : "answer";
    const chips = await (chipsLoad ?? []);
    // One of our own search chips (one sits under every answer here): a search, no need to ask.
    const chip = chips.some((c) => [c, englishChip(c), hinglishChip(c)].some((x) => x.toLowerCase() === q.toLowerCase()));
    const got: BlogResult = chip
      ? { search: true, usage: null }
      : await answerBlog(post, { mode, question: q, history: history.map((h) => ({ user: h.user, reply: h.reply })) }, started + BLOG_DEADLINE_MS);
    // No answerer (no model, or it failed) for what reads as a search: search, rather than show the outline.
    const fallBack = !got.search && got.blog.kind === "outline" && looksLikeSearch(q);
    skipModel = fallBack || Date.now() - started > BLOG_LATE_MS;
    const result: BlogResult = fallBack ? { search: true, usage: got.usage } : got;
    if (result.usage) addUsage(usage, result.usage);
    if (result.search) {
      // A turf or game search: on to the usual reading, which logs the tokens spent here too.
      ms.blog = Math.round(performance.now() - t0);
    } else {
      ms.handler = Math.round(performance.now() - t0);
      ms.total = Date.now() - started;
      const { blog } = result;
      const source = blog.kind === "outline" ? "keywords" : "claude";
      // Two questions about the article, then a search for its city.
      const asked = new Set(result.followups.map((f) => f.toLowerCase()));
      // Then one search that fits the article (its sport; none for owners).
      const followups = [...result.followups, ...articleSearchChips(post, chips, q).filter((c) => !asked.has(c.toLowerCase()))].slice(0, 3);
      const body = {
        query: q,
        intent: "blog",
        summary: `Blog: ${post.title}`.slice(0, 120),
        reply: result.reply,
        followups,
        source,
        via: "blog",
        filters: { city: post.city, sport: null, areas: [], maxPrice: null, time: null, when: null, skill: null, open24x7: false, wantsNearby: false, needs: [], players: null, sort: "rating" },
        needsLocation: false,
        freeLeft,
        // A follow-up after an answer about the article is a fresh search, not a refinement of one.
        memo: { intent: "other", top: [] },
        relaxed: [],
        total: 0,
        blog,
      };
      logFinish(supabase, logId, {
        filters: {
          intent: "blog",
          slug: post.slug,
          mode,
          kind: blog.kind,
          scope: result.scope,
          visual: blog.visual?.kind ?? null,
          web: blog.kind === "web",
          _src: "blog",
          _t: ms,
          ...(usage.calls ? { _usage: usage } : {}),
        },
        // 1 for any answer (it may have no points): admin counts 0 as an ask that found nothing.
        results: blog.kind === "outline" ? 0 : 1,
        ms: Date.now() - started,
        source,
        reply: result.reply,
        intent: "blog",
      });
      return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", "Server-Timing": timingOf(ms, "blog") } });
    }
  }

  const turfs = await turfsLoad;
  const areas = areasFromTurfs(turfs);
  const parseStart = performance.now();
  const fresh = history.length === 0;
  let filters: AskFilters = keywordFilters(q);
  let via: Via = "keywords";
  const quick = fresh ? quickAnswer(q, { areas, turfs }, { prefCity, city: ctx.city, turf: ctx.turf }) : null;
  const quickOk = quick ? AskFilters.safeParse(quick) : null;
  if (quickOk && !quickOk.success) console.error("ask: ready answer failed the schema", q, quickOk.error.issues.slice(0, 3));
  if (quickOk?.success) {
    filters = quickOk.data;
    via = "quick";
  } else if (isAskConfigured() && !skipModel) {
    try {
      if (fresh) {
        const got = await parseFresh(q, areas, ctx);
        filters = got.filters;
        via = got.cached ? "cache" : "claude";
        if (got.usage) addUsage(usage, got.usage);
      } else {
        const parsed = await parseAsk(q, areas, history, ctx, usage);
        if (parsed) {
          filters = parsed.filters;
          via = "claude";
        }
      }
    } catch (e) {
      if (e instanceof Declined) addUsage(usage, e.usage);
      else console.error("ask: claude failed, falling back to keywords", e);
    }
  }
  ms.parse = Math.round(performance.now() - parseStart);
  // ask_queries.source only takes these two; the real path is logged as _src.
  const source: "claude" | "keywords" = via === "claude" || via === "cache" ? "claude" : "keywords";
  // Compare and question need a second call; skip it when Claude is down.
  const canCallClaude = isAskConfigured() && !skipModel && via !== "keywords";

  const base = {
    query: q,
    intent: filters.intent,
    summary: filters.summary,
    reply: filters.reply,
    followups: filters.followups.slice(0, 3),
    source,
    /** Which path read the sentence: quick, cache, claude or keywords. */
    via,
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
    /** Free answers left today for a signed-out visitor; null when signed in. */
    freeLeft,
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

  const handlerStart = performance.now();
  try {
    switch (filters.intent) {
      case "find_game": {
        const r = applyGameFilters(await loadOpenGames(), filters, { prefCity, loc, limit: 10 });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, games: r.games };
        // The budget was dropped to find any game: no "Under ₹X" chip over games that cost more.
        if (r.relaxed.includes("price")) body.filters = { ...base.filters, maxPrice: null };
        // No open game yet: show turfs for the same sport and place, so
        // the player can book one and host the game instead of hitting a wall.
        if (r.games.length === 0) {
          const t = applyAskFilters(turfs, { ...filters, intent: "find_turf", when: null, time: null }, { prefCity, loc, limit: 3 });
          if (t.turfs.length) {
            body.turfs = t.turfs.map(card);
            body.reply = "No open games match that yet. Book one of these turfs and host it, players nearby can join.";
          }
        }
        break;
      }
      case "compare": {
        // "Compare the top two" with no names: fall back to what was shown last.
        const lastTop = [...history].reverse().find((h) => h.filters.top?.length)?.filters.top ?? [];
        const named = filters.turf_names.length ? filters.turf_names : lastTop.slice(0, 2);
        const cmpNames = ctx.turf && named.length === 1 ? [ctx.turf, ...named] : named;
        const resolved = resolveTurfNames(turfs, cmpNames.slice(0, 3), prefCity);
        const found = resolved.filter((r) => r.turf) as { name: string; turf: Turf }[];
        const missing = resolved.filter((r) => !r.turf).map((r) => r.name);
        if (found.length < 2 || !canCallClaude) {
          body = { ...base, relaxed: [], total: found.length, missing, turfs: found.map((r) => card(r.turf)), compare: null };
          break;
        }
        const sheets = (await Promise.all(found.map((r) => loadFacts(r.turf.id)))).filter((s) => s) as { turf: Turf; facts: Record<string, unknown> }[];
        const out = await compareTurfs(sheets.map((s) => s.facts), usage);
        body = { ...base, relaxed: [], total: sheets.length, missing, turfs: sheets.map((s) => card(s.turf)), compare: out };
        break;
      }
      case "question": {
        const names = filters.turf_names.length ? filters.turf_names : ctx.turf ? [ctx.turf] : [];
        const [hit] = resolveTurfNames(turfs, names.slice(0, 1), prefCity);
        if (!hit?.turf || !canCallClaude) {
          body = { ...base, relaxed: [], total: 0, missing: filters.turf_names, answer: null };
          break;
        }
        const sheet = await loadFacts(hit.turf.id);
        const out = sheet ? await answerQuestion(filters.question ?? q, sheet.facts, usage) : null;
        body = { ...base, relaxed: [], total: 1, missing: [], turfs: [card(hit.turf)], answer: out };
        break;
      }
      case "tool": {
        // Point at the free cricket tool; the page itself does the work.
        const def = toolBySlug(filters.tool ?? "") ?? toolBySlug("cricket-nrr-calculator")!;
        body = { ...base, relaxed: [], total: 1, tool: { slug: def.slug, name: def.name, tagline: def.tagline, href: toolPath(def.slug) } };
        break;
      }
      case "create_game":
        // The wizard drafts the game from the same sentence. One card shown.
        body = { ...base, relaxed: [], total: 1, draft: q };
        break;
      case "other": {
        // Unclear or off-topic: offer what Ask can do, for this city.
        body = { ...base, relaxed: [], total: 0 };
        if (!filters.followups.length) body.followups = askChipsFor(await getHomeDataShared(), filters.city ?? prefCity).slice(0, 5);
        break;
      }
      default: {
        const r = applyAskFilters(turfs, filters, { prefCity, loc, limit: 12 });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, turfs: r.turfs.map(card) };
        // Nothing listed a rate within the budget (most turfs list none:
        // Gota had 3 box cricket turfs on 26 Oct, none priced), so the
        // budget was dropped. Say so, instead of an "Under ₹1,000/hr" chip
        // and a "cheapest first" reply over cards with no price.
        if (r.relaxed.includes("price") && filters.max_price_per_hour != null) {
          body.filters = { ...base.filters, maxPrice: null };
          if (r.total > 0) body.reply = `None of the matching turfs list a rate under ₹${filters.max_price_per_hour.toLocaleString("en-IN")} an hour yet, so here are the closest. Check the rate with the turf.`;
        }
      }
    }
  } catch (e) {
    console.error("ask: intent handler failed", filters.intent, e);
    body = { ...base, relaxed: [], total: 0, failed: true };
  }
  ms.handler = Math.round(performance.now() - handlerStart);
  ms.total = Date.now() - started;

  // Names shown this turn, so the next message can say "the first one".
  const shown = (body.turfs as { name: string }[] | undefined)?.map((t) => t.name) ?? (body.games as { turfs?: { name?: string } }[] | undefined)?.map((g) => g.turfs?.name ?? "").filter(Boolean) ?? [];
  body.memo = { ...(body.memo as Record<string, unknown>), top: shown.slice(0, 5) };

  logFinish(supabase, logId, {
    // shown_ids: which turfs this answer showed (owners see the count on myTapturf).
    // _src, _t (stage ms) and _usage (tokens across every model call) are for tuning.
    filters: {
      ...filters,
      shown_ids: ((body.turfs as { id?: string }[] | undefined) ?? []).map((t) => t.id).filter(Boolean).slice(0, 12),
      _src: via,
      _t: ms,
      ...(usage.calls ? { _usage: usage } : {}),
    },
    results: Number(body.total) || (Array.isArray(body.turfs) ? body.turfs.length : 0),
    ms: Date.now() - started,
    source,
    reply: filters.reply,
    intent: filters.intent,
  });

  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", "Server-Timing": timingOf(ms, via) } });
}
