import { test } from "node:test";
import assert from "node:assert/strict";
import { dbProfile, installNet, net, phoneToken, req, testEnv } from "../account/testkit";
import { dispatch, getEmailPrefs, getOff, jobOf, patchEmailPrefs, postOff, suppressionOf, webhook } from "./server";
import { svixSign, svixKey } from "./svix";
import { offKey, offToken } from "./token";

testEnv();
installNet();

// Made-up people and addresses only.
const GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const id = (i: number) => `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`;
const venue = { name: "Kings Turf", area: "Baner", city: "pune", address: "Plot 4, Baner Road", lat: 18.559, lng: 73.786, maps_url: null, turf_slug: "kings-turf" };
const gameOf = { id: GAME, sport: "Football", date: "2026-11-14", start_time: "19:00", end_time: "20:00", price_per_player: 150, status: "open", host_first: "Asha", players: 6, max_players: 10, venue };
const jobs = [
  { id: id(1), kind: "request_accepted", group: "requests", user_id: RAVI, to: "ravi.standin@example.com", name: "Ravi", attempt: 1, path: `/game/${GAME}`, game: gameOf },
  { id: id(2), kind: "join_request", group: "requests", user_id: ASHA, to: "asha.standin@example.com", name: "Asha", attempt: 1, path: `/game/${GAME}`, you_host: true, game: gameOf, requests: [{ name: "Ravi Kumar" }] },
  { id: id(3), kind: "welcome", group: "account", user_id: ASHA, to: "asha.standin@example.com", name: "Asha", attempt: 2, path: "/games" },
];
const okSecret = async (h: string | null) => h === "reval";
const post = (headers: Record<string, string> = { "x-revalidate-secret": "reval" }) => req("/api/email/dispatch", { method: "POST", body: { due: 1 }, headers });

/** A fake Resend that keeps what it was sent. */
function fakeResend(answer: (n: number) => Response = (n) => Response.json({ id: `re_${n}` })) {
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return answer(sent.length);
  }) as typeof fetch;
  return { sent, f };
}
const noSleep = { sleep: async () => {} };
const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
};
const LOCAL = { RESEND_API_KEY: "re_test", EMAIL_API_BASE: "http://127.0.0.1:9/resend", VERCEL: undefined, VERCEL_ENV: undefined };

/* ---------------- the sender ---------------- */

test("dispatch: the secret first; nothing else is called without it", async () => {
  net.reset();
  const r = await dispatch(post({ "x-revalidate-secret": "wrong" }), okSecret);
  assert.equal(r.status, 401);
  assert.equal(net.rpcCalls.length, 0);
});

test("dispatch without RESEND_API_KEY: sends nothing, says so, and asks the database to hold", async () => {
  await withEnv({ ...LOCAL, RESEND_API_KEY: undefined }, async () => {
    net.reset();
    const resend = fakeResend();
    const r = await dispatch(post(), okSecret, { fetch: resend.f, ...noSleep });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, reason: "not_configured", why: "no_key" });
    assert.deepEqual(net.rpcCalls.map((c) => [c.fn, c.args.p_reason]), [["email_hold", "no_key"]], "only the hold: nothing claimed");
    assert.equal(resend.sent.length, 0);
  });
  await withEnv({ RESEND_API_KEY: "re_test", VERCEL: "1", VERCEL_ENV: "preview", EMAIL_API_BASE: undefined }, async () => {
    net.reset();
    const r = await dispatch(post(), okSecret);
    assert.deepEqual(await r.json(), { ok: false, reason: "not_configured", why: "not_production" }, "a preview never sends");
  });
});

