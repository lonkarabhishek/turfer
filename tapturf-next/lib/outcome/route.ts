import { createHash } from "node:crypto";
import { accountKey, accountRpcIfThere, readSmallJson } from "../account/server";
import { cityInfo, isCitySlug } from "../city";
import { clientNetwork, windowCounter } from "../limits";
import { isBotAgent, isPrefetch, viewFromPage } from "../live/views";
import { parseOutcome } from "./outcome";

/**
 * POST /api/contact-outcome: one player's answer to "Did you get a slot?"
 * (lib/outcome/outcome.ts says what an answer is), stored by
 * public.contact_outcome_add with the server key
 * (20261113_contact_outcomes.sql: active turfs only, a cap per turf and
 * per day). The card sends it once, at the end, and never waits on it.
 *
 * Only a person in a browser, from this site's own page: a bot, a
 * prefetch or another site's page gets 204 and nothing is stored, as
 * /api/traffic does it. 400 for a body that isn't an answer. Past
 * OUTCOMES_PER_NET answers in ten minutes from one network (kept in this
 * instance's memory as a keyed hash, for the window only, never stored),
 * 204 and nothing stored.
 *
 * Nothing about the player is read or stored: no sign-in is checked (the
 * answer's signed-in flag is the page's own word, as a tap's is), no
 * account, no cookie, no IP. The answer {ok: true} adds, after "Slot was
 * full", a link to that city's turfs with free hours marked when there
 * are any now. Relative imports only (npm run test:outcome).
 */

/** Answers taken from one network in ten minutes (phones share a carrier's address, so this is loose). */
export const OUTCOMES_PER_NET = 20;
const WINDOW_MS = 10 * 60_000;
const BODY_MAX_BYTES = 300;
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> } | { missing: true } | { unavailable: true }>;
export type OutcomeDeps = {
  rpc?: Rpc;
  /** Whether any turf in the city shows free hours now (lib/queries/freeSlots.ts in the app). */
  hasFree?: (city: string) => Promise<boolean>;
  /** A limiter of its own, for a test. */
  limit?: (net: string) => boolean;
};
export type OutcomeReply = { ok: true; free?: { href: string; city: string } } | { ok: false };

const quiet = () => new Response(null, { status: 204, headers: HEADERS });
const json = (body: OutcomeReply, status = 200) => Response.json(body, { status, headers: HEADERS });

const perNet = windowCounter(OUTCOMES_PER_NET, WINDOW_MS, Date.now);
const netHash = (req: Request, key: string) => createHash("sha256").update(`${key}|outcome|${clientNetwork(req)}`).digest("hex").slice(0, 32);

export async function postOutcome(req: Request, deps: OutcomeDeps = {}): Promise<Response> {
  const key = accountKey();
  if (!key) return quiet();
  if (isBotAgent(req.headers.get("user-agent")) || isPrefetch(req.headers) || !viewFromPage(req.headers, req.url)) return quiet();
  const answer = parseOutcome(await readSmallJson(req, BODY_MAX_BYTES));
  if (!answer) return new Response(null, { status: 400, headers: HEADERS });
  if (!(deps.limit ?? perNet)(netHash(req, key))) return quiet();
  const res = await (deps.rpc ?? (accountRpcIfThere as Rpc))("contact_outcome_add", {
    p_turf_id: answer.turf,
    p_kind: answer.kind,
    p_source: answer.source,
    p_outcome: answer.outcome,
    p_reason: answer.reason,
    p_day: answer.day,
    p_hour: answer.hour,
    p_signed: answer.signedIn,
  });
  // Before the migration, a database that is down, a turf that is gone or a day's cap: the card says thanks all the same.
  if (!("data" in res) || res.data.r !== "ok") return json({ ok: false });
  if (answer.reason !== "full" || !deps.hasFree) return json({ ok: true });
  const city = typeof res.data.city === "string" ? res.data.city.trim().toLowerCase() : "";
  if (!isCitySlug(city)) return json({ ok: true });
  let free = false;
  try {
    free = await deps.hasFree(city);
  } catch {
    // No link, then.
  }
  return json(free ? { ok: true, free: { href: `/${city}?f=free`, city: cityInfo(city).label } } : { ok: true });
}
