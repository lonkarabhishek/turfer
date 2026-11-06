import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteBookingRequest, getBookingRequests, postBookingRequest } from "./server";
import { PHONE, dbProfile, googleSession, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

const TURF = "CCCCCCCC-0000-4000-8000-000000000001";
const REQ = "EEEEEEEE-0000-4000-8000-000000000001";
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
/** Tomorrow's India date at hh:mm, a slot key. */
const tomorrow = (hhmm: string) => `${new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10)}T${hhmm}`;
const AT = tomorrow("19:00");
const BODY = { turf_id: TURF, at: AT, hours: 2, note: "5-a-side" };
const missing = () => Response.json({ code: "PGRST202", message: "Could not find the function" }, { status: 404 });
const MINE = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  turf_id: TURF.toLowerCase(),
  turf_name: "One Arena",
  turf_slug: "one-arena",
  at: AT,
  hours: 2,
  when: "Sat 7 Nov, 7 PM to 9 PM",
  note: "5-a-side",
  status: "waiting",
  changed_by: null,
  reason: null,
  created_at: "2026-11-06T06:00:00+00:00",
  changed_at: null,
  can_cancel: true,
};
const HOURS = { opening_hours: null, start_time: "06:00:00", end_time: "23:00:00", is_24x7: false, closed_days: null };
const texts: string[] = [];
/** Every answer's text is kept, to check that none carries a number. */
const read = async (res: Response) => {
  const t = await res.clone().text();
  texts.push(t);
  return json(res);
};

function signedIn(id = "acc-1", hours: unknown = HOURS) {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id });
  net.rest = (method, url) => {
    assert.equal(method, "GET");
    assert.match(url.searchParams.get("select") ?? "", /opening_hours/);
    return Response.json(hours === null ? [] : [hours]);
  };
}

const post = (body: unknown = BODY, token: string | null = phoneToken(), headers?: Record<string, string>) =>
  postBookingRequest(req("/api/booking-requests", { method: "POST", token: token ?? undefined, body, headers }));

test("no sign-in: 401; no account: 404 new; a flood from one network: 429 slow; none reach a function", async () => {
  signedIn();
  for (const r of [await post(BODY, null), await getBookingRequests(req("/api/booking-requests")), await deleteBookingRequest(req(`/api/booking-requests/${REQ}`, { method: "DELETE" }), REQ)]) {
    assert.equal(r.status, 401);
    assert.deepEqual(await read(r), { error: "sign_in" });
  }
  net.rpc.account_resolve = () => ({ r: "new", was_used: false });
  const n = await post();
  assert.deepEqual([n.status, await read(n)], [404, { error: "new" }]);
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) statuses.push((await post(BODY, null, { "x-forwarded-for": "10.200.0.1" })).status);
  assert.deepEqual([statuses.slice(0, 20).every((s) => s === 401), statuses[20]], [true, 429]);
  assert.equal(net.calls("booking_request_send").length, 0);
});

test("send: the player is the account the sign-in opens, never one the body names; the server key goes with it", async () => {
  signedIn();
  net.rpc.booking_request_send = () => ({ r: "ok", request: { ...MINE, player_phone: "+919100000001", player_name: "Priya" } });
  const res = await post();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await read(res), { r: "ok", request: MINE }, "only the player's keys: never a name or number");
  const [call] = net.calls("booking_request_send");
  assert.deepEqual(call.args, { p_key: "test-account-key", p_user_id: "acc-1", p_turf_id: TURF.toLowerCase(), p_at: AT, p_hours: 2, p_note: "5-a-side" });
  assert.equal(net.calls("account_resolve")[0].args.p_create, false, "no account is made for it");
  for (const extra of [{ user_id: "acc-2" }, { p_user_id: "acc-2" }, { player_phone: "+919000000002" }, { status: "confirmed" }]) {
    signedIn();
    const r = await post({ ...BODY, ...extra });
    assert.deepEqual([r.status, await read(r)], [400, { field: Object.keys(extra)[0], error: "bad" }]);
    assert.equal(net.calls("booking_request_send").length, 0, "refused before the database");
  }
});

test("send: a phone sign-in's number is recorded as checked before the request goes; a Google one isn't", async () => {
  signedIn("acc-phone-first");
  await post();
  const fns = net.rpcCalls.map((c) => c.fn);
  assert.ok(fns.indexOf("account_phone_checked") >= 0, "recorded");
  assert.ok(fns.indexOf("account_phone_checked") < fns.indexOf("booking_request_send"), "before the request");
  assert.deepEqual(net.calls("account_phone_checked")[0].args, { p_key: "test-account-key", p_user_id: "acc-phone-first", p_phone: PHONE });
  signedIn("acc-google");
  const g = await post(BODY, googleSession());
  assert.equal(g.status, 200);
  assert.equal(net.calls("account_phone_checked").length, 0);
  assert.equal(net.calls("booking_request_send")[0].args.p_user_id, "acc-google");
});

