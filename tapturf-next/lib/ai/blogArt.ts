import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { accountKey } from "@/lib/account/server";
import { sanitizeSvg } from "@/lib/ask/svgSanitize";
import { createGuardedFetch, defaultGuardOptions } from "@/lib/supabase/guard";
import { getAnthropic, isAskConfigured } from "./ask";

/**
 * Drawings for Ask TapTurf on a blog post: when a picture explains the
 * answer better than words (a box cricket cage and its zones, a 5-a-side
 * pitch, a stud pattern), the answerer writes a brief and the chat asks
 * /api/ask/art for it. No Claude model makes images, so Claude Opus draws
 * it as SVG; lib/ask/svgSanitize.ts rebuilds that as plain shapes and
 * labels before anyone sees it.
 *
 * Each drawing is an Opus call, so the database decides when one is made
 * (supabase/migrations/20261025_ask_art.sql), for every instance at once:
 * a drawing is made once and kept; a failed one is tried at most twice,
 * 6 hours apart; one being drawn is "busy" to everyone else; and at most
 * 200 are drawn a day, 20 of them for any one network. When the model
 * drew nothing for reasons of its own (overloaded, rate limited) or ours
 * (account, request), the try is given back. Only the article and the brief go to Opus, and
 * both are in the store's key, so one brief always gets one drawing.
 * Without the server key or the database, nothing is drawn.
 */

export const ART_MODEL = "claude-opus-5-5";

/** Part of every drawing's key: bump it when the prompt or model changes, and every brief is drawn again. */
const ART_VERSION = 2;

/** Opus gets this long; the art route stops at 60 s, and the store's claim lapses at 90. */
const DRAW_TIMEOUT_MS = 45_000;

const SYSTEM = `You draw one clear, friendly illustration or diagram for an article on the blog of TapTurf, an Indian directory of turfs, courts and pickup games. It is shown in a chat answer, about 360 pixels wide on a phone, under a title of its own.

Reply with only the drawing: one <svg> element with nothing before or after it, no code fences, no comments.

- Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"> and a white rect covering the whole viewBox.
- Flat style: solid fills, simple outlines, no shadows, blur, patterns, masks, markers or animation. Draw arrowheads as small polygons.
- Use only these elements: g, defs, linearGradient, radialGradient, stop, clipPath, rect, circle, ellipse, line, polyline, polygon, path, text, tspan. Style with attributes (fill, stroke, stroke-width, opacity, font-size, font-weight, text-anchor); never a style attribute, a class or a <style> element. No scripts, images, links, <use>, fonts or URLs: anything else is removed before it is shown.
- Colours: turf greens #16A34A, #15803D and #DCFCE7; ink #1D1D1F; muted #6B7280; lines #E5E7EB; white; amber #F59E0B and sky #0EA5E9 as accents.
- Labels: three words at most each, font-family="system-ui, sans-serif", font-size 12 to 16, dark on a light background, inside the viewBox and clear of each other and of busy lines. No sentences, no paragraphs, no heading across the top.
- No people's faces and no brand logos. Where players matter, show them as simple round markers.
- Draw exactly what the brief asks, accurately: true proportions and positions where they matter (a pitch's markings, a cage's walls). Show measurements only when the brief gives them, and only in the unit the brief gives: never add ft, m, yards or any unit the brief doesn't have, and a size given without a unit is written without one or left out.
- Every label fits: allow about 0.6 x font-size per character, keep each label and any box behind it inside the viewBox and clear of thick lines, and never rotate a label longer than 14 characters (put it outside the shape, level, instead).
- Keep it light: about 80 elements at most, whole-number coordinates.`;

/**
 * What the art route answers: the drawing; "being drawn, ask again
 * shortly"; "retry" (nothing was drawn this time, for reasons that may
 * pass: the model or the store unavailable); or none (failed, declined
 * or capped, and asking again gets the same).
 */
export type Art = { status: "ok"; svg: string } | { status: "drawing" } | { status: "retry" } | { status: "none" };

const NONE: Art = { status: "none" };
const RETRY: Art = { status: "retry" };

/** The store's key for a drawing: everything that shapes it, and nothing else. */
export function artKey(slug: string, brief: string): string {
  return createHash("sha256").update(JSON.stringify([ART_VERSION, slug, brief])).digest("hex");
}

// Its own breaker: a failing store must not make page refreshes fail fast.
const storeFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function storeClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing Supabase environment variables");
    client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: storeFetch } });
  }
  return client;
}

type Claim = { status: "ok"; svg: string } | { status: "busy" | "failed" | "capped" | "go" } | null;

