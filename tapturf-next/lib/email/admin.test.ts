import { test } from "node:test";
import assert from "node:assert/strict";
import { emailSetMode, emailStatus, emailTest, sendingOf, type AdminRpc } from "./admin";
import { countsOf, EMAIL_MODES, emailFoldLine, isEmailMode, MODE_DETAIL, MODE_LABEL, sendingNote, skipLabel, TEST_KINDS, testLineText, testProblemText, toEmailStatus } from "./mode";
import { SAMPLE_GAME_ID, sampleJobs } from "./samples";
import { renderEmail } from "./templates";
import { readOffToken, offKey } from "./token";

// Made-up people and addresses only. The admin's Emails card: the mode, the counts, "Send me one of each".

const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000aa";
const OWNER_TO = "owner.standin@example.com";
const LOCAL = { RESEND_API_KEY: "re_test", EMAIL_API_BASE: "http://127.0.0.1:9/resend", ACCOUNT_KEY: "test-account-key" };
const STATUS = {
  r: "ok",
  mode: "owner_only",
  mode_since: "2026-11-10T09:00:00+00:00",
  day: { sent: 2, queued: 1, failed: 0, expired: 0, skipped: { test_mode: 5, answered: 1 } },
  week: { sent: "12", queued: 1, failed: 1, expired: 2, skipped: { test_mode: 9, answered: 1, mode_off: 3 } },
  test_at: null,
};
let n = 0;
const uuid = () => `eeeeeeee-eeee-4eee-8eee-${String(++n).padStart(12, "0")}`;
const jsonReq = (body: unknown, type = "application/json") =>
  new Request("http://localhost:3000/api/admin/emails", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });

/** A fake database: what each owner function answers, and the calls it got. */
function fakeRpc(answers: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: AdminRpc = async (fn, args) => {
    calls.push({ fn, args });
    const a = answers[fn];
    if (a instanceof Error) throw a;
    if (a && typeof a === "object" && "__error" in a) return { data: null, error: (a as { __error: { code: string } }).__error };
    return { data: a ?? null, error: null };
  };
  return { rpc, calls };
}

/** A fake Resend that keeps what it was sent. */
function fakeResend(answer: (n: number) => Response = (i) => Response.json({ id: `re_${i}` })) {
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return answer(sent.length);
  }) as typeof fetch;
  return { sent, f };
}

/* ---------------- the mode's words and the counts ---------------- */

test("three modes, each with a label and one line", () => {
  assert.deepEqual([...EMAIL_MODES], ["off", "owner_only", "on"]);
  assert.deepEqual(EMAIL_MODES.map((m) => MODE_LABEL[m]), ["Off", "Test: only me", "On for everyone"]);
  for (const m of EMAIL_MODES) assert.ok(MODE_DETAIL[m].length > 20 && MODE_DETAIL[m].length < 100 && !MODE_DETAIL[m].includes("\n"), `${m}: one line`);
  assert.ok(isEmailMode("owner_only") && !isEmailMode("everyone") && !isEmailMode(null) && !isEmailMode("ON"));
});

test("the counts: numbers (or digit strings) only, skips by why, most first", () => {
  assert.deepEqual(countsOf(STATUS.week), {
    sent: 12, queued: 1, failed: 1, expired: 2,
    skipped: [{ why: "test_mode", n: 9 }, { why: "mode_off", n: 3 }, { why: "answered", n: 1 }], skippedTotal: 13,
  });
  assert.deepEqual(countsOf({ sent: -1, queued: "x", failed: 1.7, skipped: { a: 0, b: "nope" } }), { sent: 0, queued: 0, failed: 1, expired: 0, skipped: [], skippedTotal: 0 });
  assert.equal(countsOf(null), null);
  assert.equal(countsOf([1]), null);
});

test("admin_email_status's answer, or null", () => {
  const s = toEmailStatus(STATUS, "no_key");
  assert.equal(s?.mode, "owner_only");
  assert.equal(s?.sending, "no_key");
  assert.equal(s?.day.skippedTotal, 6);
  assert.equal(s?.testAt, null);
  assert.equal(toEmailStatus({ ...STATUS, mode: "everyone" }, "ok"), null, "a mode that isn't one");
  assert.equal(toEmailStatus({ error: "forbidden" }, "ok"), null);
  assert.equal(toEmailStatus({ ...STATUS, day: null }, "ok"), null);
  assert.equal(toEmailStatus("ok", "ok"), null);
});

