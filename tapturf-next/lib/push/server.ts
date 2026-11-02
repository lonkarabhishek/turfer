import { createECDH, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { generateRequestDetails, type RequestDetails } from "web-push";
import { accountError, accountReply, caller } from "../account/route";
import { accountRpcIfThere, createAccountLimiter, PRIVATE_HEADERS, readSmallJson, resolveAccount } from "../account/server";
import { isUuid } from "../games/payload";
import { PUSH_TTL_S, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./config";
import { deviceFamily, endpointOk, notificationPayload, parseSubscription, testPayload, urgencyFor, type PushNotificationRow } from "./payload";
import type { PushGone, PushPayload } from "./types";

// Web Push, for app/api/push/** (lib/push/types.ts has the API). The
// caller's own subscriptions go: the verified caller (lib/account/route.ts
// caller) -> the account it opens (resolveAccount) -> a server-key function
// (20261102_web_push.sql) that takes that account's id. The database asks
// /api/push/dispatch to send each new notification (the notifications_push
// trigger, with the revalidate secret); the sends are signed with the VAPID
// private key, which is only ever read from VAPID_PRIVATE_KEY here. Until
// that key is set and the database has the push functions, status says
// ready: false and the switch says coming soon. Relative imports only (npm
// run test:push).

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);
const allowTest = createAccountLimiter(10);

type Env = Record<string, string | undefined>;

/** Whether `priv` (base64url) is the private half of `pub`. */
export function keyPairMatches(priv: string, pub: string): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(priv, "base64url"));
    return ecdh.getPublicKey().toString("base64url") === pub;
  } catch {
    return false;
  }
}

let checkedKey: { raw: string; ok: boolean } | null = null;

/**
 * Vercel's VAPID_PRIVATE_KEY, only when it is the private half of
 * VAPID_PUBLIC_KEY (lib/push/config.ts): a key from another pair would make
 * every push service refuse our sends. Null means push is not on yet. The
 * key itself is never logged.
 */
export function vapidPrivateKey(env: Env = process.env): string | null {
  const raw = env.VAPID_PRIVATE_KEY?.trim();
  if (!raw) return null;
  if (checkedKey?.raw !== raw) {
    checkedKey = { raw, ok: keyPairMatches(raw, VAPID_PUBLIC_KEY) };
    if (!checkedKey.ok) console.error("push: VAPID_PRIVATE_KEY is not the private half of VAPID_PUBLIC_KEY (lib/push/config.ts); push stays off");
  }
  return checkedKey.ok ? raw : null;
}

/** The Topic header for a tag (32 URL-safe characters at most): a push service keeps only the newest message per topic for a phone that is off. */
export function topicFor(tag: string): string {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };
export type SendResult = "ok" | "gone" | "failed";

/** Push targets as the database sends them; anything not well formed is left out. */
function targetsOf(x: unknown): PushTarget[] {
  if (!Array.isArray(x)) return [];
  return x.filter(
    (t): t is PushTarget =>
      !!t && typeof t === "object" && isUuid((t as PushTarget).id) && typeof (t as PushTarget).endpoint === "string" &&
      typeof (t as PushTarget).p256dh === "string" && typeof (t as PushTarget).auth === "string",
  );
}

const SEND_TIMEOUT_MS = 10_000;

