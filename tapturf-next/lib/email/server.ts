import { NextResponse } from "next/server";
import { accountError, accountReply, caller } from "../account/route";
import { accountKey, accountRpcIfThere, createAccountLimiter, PRIVATE_HEADERS, readSmallJson, resolveAccount } from "../account/server";
import { isUuid } from "../games/payload";
import { offPage, type OffState } from "./offPage";
import { emailConfig, sendEmail, type SendResult } from "./send";
import { svixKey, svixVerify } from "./svix";
import { renderEmail } from "./templates";
import { offKey, offToken, readOffToken } from "./token";
import { TURFS_MAX } from "./slotReminder";
import { CLAIM_MAX, GROUP_OF, SITE, type EmailJob, type EmailKind, type EmailPrefsResponse, type OffGroup } from "./types";

// Emails (supabase/migrations/20261110_email.sql; lib/email/types.ts has
// the API): the sender the database calls, Resend's webhook, the Me tab's
// switches (the verified caller, as the games routes) and the link in an
// email. The owners' slot reminder (20261129_slot_reminders.sql) goes
// through the same sender; its switch has two functions of its own
// (slot_reminder_pref, slot_reminder_pref_set), absent before that file.
// Relative imports only (npm run test:email).

const KINDS: readonly EmailKind[] = ["welcome", "join_request", "request_waiting", "request_accepted", "game_cancelled", "game_changed", "reminder", "slot_reminder"];
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });

/* ------------------------------------------------------------------ */
/* The sender                                                          */
/* ------------------------------------------------------------------ */

/** A slot reminder names 1 to 5 turfs, each with its id, its name, when it was last updated (or never) and a count. */
function slotJobOk(job: EmailJob): boolean {
  const turfs: unknown = job.turfs;
  if (!Array.isArray(turfs) || turfs.length < 1 || turfs.length > TURFS_MAX) return false;
  return turfs.every((t) => {
    const x = (t ?? {}) as Record<string, unknown>;
    return isUuid(x.id) && typeof x.name === "string" && x.name.trim() !== ""
      && (x.updated_at === null || (typeof x.updated_at === "string" && Number.isFinite(Date.parse(x.updated_at))))
      && typeof x.asks === "number" && Number.isInteger(x.asks) && x.asks >= 0;
  });
}

/** A job as email_claim sends it, or null when it is not well formed. */
export function jobOf(x: unknown): EmailJob | null {
  const j = (x ?? {}) as Record<string, unknown>;
  if (!isUuid(j.id) || !isUuid(j.user_id) || !KINDS.includes(j.kind as EmailKind)) return null;
  if (typeof j.to !== "string" || !/^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/.test(j.to) || j.to.length > 254) return null;
  if (typeof j.path !== "string") return null;
  const job = j as unknown as EmailJob;
  if (job.kind === "slot_reminder") return slotJobOk(job) ? job : null;
  if (job.kind !== "welcome" && (!job.game || typeof job.game !== "object" || !isUuid(job.game.id) || !job.game.venue)) return null;
  return job;
}

/** The link that turns this email's group off (Welcome: all of them). */
export function offUrl(key: Buffer, job: Pick<EmailJob, "user_id" | "kind">): string {
  const group: OffGroup = GROUP_OF[job.kind] ?? "all";
  return `${SITE}/email/off?t=${offToken(key, job.user_id, group)}`;
}

type Deps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };

/** Resend takes 2 requests a second: the sends go one after another, this far apart at least. */
export const SEND_GAP_MS = 550;
/** One call sends for this long at most, then leaves the rest to the next minute's call. */
const BUDGET_MS = 40_000;

/**
 * POST /api/email/dispatch, from the email-flush job (pg_net, with the
 * x-revalidate-secret header, checked by `secretOk`, the revalidation
 * route's own check). Without RESEND_API_KEY, or off production, sends
 * nothing: it says not_configured and asks the database to hold its posts
 * for 30 minutes (email_hold). Else claims up to 20 due emails at a time
 * (email_claim), writes each (lib/email/templates.ts), sends it to Resend,
 * and reports what Resend said (email_report), until none is due or 40
 * seconds have gone.
 */