test("dispatch: claims, writes, sends one by one to each person only, reports", async () => {
  await withEnv(LOCAL, async () => {
    net.reset();
    let claims = 0;
    net.rpc.email_claim = () => (claims++ === 0 ? { r: "ok", jobs: [...jobs, { id: id(9), kind: "nope" }], skipped: 2, more: false } : { r: "ok", jobs: [], more: false });
    net.rpc.email_report = () => ({ r: "ok" });
    const resend = fakeResend((n) => (n === 2 ? Response.json({ name: "rate_limit_exceeded" }, { status: 429 }) : Response.json({ id: `re_${n}` })));
    const waits: number[] = [];
    const r = await dispatch(post(), okSecret, { fetch: resend.f, sleep: async (ms) => void waits.push(ms) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, sent: 2, retry: 1, failed: 0, skipped: 2 });
    assert.equal(claims, 1, "one claim: no more due");
    assert.deepEqual(net.calls("email_claim")[0].args.p_limit, 20);
    assert.equal(resend.sent.length, 3);
    assert.deepEqual(resend.sent.map((s) => s.body.to), [["ravi.standin@example.com"], ["asha.standin@example.com"], ["asha.standin@example.com"]], "one recipient a send");
    assert.deepEqual(resend.sent.map((s) => s.headers.get("idempotency-key")), [id(1), id(2), id(3)], "the outbox id as the Idempotency-Key");
    for (const s of resend.sent) {
      assert.equal(s.url, "http://127.0.0.1:9/resend/emails");
      assert.equal(s.body.from, "TapTurf <hello@tapturf.in>");
      assert.equal(s.body.reply_to, "info@tapturf.in");
      const h = s.body.headers as Record<string, string>;
      const lu = /^<https:\/\/www\.tapturf\.in\/email\/off\?t=([A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{22})>, <mailto:info@tapturf\.in\?subject=Unsubscribe%20([A-Za-z0-9_.-]+)>$/.exec(h["List-Unsubscribe"]);
      assert.ok(lu, h["List-Unsubscribe"]);
      assert.equal(lu[2], lu[1], "the mailto's subject carries the link's own token, so it can be acted on by hand");
      assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    }
    assert.equal(resend.sent[0].body.subject, "You're in: Football on Sat 14 Nov, 7 PM");
    assert.equal(resend.sent[2].body.subject, "Welcome to TapTurf");
    // The links: each person's own group (Welcome: all).
    const key = offKey("test-account-key");
    assert.ok((resend.sent[0].body.headers as Record<string, string>)["List-Unsubscribe"].includes(offToken(key, RAVI, "requests")));
    assert.ok((resend.sent[2].body.headers as Record<string, string>)["List-Unsubscribe"].includes(offToken(key, ASHA, "all")));
    assert.equal(waits.length, 2, "Resend's 2 a second: a wait before the 2nd and 3rd sends");
    assert.deepEqual(net.calls("email_report")[0].args.p_results, [
      { id: id(1), result: "sent", provider_id: "re_1" },
      { id: id(2), result: "retry", error: "429 rate_limit_exceeded" },
      { id: id(3), result: "sent", provider_id: "re_3" },
      { id: id(9), result: "failed", error: "not well formed" },
    ], "what each came to, and a job that is not well formed is failed");
  });
});

test("dispatch: claims again while more are due, at most 5 rounds", async () => {
  await withEnv(LOCAL, async () => {
    net.reset();
    net.rpc.email_claim = () => ({ r: "ok", jobs: [jobs[2]], more: true });
    const resend = fakeResend();
    const r = await dispatch(post(), okSecret, { fetch: resend.f, ...noSleep });
    assert.equal((await r.json()).sent, 5);
    assert.equal(net.calls("email_claim").length, 5);
  });
});

test("dispatch: a database without the email functions, or not answering", async () => {
  await withEnv(LOCAL, async () => {
    net.reset();
    net.rpc.email_claim = () => Response.json({ code: "PGRST202", message: "no function" }, { status: 404 });
    assert.deepEqual(await (await dispatch(post(), okSecret, noSleep)).json(), { ok: false, reason: "not_ready" });
    net.reset();
    net.rpc.email_claim = () => ({ r: "unavailable" });
    const r = await dispatch(post(), okSecret, noSleep);
    assert.equal(r.status, 503);
  });
});

test("jobOf: only well formed jobs", () => {
  assert.ok(jobOf(jobs[0]));
  assert.ok(jobOf(jobs[2]), "Welcome has no game");
  assert.equal(jobOf({ ...jobs[0], to: "a@b.c, d@e.f" }), null, "one address only");
  assert.equal(jobOf({ ...jobs[0], to: "not an address" }), null);
  assert.equal(jobOf({ ...jobs[0], game: undefined }), null, "a game email needs its game");
  assert.equal(jobOf({ ...jobs[0], kind: "booking_request" }), null, "no other kind");
  assert.equal(jobOf({ ...jobs[0], user_id: "x" }), null);
});

/* ---------------- Resend's webhook ---------------- */

const SECRET = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
const hook = (event: unknown, o: { secret?: string; ts?: number } = {}) => {
  const body = JSON.stringify(event);
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const sig = svixSign(svixKey(o.secret ?? SECRET)!, "msg_1", ts, body);
  return new Request("http://localhost/api/email/webhook", { method: "POST", body, headers: { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": sig } });
};

test("webhook: 503 without RESEND_WEBHOOK_SECRET; 401 with a wrong signature", async () => {
  await withEnv({ RESEND_WEBHOOK_SECRET: undefined }, async () => {
    net.reset();
    assert.equal((await webhook(hook({ type: "email.bounced" }))).status, 503);
  });
  await withEnv({ RESEND_WEBHOOK_SECRET: SECRET }, async () => {
    net.reset();
    assert.equal((await webhook(hook({ type: "email.bounced", data: { to: ["x@example.com"] } }, { secret: `whsec_${Buffer.from("another-secret-another-secret!!").toString("base64")}` }))).status, 401);
    assert.equal((await webhook(hook({ type: "email.bounced", data: { to: ["x@example.com"] } }, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status, 401, "an old delivery");
    assert.equal(net.rpcCalls.length, 0);
  });
});

test("webhook: a bounce or a complaint is suppressed; anything else is left alone", async () => {
  await withEnv({ RESEND_WEBHOOK_SECRET: SECRET }, async () => {
    net.reset();
    net.rpc.email_suppress = () => ({ r: "ok" });
    let r = await webhook(hook({ type: "email.bounced", data: { to: ["ravi.standin@example.com"], bounce: { type: "Permanent" } } }));
    assert.deepEqual([r.status, await r.json()], [200, { ok: true, suppressed: 1 }]);
    r = await webhook(hook({ type: "email.complained", data: { to: ["asha.standin@example.com"] } }));
    assert.deepEqual(await r.json(), { ok: true, suppressed: 1 });
    r = await webhook(hook({ type: "email.delivered", data: { to: ["asha.standin@example.com"] } }));
    assert.deepEqual(await r.json(), { ok: true, suppressed: 0 });
    assert.deepEqual(net.calls("email_suppress").map((c) => [c.args.p_address, c.args.p_reason]), [["ravi.standin@example.com", "bounce"], ["asha.standin@example.com", "complaint"]]);
    net.rpc.email_suppress = () => ({ r: "unavailable" });
    r = await webhook(hook({ type: "email.complained", data: { to: ["asha.standin@example.com"] } }));
    assert.equal(r.status, 503, "Resend tries again when the database could not take it");
  });
  assert.equal(suppressionOf({ type: "email.bounced", data: { to: "x@example.com", bounce: { type: "Transient" } } }), null, "a temporary bounce: not suppressed");
  assert.deepEqual(suppressionOf({ type: "email.bounced", data: { to: "x@example.com" } }), { reason: "bounce", addresses: ["x@example.com"] });
});

/* ---------------- the Me tab's switches ---------------- */

test("GET and PATCH /api/account/emails: the verified caller's own, through the account", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: ASHA });
  net.rpc.email_prefs_get = (a) => ({ r: "ok", email: a.p_user_id === ASHA ? "asha.standin@example.com" : null, suppressed: false, requests: true, changes: false, reminders: true, all_off: false });
  net.rpc.email_prefs_set = (a) => ({ r: "ok", email: "asha.standin@example.com", suppressed: false, requests: a.p_requests ?? true, changes: a.p_changes ?? false, reminders: a.p_reminders ?? true, all_off: false });
  assert.equal((await getEmailPrefs(req("/api/account/emails"))).status, 401, "signed in only");
  let r = await getEmailPrefs(req("/api/account/emails", { token: phoneToken() }));
  assert.deepEqual(await r.json(), { ready: true, email: "asha.standin@example.com", suppressed: false, requests: true, changes: false, reminders: true, slots: null });
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(net.calls("email_prefs_get")[0].args.p_user_id, ASHA, "the account the sign-in opens, never one the browser names");
  r = await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { reminders: false } }));
  assert.equal((await r.json()).reminders, false);
  assert.deepEqual(net.calls("email_prefs_set")[0].args, { p_key: "test-account-key", p_user_id: ASHA, p_requests: null, p_changes: null, p_reminders: false });
  for (const body of [{}, { reminders: "no" }, { user_id: RAVI, reminders: false }, { email: "x@example.com" }]) {
    assert.equal((await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body }))).status, 400, JSON.stringify(body));
  }
  net.rpc.email_prefs_get = () => Response.json({ code: "PGRST202", message: "no function" }, { status: 404 });
  r = await getEmailPrefs(req("/api/account/emails", { token: phoneToken() }));
  assert.equal((await r.json()).ready, false, "before the migration: the block hides");
});

