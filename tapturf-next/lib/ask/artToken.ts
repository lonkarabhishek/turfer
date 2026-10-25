import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Art tokens for Ask TapTurf. When an answer about a blog post comes
 * with a drawing, the server signs what to draw ({slug, brief, alt}) into
 * the visual, and the chat sends the token back to /api/ask/art, which
 * draws it. Signed, so the art route only ever draws a brief our own
 * answerer wrote: nobody can send it text of their own to put in front
 * of Claude. No expiry, since a token names one drawing, cached once drawn.
 *
 * Token: base64url(JSON {v, s, b, a}) "." base64url(HMAC-SHA256). Server
 * only (it needs the key); relative imports only (artToken.test.ts).
 */

const VERSION = 1;
const SLUG = /^[a-z0-9-]{1,120}$/;
const MAX_TOKEN = 2048;
const MAX_BRIEF = 600;
const MAX_ALT = 200;
const PART = /^[A-Za-z0-9_-]+$/;

/**
 * Its own key when one is set, else a server key we already keep. The
 * first one at least 16 characters long counts. Unset means no art:
 * signArt gives null, so answers simply come without a drawing.
 */
function artKey(): string | null {
  for (const k of [process.env.ART_TOKEN_KEY, process.env.ACCOUNT_KEY, process.env.LIVE_WRITE_KEY]) {
    const key = k?.trim();
    if (key && key.length >= 16) return key;
  }
  return null;
}

// Prefixed, so a tag made here can never pass for one another part of the
// app makes with the same key (live codes tag "live:...").
const tagOf = (body: string, key: string) => createHmac("sha256", key).update(`blog-art:${body}`).digest("base64url");

const fits = (slug: string, brief: string, alt: string) =>
  SLUG.test(slug) && brief.length > 0 && brief.length <= MAX_BRIEF && alt.length <= MAX_ALT;

/** A token for drawing `brief` in the article `slug`; null when there is no key or the parts don't fit. */
export function signArt(slug: string, brief: string, alt: string): string | null {
  const key = artKey();
  if (!key || typeof slug !== "string" || typeof brief !== "string" || typeof alt !== "string") return null;
  const b = brief.trim();
  const a = alt.trim();
  if (!fits(slug, b, a)) return null;
  const body = Buffer.from(JSON.stringify({ v: VERSION, s: slug, b, a }), "utf8").toString("base64url");
  const token = `${body}.${tagOf(body, key)}`;
  return token.length <= MAX_TOKEN ? token : null;
}

/** What a token says to draw, or null when it is malformed, too long, signed with another key or there is no key. */
export function readArt(token: string): { slug: string; brief: string; alt: string } | null {
  const key = artKey();
  if (!key || typeof token !== "string" || token.length > MAX_TOKEN) return null;
  const dot = token.indexOf(".");
  const body = token.slice(0, dot);
  const tag = token.slice(dot + 1);
  if (dot <= 0 || !PART.test(body) || !PART.test(tag)) return null;
  // Compared as written, so the one tag we made is the only one that passes.
  const want = Buffer.from(tagOf(body, key));
  const got = Buffer.from(tag);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let o: unknown;
  try {
    o = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const { v, s, b, a } = o as Record<string, unknown>;
  if (v !== VERSION || typeof s !== "string" || typeof b !== "string" || typeof a !== "string") return null;
  return fits(s, b, a) && b.trim() === b ? { slug: s, brief: b, alt: a } : null;
}
