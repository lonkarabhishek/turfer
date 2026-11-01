import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cancelGame,
  deleteRequest,
  getGameRequests,
  getNotifications,
  getRequests,
  patchGame,
  patchRequest,
  postGame,
  postGameRequest,
  postNotifications,
  getSeries,
  postSeries,
  stopSeries,
} from "./server";
import { dbProfile, googleSession, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

const GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const REQ = "eeeeeeee-eeee-4eee-8eee-000000000001";
const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const TURF2 = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const day = (d: number) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const BODY = { turf_id: TURF, sport: "Football", skill_level: "all", max_players: 10, date: day(1), start_time: "19:00", end_time: "20:00", price_per_player: 150, host_phone: "" };
/** PostgREST's answer for a function the database doesn't have yet. */
const missing = () => Response.json({ code: "PGRST202", message: "Could not find the function" }, { status: 404 });

function signedIn(id = "acc-1") {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id });
}

type Row = Record<string, unknown>;

/** A tiny PostgREST for the fallback: eq, neq, in, gt filters (on a column or column->>key); HEAD counts; POST and PATCH. */
function restDb(tables: Record<string, Row[]>) {
  return (method: string, url: URL, body: unknown): Response => {
    const table = url.pathname.split("/").pop() as string;
    const rows = (tables[table] ??= []);
    const filters = [...url.searchParams].filter(([k]) => !["select", "limit", "order", "on_conflict", "offset", "columns"].includes(k));
    const at = (r: Row, k: string) => {
      const [col, key] = k.split("->>");
      return key === undefined ? r[col] : (r[col] as Row | null | undefined)?.[key];
    };
    const match = (r: Row) =>
      filters.every(([k, v]) => {
        const [op, ...rest] = v.split(".");
        const val = rest.join(".");
        if (op === "eq") return String(at(r, k)) === val;
        if (op === "neq") return String(at(r, k)) !== val;
        if (op === "in") return val.replace(/[()"]/g, "").split(",").includes(String(at(r, k)));
        if (op === "gt") return String(at(r, k)) > val;
        throw new Error(`filter ${op}`);
      });
    if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${rows.filter(match).length}` } });
    if (method === "GET") return Response.json(rows.filter(match));
    if (method === "POST") {
      const made = (Array.isArray(body) ? body : [body]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...(r as Row) }));
      rows.push(...made);
      return Response.json(made, { status: 201 });
    }
    if (method === "PATCH") {
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, body);
      return Response.json(hit);
    }
    throw new Error(`method ${method}`);
  };
}

/* ---------------- who ---------------- */

test("create: the host is the verified sign-in, never the body", async () => {
  signedIn();
  net.rpc.game_create = () => ({ r: "ok", game: { id: GAME, creator_id: "acc-1" } });
  const res = await postGame(req("/api/games", { method: "POST", token: phoneToken(), body: BODY }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await json(res), { r: "ok", game: { id: GAME, creator_id: "acc-1" } });
  const [call] = net.calls("game_create");
  assert.equal(call.args.p_key, "test-account-key", "with the server key");
  assert.equal(call.args.p_user_id, "acc-1", "the resolved account");
  assert.deepEqual(call.args.p_game, BODY);
  assert.equal(net.calls("account_resolve")[0].args.p_create, false, "no account is made for it");
});

test("create: naming the host, the status or the count is refused before the database", async () => {
  signedIn();
  for (const extra of [{ creator_id: "acc-2" }, { user_id: "acc-2" }, { status: "full" }, { current_players: 9 }, { host_name: "Someone" }]) {
    const res = await postGame(req("/api/games", { method: "POST", token: phoneToken(), body: { ...BODY, ...extra } }));
    assert.equal(res.status, 400, JSON.stringify(extra));
    assert.deepEqual(await json(res), { field: Object.keys(extra)[0], error: "bad" });
  }
  assert.equal(net.calls("game_create").length, 0);
});

test("no sign-in, or an account that isn't there, never reaches a function", async () => {
  signedIn();
  const calls: [string, (r: Request) => Promise<Response>, Request][] = [
    ["create", postGame, req("/api/games", { method: "POST", body: BODY })],
    ["edit", (r) => patchGame(r, GAME), req(`/api/games/${GAME}`, { method: "PATCH", body: { price_per_player: 0 } })],
    ["ask", (r) => postGameRequest(r, GAME), req(`/api/games/${GAME}/requests`, { method: "POST", body: { note: null } })],
    ["answer", (r) => patchRequest(r, REQ), req(`/api/game-requests/${REQ}`, { method: "PATCH", body: { action: "accept" } })],
    ["read", getNotifications, req("/api/notifications")],
  ];
  for (const [what, handler, r] of calls) assert.equal((await handler(r)).status, 401, what);
  net.rpc.account_resolve = () => ({ r: "new" });
  assert.equal((await postGame(req("/api/games", { method: "POST", token: phoneToken(), body: BODY }))).status, 404);
  assert.equal(net.rpcCalls.filter((c) => c.fn !== "account_resolve").length, 0);
});

test("a Google sign-in works the same", async () => {
  signedIn("acc-g");
  net.rpc.game_request_send = () => ({ r: "ok", request: { id: REQ, status: "pending", created_at: "2026-10-30T10:00:00Z" } });
  const res = await postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: googleSession(), body: { note: "  I keep goal  ", user_id: "acc-x" } }), GAME);
  assert.equal(res.status, 200);
  assert.deepEqual(net.calls("game_request_send")[0].args, { p_key: "test-account-key", p_user_id: "acc-g", p_game_id: GAME, p_note: "I keep goal" });
});

/* ---------------- edit and move ---------------- */

test("edit: the sheet's fields go on as they are; not a move, no notice", async () => {
  signedIn();
  net.rpc.game_update = () => ({ r: "ok", game: { id: GAME }, notified: 0 });
  const res = await patchGame(req(`/api/games/${GAME.toUpperCase()}`, { method: "PATCH", token: phoneToken(), body: { price_per_player: 120, turf_booked: false } }), GAME.toUpperCase());
  assert.deepEqual(await json(res), { r: "ok", game: { id: GAME }, notified: 0 });
  assert.deepEqual(net.calls("game_update")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_game_id: GAME, p_changes: { price_per_player: 120, turf_booked: false }, p_move_notice: null });
  assert.equal(net.restCalls.length, 0, "no reads for an edit that isn't a move");
});

test("move: the notice is worded from the public rows, the day the save sets; the database picks who hears it", async () => {
  signedIn();
  net.rest = restDb({
    games: [{ id: GAME, host_name: "Asha Rao", sport: "football", date: "2026-11-07", turf_id: TURF }],
    turfs: [{ id: TURF2, name: "Dribble Den - by Playo", area: "Begur", city: "bangalore", address: null }],
  });
  net.rpc.game_update = () => ({ r: "ok", game: { id: GAME, turf_id: TURF2 }, notified: 3 });
  const res = await patchGame(req(`/api/games/${GAME}`, { method: "PATCH", token: phoneToken(), body: { turf_id: TURF2, date: "2026-11-08" } }), GAME);
  assert.equal((await json(res)).notified, 3);
  const args = net.calls("game_update")[0].args;
  assert.deepEqual(args.p_changes, { turf_id: TURF2, date: "2026-11-08" });
  assert.deepEqual(args.p_move_notice, { title: "Venue changed", message: "Asha moved Football on Sun 8 Nov to Dribble Den, Begur" });
  assert.ok(net.restCalls.every((c) => c.method === "GET"), "reads only");
});

test("move: rows that can't be read leave the wording to the database", async () => {
  signedIn();
  net.rest = () => Response.json({ message: "down" }, { status: 500 });
  net.rpc.game_update = () => ({ r: "ok", game: { id: GAME }, notified: 1 });
  await patchGame(req(`/api/games/${GAME}`, { method: "PATCH", token: phoneToken(), body: { turf_id: TURF2 } }), GAME);
  assert.equal(net.calls("game_update")[0].args.p_move_notice, null);
});

test("edit: the database's refusals, as the page reads them", async () => {
  const cases: [Record<string, unknown>, number, Record<string, unknown>][] = [
    [{ r: "not_host" }, 409, { reason: "not_host", error: "not_allowed" }],
    [{ r: "closed" }, 409, { reason: "closed", error: "not_allowed" }],
    [{ r: "gone" }, 400, { reason: "gone", error: "bad" }],
    [{ r: "venue" }, 400, { reason: "venue", error: "bad" }],
    [{ r: "too_few", players: 6 }, 400, { reason: "too_few", players: 6, error: "bad" }],
    [{ r: "bad", field: "date" }, 400, { field: "date", error: "bad" }],
    [{ r: "bad", field: "<script>" }, 400, { error: "bad" }],
    [{ r: "limit" }, 429, { error: "limit" }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
    [{ r: "something new" }, 503, { error: "unavailable" }],
  ];
  for (const [answer, status, body] of cases) {
    signedIn();
    net.rpc.game_update = () => answer;
    const res = await patchGame(req(`/api/games/${GAME}`, { method: "PATCH", token: phoneToken(), body: { max_players: 4 } }), GAME);
    assert.equal(res.status, status, JSON.stringify(answer));
    assert.deepEqual(await json(res), body, JSON.stringify(answer));
  }
});

test("cancel: the host only, by the database's check", async () => {
  signedIn();
  net.rpc.game_cancel = () => ({ r: "not_host" });
  assert.equal((await cancelGame(req(`/api/games/${GAME}/cancel`, { method: "POST", token: phoneToken() }), GAME)).status, 409);
  assert.deepEqual(net.calls("game_cancel")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_game_id: GAME });
  assert.equal((await cancelGame(req(`/api/games/x/cancel`, { method: "POST", token: phoneToken() }), "x")).status, 400);
});

/* ---------------- requests ---------------- */

test("requests on a game: the host gets the list without any number; anyone else only their own", async () => {
  signedIn();
  net.rpc.game_requests_for = () => ({
    r: "ok",
    host: true,
    requests: [{ id: REQ, game_id: GAME, user_id: "acc-2", note: "Keeper", status: "pending", requester_name: "Ravi", requester_phone: "+919000000002", created_at: "2026-10-30T10:00:00Z" }],
  });
  const host = await json(await getGameRequests(req(`/api/games/${GAME}/requests`, { token: phoneToken() }), GAME));
  assert.deepEqual(host, { host: true, requests: [{ id: REQ, game_id: GAME, user_id: "acc-2", note: "Keeper", status: "pending", requester_name: "Ravi", created_at: "2026-10-30T10:00:00Z" }] });
  net.rpc.game_requests_for = () => ({ r: "ok", host: false, mine: { id: REQ, status: "declined", note: "x" } });
  assert.deepEqual(await json(await getGameRequests(req(`/api/games/${GAME}/requests`, { token: phoneToken() }), GAME)), { host: false, mine: { id: REQ, status: "declined" } });
  net.rpc.game_requests_for = () => ({ r: "ok", host: false, mine: null });
  assert.deepEqual(await json(await getGameRequests(req(`/api/games/${GAME}/requests`, { token: phoneToken() }), GAME)), { host: false, mine: null });
});

test("ask: a long note is refused here; the database's no's come back as reasons", async () => {
  signedIn();
  assert.equal((await postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: phoneToken(), body: { note: "x".repeat(301) } }), GAME)).status, 400);
  assert.equal(net.calls("game_request_send").length, 0);
  for (const [r, status, error] of [["own", 409, "not_allowed"], ["full", 409, "not_allowed"], ["pending", 409, "conflict"], ["joined", 409, "conflict"], ["limit", 429, "limit"]] as const) {
    net.rpc.game_request_send = () => ({ r });
    const res = await postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: phoneToken(), body: {} }), GAME);
    assert.equal(res.status, status, r);
    assert.equal((await json(res)).error, error, r);
  }
});

test("answer and withdraw: the action is a yes or no; the database checks it's the host's, or the requester's own", async () => {
  signedIn();
  net.rpc.game_request_answer = (a) => ({ r: "ok", status: a.p_accept ? "accepted" : "declined", current_players: 4 });
  assert.deepEqual(await json(await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "accept" } }), REQ)), { r: "ok", status: "accepted", current_players: 4 });
  await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "decline" } }), REQ);
  assert.deepEqual(net.calls("game_request_answer").map((c) => c.args.p_accept), [true, false]);
  assert.equal(net.calls("game_request_answer")[0].args.p_user_id, "acc-1");
  assert.equal((await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "maybe" } }), REQ)).status, 400);
  net.rpc.game_request_answer = () => ({ r: "answered", status: "accepted" });
  const again = await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "accept" } }), REQ);
  assert.deepEqual([again.status, await json(again)], [409, { reason: "answered", status: "accepted", error: "conflict" }]);
  net.rpc.game_request_withdraw = () => ({ r: "ok" });
  assert.equal((await deleteRequest(req(`/api/game-requests/${REQ}`, { method: "DELETE", token: phoneToken() }), REQ)).status, 200);
  assert.deepEqual(net.calls("game_request_withdraw")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_request_id: REQ });
});

test("my requests and the incoming ones: one of the two, never a number", async () => {
  signedIn();
  net.rpc.game_requests_mine = () => ({ r: "ok", requests: [{ id: REQ, status: "pending", requester_phone: "+919000000001" }] });
  assert.deepEqual(await json(await getRequests(req("/api/game-requests?mine=1", { token: phoneToken() }))), { requests: [{ id: REQ, status: "pending" }] });
  net.rpc.game_requests_incoming = () => ({ r: "ok", requests: [] });
  assert.deepEqual(await json(await getRequests(req("/api/game-requests?incoming=1", { token: phoneToken() }))), { requests: [] });
  assert.equal((await getRequests(req("/api/game-requests", { token: phoneToken() }))).status, 400);
});

/* ---------------- notifications ---------------- */

test("notifications: the caller's own list and count, and marking read", async () => {
  signedIn();
  net.rpc.notifications_mine = () => ({ r: "ok", notifications: [{ id: REQ, title: "Request Accepted!" }], unread: 1 });
  assert.deepEqual(await json(await getNotifications(req("/api/notifications?limit=500", { token: phoneToken() }))), { notifications: [{ id: REQ, title: "Request Accepted!" }], unread: 1 });
  assert.deepEqual(net.calls("notifications_mine")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_limit: 100 });
  net.rpc.notifications_unread = () => ({ r: "ok", unread: 3 });
  assert.deepEqual(await json(await getNotifications(req("/api/notifications?count=unread", { token: phoneToken() }))), { unread: 3 });
  net.rpc.notifications_read = () => ({ r: "ok", marked: 1 });
  await postNotifications(req("/api/notifications", { method: "POST", token: phoneToken(), body: { read: REQ.toUpperCase() } }));
  await postNotifications(req("/api/notifications", { method: "POST", token: phoneToken(), body: { read: "all", user_id: "acc-2" } }));
  assert.deepEqual(net.calls("notifications_read").map((c) => [c.args.p_user_id, c.args.p_id]), [["acc-1", REQ], ["acc-1", null]]);
  assert.equal((await postNotifications(req("/api/notifications", { method: "POST", token: phoneToken(), body: { read: "some" } }))).status, 400);
  net.rpc.notifications_read = () => ({ r: "gone" });
  assert.equal((await postNotifications(req("/api/notifications", { method: "POST", token: phoneToken(), body: { read: REQ } }))).status, 400);
});

/* ---------------- repeats ---------------- */

const SERIES = "ffffffff-ffff-4fff-8fff-000000000001";
const dowOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const REPEAT = { rule: { freq: "weekly", interval: 1, days: [(dowOf(day(1)) + 2) % 7, dowOf(day(1))] }, ends: { type: "never" } };

test("repeat: the host is the verified sign-in; the game and the repeat go on as checked, the days in order", async () => {
  signedIn();
  net.rpc.game_series_create = () => ({ r: "ok", series: { id: SERIES }, games: [{ id: GAME }], made: 1 });
  const res = await postSeries(req("/api/game-series", { method: "POST", token: phoneToken(), body: { game: BODY, repeat: REPEAT } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await json(res), { r: "ok", series: { id: SERIES }, games: [{ id: GAME }], made: 1 });
  const [call] = net.calls("game_series_create");
  assert.deepEqual(call.args, {
    p_key: "test-account-key",
    p_user_id: "acc-1",
    p_game: BODY,
    p_repeat: { rule: { ...REPEAT.rule, days: [...REPEAT.rule.days].sort((a, b) => a - b) }, ends: REPEAT.ends },
  });
});

test("repeat: a bad game or repeat, or naming the host, is refused before the database", async () => {
  signedIn();
  const bad: [Record<string, unknown>, string][] = [
    [{ game: { ...BODY, creator_id: "acc-2" }, repeat: REPEAT }, "creator_id"],
    [{ game: BODY, repeat: { ...REPEAT, host_id: "acc-2" } }, "repeat"],
    [{ game: BODY, repeat: { ...REPEAT, rule: { freq: "weekly", interval: 9, days: [1] } } }, "interval"],
    [{ game: BODY, repeat: { ...REPEAT, ends: { type: "after", count: 1 } } }, "ends"],
    [{ game: BODY, repeat: REPEAT, user_id: "acc-2" }, "body"],
    [{ game: "football", repeat: REPEAT }, "body"],
    [{ game: BODY }, "repeat"],
  ];
  for (const [body, field] of bad) {
    const res = await postSeries(req("/api/game-series", { method: "POST", token: phoneToken(), body }));
    assert.deepEqual([res.status, await json(res)], [400, { field, error: "bad" }], JSON.stringify(body));
  }
  assert.equal(net.calls("game_series_create").length, 0);
  assert.equal((await postSeries(req("/api/game-series", { method: "POST", body: { game: BODY, repeat: REPEAT } }))).status, 401, "no sign-in");
});

test("repeat: the database's no's, and a database without repeats yet", async () => {
  for (const [answer, status, body] of [
    [{ r: "many" }, 409, { reason: "many", error: "not_allowed" }],
    [{ r: "limit" }, 429, { error: "limit" }],
    [{ r: "venue" }, 400, { reason: "venue", error: "bad" }],
    [{ r: "bad", field: "start_time" }, 400, { field: "start_time", error: "bad" }],
  ] as const) {
    signedIn();
    net.rpc.game_series_create = () => answer;
    const res = await postSeries(req("/api/game-series", { method: "POST", token: phoneToken(), body: { game: BODY, repeat: REPEAT } }));
    assert.deepEqual([res.status, await json(res)], [status, body], JSON.stringify(answer));
  }
  signedIn();
  net.rest = () => {
    throw new Error("no fallback for repeats");
  };
  net.rpc.game_series_create = missing;
  net.rpc.game_series_mine = missing;
  net.rpc.game_series_stop = missing;
  const made = await postSeries(req("/api/game-series", { method: "POST", token: phoneToken(), body: { game: BODY, repeat: REPEAT } }));
  assert.deepEqual([made.status, await json(made)], [503, { reason: "not_ready", error: "unavailable" }], "not made any other way");
  const listed = await getSeries(req("/api/game-series", { token: phoneToken() }));
  assert.deepEqual([listed.status, await json(listed)], [200, { ready: false, series: [] }], "the create flow then offers no repeat");
  assert.equal((await stopSeries(req(`/api/game-series/${SERIES}/stop`, { method: "POST", token: phoneToken(), body: { cancel: false } }), SERIES)).status, 503);
  assert.equal(net.restCalls.length, 0);
});

test("repeat: the host's list, and stopping one (cancel is a yes or no; the database checks it's the host's)", async () => {
  signedIn("acc-g");
  net.rpc.game_series_mine = () => ({ r: "ok", series: [{ id: SERIES, upcoming: 6 }] });
  assert.deepEqual(await json(await getSeries(req("/api/game-series", { token: googleSession() }))), { ready: true, series: [{ id: SERIES, upcoming: 6 }] });
  assert.deepEqual(net.calls("game_series_mine")[0].args, { p_key: "test-account-key", p_user_id: "acc-g" });
  net.rpc.game_series_stop = (a) => ({ r: "ok", series: { id: SERIES, active: false }, cancelled: a.p_cancel ? 5 : 0 });
  const stopped = await stopSeries(req(`/api/game-series/${SERIES.toUpperCase()}/stop`, { method: "POST", token: googleSession(), body: { cancel: true } }), SERIES.toUpperCase());
  assert.deepEqual(await json(stopped), { r: "ok", series: { id: SERIES, active: false }, cancelled: 5 });
  assert.deepEqual(net.calls("game_series_stop")[0].args, { p_key: "test-account-key", p_user_id: "acc-g", p_series_id: SERIES, p_cancel: true });
  for (const body of [{}, { cancel: "yes" }, { cancel: true, user_id: "acc-x" }]) {
    assert.equal((await stopSeries(req(`/api/game-series/${SERIES}/stop`, { method: "POST", token: googleSession(), body }), SERIES)).status, 400, JSON.stringify(body));
  }
  assert.equal((await stopSeries(req("/api/game-series/x/stop", { method: "POST", token: googleSession(), body: { cancel: false } }), "x")).status, 400);
  net.rpc.game_series_stop = () => ({ r: "not_host" });
  const notHost = await stopSeries(req(`/api/game-series/${SERIES}/stop`, { method: "POST", token: googleSession(), body: { cancel: false } }), SERIES);
  assert.deepEqual([notHost.status, (await json(notHost)).reason], [409, "not_host"]);
  assert.equal(net.calls("game_series_stop").length, 2, "the bad ones never reached the database");
});

/* ---------------- before the database has the functions ---------------- */

test("fallback: no function yet (PGRST202): the same rule, checked on the server, written for the verified account", async () => {
  signedIn("acc-2");
  const tables: Record<string, Row[]> = {
    users: [{ id: "acc-2", name: "Ravi Kumar", profile_image_url: null }],
    games: [{ id: GAME, creator_id: "acc-1", status: "open", sport: "Football", date: day(1), start_time: "19:00:00", end_time: "20:00:00", max_players: 10 }],
    game_participants: [{ id: "p1", game_id: GAME, user_id: "acc-1" }],
    game_requests: [],
    notifications: [],
  };
  net.rest = restDb(tables);
  net.rpc.game_request_send = missing;
  const res = await postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: phoneToken(), body: { note: "Keeper" } }), GAME);
  assert.equal(res.status, 200);
  assert.equal(tables.game_requests.length, 1);
  assert.deepEqual(
    { user: tables.game_requests[0].user_id, game: tables.game_requests[0].game_id, status: tables.game_requests[0].status, name: tables.game_requests[0].requester_name },
    { user: "acc-2", game: GAME, status: "pending", name: "Ravi Kumar" },
    "the verified account's request, its name from the account",
  );
  assert.deepEqual(tables.notifications.map((n) => [n.user_id, n.type, n.message]), [["acc-1", "game_request", "Ravi Kumar wants to join your Football"]], "the host is told");
  // Asking again while it waits: refused, nothing written.
  const before = net.restCalls.filter((c) => c.method !== "GET" && c.method !== "HEAD").length;
  const again = await postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: phoneToken(), body: {} }), GAME);
  assert.deepEqual([again.status, (await json(again)).reason], [409, "pending"]);
  assert.equal(net.restCalls.filter((c) => c.method !== "GET" && c.method !== "HEAD").length, before);
});

test("fallback: the daily limit counts sends, so asking again after a withdraw or a decline reaches it", async () => {
  const tables: Record<string, Row[]> = {
    users: [{ id: "acc-2", name: "Ravi Kumar", profile_image_url: null }],
    games: [{ id: GAME, creator_id: "acc-1", status: "open", sport: "Football", date: day(1), start_time: "19:00:00", end_time: "20:00:00", max_players: 10 }],
    game_participants: [{ id: "p1", game_id: GAME, user_id: "acc-1" }],
    game_requests: [],
    notifications: [],
  };
  const as = (id: string) => {
    signedIn(id);
    net.rest = restDb(tables);
    net.rpc.game_request_send = missing;
    net.rpc.game_request_withdraw = missing;
    net.rpc.game_request_answer = missing;
  };
  const ask = () => postGameRequest(req(`/api/games/${GAME}/requests`, { method: "POST", token: phoneToken(), body: {} }), GAME);
  for (let i = 0; i < 30; i++) {
    as("acc-2");
    assert.equal((await ask()).status, 200, `send ${i + 1}`);
    const id = String(tables.game_requests[0].id);
    if (i % 2) {
      as("acc-1");
      assert.equal((await patchRequest(req(`/api/game-requests/${id}`, { method: "PATCH", token: phoneToken(), body: { action: "decline" } }), id)).status, 200);
    } else {
      assert.equal((await deleteRequest(req(`/api/game-requests/${id}`, { method: "DELETE", token: phoneToken() }), id)).status, 200);
    }
  }
  as("acc-2");
  const over = await ask();
  assert.deepEqual([over.status, (await json(over)).error], [429, "limit"], "the 31st send of the day is refused");
  assert.equal(tables.game_requests.length, 1, "though there was only ever one row");
  assert.equal(tables.notifications.filter((n) => n.type === "game_request").length, 30, "the host was told 30 times, no more");
});

test("fallback: a player cannot edit or answer for the host; the host can, and a move tells the players", async () => {
  signedIn("acc-2");
  const tables: Record<string, Row[]> = {
    games: [{ id: GAME, creator_id: "acc-1", status: "open", sport: "Football", date: day(1), start_time: "19:00:00", end_time: "20:00:00", max_players: 10, current_players: 2, turf_id: TURF, host_name: "Asha" }],
    turfs: [{ id: TURF2, name: "Dribble Den", area: "Begur", city: "bangalore", address: null, is_active: true }],
    game_participants: [{ id: "p1", game_id: GAME, user_id: "acc-1" }, { id: "p2", game_id: GAME, user_id: "acc-2" }],
    game_requests: [{ id: REQ, game_id: GAME, user_id: "acc-3", status: "pending" }],
    notifications: [],
  };
  net.rest = restDb(tables);
  net.rpc.game_update = missing;
  net.rpc.game_request_answer = missing;
  const edit = await patchGame(req(`/api/games/${GAME}`, { method: "PATCH", token: phoneToken(), body: { price_per_player: 0 } }), GAME);
  assert.deepEqual([edit.status, (await json(edit)).reason], [409, "not_host"]);
  const ans = await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "accept" } }), REQ);
  assert.deepEqual([ans.status, (await json(ans)).reason], [409, "not_host"]);
  assert.equal(net.restCalls.filter((c) => c.method === "POST" || c.method === "PATCH").length, 0, "nothing written for a player");

  signedIn("acc-1");
  net.rest = restDb(tables);
  net.rpc.game_update = missing;
  net.rpc.game_request_answer = missing;
  const moved = await patchGame(req(`/api/games/${GAME}`, { method: "PATCH", token: phoneToken(), body: { turf_id: TURF2 } }), GAME);
  assert.equal(moved.status, 200);
  assert.equal(tables.games[0].turf_id, TURF2);
  assert.deepEqual(tables.notifications.map((n) => n.user_id).sort(), ["acc-2", "acc-3"], "the player and the waiting request, never the host");
  assert.ok(String(tables.notifications[0].message).startsWith("Asha moved Football on "));
  const ok = await patchRequest(req(`/api/game-requests/${REQ}`, { method: "PATCH", token: phoneToken(), body: { action: "accept" } }), REQ);
  assert.deepEqual(await json(ok), { r: "ok", status: "accepted", current_players: 3 });
  assert.equal(tables.game_participants.length, 3);
  assert.equal(tables.games[0].current_players, 3, "the count is recounted");
});

test("fallback only for a missing function: a failing database or a wrong key is unavailable, never the fallback", async () => {
  signedIn();
  net.rest = () => {
    throw new Error("the fallback must not run");
  };
  net.rpc.notifications_unread = () => Response.json({ code: "57014", message: "statement timeout" }, { status: 500 });
  assert.equal((await getNotifications(req("/api/notifications?count=unread", { token: phoneToken() }))).status, 503);
  net.rpc.notifications_unread = () => ({ r: "unavailable" });
  assert.equal((await getNotifications(req("/api/notifications?count=unread", { token: phoneToken() }))).status, 503);
  assert.equal(net.restCalls.length, 0);
});
