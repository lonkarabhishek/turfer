import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isEmailMode, toEmailStatus, type EmailAdminAnswer, type EmailSending, type EmailTestAnswer, type TestLine, type TestProblem } from "./mode";
import { sampleJobs } from "./samples";
import { emailConfig, sendEmail } from "./send";
import { offUrl, SEND_GAP_MS } from "./server";
import { renderEmail } from "./templates";
import { offKey } from "./token";
import { SITE } from "./types";

/**
 * The admin's Emails card on the server (20261110_email.sql; the API in
 * lib/email/mode.ts). The routes (app/api/admin/emails) check the site
 * owner first, as every admin route does (lib/admin/auth.ts isAdmin), then
 * call these with `rpc`: the owner functions called with the owner's own
 * session and Firebase token as p_token, which check the site owner again
 * (public._caller_key and public._is_admin_key). Never an address or a name
 * in an answer. Relative imports only (npm run test:email).
 */

export type AdminRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

type Env = Record<string, string | undefined>;

const HEADERS = { "Cache-Control": "private, no-store" };
const json = (body: EmailAdminAnswer | EmailTestAnswer, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

/** Whether this deployment can send: Resend's key on production (or the local stand-in), and the key the turn-off links are signed with. */
export function sendingOf(env: Env): EmailSending {
  const c = emailConfig(env);
  if (!c.ok) return c.reason;
  return env.ACCOUNT_KEY?.trim() ? "ok" : "no_account_key";
}

/** The function isn't on the database yet (before 20261110_email.sql). */
const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

async function call(rpc: AdminRpc, fn: string, args: Record<string, unknown>): Promise<{ data: unknown } | { missing: true } | { unavailable: true }> {
  try {
    const { data, error } = await rpc(fn, args);
    if (error) {
      if (missingFn(error.code)) return { missing: true };
      console.warn(`email admin: ${fn} failed`, error.code);
      return { unavailable: true };
    }
    return { data };
  } catch (e) {
    console.warn(`email admin: ${fn} failed`, e instanceof Error ? e.name : "error");
    return { unavailable: true };
  }
}

const refused = (d: unknown) => !!d && typeof d === "object" && (d as { error?: unknown }).error === "forbidden";

function statusReply(res: Awaited<ReturnType<typeof call>>, env: Env): NextResponse {
  if ("missing" in res) return json({ ok: false, error: "not_set_up" }, 503);
  if ("unavailable" in res) return json({ ok: false, error: "unavailable" }, 503);
  if (refused(res.data)) return json({ ok: false, error: "forbidden" }, 403);
  const status = toEmailStatus(res.data, sendingOf(env));
  return status ? json({ ok: true, status }) : json({ ok: false, error: "unavailable" }, 502);
}

/** GET /api/admin/emails: the mode, the counts, the last test, and whether this deployment sends. */
export async function emailStatus(rpc: AdminRpc, env: Env = process.env): Promise<NextResponse> {
  return statusReply(await call(rpc, "admin_email_status", {}), env);
}

/** A JSON body of at most 2 kB, or null (a form, or anything else, is refused: only the card's fetch sends JSON). */
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

/** POST /api/admin/emails { mode: off | owner_only | on }: the mode, at once (no deploy). Answers as GET. */
export async function emailSetMode(rpc: AdminRpc, req: Request, env: Env = process.env): Promise<NextResponse> {
  const body = await smallJson(req);
  if (!body || !isEmailMode(body.mode) || Object.keys(body).length !== 1) return json({ ok: false, error: "bad" }, 400);
  const res = await call(rpc, "admin_email_set_mode", { p_mode: body.mode });
  if ("data" in res && (res.data as { error?: unknown } | null)?.error === "bad") return json({ ok: false, error: "bad" }, 400);
  return statusReply(res, env);
}

export type TestDeps = { env?: Env; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; uuid?: () => string };

/** One test send has this long at most, then the rest are reported not tried (the route has 60 seconds). */
const TEST_BUDGET_MS = 40_000;

const problem = (reason: TestProblem, status: number, seconds?: number) => json({ ok: false, reason, ...(seconds ? { seconds } : {}) }, status);

/**
 * POST /api/admin/emails/test { send: true }: "Send me one of each". The
 * ten emails (lib/email/samples.ts) with "[Test] " before each subject, to
 * the site owner's own Google-confirmed address (admin_email_test, which
 * also allows it once in 10 minutes), through the same send as every email
 * (lib/email/send.ts: From, Reply-To, List-Unsubscribe, Idempotency-Key),
 * whatever the mode. Nothing goes in the outbox. Says plainly when it
 * can't send (no RESEND_API_KEY, not production) before using up the 10
 * minutes. The answer: each email's result, never the address.
 */
export async function emailTest(rpc: AdminRpc, req: Request, deps: TestDeps = {}): Promise<NextResponse> {
  const body = await smallJson(req);
  if (!body || body.send !== true) return problem("unavailable", 400);
  const env = deps.env ?? process.env;
  const cfg = emailConfig(env);
  if (!cfg.ok) return problem(cfg.reason, 503);
  const ak = env.ACCOUNT_KEY?.trim();
  if (!ak) return problem("no_account_key", 503);
  const res = await call(rpc, "admin_email_test", {});
  if ("missing" in res) return problem("not_set_up", 503);
  if ("unavailable" in res) return problem("unavailable", 503);
  const d = (res.data ?? {}) as Record<string, unknown>;
  if (refused(d)) return problem("forbidden", 403);
  if (d.r === "wait") return problem("wait", 429, typeof d.seconds === "number" && d.seconds > 0 ? Math.ceil(d.seconds) : 600);
  if (d.r === "no_address") return problem("no_address", 409);
  if (d.r !== "ok" || typeof d.to !== "string" || typeof d.user_id !== "string") return problem("unavailable", 502);

  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? randomUUID;
  const key = offKey(ak);
  const owner = { userId: d.user_id, to: d.to, name: typeof d.name === "string" ? d.name : null };
  const started = now();
  const results: TestLine[] = [];
  let lastSend = 0;
  for (const { key: k, label, job } of sampleJobs(owner, new Date(started), uuid)) {
    if (now() - started > TEST_BUDGET_MS) {
      results.push({ key: k, label, result: "retry", error: "not tried, out of time" });
      continue;
    }
    const off = offUrl(key, job);
    const email = renderEmail(job, { site: SITE, off }, { subjectPrefix: "[Test] " });
    if (!email) {
      results.push({ key: k, label, result: "failed", error: "no template" });
      continue;
    }
    const wait = lastSend + SEND_GAP_MS - now();
    if (lastSend && wait > 0) await sleep(wait);
    lastSend = now();
    const r = await sendEmail(cfg, { id: job.id, kind: job.kind, to: job.to, email, offUrl: off }, f);
    results.push(r.result === "sent" ? { key: k, label, result: "sent" } : { key: k, label, result: r.result, error: r.error });
  }
  return json({ ok: true, results });
}
