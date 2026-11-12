import { NextResponse } from "next/server";
import { byOf, isOutreachStatus, noteOf, outreachCity, outreachDays, toOutreachList, toSaidByTurf, toSaved, type OutreachAnswer, type OutreachSetAnswer } from "./outreach";
import { reportKey, reportUrl } from "../report/token";

/**
 * The admin's Owner outreach section on the server
 * (20261113_owner_outreach.sql; the API in lib/admin/outreach.ts). The
 * route (app/api/admin/outreach) checks the site owner first, as every
 * admin route does (lib/admin/auth.ts isAdmin), then calls these with
 * `rpc`: the owner functions called with the owner's own session and
 * Firebase token as p_token, which check the site owner again
 * (public._caller_key and public._is_admin_key). The answer holds turfs'
 * own listed numbers, for the signed-in site owner alone: private,
 * no-store, and never logged (a failure logs the function's name and the
 * error code only). Relative imports only (npm run test:outreach).
 */

export type AdminRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
type Env = Record<string, string | undefined>;

const HEADERS = { "Cache-Control": "private, no-store" };
const json = (body: OutreachAnswer | OutreachSetAnswer, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

/** The function isn't on the database yet (before 20261113_owner_outreach.sql). */
const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

async function call(rpc: AdminRpc, fn: string, args: Record<string, unknown>): Promise<{ data: unknown } | { error: "not_set_up" | "unavailable" | "forbidden" }> {
  try {
    const { data, error } = await rpc(fn, args);
    if (error) {
      if (missingFn(error.code)) return { error: "not_set_up" };
      console.warn(`outreach admin: ${fn} failed`, error.code);
      return { error: "unavailable" };
    }
    if (data && typeof data === "object" && (data as { error?: unknown }).error === "forbidden") return { error: "forbidden" };
    return { data };
  } catch (e) {
    console.warn(`outreach admin: ${fn} failed`, e instanceof Error ? e.name : "error");
    return { error: "unavailable" };
  }
}

const statusOf = (e: "not_set_up" | "unavailable" | "forbidden") => (e === "forbidden" ? 403 : 503);

/** GET /api/admin/outreach?city=<slug>&days=30|90: the city's turfs, most taps first, with each one's numbers, report link and note. */
export async function outreachList(rpc: AdminRpc, req: Request, env: Env = process.env): Promise<NextResponse> {
  const q = new URL(req.url).searchParams;
  const args = { p_city: outreachCity(q.get("city")), p_days: outreachDays(q.get("days")) };
  // What players said after tapping (20261113_contact_outcomes.sql), read alongside; before that file, or when it fails, the rows just say nothing about it.
  const [res, said] = await Promise.all([call(rpc, "admin_owner_outreach", args), call(rpc, "admin_contact_outcomes", args)]);
  if ("error" in res) return json({ ok: false, error: res.error }, statusOf(res.error));
  const ak = env.ACCOUNT_KEY?.trim();
  const key = ak ? reportKey(ak) : null;
  const list = toOutreachList(res.data, (id) => (key ? reportUrl(key, id) : null), toSaidByTurf("data" in said ? said.data : null));
  return list ? json({ ok: true, list }) : json({ ok: false, error: "unavailable" }, 502);
}

/** A JSON body of at most 2 kB, or null (only the section's fetch sends JSON). */
async function smallJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return null;
  try {
    const text = await req.text();
    if (text.length > 2_000) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/admin/outreach { turf, status, note?, by? }: one turf's note. */
export async function outreachSet(rpc: AdminRpc, req: Request): Promise<NextResponse> {
  const body = await smallJson(req);
  const note = noteOf(body?.note);
  if (!body || typeof body.turf !== "string" || !UUID.test(body.turf) || !isOutreachStatus(body.status) || note === false) return json({ ok: false, error: "bad" }, 400);
  const res = await call(rpc, "admin_owner_outreach_set", { p_turf_id: body.turf, p_status: body.status, p_note: note, p_by: byOf(body.by) });
  if ("error" in res) return json({ ok: false, error: res.error }, statusOf(res.error));
  const d = (res.data ?? {}) as Record<string, unknown>;
  if (d.error === "bad") return json({ ok: false, error: "bad" }, 400);
  if (d.error === "not_found") return json({ ok: false, error: "not_found" }, 404);
  const saved = d.ok === true ? toSaved(d) : null;
  return saved ? json({ ok: true, saved }) : json({ ok: false, error: "unavailable" }, 502);
}