/** ask_art_claim's answer, or null when the store couldn't be asked or said something else. */
async function claim(secret: string, key: string, slug: string, net: string | null): Promise<Claim> {
  try {
    const { data, error } = await storeClient().rpc("ask_art_claim", { p_key: secret, p_art: key, p_slug: slug, p_net: net });
    if (error) {
      console.warn("blog art: claim failed", error.message);
      return null;
    }
    const d = (data ?? {}) as { status?: unknown; svg?: unknown; error?: unknown };
    if (d.status === "ok") return typeof d.svg === "string" ? { status: "ok", svg: d.svg } : null;
    if (d.status === "busy" || d.status === "failed" || d.status === "capped" || d.status === "go") return { status: d.status };
    console.warn("blog art: claim refused", String(d.error ?? d.status));
    return null;
  } catch (e) {
    console.warn("blog art: claim failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Store what came of a go: the drawing, or null for a failure. */
async function done(secret: string, key: string, svg: string | null): Promise<void> {
  try {
    const { error } = await storeClient().rpc("ask_art_done", { p_key: secret, p_art: key, p_svg: svg });
    if (error) console.warn("blog art: done failed", error.message);
  } catch (e) {
    console.warn("blog art: done failed", e instanceof Error ? e.message : e);
  }
}

/** Give a go back: the model never drew anything, so the try and the day's count are returned. */
async function release(secret: string, key: string): Promise<void> {
  try {
    const { error } = await storeClient().rpc("ask_art_release", { p_key: secret, p_art: key });
    if (error) console.warn("blog art: release failed", error.message);
  } catch (e) {
    console.warn("blog art: release failed", e instanceof Error ? e.message : e);
  }
}

/**
 * API errors where Opus never drew anything: rate limited, overloaded,
 * unreachable, or our own account or request at fault (auth, billing, a
 * bad parameter). None of them says anything about the brief, so the try
 * is given back. A timeout is the brief's own failure: one too slow to
 * draw stays slow. (APIConnectionError, and its timeout, are APIErrors.)
 */
function passing(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return false;
  return e instanceof Anthropic.APIError;
}

type Drawn = { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number }; stop_reason: string | null; model: string };

/** One Opus call: the sanitised drawing, or null when it declined or drew nothing usable. Throws on API errors. */
async function draw(slug: string, brief: string): Promise<string | null> {
  const t0 = Date.now();
  const request = {
    model: ART_MODEL,
    // Plenty for about 80 elements, and a cap on what a runaway drawing costs.
    max_tokens: 6_000,
    // No thinking param: Opus 5.5 rejects disabled thinking, and leaving it out is adaptive.
    output_config: { effort: "low" as const },
    system: SYSTEM,
    messages: [{ role: "user" as const, content: `Draw this for the article "${slug}":\n${brief}` }],
  };
  const options = { timeout: DRAW_TIMEOUT_MS, maxRetries: 0 };
  let res: Drawn;
  try {
    // Server-side fallback: when Opus declines, the API retries on the model
    // it recommends for that kind of refusal, in the same call.
    res = await getAnthropic().beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, options);
  } catch (e) {
    // An account without the fallback beta gets a 400 at once: draw without it rather than never.
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    console.warn("blog art: fallbacks refused, drawing without them", e.message);
    res = await getAnthropic().messages.create(request, { ...options, timeout: Math.max(5_000, DRAW_TIMEOUT_MS - (Date.now() - t0)) });
  }
  console.info("blog art", {
    slug,
    ms: Date.now() - t0,
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    stop: res.stop_reason,
    model: res.model,
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("");
  const svg = sanitizeSvg(text);
  if (!svg) console.warn("blog art: unusable svg", { slug, stop: res.stop_reason, chars: text.length, start: text.slice(0, 120) });
  return svg;
}

async function claimAndDraw(key: string, slug: string, brief: string, net: string | null): Promise<Art> {
  // No server key, no way to count drawings: none rather than uncounted ones.
  const secret = accountKey();
  if (!secret) return NONE;
  const c = await claim(secret, key, slug, net);
  // The store couldn't be asked: nothing drawn, and another time may work.
  if (!c) return RETRY;
  if (c.status === "ok") {
    // Checked again on the way out: drawings are kept for good, the sanitiser may get stricter.
    const svg = sanitizeSvg(c.svg);
    if (!svg) console.warn("blog art: stored drawing no longer passes", { slug });
    return svg ? { status: "ok", svg } : NONE;
  }
  if (c.status === "busy") return { status: "drawing" };
  if (c.status !== "go") return NONE;
  let svg: string | null = null;
  try {
    svg = await draw(slug, brief);
  } catch (e) {
    if (passing(e)) {
      console.warn("blog art: model unavailable", slug, e instanceof Error ? e.message : e);
      await release(secret, key);
      return RETRY;
    }
    console.error("blog art: failed", slug, e);
  }
  await done(secret, key, svg);
  return svg ? { status: "ok", svg } : NONE;
}

// Two readers on this instance asking for one drawing share one claim.
const pending = new Map<string, Promise<Art>>();

/**
 * The drawing for `brief` in the article `slug`, sanitised; "drawing"
 * while another request draws it. `network` is the visitor's network
 * (lib/limits clientNetwork), for its share of the day's drawings; only
 * a hash of it is stored.
 */
export async function drawArt(slug: string, brief: string, network?: string): Promise<Art> {
  const b = brief.trim();
  if (!isAskConfigured() || !b) return NONE;
  const key = artKey(slug, b);
  const net = network ? createHash("sha256").update(`art-net:${network}`).digest("hex").slice(0, 32) : null;
  let p = pending.get(key);
  if (!p) {
    p = claimAndDraw(key, slug, b, net).finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}