export async function dispatch(req: Request, secretOk: (header: string | null) => Promise<boolean>, deps: Deps = {}): Promise<NextResponse> {
  if (!(await secretOk(req.headers.get("x-revalidate-secret")))) return json({ ok: false, error: "Unauthorized" }, 401);
  const cfg = emailConfig(process.env);
  if (!cfg.ok) {
    const held = await accountRpcIfThere("email_hold", { p_reason: cfg.reason });
    if ("data" in held && held.data.r !== "ok") console.warn("email: email_hold answered", held.data.r);
    return json({ ok: false, reason: "not_configured", why: cfg.reason }, 503);
  }
  const ak = accountKey();
  if (!ak) return json({ ok: false, reason: "unavailable" }, 503);
  const key = offKey(ak);
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const started = now();
  const total = { sent: 0, retry: 0, failed: 0, skipped: 0 };
  let lastSend = 0;
  for (let round = 0; round < 5 && now() - started < BUDGET_MS; round++) {
    const res = await accountRpcIfThere("email_claim", { p_limit: CLAIM_MAX });
    if ("missing" in res) return json({ ok: false, reason: "not_ready" }, 503);
    if ("unavailable" in res) return json({ ok: false, reason: "unavailable", ...total }, 503);
    total.skipped += typeof res.data.skipped === "number" ? res.data.skipped : 0;
    const list = Array.isArray(res.data.jobs) ? res.data.jobs : [];
    const results: { id: string; result: SendResult["result"]; provider_id?: string | null; error?: string }[] = [];
    for (const raw of list) {
      const job = jobOf(raw);
      const id = (raw as { id?: unknown })?.id;
      if (!job) {
        if (isUuid(id)) results.push({ id, result: "failed", error: "not well formed" });
        continue;
      }
      const off = offUrl(key, job);
      const email = renderEmail(job, { site: SITE, off });
      if (!email) {
        results.push({ id: job.id, result: "failed", error: "no template" });
        continue;
      }
      const wait = lastSend + SEND_GAP_MS - now();
      if (lastSend && wait > 0) await sleep(wait);
      lastSend = now();
      const r = await sendEmail(cfg, { id: job.id, kind: job.kind, to: job.to, email, offUrl: off }, f);
      results.push(r.result === "sent" ? { id: job.id, result: "sent", provider_id: r.id } : { id: job.id, result: r.result, error: r.error });
      total[r.result === "sent" ? "sent" : r.result] += 1;
    }
    if (results.length) {
      const rep = await accountRpcIfThere("email_report", { p_results: results });
      if (!("data" in rep) || rep.data.r !== "ok") console.warn("email: email_report answered", "data" in rep ? rep.data.r : Object.keys(rep)[0]);
    }
    if (res.data.more !== true) break;
  }
  return json({ ok: true, ...total });
}

/* ------------------------------------------------------------------ */
/* Resend's webhook                                                    */
/* ------------------------------------------------------------------ */

/** The addresses of a bounce or a complaint event; [] for anything else, and for a bounce Resend calls temporary. */
export function suppressionOf(event: unknown): { reason: "bounce" | "complaint"; addresses: string[] } | null {
  const e = (event ?? {}) as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };
  const reason = e.type === "email.bounced" ? "bounce" : e.type === "email.complained" ? "complaint" : null;
  if (!reason) return null;
  if (reason === "bounce" && typeof e.data?.bounce?.type === "string" && /^(transient|temporary)$/i.test(e.data.bounce.type)) return null;
  const to = e.data?.to;
  const list = (Array.isArray(to) ? to : [to]).filter((a): a is string => typeof a === "string" && a.includes("@") && a.length <= 254).slice(0, 10);
  return list.length ? { reason, addresses: list } : null;
}

