import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { getAskTurfs } from "@/lib/queries/turfCache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { isCity, labelFor } from "@/lib/city";
import { forCard } from "@/lib/utils/cardTurf";
import {
  AskFilters,
  addUsage,
  applyAskFilters,
  areasFromTurfs,
  cityNamed,
  EXTRA_KEYS,
  isAskConfigured,
  keywordExtras,
  keywordFilters,
  nameIn,
  newUsage,
  NO_EXTRAS,
  parseAsk,
  readingSchema,
  relaxedLabel,
  SPORT_FALLBACK,
  turfExtrasAsked,
  type AskContext,
  type AskReading,
  type AskTurn,
} from "@/lib/ai/ask";
import { quickAnswer, venues } from "@/lib/ai/quick";
import { EVAL_HEADER, loggedShownIds, routerChoice, type RouterVersion } from "@/lib/ai/routerVersion";
import { normalOpenAt, openAtWords } from "@/lib/ai/openAt";
import { getAskTurfFacts } from "@/lib/queries/askFacts";
import { sportBySlug } from "@/lib/sports";
import { namesVenue, placedAt, resolveWithPage, shownNames, wholeVenueName } from "@/lib/ai/names";
import { asksPrice, cardPrices, cardSportOf, compareTable, hostPreview, hostVenueWords, priceChart, resultsMap, saysHere, visualsFor, type AskVisuals } from "@/lib/ask/cards";
import { getSportBands, getSportBandTimes, withSportBands } from "@/lib/queries/sportBands";
import { sportMinimumPrice } from "@/lib/utils/cardSport";
import {
  cap,
  citiesLine,
  closestRow,
  elsewhereRow,
  extrasPhrase,
  gamesExtrasLine,
  gamesFoundReply,
  gamesNoneReply,
  gamesWidenedReply,
  NEARBY_KM,
  noneIn,
  noneYetReply,
  nowhereReply,
  unavailableLine,
  venueLine,
  venueReply,
  venueRows,
  widenedReply,
  type GameAsk,
} from "@/lib/ai/relax";
import { areaFor } from "@/lib/utils/area";
import { Declined, parseFresh } from "@/lib/ai/parseCache";
import { applyGameFilters, loadOpenGames } from "@/lib/ai/games";
import { answerQuestion, compareTurfs, loadFacts } from "@/lib/ai/compare";
import { isReviewsAsk, pickAnswer } from "@/lib/ai/reviewsAnswer";
import { REVIEWS_CHIP } from "@/lib/ask/chips";
import type { Turf } from "@/types/turf";
import { toolBySlug, toolPath } from "@/lib/tools/registry";
import { getHomeDataShared } from "@/lib/home/data";
import { askChipsFor } from "@/lib/home/select";
import { getPostBySlug } from "@/content/blog";
import { articleSearchChips, englishChip, hinglishChip, isSummaryAsk, looksLikeSearch } from "@/lib/ask/blog";
import { answerBlog, type BlogResult } from "@/lib/ai/blogAnswer";
import { cleanVenueName, mentionsBookingApp, scrubBookingApps } from "@/lib/utils/bookingApps";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What page the player is on, trimmed. blog: the slug of the article on screen. */
function parseContext(raw: string | null): AskContext & { blog: string | null } {
  if (!raw) return { blog: null };
  try {
    const o = JSON.parse(raw) as { turf?: unknown; turfId?: unknown; city?: unknown; blog?: unknown };
    return {
      turf: typeof o.turf === "string" ? o.turf.slice(0, 80) : null,
      turfId: typeof o.turfId === "string" && UUID.test(o.turfId) ? o.turfId : null,
      city: isCity(typeof o.city === "string" ? o.city : null) ? (o.city as AskContext["city"]) : null,
      blog: typeof o.blog === "string" ? o.blog.slice(0, 120) : null,
    };
  } catch {
    return { blog: null };
  }
}

type Db = ReturnType<typeof createReadOnlyClient>;
/**
 * The player's words reach the model, so a booking app they name ("Hudle
 * pe Baner me football turf?") can come back in the reply, the summary or
 * the chips: never shown (lib/utils/bookingApps.ts). What is left when
 * the scrub takes all of it is the box's plain line for the intent.
 */
