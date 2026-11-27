import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { patchMe } from "./meRoutes";
import { getUsername, postUsername } from "./usernameRoutes";
import { dbProfile, installNet, net, phoneToken, req, testEnv } from "./testkit";

// The username routes with a username TapTurf gave (20261128_usernames_assigned.sql), and on a database from
// before it (npm run test:account). A fake network stands in for the database. Made-up people only.

testEnv();
installNet();

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const KEY = "test-account-key";
/** PostgREST's answer for a function the database does not have. */
const noFunction = () => Response.json({ code: "PGRST202", message: "Could not find the function" }, { status: 404 });
/** And for one whose execute was taken away again (the migration's "To undo"). */
const closed = () => Response.json({ code: "42501", message: "permission denied for function" }, { status: 403 });
const get = (q: string) => getUsername(req(`/api/account/username?${q}`, { token: phoneToken() }));
const keep = (body: unknown = { keep: true }) => postUsername(req("/api/account/username", { method: "POST", token: phoneToken(), body }));
const patch = (body: unknown) => patchMe(req("/api/account/me", { method: "PATCH", token: phoneToken(), body }));

test("suggest: the username TapTurf gave is offered as it is, marked assigned", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ name: "Asha Rao", username: null });
  net.rpc.username_ensure = () => ({ r: "ok", assigned: "asha_rao" });
  const res = await get("suggest=1");
  assert.deepEqual([res.status, await json(res)], [200, { username: "asha_rao", assigned: true }]);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  // For the account the server verified, never one the browser names; and no suggestion was looked up.
  assert.deepEqual(net.calls("username_ensure")[0].args, { p_key: KEY, p_user_id: "acc-1" });
  assert.equal(net.calls("username_pick").length, 0);
});

test("suggest: someone who chose a username gets theirs, and nothing is given", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: "asha" });
  const res = await get("suggest=1");
  assert.deepEqual([res.status, await json(res)], [200, { username: "asha" }]);
  assert.equal(net.calls("username_ensure").length, 0);
});

test("suggest: a database from before the migration (or with the function closed again) suggests as before", async () => {
  for (const answer of [noFunction, closed]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ name: "Asha Rao", username: null });
    net.rpc.username_ensure = answer;
    net.rpc.username_pick = (a) => (a.p_candidates as string[])[0];
    const res = await get("suggest=1");
    assert.deepEqual([res.status, await json(res)], [200, { username: "asharao" }], "a suggestion, not marked assigned");
  }
  // Nothing given (set aside by hand): a suggestion too.
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ name: "Asha Rao", username: null });
  net.rpc.username_ensure = () => ({ r: "ok", assigned: null });
  net.rpc.username_pick = () => "asharao";
  assert.deepEqual(await json(await get("suggest=1")), { username: "asharao" });
});

test("suggest: when the given name can't be read right now, nobody is asked to pick one instead", async () => {
  for (const answer of [() => ({ r: "unavailable" }), () => new Response("upstream", { status: 502 }), () => ({ r: "bad" })]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: null });
    net.rpc.username_ensure = answer;
    const res = await get("suggest=1");
    assert.deepEqual([res.status, await json(res)], [503, { error: "unavailable" }]);
    assert.equal(net.calls("username_pick").length, 0);
  }
  // A malformed name from the database is never passed on.
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ name: "Asha Rao", username: null });
  net.rpc.username_ensure = () => ({ r: "ok", assigned: "Not A Username" });
  net.rpc.username_pick = () => "asharao";
  assert.deepEqual(await json(await get("suggest=1")), { username: "asharao" });
});

test("check: through username_check_all, so a name waiting for someone else is taken; before the migration, username_check", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: null });
  net.rpc.username_check_all = (a) => (a.p_username === "asha_rao2" ? { r: "taken" } : { r: "ok", username: String(a.p_username).toLowerCase() });
  let res = await get("u=asha_rao2");
  assert.deepEqual([res.status, await json(res)], [409, { error: "taken" }]);
  res = await get("u=Asha_Plays");
  assert.deepEqual([res.status, await json(res)], [200, { ok: true, username: "asha_plays" }]);
  assert.deepEqual(net.calls("username_check_all")[1].args, { p_key: KEY, p_user_id: "acc-1", p_username: "Asha_Plays" });
  assert.equal(net.calls("username_check").length, 0);
  // The rules still answer before any lookup.
  res = await get("u=admin_asha");
  assert.deepEqual([res.status, await json(res)], [422, { error: "reserved" }]);
  assert.equal(net.calls("username_check_all").length, 2);

  for (const answer of [noFunction, closed]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: null });
    net.rpc.username_check_all = answer;
    net.rpc.username_check = () => ({ r: "ok", username: "asha_plays" });
    res = await get("u=asha_plays");
    assert.deepEqual([res.status, await json(res)], [200, { ok: true, username: "asha_plays" }]);
    assert.equal(net.calls("username_check").length, 1);
  }
});

test("GET: neither u nor suggest is 400; no sign-in is 401", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile();
  assert.equal((await get("mine=1")).status, 400);
  assert.equal((await getUsername(req("/api/account/username?suggest=1"))).status, 401);
  assert.equal((await postUsername(req("/api/account/username", { method: "POST", body: { keep: true } }))).status, 401);
  assert.equal(net.rpcCalls.length, 0);
});

