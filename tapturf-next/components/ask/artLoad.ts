/**
 * Getting a drawing for the chat (BlogVisual's Art card) from
 * /api/ask/art, which draws each one once for everyone and answers
 * 200 { svg }, 202 { status: "drawing" } while another request draws it,
 * or 502 { error: "no_art" } when it won't be drawn.
 *
 * Kept for the visit, by token: drawings, so reopening the chat shows
 * them at once, and refusals, so it doesn't ask again. A timeout or a
 * dropped connection isn't kept: the server may still finish and store
 * the drawing, and the next open picks it up.
 */

/** One request may take this long: more than the server needs (Opus gets 45 s, the route stops at 60), so the chat never gives up on a drawing still on its way. */
export const ART_REQUEST_MS = 58_000;
/** While another request draws it (202), ask again this often... */
export const ART_POLL_MS = 4_000;
/** ...for up to this long after the first ask: longer than one drawing takes. */
export const ART_POLL_FOR_MS = 60_000;

/** What one answer from /api/ask/art means. no: it won't be drawn, asking again gets the same. later: another time may do. */
export type ArtReply = { kind: "ok"; svg: string } | { kind: "drawing" } | { kind: "no" } | { kind: "later" };

export function artReply(status: number, body: unknown): ArtReply {
  const b = body && typeof body === "object" ? (body as { svg?: unknown; error?: unknown }) : {};
  if (status === 200) {
    const svg = typeof b.svg === "string" ? b.svg.trim() : "";
    return svg.startsWith("<svg") ? { kind: "ok", svg } : { kind: "no" };
  }
  if (status === 202) return { kind: "drawing" };
  // The route's own refusals: failed or over the day's cap, a bad token, no model set up.
  if (b.error === "no_art" || b.error === "bad_token" || b.error === "not_configured") return { kind: "no" };
  // Too many asks from this network, or the platform failed.
  if (status === 408 || status === 429 || status >= 500) return { kind: "later" };
  return { kind: status >= 400 ? "no" : "later" };
}

/** An SVG as a data URL. btoa takes bytes, so the text goes through UTF-8 first (labels can be ₹ or Devanagari). */
export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

const drawn = new Map<string, string>();
const refused = new Set<string>();

/** What this visit already knows about a drawing: its picture (a data URL), that it won't come, or nothing yet. */
export function knownArt(token: string): { src: string } | "failed" | null {
  if (refused.has(token)) return "failed";
  const src = drawn.get(token);
  return src ? { src } : null;
}

/** The picture wouldn't show: don't ask for it again this visit. */
export function artBroken(token: string): void {
  drawn.delete(token);
  refused.add(token);
}

export type ArtResult = { kind: "ok"; src: string } | { kind: "failed" } | { kind: "stopped" };

type Get = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * The drawing for `token`, as a data URL. Asks once; on 202 asks again
 * every ART_POLL_MS for up to ART_POLL_FOR_MS; each ask ends after
 * ART_REQUEST_MS. `stop` (the card went away) ends it at once with
 * "stopped", keeping nothing, so the next open asks again.
 */
export async function loadArt(token: string, stop: AbortSignal, get: Get = (url, init) => fetch(url, init)): Promise<ArtResult> {
  const known = knownArt(token);
  if (known === "failed") return { kind: "failed" };
  if (known) return { kind: "ok", src: known.src };
  const start = Date.now();
  for (;;) {
    if (stop.aborted) return { kind: "stopped" };
    const reply = await askOnce(token, stop, get);
    if (stop.aborted) return { kind: "stopped" };
    if (reply.kind === "ok") {
      const src = svgDataUrl(reply.svg);
      drawn.set(token, src);
      return { kind: "ok", src };
    }
    if (reply.kind === "no") {
      refused.add(token);
      return { kind: "failed" };
    }
    if (reply.kind === "later" || Date.now() + ART_POLL_MS - start > ART_POLL_FOR_MS) return { kind: "failed" };
    await pause(ART_POLL_MS, stop);
  }
}

async function askOnce(token: string, stop: AbortSignal, get: Get): Promise<ArtReply> {
  const ctl = new AbortController();
  const abort = () => ctl.abort();
  stop.addEventListener("abort", abort);
  const timer = setTimeout(abort, ART_REQUEST_MS);
  try {
    const r = await get(`/api/ask/art?t=${encodeURIComponent(token)}`, { signal: ctl.signal });
    const body: unknown = await r.json().catch(() => undefined);
    // Not JSON (cut off, or a network's own page in its place): not the route's answer.
    if (body === undefined) return { kind: "later" };
    return artReply(r.status, body);
  } catch {
    // Timed out, offline, or the connection dropped.
    return { kind: "later" };
  } finally {
    clearTimeout(timer);
    stop.removeEventListener("abort", abort);
  }
}

function pause(ms: number, stop: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const end = () => {
      clearTimeout(timer);
      stop.removeEventListener("abort", end);
      done();
    };
    const timer = setTimeout(end, ms);
    stop.addEventListener("abort", end);
  });
}