/**
 * POST /api/email/webhook, from Resend: a bounced or complaining address is
 * never emailed again (email_suppress). Checked with RESEND_WEBHOOK_SECRET
 * (the Svix signature); 503 until it is set.
 */
export async function webhook(req: Request, nowS?: number): Promise<NextResponse> {
  const key = svixKey(process.env.RESEND_WEBHOOK_SECRET);
  if (!key) return json({ ok: false, reason: "not_configured" }, 503);
  if (Number(req.headers.get("content-length")) > 64_000) return json({ ok: false, error: "Too big" }, 413);
  const body = await req.text();
  if (body.length > 64_000) return json({ ok: false, error: "Too big" }, 413);
  const signed = svixVerify(
    key,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body,
    nowS,
  );
  if (!signed) return json({ ok: false, error: "Unauthorized" }, 401);
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "Bad body" }, 400);
  }
  const s = suppressionOf(event);
  if (!s) return json({ ok: true, suppressed: 0 });
  let n = 0;
  for (const address of s.addresses) {
    const res = await accountRpcIfThere("email_suppress", { p_address: address, p_reason: s.reason });
    if ("data" in res && res.data.r === "ok") n++;
    // Resend sends the event again on a 5xx: say so when the database could not take it.
    else if (!("data" in res)) return json({ ok: false, reason: "unavailable" }, 503);
  }
  return json({ ok: true, suppressed: n });
}

/* ------------------------------------------------------------------ */
/* The Me tab's switches                                               */
/* ------------------------------------------------------------------ */

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

/** The account this sign-in opens, or the reply to send instead. */
async function who(req: Request, allow: (req: Request) => boolean): Promise<{ userId: string } | { reply: NextResponse }> {
  const c = await caller(req, allow);
  if ("reply" in c) return c;
  const r = await resolveAccount(c.id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id };
}

const NOT_READY: EmailPrefsResponse = { ready: false, email: null, suppressed: false, requests: true, changes: true, reminders: true, slots: null };

function prefsOf(d: Record<string, unknown>, slots: boolean | null): EmailPrefsResponse {
  return {
    ready: true,
    email: typeof d.email === "string" ? d.email : null,
    suppressed: d.suppressed === true,
    requests: d.requests !== false,
    changes: d.changes !== false,
    reminders: d.reminders !== false,
    slots,
  };
}

type RpcAnswer = Awaited<ReturnType<typeof accountRpcIfThere>>;

/**
 * The slot reminder switch as slot_reminder_pref (or _set) answers it: on
 * or off for an account that runs a claimed turf. Null for anyone else, a
 * database without the function, or a read that failed: the switch is then
 * not shown, and the other three are as they were.
 */
function slotsOf(res: RpcAnswer): boolean | null {
  if (!("data" in res) || res.data.r !== "ok" || res.data.owner !== true) return null;
  return res.data.slots !== false;
}

/** GET /api/account/emails: the caller's own address (only when Google confirmed it) and switches. */
export async function getEmailPrefs(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const [res, slots] = await Promise.all([
    accountRpcIfThere("email_prefs_get", { p_user_id: w.userId }),
    accountRpcIfThere("slot_reminder_pref", { p_user_id: w.userId }),
  ]);
  if ("missing" in res) return accountReply(NOT_READY);
  if ("unavailable" in res) return accountError("unavailable");
  return res.data.r === "ok" ? accountReply(prefsOf(res.data, slotsOf(slots))) : accountError("bad");
}