/**
 * One push: the payload encrypted for that browser (aes128gcm) and signed
 * with our VAPID key (web-push builds the request), posted to its push
 * service. ok: accepted (2xx); gone: the service says the subscription has
 * ended (404, 410); failed: anything else, or an address we don't send to.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  o: { privateKey: string; urgency: "high" | "normal"; env?: Env },
): Promise<{ result: SendResult; status: number }> {
  if (!endpointOk(target.endpoint, o.env ?? process.env)) return { result: "failed", status: 0 };
  let details: RequestDetails;
  try {
    details = generateRequestDetails({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
      vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: o.privateKey },
      TTL: PUSH_TTL_S,
      urgency: o.urgency,
      topic: topicFor(payload.tag),
      contentEncoding: "aes128gcm",
    });
  } catch {
    return { result: "failed", status: 0 };
  }
  // fetch works out the length itself.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(details.headers)) if (k.toLowerCase() !== "content-length") headers[k] = String(v);
  try {
    const res = await fetch(details.endpoint, {
      method: "POST",
      headers,
      body: details.body ? new Uint8Array(details.body) : null,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    await res.arrayBuffer().catch(() => null);
    if (res.status >= 200 && res.status < 300) return { result: "ok", status: res.status };
    if (res.status === 404 || res.status === 410) return { result: "gone", status: res.status };
    return { result: "failed", status: res.status };
  } catch {
    return { result: "failed", status: 0 };
  }
}

/** Every target at once (10 at most); what each came to, for push_report. */
async function sendAll(targets: PushTarget[], payload: PushPayload, privateKey: string, urgency: "high" | "normal") {
  const results = await Promise.all(targets.map(async (t) => ({ id: t.id, ...(await sendPush(t, payload, { privateKey, urgency })) })));
  const count = (r: SendResult) => results.filter((x) => x.result === r).length;
  return { results: results.map(({ id, result }) => ({ id, result })), sent: count("ok"), gone: count("gone"), failed: count("failed") };
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const GONE: readonly unknown[] = ["off", "expired", "failing", "replaced"] satisfies PushGone[];
const goneOf = (x: unknown): PushGone | null => (GONE.includes(x) ? (x as PushGone) : null);
const NOT_READY = () => accountReply({ reason: "not_ready" }, "unavailable");

type Who = { userId: string } | { reply: NextResponse };

/** The account this sign-in opens, or the reply to send instead. */
async function who(req: Request, allow: (req: Request) => boolean): Promise<Who> {
  const c = await caller(req, allow);
  if ("reply" in c) return c;
  const r = await resolveAccount(c.id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id };
}

/** An endpoint in a body, as far as the database needs it (it only ever matches the caller's own). */
const endpointIn = (body: Record<string, unknown> | null): string | null =>
  typeof body?.endpoint === "string" && body.endpoint.length > 0 && body.endpoint.length <= 1024 ? body.endpoint : null;

/* ------------------------------------------------------------------ */
/* The caller's own                                                    */
/* ------------------------------------------------------------------ */

/** POST /api/push/status { endpoint | null }: whether push can be turned on yet, and whether it is on here. */
export async function postStatus(req: Request): Promise<NextResponse> {
  // Not on yet: say so before any sign-in check or database call.
  if (!vapidPrivateKey()) return accountReply({ ready: false, on: false, devices: 0 });
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const body = await readSmallJson(req, 2_000);
  if (!body) return accountError("bad");
  const res = await accountRpcIfThere("push_state", { p_user_id: w.userId, p_endpoint: endpointIn(body) });
  if ("missing" in res) return accountReply({ ready: false, on: false, devices: 0 });
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r !== "ok") return accountError("bad");
  return accountReply({ ready: true, on: res.data.on === true, devices: num(res.data.devices), gone: goneOf(res.data.gone) });
}

/** POST /api/push/subscribe: this browser's subscription, on for the caller. */
export async function postSubscribe(req: Request): Promise<NextResponse> {
  if (!vapidPrivateKey()) return NOT_READY();
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const p = parseSubscription(await readSmallJson(req, 2_000), process.env);
  if ("bad" in p) return accountReply({ field: p.bad }, "bad");
  const res = await accountRpcIfThere("push_subscribe", {
    p_user_id: w.userId,
    p_endpoint: p.ok.endpoint,
    p_p256dh: p.ok.p256dh,
    p_auth: p.ok.auth,
    p_device: deviceFamily(req.headers.get("user-agent")),
  });
  if ("missing" in res) return NOT_READY();
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r === "ok") return accountReply({ r: "ok", devices: num(res.data.devices) });
  // The push service has ended that address (404, 410): the browser makes a new one.
  if (res.data.r === "expired") return accountReply({ reason: "expired" }, "not_allowed");
  return accountError(res.data.r === "limit" ? "limit" : "bad");
}

