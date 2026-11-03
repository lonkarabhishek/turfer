// A read the page needs failed and no copy young enough to stand in for it
// exists (lib/cache/rowStore.ts, lib/queries/*): the page is not rendered
// from older or thinner data. In a background regeneration the throw keeps
// the last good page (Next keeps it when a regeneration fails); in a first
// render, pages/_error.tsx answers 503 with Retry-After and no-store, so
// neither Vercel's CDN nor ISR keeps the answer and a crawler comes back.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// The error crosses bundles (thrown in an app router page, read by the
// pages router's _error), so it is recognised by its name and the start of
// its message, never with instanceof.

export const UNAVAILABLE_NAME = "TapTurfUnavailable";
const PREFIX = "TapTurf unavailable: ";

/** Seconds a client or crawler is asked to wait before it asks again. */
export const RETRY_AFTER_S = 30;

const text = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Unavailable extends Error {
  constructor(what: string, cause?: unknown) {
    super(`${PREFIX}${what}${cause === undefined ? "" : `: ${text(cause)}`}`, cause === undefined ? undefined : { cause });
    this.name = UNAVAILABLE_NAME;
  }
}

/** True for an Unavailable thrown anywhere (this bundle or another), however Next passed it on. */
export function isUnavailable(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  return name === UNAVAILABLE_NAME || (typeof message === "string" && message.startsWith(PREFIX));
}

/** The headers of the 503: wait RETRY_AFTER_S, keep it nowhere, index nothing. */
export const UNAVAILABLE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Retry-After": String(RETRY_AFTER_S),
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex",
  "Content-Type": "text/html; charset=utf-8",
});

/**
 * The 503 page itself: plain HTML, inline styles, nothing that reads data
 * (the data is what failed), noindex, a plain link home. The look of
 * pages/500.tsx.
 */
export const UNAVAILABLE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>Back in a minute | TapTurf</title></head><body style="margin:0;background:#fff"><main style="padding:96px 16px;color:#1D1D1F;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center"><div style="max-width:480px;margin:0 auto"><p style="font-size:22px;font-weight:700;margin:0 0 32px">Tap<span style="color:#16A34A">Turf</span></p><h1 style="font-size:24px;line-height:1.3;margin:0 0 8px">Back in a minute</h1><p style="color:#6E6E73;margin:0 0 24px;line-height:1.5">This page is busy loading. Please try again in a minute.</p><a href="/" style="display:inline-block;background:#111113;color:#fff;border-radius:12px;padding:12px 24px;font-size:16px;font-weight:600;text-decoration:none">Go to TapTurf home</a></div></main></body></html>`;
