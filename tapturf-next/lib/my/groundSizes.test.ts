import { test } from "node:test";
import assert from "node:assert/strict";
import { getGroundSizes, postGroundSizes } from "./groundSizes";
import { dbProfile, googleSession, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

const TURF = "dddddddd-dddd-4ddd-8ddd-000000000001";
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const STORED = {
  grounds: [{ name: "Box 1", sport: "cricket", length_ft: 120.1, width_ft: 60.0, height_ft: 40.0 }],
  unit: "m",
  updated_at: "2026-11-02T10:00:00+00:00",
  source: "owner",
};

function signedIn() {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-1" });
}

const post = (body: unknown, token = phoneToken(), onSaved?: (id: string) => void) =>
  postGroundSizes(req("/api/my/ground-sizes", { method: "POST", token, body }), onSaved);

test("save: metres become feet, the account comes from the sign-in, never the body", async () => {
  signedIn();
  net.rpc.turf_ground_sizes_save = () => ({ r: "ok", changed: true, ground_sizes: STORED, saves_left: 19 });
  const saved: string[] = [];
  const res = await post(
    { turf_id: TURF.toUpperCase(), unit: "m", user_id: "someone-else", p_user_id: "x", grounds: [{ name: " Box 1 ", sport: "cricket", length: "36.6", width: 18.3, height: "12.2" }] },
    phoneToken(),
    (id) => void saved.push(id),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await json(res), { r: "ok", changed: true, sizes: { ...STORED, grounds: [{ name: "Box 1", sport: "cricket", length_ft: 120.1, width_ft: 60, height_ft: 40 }] }, saves_left: 19 });
  const [call] = net.calls("turf_ground_sizes_save");
  assert.equal(call.args.p_key, "test-account-key", "with the server key");
  assert.equal(call.args.p_user_id, "acc-1", "the resolved account");
  assert.equal(call.args.p_turf_id, TURF);
  assert.deepEqual(call.args.p_sizes, { unit: "m", grounds: [{ name: "Box 1", sport: "cricket", length_ft: 120.1, width_ft: 60, height_ft: 40 }] }, "feet, to 0.1");
  assert.deepEqual(saved, [TURF], "the page is rebuilt");
  assert.equal(net.calls("account_resolve")[0].args.p_create, false, "no account made for the sign-in");
});

test("save: a Google sign-in works the same; a save that changed nothing rebuilds nothing", async () => {
  signedIn();
  net.rpc.turf_ground_sizes_save = () => ({ r: "ok", changed: false, ground_sizes: STORED, saves_left: 20 });
  const saved: string[] = [];
  const res = await post({ turf_id: TURF, unit: "ft", grounds: [{ length: 120, width: 60 }] }, googleSession(), (id) => void saved.push(id));
  assert.equal(res.status, 200);
  assert.equal((await json(res)).changed, false);
  assert.deepEqual(saved, []);
});

test("save: a failed page rebuild never fails the save", async () => {
  signedIn();
  net.rpc.turf_ground_sizes_save = () => ({ r: "ok", changed: true, ground_sizes: STORED, saves_left: 3 });
  const res = await post({ turf_id: TURF, unit: "ft", grounds: [{ length: 120, width: 60 }] }, phoneToken(), () => {
    throw new Error("no cache here");
  });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).saves_left, 3);
});