/** POST /api/push/unsubscribe { endpoint }: off for this browser (works whether or not push is on yet). */
export async function postUnsubscribe(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const endpoint = endpointIn(await readSmallJson(req, 2_000));
  if (!endpoint) return accountReply({ field: "endpoint" }, "bad");
  const res = await accountRpcIfThere("push_unsubscribe", { p_user_id: w.userId, p_endpoint: endpoint });
  // No push functions yet: nothing was on.
  if ("missing" in res) return accountReply({ r: "ok", devices: 0 });
  if ("unavailable" in res) return accountError("unavailable");
  return res.data.r === "ok" ? accountReply({ r: "ok", devices: num(res.data.devices) }) : accountError("bad");
}

/** POST /api/push/test: "Send me a test", to the caller's own phones (5 an hour). */
export async function postTest(req: Request): Promise<NextResponse> {
  const key = vapidPrivateKey();
  if (!key) return NOT_READY();
  const w = await who(req, allowTest);
  if ("reply" in w) return w.reply;
  const res = await accountRpcIfThere("push_test_targets", { p_user_id: w.userId });
  if ("missing" in res) return NOT_READY();
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r === "none") return accountReply({ reason: "none" }, "not_allowed");
  if (res.data.r === "limit") return accountError("limit");
  if (res.data.r !== "ok" || typeof res.data.send_id !== "string") return accountError("unavailable");
  const out = await sendAll(targetsOf(res.data.targets), testPayload(), key, "normal");
  await report(res.data.send_id, out.results);
  return accountReply({ r: "ok", sent: out.sent, gone: out.gone, failed: out.failed });
}

/** What the sends came to (subscriptions the push service ended become gone). Never throws. */
async function report(sendId: string, results: { id: string; result: SendResult }[]): Promise<void> {
  const res = await accountRpcIfThere("push_report", { p_send_id: sendId, p_results: results });
  if (!("data" in res) || res.data.r !== "ok") console.warn("push: push_report answered", "data" in res ? res.data.r : Object.keys(res)[0]);
}

/* ------------------------------------------------------------------ */
/* From the database                                                   */
/* ------------------------------------------------------------------ */

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });

/** The notification push_targets sends, or null when it is not well formed. */
function notificationOf(x: unknown): PushNotificationRow | null {
  const n = (x ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof n[k] === "string" ? (n[k] as string) : null);
  const id = s("id"), type = s("type"), title = s("title"), message = s("message"), url = s("url");
  return id && type && title !== null && message !== null && url ? { id, type, title, message, url } : null;
}

/**
 * POST /api/push/dispatch { id }, from the notifications_push trigger with
 * the x-revalidate-secret header (checked by `secretOk`, the revalidation
 * route's own check): send that notification to its account's phones.
 * push_targets hands it out once, so a second post sends nothing.
 */
export async function dispatch(req: Request, secretOk: (header: string | null) => Promise<boolean>): Promise<NextResponse> {
  if (!(await secretOk(req.headers.get("x-revalidate-secret")))) return json({ ok: false, error: "Unauthorized" }, 401);
  const body = await readSmallJson(req, 500);
  const id = body?.id;
  if (!isUuid(id)) return json({ ok: false, error: "Bad body" }, 400);
  const key = vapidPrivateKey();
  if (!key) return json({ ok: false, reason: "not_ready" }, 503);
  const res = await accountRpcIfThere("push_targets", { p_notification_id: id.toLowerCase() });
  if ("missing" in res) return json({ ok: false, reason: "not_ready" }, 503);
  if ("unavailable" in res) return json({ ok: false, reason: "unavailable" }, 503);
  const d = res.data;
  // gone, old, none, sent: nothing to send.
  if (d.r !== "ok") return json({ ok: true, skipped: typeof d.r === "string" ? d.r : "bad" });
  const n = notificationOf(d.notification);
  if (!n || typeof d.send_id !== "string") return json({ ok: false, reason: "unavailable" }, 503);
  const out = await sendAll(targetsOf(d.targets), notificationPayload(n), key, urgencyFor(n.type));
  await report(d.send_id, out.results);
  return json({ ok: true, sent: out.sent, gone: out.gone, failed: out.failed });
}
