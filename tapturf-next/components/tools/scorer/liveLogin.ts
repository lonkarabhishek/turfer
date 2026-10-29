/**
 * Turning on a live link needs a login; scoring and following never do.
 * Logged out, the scorer goes to /login?via=live (Google first, then
 * phone) and comes back to the same page with ?live=1, and the link it
 * asked for turns on by itself. The match is already saved in this
 * browser, so nothing typed is lost. The ask is kept in sessionStorage,
 * which survives the trip to Google and back in the same tab. Shared by
 * the Live Cricket Scorer and the Live Scoreboard; no engine imports.
 * The same trip when the server asks for a login again (a link already
 * on, its sign-in no longer accepted): again tells /login to show the
 * login even though this device still looks signed in, and back here the
 * link sends what waited; closed tells it the link closed after 2 hours
 * without an update, so back here a new one starts instead.
 */

const KEY = "tapturf_live_login_v1";
/** An ask older than this is ignored: the scorer left and came back some other way. */
const FRESH_MS = 30 * 60_000;
const PARAM = "live";

type Ask = { tool: "cricket" | "board"; id: string; at: number };

/** Off to the login, remembering which match's link to turn on (or carry on) after. */
export function askLiveLogin(tool: Ask["tool"], id: string, now = Date.now(), again = false, closed = false) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tool, id, at: now } satisfies Ask));
  } catch {
    /* blocked storage: after login the scorer taps Turn on live link again */
  }
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, "1");
  window.location.href = `/login?next=${encodeURIComponent(url.pathname + url.search)}&via=live${again ? `&again=1${closed ? "&closed=1" : ""}` : ""}`;
}

/** Whether this page load is the return from that login, and the query without the marker. */
export function liveReturn(search: string): { returning: boolean; rest: string } {
  const q = new URLSearchParams(search);
  const returning = q.get(PARAM) === "1";
  q.delete(PARAM);
  const rest = q.toString();
  return { returning, rest: rest ? `?${rest}` : "" };
}

/** The match whose link to turn on, if the ask is this tool's and fresh. Read once: it is cleared. */
export function takeLiveAsk(tool: Ask["tool"], now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const x = raw ? (JSON.parse(raw) as Partial<Ask>) : null;
    if (!x || x.tool !== tool || typeof x.id !== "string" || typeof x.at !== "number") return null;
    return now - x.at >= 0 && now - x.at < FRESH_MS ? x.id : null;
  } catch {
    return null;
  }
}