test("the slot reminders' switch: only for an account that runs a turf, through its own two functions", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: ASHA });
  const three = { r: "ok", email: "asha.standin@example.com", suppressed: false, requests: true, changes: true, reminders: true, all_off: false };
  net.rpc.email_prefs_get = () => three;
  net.rpc.email_prefs_set = (a) => ({ ...three, reminders: a.p_reminders ?? true });
  let on = true;
  net.rpc.slot_reminder_pref = () => ({ r: "ok", owner: true, slots: on });
  net.rpc.slot_reminder_pref_set = (a) => {
    on = a.p_on as boolean;
    return { r: "ok", owner: true, slots: on };
  };
  let r = await getEmailPrefs(req("/api/account/emails", { token: phoneToken() }));
  assert.equal((await r.json()).slots, true, "an owner: the switch, on until turned off");
  assert.deepEqual(net.calls("slot_reminder_pref")[0].args, { p_key: "test-account-key", p_user_id: ASHA });
  r = await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { slots: false } }));
  assert.deepEqual([r.status, (await r.json()).slots], [200, false]);
  assert.deepEqual(net.calls("slot_reminder_pref_set")[0].args, { p_key: "test-account-key", p_user_id: ASHA, p_on: false });
  assert.equal(net.calls("email_prefs_set").length, 0, "the other three are read, not written");
  r = await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { slots: true, reminders: false } }));
  const both = await r.json();
  assert.deepEqual([both.slots, both.reminders], [true, false], "both in one save");
  assert.deepEqual(net.calls("email_prefs_set")[0].args, { p_key: "test-account-key", p_user_id: ASHA, p_requests: null, p_changes: null, p_reminders: false });
  assert.equal((await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { slots: "off" } }))).status, 400);
  // Someone who runs no turf: no switch.
  net.rpc.slot_reminder_pref = () => ({ r: "ok", owner: false, slots: true });
  r = await getEmailPrefs(req("/api/account/emails", { token: phoneToken() }));
  assert.equal((await r.json()).slots, null);
  // Before 20261129_slot_reminders.sql: the three switches as they were, no fourth, and a change to it says so.
  const missing = () => Response.json({ code: "PGRST202", message: "no function" }, { status: 404 });
  net.rpc.slot_reminder_pref = missing;
  net.rpc.slot_reminder_pref_set = missing;
  r = await getEmailPrefs(req("/api/account/emails", { token: phoneToken() }));
  assert.deepEqual(await r.json(), { ready: true, email: "asha.standin@example.com", suppressed: false, requests: true, changes: true, reminders: true, slots: null });
  r = await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { reminders: false } }));
  assert.deepEqual([r.status, (await r.json()).reminders], [200, false], "the three still save");
  const sets = net.calls("email_prefs_set").length;
  r = await patchEmailPrefs(req("/api/account/emails", { method: "PATCH", token: phoneToken(), body: { slots: false, reminders: true } }));
  assert.equal(r.status, 503);
  assert.equal(net.calls("email_prefs_set").length, sets, "and nothing else is written with it");
});