test("save: what the form would refuse never reaches the database, said on the same box", async () => {
  signedIn();
  const cases: [unknown, number, Record<string, unknown>][] = [
    [{ turf_id: TURF, unit: "ft", grounds: [{ length: 500, width: 60 }] }, 400, { error: "bad", problem: { ground: 0, field: "length", why: "range" } }],
    [{ turf_id: TURF, unit: "m", grounds: [{ length: 30, width: 15 }, { length: 30, width: 15, height: 40 }] }, 400, { error: "bad", problem: { ground: 1, field: "height", why: "range" } }],
    [{ turf_id: TURF, unit: "ft", grounds: [{ name: "Call 98220 12345", length: 120, width: 60 }] }, 400, { error: "bad", problem: { ground: 0, field: "name", why: "phone" } }],
    [{ turf_id: TURF, unit: "ft", grounds: Array(5).fill({ length: 120, width: 60 }) }, 400, { error: "bad", problem: { ground: -1, field: "grounds", why: "count" } }],
    [{ turf_id: TURF, unit: "ft", grounds: ["x"] }, 400, { error: "bad", problem: { ground: 0, field: "length", why: "missing" } }],
    [{ turf_id: "nope", unit: "ft", grounds: [] }, 400, { error: "bad" }],
    [{ turf_id: TURF, unit: "yd", grounds: [] }, 400, { error: "bad" }],
    [{ turf_id: TURF, unit: "ft" }, 400, { error: "bad" }],
  ];
  for (const [body, status, answer] of cases) {
    const res = await post(body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.deepEqual(await json(res), answer);
  }
  assert.equal(net.calls("turf_ground_sizes_save").length, 0);
});

test("save: the database's refusals", async () => {
  const body = { turf_id: TURF, unit: "ft", grounds: [{ length: 120, width: 60 }] };
  const answers: [unknown, number, Record<string, unknown>][] = [
    [{ r: "forbidden" }, 403, { error: "not_allowed", reason: "not_owner" }],
    [{ r: "gone" }, 404, { error: "bad", reason: "gone" }],
    [{ r: "limit" }, 429, { error: "limit", reason: "limit" }],
    [{ r: "bad", ground: 0, field: "width" }, 400, { error: "bad", problem: { ground: 0, field: "width", why: "range" } }],
    [{ r: "bad", ground: 0, field: "name" }, 400, { error: "bad", problem: { ground: 0, field: "name", why: "long" } }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
    [{ r: "what" }, 503, { error: "unavailable" }],
    [Response.json({ code: "PGRST202", message: "no function" }, { status: 404 }), 503, { error: "unavailable", reason: "not_ready" }],
    [Response.json({ code: "XX000", message: "boom" }, { status: 500 }), 503, { error: "unavailable" }],
  ];
  for (const [a, status, answer] of answers) {
    signedIn();
    const saved: string[] = [];
    net.rpc.turf_ground_sizes_save = () => a;
    const res = await post(body, phoneToken(), (id) => void saved.push(id));
    assert.equal(res.status, status, JSON.stringify(a));
    assert.deepEqual(await json(res), answer);
    assert.deepEqual(saved, [], "nothing rebuilt");
  }
});

test("save: no sign-in, or a number with no account, never reaches the database", async () => {
  signedIn();
  const body = { turf_id: TURF, unit: "ft", grounds: [{ length: 120, width: 60 }] };
  assert.equal((await postGroundSizes(req("/api/my/ground-sizes", { method: "POST", body }))).status, 401);
  assert.equal((await post(body, "not-a-token")).status, 401);
  net.rpc.account_resolve = () => ({ r: "new", was_used: false });
  assert.equal((await post(body)).status, 404);
  assert.equal(net.calls("turf_ground_sizes_save").length, 0);
});

test("read: the form's start, for the turf's owners only", async () => {
  signedIn();
  net.rpc.turf_ground_sizes_mine = () => ({ r: "ok", ground_sizes: STORED, legacy: { length_ft: 100, width_ft: 50, height_ft: null }, saves_left: 18 });
  const res = await getGroundSizes(req(`/api/my/ground-sizes?turf=${TURF}`, { token: phoneToken() }));
  assert.equal(res.status, 200);
  const b = await json(res);
  assert.equal(b.ready, true);
  assert.equal((b.sizes as { unit: string }).unit, "m");
  assert.deepEqual(b.legacy, { name: null, sport: null, length_ft: 100, width_ft: 50, height_ft: null });
  assert.equal(b.saves_left, 18);
  const [call] = net.calls("turf_ground_sizes_mine");
  assert.deepEqual([call.args.p_user_id, call.args.p_turf_id], ["acc-1", TURF]);

  net.rpc.turf_ground_sizes_mine = () => ({ r: "ok", ground_sizes: null, legacy: { length_ft: 60, width_ft: 120 }, saves_left: 20 });
  assert.deepEqual(await json(await getGroundSizes(req(`/api/my/ground-sizes?turf=${TURF}`, { token: phoneToken() }))), { ready: true, sizes: null, legacy: null, saves_left: 20 }, "a researched size out of the rules is not offered");

  net.rpc.turf_ground_sizes_mine = () => ({ r: "forbidden" });
  assert.equal((await getGroundSizes(req(`/api/my/ground-sizes?turf=${TURF}`, { token: phoneToken() }))).status, 403);
  net.rpc.turf_ground_sizes_mine = () => Response.json({ code: "PGRST202" }, { status: 404 });
  const before = await getGroundSizes(req(`/api/my/ground-sizes?turf=${TURF}`, { token: phoneToken() }));
  assert.equal(before.status, 200);
  assert.deepEqual(await json(before), { ready: false }, "before the migration: coming soon");
  assert.equal((await getGroundSizes(req("/api/my/ground-sizes?turf=x", { token: phoneToken() }))).status, 400);
  assert.equal((await getGroundSizes(req(`/api/my/ground-sizes?turf=${TURF}`))).status, 401);
});