function withoutBookingApps<F extends AskFilters>(f: F): F {
  if (!mentionsBookingApp(f.reply) && !mentionsBookingApp(f.summary) && !f.followups.some(mentionsBookingApp)) return f;
  const game = f.intent === "find_game";
  const reply = mentionsBookingApp(f.reply)
    ? (scrubBookingApps(f.reply) ??
      (game ? "Here are the open games that match." : f.intent === "other" ? "I can find you a turf or a game, compare two venues or answer a question about one." : "Here is what matches on TapTurf."))
    : f.reply;
  const summary = mentionsBookingApp(f.summary) ? (scrubBookingApps(f.summary) ?? (game ? "Open games" : "Turfs on TapTurf")) : f.summary;
  return { ...f, reply, summary, followups: f.followups.filter((x) => !mentionsBookingApp(x)) };
}

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

/** Router v10's fields a follow-up keeps ("only claimed ones", "and free ones?"), and players, the spots a game search needs. */
const HISTORY_V10 = [...EXTRA_KEYS, "players"];

/** Last three turns from the client, trimmed so a hostile client can't pad the prompt. `version` 10 keeps v10's fields too. */
function parseHistory(raw: string | null, version: RouterVersion): AskTurn[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(-3).flatMap((h) => {
      if (!h || typeof h.user !== "string") return [];
      const f = (h.filters && typeof h.filters === "object" ? h.filters : {}) as Record<string, unknown>;
      const keep: Record<string, unknown> = {};
      for (const k of ["intent", "tool", "city", "sport", "areas", "turf_names", "max_price_per_hour", "time", "when", "skill", "open_24x7", "wants_nearby", "needs", "sort", "free_text", ...(version === 10 ? HISTORY_V10 : [])]) {
        if (f[k] != null && f[k] !== false && !(Array.isArray(f[k]) && (f[k] as unknown[]).length === 0)) keep[k] = f[k];
      }
      if (version === 10) {
        // "now", "HH:MM" or "sun HH:MM" (normalOpenAt), and a count: nothing else reaches the prompt.
        const at = typeof keep.open_at === "string" ? normalOpenAt(keep.open_at.slice(0, 20)) : null;
        if (at) keep.open_at = at;
        else delete keep.open_at;
        if (typeof keep.players !== "number") delete keep.players;
        for (const k of EXTRA_KEYS) if (k !== "open_at" && k in keep && keep[k] !== true) delete keep[k];
      }
      // A venue named earlier stays in the conversation ("is it open late?"); trimmed like the rest.
      if (typeof keep.free_text === "string") keep.free_text = keep.free_text.slice(0, 80);
      else delete keep.free_text;
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
  // Router v10 only when switched on, or for an eval request with the key (lib/ai/routerVersion.ts).
  const choice = routerChoice(process.env, req.headers.get(EVAL_HEADER));
  const version = choice.version;
  const history = parseHistory(searchParams.get("h"), version);
  const { blog: blogSlug, ...ctx } = parseContext(searchParams.get("ctx"));
  // Signed-in players send their account id; visitors a browser id and
  // get three answers a day before sign-in. Phone users have no server
  // session, so both are trusted ids; the per-IP budget caps abuse.
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
  // The city the player's own words name, if any: it beats the page's
  // and theirs when a venue name is shared ("Prime Turf in Ballari").
  const askedCity = cityNamed(turfs, q);
  // The venues the last answer showed, for "compare the top two" and "the second one".
  const lastTop = [...history].reverse().find((h) => h.filters.top?.length)?.filters.top ?? [];
  let filters: AskReading = keywordFilters(q, { turfs, pageTurf: ctx.turf, shown: lastTop });
  // Router v10 without the model: its fields from keywords too.
  if (version === 10) filters = { ...filters, ...keywordExtras(q, filters.intent) };
  let via: Via = "keywords";
  const quick = fresh ? quickAnswer(q, { areas, turfs }, { prefCity, city: ctx.city, turf: ctx.turf }, version) : null;
  const quickOk = quick ? readingSchema(version).safeParse(quick) : null;
  if (quickOk && !quickOk.success) console.error("ask: ready answer failed the schema", q, quickOk.error.issues.slice(0, 3));
  if (quickOk?.success) {
    filters = quickOk.data;
    via = "quick";
  } else if (isAskConfigured() && !skipModel) {
    try {
      if (fresh) {
        const got = await parseFresh(q, areas, ctx, version);
        filters = got.filters;
        via = got.cached ? "cache" : "claude";
        if (got.usage) addUsage(usage, got.usage);
      } else {
        const parsed = await parseAsk(q, areas, history, ctx, usage, version);
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
  // A first message that is only a venue's whole name, read as small
  // talk ("Dribble den", ask 396): a search for that venue. Not a word
  // some venue's name starts with ("sure", "really"), nor a reply to the box.
  if (filters.intent === "other" && via !== "quick" && fresh) {
    const named = wholeVenueName(turfs, q);
    if (named)
      filters = { ...filters, intent: "find_turf", free_text: named.label, turf_names: [], summary: named.label.slice(0, 120), reply: `Here is what matches ${named.label}.`, followups: [] };
  }
  filters = withoutBookingApps(filters);
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
    /** Router v10 read it (lib/ai/routerVersion.ts); absent for v9. */
    ...(version === 10 ? { router: 10 } : {}),
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
      // Router v10's, for the chips and for grading (scripts/ask-eval); v9's answers have none.
      ...(version === 10
        ? {
            claimed: !!filters.claimed,
            ownerPrices: !!filters.owner_prices,
            withPhotos: !!filters.with_photos,
            playerReviews: !!filters.player_reviews,
            openAt: filters.open_at ?? null,
            freeToJoin: !!filters.free_to_join,
            turfBooked: !!filters.turf_booked,
          }
        : {}),
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
      // The venue the player named, set below when one was found, so "is it open late?" keeps it.
      free_text: null as string | null,
      // Router v10's, so "only free ones" builds on them (parseHistory keeps them under v10 only).
      ...(version === 10 ? { ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, filters[k] ?? NO_EXTRAS[k]])), players: filters.players } : {}),
    },
  };
  let body: Record<string, unknown> = { ...base, relaxed: [], total: 0 };
  // Venue names (without an app's attribution) and cities as replies say them.
  const place = (t: Turf) => ({ name: cleanVenueName(t.name), area: areaFor(t), city: labelFor(t.city ?? "") });
  const label = (c: string | null | undefined) => (c && isCity(c) ? labelFor(c) : null);
  // Who a shared name means: the city the player named, the reading's, then theirs.
  const prefer = [askedCity, filters.city, prefCity];
  // The venue page the player is on, by its row: two venues can share a
  // name in one city (three Huddle Arenas in Vadodara), so "this turf" is never looked up by name.
  const page = { name: ctx.turf, turf: ctx.turfId ? (turfs.find((t) => t.id === ctx.turfId) ?? null) : null };

  const handlerStart = performance.now();
  try {
    switch (filters.intent) {
      case "find_game": {
        const r = applyGameFilters(await loadOpenGames(), filters, { prefCity, loc, limit: 10, version });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, games: r.games };
        // The budget was dropped to find any game: no "Under ₹X" chip over games that cost more.
        if (r.relaxed.includes("price")) body.filters = { ...base.filters, maxPrice: null };
        // No open game yet: show turfs for the same sport and place, so
        // the player can book one and host the game instead of hitting a wall.
        if (r.games.length === 0) {
          // Router v10's turf filters are no game's: the turfs to host at are any of the sport and place.
          const t = applyAskFilters(turfs, { ...filters, intent: "find_turf", when: null, time: null, ...(version === 10 ? NO_EXTRAS : {}) }, { prefCity, loc, limit: 3 });
          if (t.turfs.length) {
            body.turfs = t.turfs.map(card);
            body.reply = "No open games match that yet. Book one of these turfs and host it, players nearby can join.";
          }
        }
        // Router v10: what was asked for said from the rows, never the model's
        // line over games that aren't it, and hosting said as calling the turf.
        if (version === 10) {
          const gameCity = filters.city ?? (!filters.wants_nearby ? prefCity : null);
          const ask: GameAsk = {
            free: !!filters.free_to_join,
            booked: !!filters.turf_booked,
            spots: filters.players != null && filters.players > 0 ? filters.players : null,
            skill: filters.skill,
            sport: sportBySlug(filters.sport ?? "")?.name.toLowerCase() ?? null,
            at: filters.when ? { today: "today", tomorrow: "tomorrow", weekend: "this weekend", this_week: "this week" }[filters.when] : "",
            where: gameCity && isCity(gameCity) ? `in ${labelFor(gameCity)}` : filters.wants_nearby ? "near you" : "",
          };
          const said = r.games.length === 0 ? gamesNoneReply(ask, !!body.turfs) : gamesWidenedReply(ask, r.relaxed);
          if (said) body.reply = said;
          // Turf filters asked of games ("free games at verified turfs"): no game is picked by
          // them, so the reply says so, never the model's "at verified turfs".
          const turfOnly = turfExtrasAsked(filters);
          if (turfOnly.length && r.games.length > 0) body.reply = `${said ?? gamesFoundReply(ask)} ${gamesExtrasLine(turfOnly)}`;
          // The chips follow the games shown: no "Football" chip over the free badminton game shown instead.
          if (r.games.length > 0)
            for (const k of ["sport", "when", "skill"] as const) if (r.relaxed.includes(k)) body.filters = { ...(body.filters as typeof base.filters), [k]: null };
        }
        break;
      }
      case "compare": {
        // "Compare the top two" with no names: fall back to what was shown last.
        const named = filters.turf_names.length ? filters.turf_names : lastTop.slice(0, 2);
        const cmpNames = ctx.turf && named.length === 1 ? [ctx.turf, ...named] : named;
        // Each a different venue ("compare the top two" under five Huddle Arenas is two of them), the page's own by its row.
        const resolved = resolveWithPage(turfs, cmpNames.slice(0, 3), prefer, page, { distinct: true });
        const found = resolved.filter((r) => r.turf) as { name: string; turf: Turf }[];
        const missing = resolved.filter((r) => !r.turf).map((r) => r.name);
        // Venues in other cities are compared all the same; say where they are.
        const where = citiesLine(found.map((r) => place(r.turf)), label(prefCity));
        const reply = where ? `${filters.reply} ${where}` : filters.reply;
        if (found.length < 2) {
          body = { ...base, reply, relaxed: [], total: found.length, missing, turfs: found.map((r) => card(r.turf)), compare: null };
          break;
        }
        // The table is built from the venues' own rows (the read the model's
        // sheets come from), so it shows without the model too; the model
        // adds the verdict, what each is best for and the caveats.
        const sheets = (await Promise.all(found.map((r) => loadFacts(r.turf.id, version === 10)))).filter((s) => s) as { turf: Turf; facts: Record<string, unknown> }[];
        const out = canCallClaude && sheets.length >= 2 ? await compareTurfs(sheets.map((s) => s.facts), usage) : null;
        const reports = sheets.map((s) => {
          const r = s.facts.tapturf_reports as { players?: number; average_stars?: string } | undefined;
          return r?.players && r.average_stars ? { players: r.players, average: r.average_stars } : null;
        });
        const table = compareTable(sheets.map((s) => s.turf), { sport: filters.sport, loc, reports });
        const show = visualsFor(filters, { compared: sheets.length });
        // rows: [] for a tab opened before 30 Oct, whose chat maps compare.rows: it then
        // shows the verdict and "Best for" over the cards. Drop after a release or two.
        const compare = out ? { ...out, rows: [] } : null;
        body = { ...base, reply, relaxed: [], total: sheets.length, missing, turfs: sheets.map((s) => card(s.turf)), compare, ...(show.length ? { visuals: { show, compare: table } satisfies AskVisuals } : {}) };
        break;
      }
      case "question": {
        const names = filters.turf_names.length ? filters.turf_names : ctx.turf ? [ctx.turf] : [];
        // "This turf" on a venue page is that row; no other venue by its name to mention.
        const [hit] = resolveWithPage(turfs, names.slice(0, 1), prefer, page);
        if (!hit?.turf) {
          body = { ...base, relaxed: [], total: 0, missing: filters.turf_names, answer: null };
          break;
        }
        // A venue typed that isn't in the player's city (the one asked
        // about, the reading's, theirs): say so first, as a search does
        // ("No turf called Kage in Mumbai."). Not for the page's venue, a
        // card shown last turn or a venue named earlier in the conversation
        // (free_text or turf_names), nor when the player said where it is
        // ("does Prime Turf Marol have parking"), as a search reads it.
        const home = label(askedCity ?? filters.city ?? prefCity);
        const typed = filters.turf_names[0];
        const earlier = [ctx.turf ?? "", ...lastTop, ...history.flatMap((h) => [h.filters.free_text ?? "", ...(h.filters.turf_names ?? [])])];
        const carried = !!typed && earlier.some((n) => n.toLowerCase() === typed.toLowerCase());
        const away = !!home && !!typed && !carried && place(hit.turf).city !== home && !placedAt([hit.turf], typed, filters.areas);
        // The venue's own name when typed whole ("Kick it arena"), else the words typed ("Kage").
        const lead = away && home ? noneIn(hit.whole ? place(hit.turf).name : cap(nameIn(turfs, typed) ?? typed), home) : null;
        // Which venue this is, when it isn't in the player's city or the name is shared.
        const which = venueLine(place(hit.turf), lead ? home : label(prefCity), hit.others.map((t) => labelFor(t.city ?? "")));
        const asked = filters.question ?? q;
        // "What do players say about it?": TapTurf players' reports, then Google's rating and reviews.
        const aboutReviews = isReviewsAsk(asked);
        // After any other question about the page's venue, what players say is the next chip.
        const followups =
          page.turf?.id === hit.turf.id && !aboutReviews
            ? [REVIEWS_CHIP, ...base.followups.filter((f) => f.toLowerCase() !== REVIEWS_CHIP.toLowerCase())].slice(0, 3)
            : base.followups;
        const sheet = canCallClaude || aboutReviews ? await loadFacts(hit.turf.id, version === 10) : null;
        // What people say is said from the sheet without the model when there is no model, or
        // nothing written to read (the model used to dress the numbers up as "reviewers mention...");
        // it falls back to that when the model fails, and replaces a model answer that says what
        // people said with nothing of theirs to read (lib/ai/reviewsAnswer.ts pickAnswer).
        // A review question has an answer ready, so the model gets 10 s, not the client's 20 s twice.
        const picked = await pickAnswer(
          asked,
          sheet,
          canCallClaude ? (question, facts) => answerQuestion(question, facts, usage, aboutReviews ? { deadline: Date.now() + 10_000 } : undefined) : null,
          (e) => console.error("ask: answer failed, plain reviews answer", e),
        );
        // The venue's card has its hours, prices and facilities: said when there is no answer, and
        // under the plain reviews answer to a question that also asked for one ("price and reviews").
        const cardReply = lead
          ? `${lead} ${which} Its page has the timings, prices and facilities.`
          : `Here is ${place(hit.turf).name}. Its page has the timings, prices and facilities.${which ? ` ${which}` : ""}`;
        if (!canCallClaude && !picked.answer) {
          body = { ...base, followups, reply: cardReply, relaxed: [], total: 1, missing: [], turfs: [card(hit.turf)], answer: null };
          break;
        }
        const reply = picked.more && picked.path !== "model" ? cardReply : lead ? `${lead} ${which}` : which ? `${filters.reply} ${which}` : filters.reply;
        body = { ...base, followups, reply, relaxed: [], total: 1, missing: [], turfs: [card(hit.turf)], answer: picked.answer };
        break;
      }
      case "tool": {
        // Point at the free cricket tool; the page itself does the work.
        const def = toolBySlug(filters.tool ?? "") ?? toolBySlug("cricket-nrr-calculator")!;
        body = { ...base, relaxed: [], total: 1, tool: { slug: def.slug, name: def.name, tagline: def.tagline, href: toolPath(def.slug) } };
        break;
      }
      case "create_game": {
        // The wizard drafts the game from the same sentence. One card shown:
        // what the reading says of the game, and the venue when it names
        // one we list (or "here" on a venue's page), picked in the wizard.
        // Only a venue's own name picks one: a wrong venue in the wizard is worse than none.
        const words = filters.turf_names[0] ?? hostVenueWords(q);
        const [hit] = words && (namesVenue(turfs, words) || words === page.name) ? resolveWithPage(turfs, [words], prefer, page) : [];
        const at = hit?.turf ?? (page.turf && saysHere(q) ? page.turf : null);
        body = { ...base, relaxed: [], total: 1, draft: q, visuals: { show: visualsFor(filters, {}), host: hostPreview(filters, at, q) } satisfies AskVisuals };
        break;
      }
      case "other": {
        // Unclear or off-topic: offer what Ask can do, for this city.
        body = { ...base, relaxed: [], total: 0 };
        if (!filters.followups.length) body.followups = askChipsFor(await getHomeDataShared(), filters.city ?? prefCity).slice(0, 5);
        break;
      }
      default: {
        // Router v10's filters the turf rows can't answer read their own data
        // meanwhile (lib/queries/askFacts.ts): hours and the owner's prices, players' reports.
        const extras = version === 10 ? turfExtrasAsked(filters) : [];
        const needHours = extras.includes("open_at") || extras.includes("owner_prices");
        const factsLoad = needHours || extras.includes("player_reviews") ? getAskTurfFacts({ hours: needHours, reports: extras.includes("player_reviews") }) : null;
        // With a sport, the cards show its price (cardPrices, below), and the
        // budget and cheapest first read the same (applyAskFilters): the
        // sport's bands, and by time when a time was asked (cached reads).
        const [bands, times] = filters.sport ? await Promise.all([getSportBands(), filters.time ? getSportBandTimes() : null]) : [null, null];
        const facts = factsLoad ? await factsLoad : null;
        const r = applyAskFilters(turfs, filters, { prefCity, loc, limit: 12, askedCity, sportPrices: { bands, times }, facts });
        body = { ...base, relaxed: r.relaxed.map(relaxedLabel), total: r.total, turfs: r.turfs.map(card) };
        // The chip and the "more" link follow the cards: cricket when no
        // practice nets were listed in the place (Nashik on 26 Oct).
        if (r.sport !== filters.sport) body.filters = { ...(body.filters as typeof base.filters), sport: r.sport };
        // The city chip, the "more" link and the next turn's city follow
        // the cards too: a named venue's own city (none for several), or
        // no city when the reading's gave way to an area it doesn't have.
        if (r.city !== filters.city) {
          body.filters = { ...(body.filters as typeof base.filters), city: r.city };
          body.memo = { ...(body.memo as Record<string, unknown>), city: r.city };
        }
        if (r.venue) {
          // The venues by that name, wherever they are: no "See all" to a
          // city list, no "after widening your city", and say which city.
          body.total = r.turfs.length;
          body.relaxed = r.relaxed.filter((k) => !["asked_city", "city", "pref_city"].includes(k)).map(relaxedLabel);
          body.memo = { ...(body.memo as Record<string, unknown>), free_text: r.venue.label };
          // None by that name in the player's city: its closest names
          // there first, in the reply and as their own row of cards.
          const near = r.closest?.turfs ?? [];
          const said = venueReply({
            label: r.venue.label,
            shown: r.turfs.map(place),
            home: label(r.venue.askedCity ?? filters.city ?? prefCity),
            asked: label(r.venue.askedCity),
            closest: r.closest ? near.map((t) => place(t).name) : null,
            whole: r.venue.whole,
          });
          if (said) body.reply = said;
          const rows = r.closest ? venueRows(labelFor(r.closest.city), near.length, r.turfs.map(place)) : null;
          if (rows) {
            body.turfs = [...near, ...r.turfs].map(card);
            body.rows = rows;
          }
          break;
        }
        // A name no venue has, with close names in the player's city:
        // those, said plainly, rather than other turfs there.
        const typedName = nameIn(turfs, filters.turf_names[0]) ?? nameIn(turfs, filters.free_text);
        if (r.closest?.turfs.length && typedName) {
          const home = labelFor(r.closest.city);
          body.turfs = r.closest.turfs.map(card);
          body.total = 0;
          body.relaxed = [];
          body.rows = [closestRow(home, r.closest.turfs.length)];
          body.reply = nowhereReply(typedName, home, r.closest.turfs.map((t) => place(t).name));
          break;
        }
        // Router v10: nothing in the place is what was asked for (claimed, the
        // owner's prices, photos, players' reviews, open then), or the claimed,
        // owner-priced or reviewed ones are all outside the visitor's city.
        // Said from the rows, never the model's line, with the rows' count;
        // the ones elsewhere are the cards, under a heading of their own.
        const lost = unavailableLine(r.unavailable ?? []);
        // What was asked for, as a reply says it, without the filters a failed read left out (`left`).
        const phrase = (left: readonly string[]) =>
          extrasPhrase(venues(r.sport ? sportBySlug(r.sport) : undefined), {
            claimed: !!filters.claimed,
            owner_prices: !!filters.owner_prices && !left.includes("owner_prices"),
            with_photos: !!filters.with_photos,
            player_reviews: !!filters.player_reviews && !left.includes("player_reviews"),
            open: left.includes("open_at") ? null : openAtWords(filters.open_at, filters.when),
          });
        if (extras.length) {
          const what = phrase([]);
          const proof = extras.some((k) => k === "claimed" || k === "owner_prices" || k === "player_reviews");
          const homeGone = proof && r.total > 0 && r.relaxed.includes("pref_city") && isCity(prefCity) ? prefCity : null;
          if (r.total === 0 || homeGone) {
            const cityWords = (ids: readonly string[]) => ids.map((c) => (isCity(c) ? labelFor(c) : c));
            const inCity = homeGone ?? (r.city && isCity(r.city) ? r.city : null);
            const where = inCity ? `in ${labelFor(inCity)}` : filters.wants_nearby && loc ? `within ${NEARBY_KM[NEARBY_KM.length - 1]} km of you` : "";
            const others = homeGone ? { turfs: r.turfs, total: r.total, cities: r.cities ?? [] } : (r.elsewhere ?? null);
            body.reply = noneYetReply({ what, where, byHours: extras.includes("open_at"), elsewhere: others ? { total: others.total, cities: cityWords(others.cities) } : null });
            if (lost) body.reply = `${body.reply} ${lost}`;
            body.relaxed = [];
            body.turfs = (others?.turfs ?? []).map(card);
            body.total = others?.total ?? 0;
            if (others?.turfs.length) body.rows = [elsewhereRow(what, cityWords(others.cities), others.turfs.length)];
            break;
          }
        }
        // The budget survives a widened area (relaxSteps), so a dropped
        // budget means no matching turf lists a rate within it (most list
        // none: Gota had 3 box cricket turfs on 26 Oct, none priced). No
        // "Under ₹1,000/hr" chip over cards that aren't.
        if (r.relaxed.includes("price")) body.filters = { ...(body.filters as typeof base.filters), maxPrice: null };
        // The parsed reply describes the search as asked ("football turfs in
        // Kothrud under ₹1,000"); say what was widened instead.
        const prefScoped = !r.city && !(filters.wants_nearby && loc) && filters.areas.length === 0 ? prefCity : null;
        const stayedIn = r.city ?? (prefScoped && !r.relaxed.includes("pref_city") ? prefScoped : null);
        // Pictures from the same cards: each one's price at the time asked
        // (with the sport's bands, and by time when a time was asked) and
        // where they are. The budget was dropped when nothing fit it. With a
        // sport, the cards show the price the chart reads too (cardPrices),
        // where it isn't their own.
        const asked = { ...filters, sport: r.sport, max_price_per_hour: r.relaxed.includes("price") ? null : filters.max_price_per_hour };
        const rows = bands ? r.turfs.map((t) => withSportBands(t, bands)) : r.turfs;
        const prices = cardPrices(rows, asked.sport);
        if (prices) body.cardPrices = prices;
        // "The lowest listed rates come first" only over cards that list one for the sport (none of Bangalore's for badminton, 30 Oct).
        const rule = cardSportOf(asked.sport);
        const widened =
          r.total > 0
            ? widenedReply({
                relaxed: r.relaxed,
                maxPrice: filters.max_price_per_hour,
                cheapestFirst: filters.sort === "price_low" && (!rule || rows.some((t) => sportMinimumPrice(t, rule) != null)),
                areas: filters.areas,
                city: stayedIn && isCity(stayedIn) ? labelFor(stayedIn) : null,
                prefCity: prefScoped ? labelFor(prefScoped) : null,
                narrowed: filters.sport ? (SPORT_FALLBACK[filters.sport] ?? null) : null,
                name: typedName,
              })
            : null;
        if (widened) body.reply = widened;
        // "Near me" before the location is shared: the visitor's city, best rated, until it is.
        else if (filters.wants_nearby && !loc && stayedIn && isCity(stayedIn))
          body.reply = `These are the top rated in ${labelFor(stayedIn)}. Share your location to see the nearest first.`;
        // Near me found nothing within the last radius (applyAskFilters): not "Here are the turfs near you".
        else if (filters.wants_nearby && loc && r.total === 0) body.reply = `Nothing that matches is listed within ${NEARBY_KM[NEARBY_KM.length - 1]} km of you yet.`;
        // Router v10: a filter whose read failed is said, and its chip goes. The
        // reading's own line would promise it ("Here are turfs with player
        // reviews"): what the cards are instead, then why.
        if (lost) {
          const chip: Record<string, [string, null | false]> = { owner_prices: ["ownerPrices", false], player_reviews: ["playerReviews", false], open_at: ["openAt", null] };
          const plain = !widened && !filters.wants_nearby && r.total > 0;
          const lead = plain ? `Here are ${phrase(r.unavailable ?? [])}${stayedIn && isCity(stayedIn) ? ` in ${labelFor(stayedIn)}` : ""}.` : body.reply;
          body.reply = `${lead} ${lost}`;
          body.filters = { ...(body.filters as typeof base.filters), ...Object.fromEntries((r.unavailable ?? []).flatMap((k) => (chip[k] ? [chip[k]] : []))) };
        }
        const chart = asksPrice(asked) ? priceChart(rows, asked, new Date(), times) : null;
        const map = resultsMap(r.turfs.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, area: areaFor(t) })), loc);
        const show = visualsFor(asked, { priced: chart?.bars.length ?? 0, map: !!map });
        if (show.length)
          body.visuals = { show, ...(chart && show.includes("prices") ? { prices: chart } : {}), ...(map && show.includes("map") ? { map } : {}) } satisfies AskVisuals;
      }
    }
  } catch (e) {
    console.error("ask: intent handler failed", filters.intent, e);
    body = { ...base, relaxed: [], total: 0, failed: true };
  }
  ms.handler = Math.round(performance.now() - handlerStart);
  ms.total = Date.now() - started;

  // Names shown this turn, so the next message can say "the first one";
  // a shared name with its area and city, so it comes back as that venue.
  const shown = body.turfs
    ? shownNames(body.turfs as Turf[], turfs)
    : ((body.games as { turfs?: { name?: string } }[] | undefined)?.map((g) => g.turfs?.name ?? "").filter(Boolean) ?? []);
  body.memo = { ...(body.memo as Record<string, unknown>), top: shown.slice(0, 5) };

  logFinish(supabase, logId, {
    // shown_ids: which turfs this answer showed (owners see the count on myTapturf).
    // _src, _t (stage ms) and _usage (tokens across every model call) are for tuning.
    filters: {
      ...filters,
      // None for an eval ask (loggedShownIds): the eval set is no player's, and owners see the count.
      shown_ids: loggedShownIds(((body.turfs as { id?: string }[] | undefined) ?? []).map((t) => t.id).filter((id): id is string => !!id).slice(0, 12), choice),
      // _vis: the pictures the answer showed (lib/ask/cards.ts), for tuning.
      ...(body.visuals ? { _vis: (body.visuals as AskVisuals).show } : {}),
      // _router: the reading was router v10's (its fields are in the filters above); _eval: an eval ask (scripts/ask-eval).
      ...(version === 10 ? { _router: 10 } : {}),
      ...(choice.eval ? { _eval: true } : {}),
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