/* ---------------- the link in an email ---------------- */

test("/email/off: GET asks and changes nothing; POST turns off; one-click too", async () => {
  net.reset();
  net.rpc.email_unsubscribe = () => ({ r: "ok" });
  const t = offToken(offKey("test-account-key"), RAVI, "reminders");
  let r = await getOff(req(`/email/off?t=${t}`));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const html = await r.text();
  assert.match(html, /Turn off reminder emails\?/);
  assert.equal(net.rpcCalls.length, 0, "opening the link changes nothing");
  r = await getOff(req(`/email/off?t=${t.slice(0, -2)}xx`));
  assert.equal(r.status, 400);
  // The button.
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: `t=${t}`, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.9.1" } }));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /We won't send you reminder emails any more\./);
  assert.deepEqual(net.calls("email_unsubscribe")[0].args, { p_key: "test-account-key", p_user_id: RAVI, p_group: "reminders" });
  // A mail app's one-click (RFC 8058).
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.9.2" } }));
  assert.deepEqual([r.status, await r.text()], [200, "Unsubscribed."]);
  // A forged token: nothing changes.
  const forged = offToken(offKey("another-key"), RAVI, "all");
  r = await postOff(new Request(`http://localhost/email/off?t=${forged}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "x-forwarded-for": "10.9.9.3" } }));
  assert.equal(r.status, 400);
  assert.equal(net.calls("email_unsubscribe").length, 2);
  // The database not answering.
  net.rpc.email_unsubscribe = () => ({ r: "unavailable" });
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: `t=${t}`, headers: { "x-forwarded-for": "10.9.9.4" } }));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /Try again/);
});

test("/email/off for slot reminders: turns off only that kind, through its own function", async () => {
  net.reset();
  net.rpc.slot_reminder_pref_set = () => ({ r: "ok", owner: true, slots: false });
  const t = offToken(offKey("test-account-key"), RAVI, "slots");
  let r = await getOff(req(`/email/off?t=${t}`));
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Turn off reminders to update your free slots\?/);
  assert.match(html, /For turf owners: an email every 2 days while your free slots are out of date, 5 in a row at most\./);
  assert.equal(net.rpcCalls.length, 0, "opening the link changes nothing");
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: `t=${t}`, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.8.1" } }));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /We won't send you reminders to update your free slots any more\./);
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.8.2" } }));
  assert.deepEqual([r.status, await r.text()], [200, "Unsubscribed."]);
  assert.deepEqual(net.calls("slot_reminder_pref_set").map((c) => c.args), Array(2).fill({ p_key: "test-account-key", p_user_id: RAVI, p_on: false }));
  assert.equal(net.calls("email_unsubscribe").length, 0, "no other kind is touched");
  // Before the migration: try later, nothing turned off.
  net.rpc.slot_reminder_pref_set = () => Response.json({ code: "PGRST202", message: "no function" }, { status: 404 });
  r = await postOff(new Request(`http://localhost/email/off?t=${t}`, { method: "POST", body: `t=${t}`, headers: { "x-forwarded-for": "10.9.8.3" } }));
  assert.equal(r.status, 503);
});

test("dispatch: a slot reminder goes through the same sender, with its own turn-off link", async () => {
  await withEnv(LOCAL, async () => {
    net.reset();
    const TURF = "cccccccc-cccc-4ccc-8ccc-000000000001";
    const now = new Date().toISOString();
    const slot = { id: id(7), kind: "slot_reminder", group: "slots", user_id: ASHA, to: "asha.standin@example.com", name: "Asha", attempt: 1, path: `/my/turf/${TURF}`,
      n: 1, last: false, more: 0, now, turfs: [{ id: TURF, name: "Kings Turf Arena", updated_at: new Date(Date.now() - 73 * 3600000).toISOString(), asks: 4 }] };
    net.rpc.email_claim = () => ({ r: "ok", jobs: [slot, { ...slot, id: id(8), turfs: [] }], skipped: 0, more: false });
    net.rpc.email_report = () => ({ r: "ok" });
    const resend = fakeResend();
    const r = await dispatch(post(), okSecret, { fetch: resend.f, ...noSleep });
    assert.deepEqual(await r.json(), { ok: true, sent: 1, retry: 0, failed: 0, skipped: 0 });
    assert.equal(resend.sent.length, 1);
    const b = resend.sent[0].body;
    assert.deepEqual(b.to, ["asha.standin@example.com"]);
    assert.equal(b.subject, "Update your free slots: Kings Turf Arena");
    assert.deepEqual(b.tags, [{ name: "kind", value: "slot_reminder" }]);
    assert.ok(String(b.html).includes(`https://www.tapturf.in/my/turf/${TURF}`));
    assert.ok((b.headers as Record<string, string>)["List-Unsubscribe"].includes(offToken(offKey("test-account-key"), ASHA, "slots")));
    assert.deepEqual(net.calls("email_report")[0].args.p_results, [{ id: id(7), result: "sent", provider_id: "re_1" }, { id: id(8), result: "failed", error: "not well formed" }]);
  });
  const TURF = "cccccccc-cccc-4ccc-8ccc-000000000001";
  const ok = { id: id(7), kind: "slot_reminder", user_id: ASHA, to: "asha.standin@example.com", path: "/my", turfs: [{ id: TURF, name: "Kings Turf Arena", updated_at: null, asks: 0 }] };
  assert.ok(jobOf(ok), "never marked: no time");
  assert.equal(jobOf({ ...ok, turfs: [{ ...ok.turfs[0], id: "x" }] }), null);
  assert.equal(jobOf({ ...ok, turfs: [{ ...ok.turfs[0], updated_at: "soon" }] }), null);
  assert.equal(jobOf({ ...ok, turfs: [{ ...ok.turfs[0], asks: -1 }] }), null);
  assert.equal(jobOf({ ...ok, turfs: Array(6).fill(ok.turfs[0]) }), null, "5 turfs at most");
});
