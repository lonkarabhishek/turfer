import { test } from "node:test";
import assert from "node:assert/strict";
import { cityNote, visitCity } from "./city";
import { postToolUse } from "./toolRoutes";
import { dbProfile, GOOGLE_UID, googleSession, installNet, net, phoneToken, PHONE, req, settle, testEnv } from "./testkit";

testEnv();
installNet();

const DEVICE = "k3j9x0abc123";
const CODE = "abcd1234wxyz";
const aUse = (o: Record<string, unknown> = {}) => ({ tool: "toss", event: "started", detail: null, tags: null, code: null, device: DEVICE, ...o });
const post = (body: unknown, o: { token?: string; headers?: Record<string, string>; cookie?: string } = {}) =>
  postToolUse(req("/api/tools/use", { method: "POST", body, ...o }));

function reset() {
  net.reset();
  net.rpc.tool_use_record = () => true;
  net.rpc.tool_use_count = () => true;
}

const recorded = () => net.calls("tool_use_record").map((c) => c.args);

test("a guest's use: 204 at once, then recorded with the device tag and the city, no account", async () => {
  reset();
  const res = await post(aUse(), { headers: { "x-vercel-ip-city": "Pune", "x-vercel-ip-country": "IN" } });
  assert.equal(res.status, 204);
  await settle();
  const [args] = recorded();
  assert.equal(args.p_tool, "toss");
  assert.equal(args.p_event, "started");
  assert.equal(args.p_user_id, null);
  assert.equal(args.p_device, DEVICE);
  assert.equal(args.p_city, "Pune");
  assert.equal(args.p_key, "test-account-key", "with the server key");
  assert.equal(net.calls("account_resolve").length, 0, "no sign-in, no account lookup");
  assert.equal(net.calls("tool_use_count").length, 0, "one round trip: the record also counts");
});

test("a signed-in phone use: the verified account, never made, and no device tag", async () => {
  reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-phone" });
  const res = await post(aUse({ tool: "live_scoreboard", detail: "football", tags: "football", code: CODE }), { token: phoneToken() });
  assert.equal(res.status, 204);
  await settle();
  const [resolve] = net.calls("account_resolve");
  assert.equal(resolve.args.p_kind, "phone");
  assert.equal(resolve.args.p_phone, PHONE);
  assert.equal(resolve.args.p_create, false, "a tool use never makes an account");
  assert.equal(resolve.args.p_log, false, "and is not a sign-in");
  const [args] = recorded();
  assert.equal(args.p_user_id, "acc-phone");
  assert.equal(args.p_device, null, "never both");
  assert.equal(args.p_detail, "football");
  assert.equal(args.p_tags, "football");
  assert.equal(args.p_code, CODE);
});

test("a signed-in Google use: the account its verified session opens", async () => {
  reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-google", phone: null });
  await post(aUse(), { token: googleSession() });
  await settle();
  const [resolve] = net.calls("account_resolve");
  assert.equal(resolve.args.p_kind, "google");
  assert.equal(resolve.args.p_uid, GOOGLE_UID);
  assert.equal(resolve.args.p_create, false);
  assert.equal(recorded()[0].p_user_id, "acc-google");
});

test("a token that doesn't check out, or opens no account, makes it a guest's use", async () => {
  reset();
  await post(aUse(), { token: "not.a.token" });
  await settle();
  assert.equal(net.calls("account_resolve").length, 0, "a bad token never reaches the database");
  assert.deepEqual([recorded()[0].p_user_id, recorded()[0].p_device], [null, DEVICE]);

  reset();
  // An email and password session is not a Google sign-in.
  await post(aUse(), { token: googleSession({ method: "password" }) });
  await settle();
  assert.deepEqual([recorded()[0].p_user_id, recorded()[0].p_device], [null, DEVICE]);

  reset();
  net.rpc.account_resolve = () => ({ r: "new", was_used: false });
  await post(aUse(), { token: phoneToken() });
  await settle();
  assert.equal(net.calls("account_resolve").length, 1);
  assert.deepEqual([recorded()[0].p_user_id, recorded()[0].p_device], [null, DEVICE], "a number with no account");

  reset();
  net.rpc.account_resolve = () => ({ r: "unavailable" });
  await post(aUse(), { token: phoneToken() });
  await settle();
  assert.equal(recorded()[0].p_user_id, null, "the account can't be read right now");
});

test("the browser never names who: a user id in the body is ignored", async () => {
  reset();
  await post(aUse({ user_id: "acc-someone", userId: "acc-someone", p_user_id: "acc-someone" }));
  await settle();
  assert.equal(recorded()[0].p_user_id, null);
});

test("only well-formed uses; bad tags, codes and device tags are left out", async () => {
  reset();
  for (const bad of [{ tool: "admin", event: "started" }, { tool: "toss", event: "opened" }, "x", null]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await postToolUse(req("/api/tools/use", { method: "POST", body: { ...aUse(), pad: "x".repeat(700) } }))).status, 400, "too big");
  await post(aUse({ tags: "<script>", code: "short", device: "NOT A TAG" }));
  await settle();
  assert.equal(recorded().length, 1, "only the good use");
  const [args] = recorded();
  assert.deepEqual([args.p_tags, args.p_code, args.p_device], [null, null, null]);
});

test("the per-network limit still sheds a flood before any work", async () => {
  reset();
  const headers = { "x-forwarded-for": "10.250.1.1" };
  const codes: number[] = [];
  for (let i = 0; i < 31; i++) codes.push((await post(aUse(), { headers })).status);
  assert.deepEqual(codes.slice(0, 30), Array(30).fill(204));
  assert.equal(codes[30], 429);
  await settle();
  assert.equal(recorded().length, 30);
});

test("before the database has tool_use_record, the use is still counted", async () => {
  reset();
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input instanceof Request ? input.url : input).endsWith("/rest/v1/rpc/tool_use_record")) {
      return Response.json({ code: "PGRST202", message: "Could not find the function public.tool_use_record" }, { status: 404 });
    }
    return real(input, init);
  }) as typeof fetch;
  try {
    await post(aUse({ tool: "live_scoreboard", detail: "football" }));
    await settle();
  } finally {
    globalThis.fetch = real;
  }
  const [count] = net.calls("tool_use_count");
  assert.deepEqual([count.args.p_tool, count.args.p_event, count.args.p_detail], ["live_scoreboard", "started", "football"]);
});

test("the visit's city: the internet connection's place, else the city picked on TapTurf", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  assert.equal(visitCity(cityNote(get({ "x-vercel-ip-city": "Navi%20Mumbai", "x-vercel-ip-country": "IN" }))), "Navi Mumbai");
  assert.equal(visitCity(cityNote(get({ "x-vercel-ip-city": "Dubai", "x-vercel-ip-country": "AE" }))), "Dubai (AE)");
  assert.equal(visitCity(cityNote(get({ cookie: "tt_city=pune" }))), "Pune", "no internet city: the pick");
  assert.equal(visitCity(cityNote(get({ cookie: "tt_city=geo.nashik" }))), "Nashik", "or the proxy's earlier guess");
  assert.equal(visitCity(cityNote(get({ "x-vercel-ip-city": "%3Cb%3E" }))), "b", "only letters and simple punctuation");
  assert.equal(visitCity(cityNote(get({}))), null);
});