/** PATCH /api/account/emails { requests?, changes?, reminders?, slots? }: the caller's own switches. */
export async function patchEmailPrefs(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const body = await readSmallJson(req, 500);
  const three = ["requests", "changes", "reminders"] as const;
  const keys = [...three, "slots"] as const;
  if (!body || Object.keys(body).some((k) => !(keys as readonly string[]).includes(k)) || !keys.some((k) => typeof body[k] === "boolean")
      || keys.some((k) => body[k] !== undefined && typeof body[k] !== "boolean")) {
    return accountError("bad");
  }
  // The slot reminders' switch first (its own function, 20261129_slot_reminders.sql): a database without it changes nothing.
  let slots: RpcAnswer | null = null;
  if (typeof body.slots === "boolean") {
    slots = await accountRpcIfThere("slot_reminder_pref_set", { p_user_id: w.userId, p_on: body.slots });
    if ("missing" in slots) return accountReply(NOT_READY, "unavailable");
    if ("unavailable" in slots) return accountError("unavailable");
    if (slots.data.r !== "ok") return accountError("bad");
  }
  const res = three.some((k) => typeof body[k] === "boolean")
    ? await accountRpcIfThere("email_prefs_set", {
        p_user_id: w.userId,
        p_requests: body.requests ?? null,
        p_changes: body.changes ?? null,
        p_reminders: body.reminders ?? null,
      })
    : await accountRpcIfThere("email_prefs_get", { p_user_id: w.userId });
  if ("missing" in res) return accountReply(NOT_READY, "unavailable");
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r !== "ok") return accountError("bad");
  return accountReply(prefsOf(res.data, slotsOf(slots ?? (await accountRpcIfThere("slot_reminder_pref", { p_user_id: w.userId })))));
}

/* ------------------------------------------------------------------ */
/* The link in an email: /email/off                                    */
/* ------------------------------------------------------------------ */

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
const page = (s: OffState) => {
  const p = offPage(s);
  return new NextResponse(p.html, { status: p.status, headers: PAGE_HEADERS });
};
const allowOff = createAccountLimiter(30);

function tokenKey(): Buffer | null {
  const k = accountKey();
  return k ? offKey(k) : null;
}

/** GET /email/off?t=...: which emails the link turns off, and a Turn off button. Changes nothing. */
export async function getOff(req: Request): Promise<NextResponse> {
  const t = new URL(req.url).searchParams.get("t");
  const key = tokenKey();
  if (!key) return page({ state: "error" });
  const who = readOffToken(key, t);
  return who && t ? page({ state: "ask", group: who.group, token: t }) : page({ state: "bad" });
}

/**
 * POST /email/off?t=...: turns them off. From the page's button (a form,
 * t in the address and the body) or from a mail app's one-click
 * unsubscribe (RFC 8058: body List-Unsubscribe=One-Click), which gets a
 * short plain answer.
 */
export async function postOff(req: Request): Promise<NextResponse> {
  if (!allowOff(req)) return new NextResponse("Too many tries. Wait a minute.", { status: 429, headers: { ...PAGE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  let form = new URLSearchParams();
  try {
    if (Number(req.headers.get("content-length")) <= 2_000) {
      const text = await req.text();
      if (text.length <= 2_000) form = new URLSearchParams(text);
    }
  } catch {
    /* no body */
  }
  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  const t = new URL(req.url).searchParams.get("t") ?? form.get("t");
  const plain = (status: number, text: string) => new NextResponse(text, { status, headers: { ...PAGE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  const key = tokenKey();
  if (!key) return oneClick ? plain(503, "Try again later.") : page({ state: "error", token: t ?? undefined });
  const who = readOffToken(key, t);
  if (!who || !t) return oneClick ? plain(400, "This link doesn't work.") : page({ state: "bad" });
  // The slot reminders' link turns off that one kind, through its own function (20261129_slot_reminders.sql).
  const res = who.group === "slots"
    ? await accountRpcIfThere("slot_reminder_pref_set", { p_user_id: who.userId, p_on: false })
    : await accountRpcIfThere("email_unsubscribe", { p_user_id: who.userId, p_group: who.group });
  if (!("data" in res) || res.data.r !== "ok") {
    // An account that is gone has nothing to turn off.
    if ("data" in res && res.data.r === "bad") return oneClick ? plain(200, "Unsubscribed.") : page({ state: "done", group: who.group });
    return oneClick ? plain(503, "Try again later.") : page({ state: "error", token: t });
  }
  return oneClick ? plain(200, "Unsubscribed.") : page({ state: "done", group: who.group });
}