test("the card's words: the fold line, the skips, the sending note, the test's answers", () => {
  assert.equal(emailFoldLine(toEmailStatus(STATUS, "ok")!), "Test: only me · 2 sent, 6 skipped, 1 queued in 24 hours");
  assert.equal(emailFoldLine({ ...toEmailStatus(STATUS, "ok")!, mode: "off", day: countsOf({ sent: 0 })! }), "Off · 0 sent in 24 hours");
  assert.equal(skipLabel("test_mode"), "Test mode, not you");
  assert.equal(skipLabel("mode_off"), "Emails were off");
  assert.equal(skipLabel("something_new"), "something new", "an unknown why, as words");
  assert.equal(sendingNote("ok"), null);
  assert.match(sendingNote("no_key") ?? "", /^RESEND_API_KEY isn't set/);
  assert.match(testProblemText("no_key"), /^RESEND_API_KEY isn't set, so no email can be sent yet\. Nothing was sent\.$/);
  assert.equal(testProblemText("wait", 61), "You sent a test less than 10 minutes ago. Try again in 2 minutes.");
  assert.equal(testProblemText("wait", 30), "You sent a test less than 10 minutes ago. Try again in 1 minute.");
  assert.match(testProblemText("no_address"), /Google/);
  assert.equal(testLineText({ result: "sent" }), "Sent");
  assert.equal(testLineText({ result: "failed", error: "422 validation_error" }), "Not sent: 422 validation_error");
});

test("sending: Resend's key on production or the local stand-in, and the account key", () => {
  assert.equal(sendingOf({}), "no_key");
  assert.equal(sendingOf({ RESEND_API_KEY: "re_x" }), "not_production");
  assert.equal(sendingOf({ RESEND_API_KEY: "re_x", VERCEL_ENV: "preview", VERCEL: "1" }), "not_production");
  assert.equal(sendingOf({ RESEND_API_KEY: "re_x", VERCEL_ENV: "production" }), "no_account_key");
  assert.equal(sendingOf({ RESEND_API_KEY: "re_x", VERCEL_ENV: "production", ACCOUNT_KEY: "k" }), "ok");
  assert.equal(sendingOf(LOCAL), "ok");
});

/* ---------------- the samples ---------------- */

test("one of each: ten emails, in order, each written, to the owner's address only, with made-up players", () => {
  const now = new Date("2026-11-10T13:10:00Z"); // 6:40 PM in India
  const s = sampleJobs({ userId: OWNER_ID, to: OWNER_TO, name: "Site Owner" }, now, uuid);
  assert.deepEqual(s.map((x) => x.key), TEST_KINDS.map((k) => k.key));
  assert.equal(new Set(s.map((x) => x.job.id)).size, 10, "each its own id (its Idempotency-Key)");
  const links = { site: "https://www.tapturf.in", off: "https://www.tapturf.in/email/off?t=T" };
  const out = s.map((x) => ({ key: x.key, e: renderEmail(x.job, links, { subjectPrefix: "[Test] " }) }));
  for (const { key, e } of out) {
    assert.ok(e, `${key}: written`);
    assert.ok(e.subject.startsWith("[Test] "), `${key}: [Test] first`);
    assert.ok(!e.html.includes("/game/"), `${key}: no link to a game that isn't there`);
  }
  for (const x of s) {
    assert.equal(x.job.to, OWNER_TO);
    assert.equal(x.job.user_id, OWNER_ID);
    assert.equal(x.job.path, "/games");
    if (x.job.game) assert.equal(x.job.game.id, SAMPLE_GAME_ID);
  }
  const subj = Object.fromEntries(out.map((o) => [o.key, o.e!.subject]));
  assert.equal(subj.welcome, "[Test] Welcome to TapTurf");
  assert.equal(subj.join_request, "[Test] Rohan Patil wants to join your Football game");
  assert.equal(subj.join_requests, "[Test] 3 players want to join your Football game");
  assert.equal(subj.request_waiting, "[Test] Imran Shaikh is still waiting to hear from you");
  assert.equal(subj.request_accepted, "[Test] You're in: Football on Wed 11 Nov, 7 PM");
  assert.equal(subj.game_changed, "[Test] Football moved to Wed 11 Nov, 7 PM at Green Valley Turf");
  assert.equal(subj.game_cancelled, "[Test] Cancelled: Football on Wed 11 Nov, 7 PM");
  assert.equal(subj.reminder_tomorrow, "[Test] Tomorrow: Football at 7 PM, Green Valley Turf");
  assert.equal(subj.reminder_soon, "[Test] In about 3 hours: Football at 10 PM, Green Valley Turf", "6:40 PM + 3 hours, on the next half hour");
  assert.equal(subj.reminder_tonight, "[Test] Tonight, after midnight: Football at 12:30 AM, Green Valley Turf");
  const joined = out.find((o) => o.key === "join_requests")!.e!.text;
  assert.match(joined, /- Rohan Patil\n- Imran Shaikh\n- Kabir Mehta/);
  assert.match(out.find((o) => o.key === "reminder_soon")!.e!.text, /You're hosting Football\./);
  assert.match(out.find((o) => o.key === "game_changed")!.e!.text, /It was Wed 11 Nov, 6 PM\./);
});

test("the samples' times cross midnight in India time", () => {
  const late = new Date("2026-11-10T17:40:00Z"); // 11:10 PM in India: about 3 hours is 2:30 AM on the 11th
  const s = sampleJobs({ userId: OWNER_ID, to: OWNER_TO, name: null }, late, uuid);
  const soon = s.find((x) => x.key === "reminder_soon")!.job.game!;
  assert.deepEqual([soon.date, soon.start_time, soon.end_time], ["2026-11-11", "02:30", "03:30"]);
  assert.equal(s.find((x) => x.key === "reminder_tomorrow")!.job.game!.date, "2026-11-11");
  assert.equal(renderEmail(s[0].job, { site: "https://www.tapturf.in", off: "x" })!.subject, "Welcome to TapTurf", "no name: still written");
});

/* ---------------- the routes ---------------- */

test("status: the counts and this deployment's sending; refusals and a database without the file", async () => {
  let r = await emailStatus(fakeRpc({ admin_email_status: STATUS }).rpc, LOCAL);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.status.mode, "owner_only");
  assert.equal(j.status.sending, "ok");
  assert.ok(!JSON.stringify(j).includes("@"), "no address");
  r = await emailStatus(fakeRpc({ admin_email_status: STATUS }).rpc, {});
  assert.equal((await r.json()).status.sending, "no_key", "no Resend key: says so");
  r = await emailStatus(fakeRpc({ admin_email_status: { error: "forbidden" } }).rpc, LOCAL);
  assert.deepEqual([r.status, await r.json()], [403, { ok: false, error: "forbidden" }]);
  r = await emailStatus(fakeRpc({ admin_email_status: { __error: { code: "PGRST202" } } }).rpc, LOCAL);
  assert.deepEqual([r.status, await r.json()], [503, { ok: false, error: "not_set_up" }]);
  r = await emailStatus(fakeRpc({ admin_email_status: new Error("down") }).rpc, LOCAL);
  assert.deepEqual([r.status, await r.json()], [503, { ok: false, error: "unavailable" }]);
  r = await emailStatus(fakeRpc({ admin_email_status: { r: "ok", mode: "loud" } }).rpc, LOCAL);
  assert.equal(r.status, 502);
});

test("set the mode: one of three, as JSON only", async () => {
  const db = fakeRpc({ admin_email_set_mode: { ...STATUS, mode: "on" } });
  let r = await emailSetMode(db.rpc, jsonReq({ mode: "on" }), LOCAL);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status.mode, "on");
  assert.deepEqual(db.calls, [{ fn: "admin_email_set_mode", args: { p_mode: "on" } }]);
  for (const bad of [{ mode: "everyone" }, { mode: "on", extra: 1 }, {}, "not json", ["on"]]) {
    const d = fakeRpc({});
    r = await emailSetMode(d.rpc, jsonReq(bad), LOCAL);
    assert.equal(r.status, 400, `refused: ${JSON.stringify(bad)}`);
    assert.equal(d.calls.length, 0, "and the database is not asked");
  }
  const d = fakeRpc({});
  r = await emailSetMode(d.rpc, jsonReq("mode=on", "application/x-www-form-urlencoded"), LOCAL);
  assert.deepEqual([r.status, d.calls.length], [400, 0], "a form post is refused");
  r = await emailSetMode(fakeRpc({ admin_email_set_mode: { error: "forbidden" } }).rpc, jsonReq({ mode: "off" }), LOCAL);
  assert.equal(r.status, 403);
});

test("one of each: says plainly when it can't send, before asking the database", async () => {
  for (const [env, reason] of [[{}, "no_key"], [{ RESEND_API_KEY: "re_x", VERCEL: "1", VERCEL_ENV: "preview" }, "not_production"], [{ ...LOCAL, ACCOUNT_KEY: undefined }, "no_account_key"]] as const) {
    const db = fakeRpc({ admin_email_test: { r: "ok", to: OWNER_TO, user_id: OWNER_ID, name: "Site" } });
    const { sent, f } = fakeResend();
    const r = await emailTest(db.rpc, jsonReq({ send: true }), { env, fetch: f, sleep: async () => {} });
    assert.deepEqual([r.status, await r.json()], [503, { ok: false, reason }], reason);
    assert.equal(db.calls.length + sent.length, 0, `${reason}: the 10 minutes are not used up, nothing sent`);
  }
  for (const [answer, status, body] of [
    [{ r: "wait", seconds: 412 }, 429, { ok: false, reason: "wait", seconds: 412 }],
    [{ r: "no_address" }, 409, { ok: false, reason: "no_address" }],
    [{ error: "forbidden" }, 403, { ok: false, reason: "forbidden" }],
    [{ __error: { code: "42883" } }, 503, { ok: false, reason: "not_set_up" }],
    [{ r: "ok" }, 502, { ok: false, reason: "unavailable" }],
  ] as const) {
    const { sent, f } = fakeResend();
    const r = await emailTest(fakeRpc({ admin_email_test: answer }).rpc, jsonReq({ send: true }), { env: LOCAL, fetch: f, sleep: async () => {} });
    assert.deepEqual([r.status, await r.json()], [status, body]);
    assert.equal(sent.length, 0);
  }
  const { sent, f } = fakeResend();
  const r = await emailTest(fakeRpc({ admin_email_test: { r: "ok", to: OWNER_TO, user_id: OWNER_ID } }).rpc, jsonReq({ send: false }), { env: LOCAL, fetch: f });
  assert.deepEqual([r.status, sent.length], [400, 0], "only { send: true }");
});

test("one of each: ten sends through the same send as every email, [Test] first, to the owner only, the result per kind", async () => {
  const db = fakeRpc({ admin_email_test: { r: "ok", to: OWNER_TO, user_id: OWNER_ID, name: "Site" } });
  const { sent, f } = fakeResend((i) => (i === 4 ? Response.json({ name: "validation_error" }, { status: 422 }) : Response.json({ id: `re_${i}` })));
  const waits: number[] = [];
  let t = 1_000_000;
  const r = await emailTest(db.rpc, jsonReq({ send: true }), { env: LOCAL, fetch: f, sleep: async (ms) => { waits.push(ms); t += ms; }, now: () => t, uuid });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.deepEqual(j.results.map((x: { key: string }) => x.key), TEST_KINDS.map((k) => k.key));
  assert.deepEqual(j.results.map((x: { result: string }) => x.result), ["sent", "sent", "sent", "failed", "sent", "sent", "sent", "sent", "sent", "sent"], "each kind's own result");
  assert.equal(j.results[3].error, "422 validation_error");
  assert.ok(!JSON.stringify(j).includes("@"), "the answer never holds the address");
  assert.equal(sent.length, 10);
  assert.equal(waits.length, 9, "2 a second at most");
  for (const s of sent) {
    assert.equal(s.url, "http://127.0.0.1:9/resend/emails");
    assert.deepEqual(s.body.to, [OWNER_TO], "to the owner only");
    assert.equal(s.body.from, "TapTurf <hello@tapturf.in>");
    assert.equal(s.body.reply_to, "info@tapturf.in");
    assert.ok(!("cc" in s.body) && !("bcc" in s.body));
    assert.match(String(s.body.subject), /^\[Test\] /);
    const h = s.body.headers as Record<string, string>;
    assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    const token = /^<https:\/\/www\.tapturf\.in\/email\/off\?t=([^>]+)>, <mailto:info@tapturf\.in\?subject=Unsubscribe%20/.exec(h["List-Unsubscribe"])?.[1];
    assert.equal(readOffToken(offKey("test-account-key"), token ?? null)?.userId, OWNER_ID, "a real turn-off link, for the owner's own account");
    assert.match(s.headers.get("idempotency-key") ?? "", /^eeeeeeee-/);
    assert.equal(s.headers.get("authorization"), "Bearer re_test");
  }
  assert.equal(new Set(sent.map((s) => s.headers.get("idempotency-key"))).size, 10, "each its own Idempotency-Key");
  assert.deepEqual(db.calls, [{ fn: "admin_email_test", args: {} }], "the database asked once");
});

test("one of each: out of time, the rest are said not tried", async () => {
  const { sent, f } = fakeResend();
  let t = 0;
  const r = await emailTest(fakeRpc({ admin_email_test: { r: "ok", to: OWNER_TO, user_id: OWNER_ID } }).rpc, jsonReq({ send: true }), {
    env: LOCAL, fetch: (async (...a: Parameters<typeof fetch>) => { t += 15_000; return f(...a); }) as typeof fetch, sleep: async () => {}, now: () => t, uuid,
  });
  const j = await r.json();
  assert.equal(sent.length, 3);
  assert.deepEqual(j.results.slice(3).map((x: { result: string; error?: string }) => [x.result, x.error]), Array(7).fill(["retry", "not tried, out of time"]));
});
