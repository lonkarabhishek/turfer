import { NextResponse } from "next/server";
import { listQuery, toAnswerList, toOutcomeTotals, type OutcomeError, type OutcomeListAnswer, type OutcomeTotalsAnswer } from "./outcomeTotals";
import type { AdminRpc } from "./outreach.server";

/**
 * The admin's "Did you get a slot?" card on the server
 * (20261127_contact_outcome_totals.sql; the words and the API in
 * lib/admin/outcomeTotals.ts). The routes (app/api/admin/outcomes) check
 * the site owner first, as every admin route does (lib/admin/auth.ts
 * isAdmin), then call these with `rpc`: the owner functions called with
 * the owner's own session and Firebase token as p_token, which check the
 * site owner again (public._caller_key and public._is_admin_key). Counts,
 * turfs and times only, nothing about a person; private, no-store all the
 * same, and a failure logs the function's name and the error code only.
 *
 * Before the file is applied the database has neither function: that is
 * not an error. The route answers 200 { ok: false, error: "not_set_up" },
 * the card says "Totals aren't available yet.", and this server instance
 * does not ask the database again for a minute (MISSING_FOR_MS), whichever
 * of the two reads found it missing. Relative imports only (npm run
 * test:outreach).
 */

/** A database without the functions (before the migration) is asked again only after this long, per instance. */
export const MISSING_FOR_MS = 60_000;

const HEADERS = { "Cache-Control": "private, no-store" };
const json = (body: OutcomeTotalsAnswer | OutcomeListAnswer, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
/** Not there yet is a plain 200: nothing went wrong. */
const statusOf = (e: OutcomeError) => (e === "forbidden" ? 403 : e === "not_set_up" ? 200 : 503);
/** The function isn't on the database yet (before 20261127_contact_outcome_totals.sql). */
const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

/** The two reads, sharing one "not there yet" mark. One per server instance (outcomeReads); tests make their own. */
export function createOutcomeReads(wait = MISSING_FOR_MS) {
  let missingUntil = 0;

  async function call(rpc: AdminRpc, fn: string, args: Record<string, unknown>, now: number): Promise<{ data: unknown } | { error: OutcomeError }> {
    if (now < missingUntil) return { error: "not_set_up" };
    try {
      const { data, error } = await rpc(fn, args);
      if (error) {
        if (missingFn(error.code)) {
          missingUntil = now + wait;
          return { error: "not_set_up" };
        }
        console.warn(`outcomes admin: ${fn} failed`, error.code);
        return { error: "unavailable" };
      }
      if (data && typeof data === "object" && (data as { error?: unknown }).error === "forbidden") return { error: "forbidden" };
      return { data };
    } catch (e) {
      console.warn(`outcomes admin: ${fn} failed`, e instanceof Error ? e.name : "error");
      return { error: "unavailable" };
    }
  }

  return {
    /** GET /api/admin/outcomes: all turfs, the last 7 days, the last 30 and all time, with the turfs to look at and the hours. */
    async totals(rpc: AdminRpc, now = Date.now()): Promise<NextResponse> {
      const res = await call(rpc, "admin_contact_outcome_totals", {}, now);
      if ("error" in res) return json({ ok: false, error: res.error }, statusOf(res.error));
      const totals = toOutcomeTotals(res.data);
      return totals ? json({ ok: true, totals }) : json({ ok: false, error: "unavailable" }, 502);
    },
    /** GET /api/admin/outcomes/list?days=7|30|0&limit=&closed=1: the answers one by one, newest first. */
    async list(rpc: AdminRpc, req: Request, now = Date.now()): Promise<NextResponse> {
      const q = listQuery(new URL(req.url).searchParams);
      const res = await call(rpc, "admin_contact_outcome_list", { p_days: q.days, p_limit: q.limit, p_dismissed: q.dismissed }, now);
      if ("error" in res) return json({ ok: false, error: res.error }, statusOf(res.error));
      const list = toAnswerList(res.data);
      return list ? json({ ok: true, list }) : json({ ok: false, error: "unavailable" }, 502);
    },
  };
}

export const outcomeReads = createOutcomeReads();
