/**
 * Old game URLs, /game/<uuid> (the game pages' address until the readable
 * URLs, lib/utils/gamePath.ts), with a query string.
 *
 * The game page itself answers every old link with a 308 to the readable
 * URL (app/game/[id]/page.tsx permanentRedirect), but a cached page cannot
 * see the query string, so its redirect drops it (?utm_source=chatgpt.com
 * on a link an AI chat cited, which the traffic counter reads). For those
 * requests only, the proxy (proxy.ts) asks the page for its redirect (a
 * HEAD of the same path with no query: the page's cached answer, no
 * database read of its own) and sends the 308 itself with the query kept.
 * When that fails or is slow, the request goes on to the page, whose
 * redirect loses only the query.
 *
 * Unlike turfs there is no build-time map: games are made and edited all
 * day. No imports, so the proxy and the unit tests use it on their own.
 */

const OLD = /^\/game\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// A readable game path: lower-case words, digits and hyphens, ending in the code or the whole id.
const READABLE = /^\/game\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether this request is an old id link that carries a query string (the only one the proxy answers). */
export function oldGameLinkWithQuery(pathname: string, search: string): boolean {
  return search.length > 1 && OLD.test(pathname);
}

/**
 * The readable path the page's redirect names, or null: a 308 only, to a
 * game path on this site that is not another id link (it would loop).
 */
export function gameRedirectTarget(status: number, location: string | null, origin: string): string | null {
  if (status !== 308 || !location) return null;
  let u: URL;
  try {
    u = new URL(location, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin || u.search || u.hash) return null;
  return READABLE.test(u.pathname) && !OLD.test(u.pathname) ? u.pathname : null;
}

/** How long the proxy waits for the page's answer before letting the request through. */
export const GAME_LINK_WAIT_MS = 2500;

/** The readable path for an old id link, asked of the page itself; null when it has none or did not answer in time. */
export async function readableGamePath(origin: string, pathname: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`${origin}${pathname}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(GAME_LINK_WAIT_MS) });
    return gameRedirectTarget(res.status, res.headers.get("location"), origin);
  } catch {
    return null;
  }
}