test("send: the hours must be the turf's own, still to come, in the days the card shows: else 400 at, with no database call", async () => {
  for (const at of [tomorrow("19:15"), tomorrow("03:00"), tomorrow("23:00"), `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T19:00`]) {
    signedIn();
    const r = await post({ ...BODY, at, hours: 1 });
    assert.deepEqual([r.status, await read(r)], [400, { field: "at", error: "bad" }], at);
    assert.equal(net.calls("booking_request_send").length, 0);
  }
  signedIn();
  const late = await post({ ...BODY, at: tomorrow("22:00"), hours: 2 });
  assert.deepEqual([late.status, await read(late)], [400, { field: "at", error: "bad" }], "a run past closing");
  signedIn("acc-1", null);
  const gone = await post();
  assert.deepEqual([gone.status, await read(gone)], [409, { reason: "off", error: "not_allowed" }], "no such turf");
  signedIn();
  net.rest = () => Response.json({ message: "boom" }, { status: 500 });
  const failed = await post();
  assert.deepEqual([failed.status, await read(failed)], [503, { error: "unavailable" }], "the turf can't be read");
  assert.equal(net.calls("booking_request_send").length, 0);
});

test("send: every refusal, as the routes send it", async () => {
  const cases: [Record<string, unknown>, number, Record<string, unknown>][] = [
    [{ r: "bad", field: "note" }, 400, { field: "note", error: "bad" }],
    [{ r: "bad", field: "Not A Field" }, 400, { error: "bad" }],
    [{ r: "bad" }, 400, { error: "bad" }],
    [{ r: "off" }, 409, { reason: "off", error: "not_allowed" }],
    [{ r: "own" }, 409, { reason: "own", error: "not_allowed" }],
    [{ r: "no_phone" }, 409, { reason: "no_phone", error: "not_allowed" }],
    [{ r: "taken", booked: [AT, "junk", 5, "2026-02-30T10:00"] }, 409, { reason: "taken", booked: [AT], error: "conflict" }],
    [{ r: "taken" }, 409, { reason: "taken", booked: [], error: "conflict" }],
    [{ r: "past" }, 409, { reason: "past", error: "conflict" }],
    [{ r: "limit", kind: "day" }, 429, { reason: "day", error: "limit" }],
    [{ r: "limit", kind: "waiting" }, 429, { reason: "waiting", error: "limit" }],
    [{ r: "limit", kind: "sends" }, 429, { reason: "sends", error: "limit" }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
    [{ r: "something new" }, 503, { error: "unavailable" }],
  ];
  for (const [answer, status, body] of cases) {
    signedIn();
    net.rpc.booking_request_send = () => answer;
    const r = await post();
    assert.deepEqual([r.status, await read(r)], [status, body], JSON.stringify(answer));
  }
  signedIn();
  net.rpc.booking_request_send = missing;
  const nr = await post();
  assert.deepEqual([nr.status, await read(nr)], [503, { reason: "not_ready", error: "unavailable" }], "before the migration");
});

test("GET: mine, the player's keys only; ready false before the migration", async () => {
  signedIn("acc-9");
  net.rpc.booking_requests_mine = () => ({ r: "ok", requests: [{ ...MINE, player_phone: "+919100000001", user_id: "acc-9" }, "junk"] });
  const res = await getBookingRequests(req("/api/booking-requests", { token: phoneToken() }));
  assert.equal(res.status, 200);
  assert.deepEqual(await read(res), { ready: true, requests: [MINE] });
  assert.deepEqual(net.calls("booking_requests_mine")[0].args, { p_key: "test-account-key", p_user_id: "acc-9" });
  signedIn();
  net.rpc.booking_requests_mine = missing;
  const nr = await getBookingRequests(req("/api/booking-requests", { token: phoneToken() }));
  assert.deepEqual([nr.status, await read(nr)], [200, { ready: false, requests: [] }]);
  signedIn();
  net.rpc.booking_requests_mine = () => ({ r: "unavailable" });
  const down = await getBookingRequests(req("/api/booking-requests", { token: phoneToken() }));
  assert.deepEqual([down.status, await read(down)], [503, { error: "unavailable" }]);
});

test("DELETE: the player's own; every answer", async () => {
  const del = (id: string) => deleteBookingRequest(req(`/api/booking-requests/${id}`, { method: "DELETE", token: phoneToken() }), id);
  signedIn();
  const bad = await del("nope");
  assert.deepEqual([bad.status, await read(bad)], [400, { error: "bad" }]);
  assert.equal(net.calls("booking_request_cancel").length, 0);
  const cases: [Record<string, unknown> | (() => Response), number, Record<string, unknown>][] = [
    [{ r: "ok", status: "cancelled", request: { ...MINE, status: "cancelled", player_phone: "+919100000001" } }, 200, { r: "ok", status: "cancelled", request: { ...MINE, status: "cancelled" } }],
    [{ r: "gone" }, 400, { reason: "gone", error: "bad" }],
    [{ r: "answered", status: "expired" }, 409, { reason: "answered", status: "expired", error: "conflict" }],
    [{ r: "answered", status: "weird" }, 409, { reason: "answered", status: null, error: "conflict" }],
    [{ r: "started" }, 409, { reason: "started", error: "not_allowed" }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
    [missing, 503, { reason: "not_ready", error: "unavailable" }],
  ];
  for (const [answer, status, body] of cases) {
    signedIn("acc-3");
    net.rpc.booking_request_cancel = typeof answer === "function" ? answer : () => answer;
    const r = await del(REQ);
    assert.deepEqual([r.status, await read(r)], [status, body], JSON.stringify(typeof answer === "function" ? "missing" : answer));
    assert.deepEqual(net.calls("booking_request_cancel")[0].args, { p_key: "test-account-key", p_user_id: "acc-3", p_request_id: REQ.toLowerCase() });
  }
});

test("no answer from any of these routes ever carried a phone number", () => {
  assert.ok(texts.length > 30);
  for (const t of texts) assert.doesNotMatch(t, /\+91|91000000|"player_phone":|"player_name":|Priya/, t);
});