test("Keep it: the given username becomes theirs, by their own tap", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ name: "Asha Rao", username: null });
  net.rpc.username_choose = () => dbProfile({ name: "Asha Rao", username: "asha_rao", taggable: true });
  const res = await keep();
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.equal((body.profile as { username: string }).username, "asha_rao");
  assert.equal((body.profile as { taggable: boolean }).taggable, true);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  // No name and no switch are sent: the database keeps the one that was waiting, public as a picked username is.
  assert.deepEqual(net.calls("username_choose")[0].args, { p_key: KEY, p_user_id: "acc-1", p_username: null, p_taggable: null });
  assert.equal(net.calls("username_set").length, 0);
});

test("Keep it: only { keep: true } is taken; a browser can't name an account or a username", async () => {
  for (const body of [{}, { keep: false }, { keep: "yes" }, { keep: true, username: "someone" }, { keep: true, user_id: "acc-2" }, [], "keep"]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: null });
    const res = await keep(body);
    assert.deepEqual([res.status, await json(res)], [400, { error: "bad" }], JSON.stringify(body));
    assert.equal(net.calls("username_choose").length, 0);
  }
});

test("Keep it: already chosen is a quiet yes; nothing waiting, or a database from before, is 400", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: "asha" });
  let res = await keep();
  assert.equal(res.status, 200);
  assert.equal(((await json(res)).profile as { username: string }).username, "asha");
  assert.equal(net.calls("username_choose").length, 0, "a second tap writes nothing");

  for (const answer of [() => ({ r: "bad" }), noFunction, closed]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: null });
    net.rpc.username_choose = answer;
    res = await keep();
    assert.deepEqual([res.status, await json(res)], [400, { error: "bad" }]);
    assert.equal(net.calls("username_set").length, 0, "Keep never falls back to a write of its own");
  }
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: null });
  net.rpc.username_choose = () => ({ r: "unavailable" });
  assert.equal((await keep()).status, 503);
  net.reset();
  net.rpc.account_resolve = () => ({ r: "new" });
  assert.equal((await keep()).status, 404);
});

test("Keep it: the name went to someone else a moment ago: 409 with the one waiting now, nothing public", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: null });
  net.rpc.username_choose = () => ({ r: "moved", assigned: "asha_rao2" });
  const res = await keep();
  assert.deepEqual([res.status, await json(res)], [409, { assigned: "asha_rao2", error: "taken" }]);
});

test("me PATCH: a username or the switch goes through username_choose; before the migration, username_set", async () => {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: null });
  net.rpc.username_choose = (a) => dbProfile({ username: String(a.p_username).toLowerCase(), taggable: a.p_taggable !== false });
  let res = await patch({ username: "Asha_Plays" });
  assert.equal(res.status, 200);
  assert.equal(((await json(res)).profile as { username: string }).username, "asha_plays");
  assert.deepEqual(net.calls("username_choose")[0].args, { p_key: KEY, p_user_id: "acc-1", p_username: "Asha_Plays", p_taggable: null });
  assert.equal(net.calls("username_set").length, 0);
  // A new name saved with the switch off: the switch goes with it.
  res = await patch({ username: "asha_plays", taggable: false });
  assert.deepEqual(net.calls("username_choose")[1].args, { p_key: KEY, p_user_id: "acc-1", p_username: "asha_plays", p_taggable: false });
  assert.equal(((await json(res)).profile as { taggable: boolean }).taggable, false);

  // Refusals pass through: a name waiting for someone else is taken.
  for (const [r, status] of [["taken", 409], ["reserved", 422], ["bad", 400], ["limit", 429]] as const) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: null });
    net.rpc.username_choose = () => ({ r });
    res = await patch({ username: "asha_rao2" });
    assert.equal(res.status, status, r);
    assert.equal((await json(res)).error, r);
  }

  // The switch alone, with no username of their own: nothing to set it on (a given name is kept with Keep it).
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ username: null });
  for (const [taggable, status] of [[true, 200], [false, 400]] as const) {
    res = await patch({ taggable });
    assert.equal(res.status, status);
    assert.equal(((await json(res)).profile as { username: string | null }).username, null);
  }
  assert.equal(net.calls("username_choose").length, 0, "and nothing is written, so the switch can never make a given name public");

  for (const answer of [noFunction, closed]) {
    net.reset();
    net.rpc.account_resolve = () => dbProfile({ username: "asha", taggable: true });
    net.rpc.username_choose = answer;
    net.rpc.username_set = (a) => dbProfile({ username: "asha", taggable: a.p_taggable });
    res = await patch({ taggable: false });
    assert.equal(res.status, 200);
    assert.deepEqual(net.calls("username_set")[0].args, { p_key: KEY, p_user_id: "acc-1", p_username: null, p_taggable: false });
  }
});

test("the app's route file only passes the request on", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/account/username/route.ts"), "utf8");
  assert.match(route, /export function GET\(req: Request\) \{\s+return getUsername\(req\);/);
  assert.match(route, /export function POST\(req: Request\) \{\s+return postUsername\(req\);/);
});
