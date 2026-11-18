import { createHash } from "node:crypto";
import { accountKey, accountRpcIfThere, readSmallJson } from "../account/server";
import { clientNetwork, windowCounter } from "../limits";
import { isBotAgent, isPrefetch, viewFromPage } from "../live/views";
import { parseAsk } from "./ask";

/**
 * POST /api/slot-ask: one "Ask for a slot" (lib/slotAsk/ask.ts says what
 * an ask is), stored by public.slot_ask_add with the server key
 * (20261118_slot_asks.sql: active turfs only, a day a player can ask
 * about, a sport the turf lists, a cap per turf and per day). The sheet
 * sends it as the tap opens WhatsApp and never waits on it: whatever this
 * answers, WhatsApp has opened.
 *
 * The same protections as /api/contact-outcome (lib/outcome/route.ts):
 * only a person in a browser, from this site's own page (a bot, a prefetch
 * or another site's page gets 204 and nothing is stored); 400 for a body
 * that isn't an ask; past ASKS_PER_NET asks in ten minutes from one
 * network (kept in this instance's memory as a keyed hash, for the window
 * only, never stored), 204 and nothing stored.
 *
 * Nothing about the player is read or stored: no sign-in is checked (the
 * signed-in flag is the page's own word, as a tap's is), no account, no
 * cookie, no IP, and never the message. Relative imports only
 * (npm run test:slotask).
 */

/** Asks taken from one network in ten minutes (phones share a carrier's address, so this is loose). */
export const ASKS_PER_NET = 20;
const WINDOW_MS = 10 * 60_000;
const BODY_MAX_BYTES = 300;
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> } | { missing: true } | { unavailable: true }>;
export type SlotAskDeps = {
  rpc?: Rpc;
  /** A limiter of its own, for a test. */
  limit?: (net: string) => boolean;
};
export type SlotAskReply = { ok: boolean };

const quiet = () => new Response(null, { status: 204, headers: HEADERS });
const json = (body: SlotAskReply, status = 200) => Response.json(body, { status, headers: HEADERS });

const perNet = windowCounter(ASKS_PER_NET, WINDOW_MS, Date.now);
const netHash = (req: Request, key: string) => createHash("sha256").update(`${key}|slot-ask|${clientNetwork(req)}`).digest("hex").slice(0, 32);

export async function postSlotAsk(req: Request, deps: SlotAskDeps = {}): Promise<Response> {
  const key = accountKey();
  if (!key) return quiet();
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return quiet();
  const ask = parseAsk(await readSmallJson(req, BODY_MAX_BYTES));
  if (!ask) return new Response(null, { status: 400, headers: HEADERS });
  if (!(deps.limit ?? perNet)(netHash(req, key))) return quiet();
  const res = await (deps.rpc ?? (accountRpcIfThere as Rpc))("slot_ask_add", {
    p_turf_id: ask.turf,
    p_date: ask.date,
    p_hour: ask.hour,
    p_minute: ask.minute,
    p_minutes: ask.minutes,
    p_sport: ask.sport,
    p_players: ask.players,
    p_signed: ask.signedIn,
  });
  // Before the migration, a database that is down, a turf that is gone, a sport it doesn't list or a day's cap: nothing kept, and the player notices nothing.
  return json({ ok: "data" in res && res.data.r === "ok" });
}
