import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteReview, getReviews, postReview, postVote } from "./server";
import { dbProfile, googleSession, installNet, net, phoneToken, req, testEnv } from "../account/testkit";

testEnv();
installNet();

const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const REVIEW = "cccccccc-cccc-4ccc-8ccc-000000000001";
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

function signedIn() {
  net.reset();
  net.rpc.account_resolve = () => dbProfile({ id: "acc-1" });
}

test("post: the account comes from the verified sign-in, never the body", async () => {
  signedIn();
  net.rpc.review_save = () => ({ r: "ok", created: true, review: { id: REVIEW, status: "live" }, note: null, after: { tapturf_n: 1, aspects: {} }, price_saved: false });
  const res = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 5, user_id: "someone-else", p_user_id: "x" } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = await json(res);
  assert.equal(body.r, "ok");
  assert.equal(body.created, true);
  const [call] = net.calls("review_save");
  assert.equal(call.args.p_key, "test-account-key", "with the server key");
  assert.equal(call.args.p_user_id, "acc-1", "the resolved account");
  assert.equal(call.args.p_turf_id, TURF);
  const report = call.args.p_report as Record<string, unknown>;
  assert.equal("user_id" in report || "turf_id" in report || "p_user_id" in report, false);
  assert.equal(report.rating, 5);
  // The sign-in was checked, and no account was made for it.
  assert.equal(net.calls("account_resolve")[0].args.p_create, false);
});

test("post: a Google sign-in works the same", async () => {
  signedIn();
  net.rpc.review_save = () => ({ r: "ok", created: false, review: { id: REVIEW }, note: { delivers: "tomorrow", at: "2026-10-27T03:30:00+00:00" }, after: { tapturf_n: 3, aspects: { pitch: 3 } }, price_saved: true });
  const res = await postReview(req("/api/reviews", { method: "POST", token: googleSession(), body: { turf_id: TURF, rating: 4, note: { body: "Gate light off", show_name: false } } }));
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.deepEqual(body.note, { delivers: "tomorrow", at: "2026-10-27T03:30:00+00:00" });
  assert.equal(body.price_saved, true);
  assert.deepEqual((net.calls("review_save")[0].args.p_report as Record<string, unknown>).note, { body: "Gate light off", show_name: false });
});

test("post: no sign-in, a bad body, or a new number never reach review_save", async () => {
  signedIn();
  assert.equal((await postReview(req("/api/reviews", { method: "POST", body: { turf_id: TURF, rating: 5 } }))).status, 401);
  assert.equal((await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 9 } }))).status, 400);
  assert.equal((await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: "nope", rating: 4 } }))).status, 400);
  const big = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4, comment: "x".repeat(5000) } }));
  assert.equal(big.status, 400);
  net.rpc.account_resolve = () => ({ r: "new" });
  const fresh = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4 } }));
  assert.equal(fresh.status, 404);
  assert.equal((await json(fresh)).error, "new");
  assert.equal(net.calls("review_save").length, 0);
});

test("post: the database's refusals, as the sheet reads them", async () => {
  const cases: [Record<string, unknown>, number, Record<string, unknown>][] = [
    [{ r: "own_turf" }, 409, { reason: "own_turf", error: "not_allowed" }],
    [{ r: "contact_info", field: "note" }, 400, { reason: "contact_info", field: "note", error: "bad" }],
    [{ r: "contact_info", field: "comment" }, 400, { reason: "contact_info", field: "comment", error: "bad" }],
    [{ r: "gone" }, 400, { reason: "gone", error: "bad" }],
    [{ r: "limit" }, 429, { error: "limit" }],
    [{ r: "bad" }, 400, { error: "bad" }],
    [{ r: "unavailable" }, 503, { error: "unavailable" }],
    [{ r: "something new" }, 503, { error: "unavailable" }],
  ];
  for (const [answer, status, body] of cases) {
    signedIn();
    net.rpc.review_save = () => answer;
    const res = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4 } }));
    assert.equal(res.status, status, JSON.stringify(answer));
    assert.deepEqual(await json(res), body, JSON.stringify(answer));
  }
});

test("get: the caller's own report, votes, hint and price; nothing for a bad turf id", async () => {
  signedIn();
  net.rpc.review_mine = () => ({ r: "ok", mine: null, voted: [REVIEW, 7], blocked: null, hint: { kind: "call", at: "2026-10-24T09:00:00+05:30" }, my_price: 1000 });
  const res = await getReviews(req(`/api/reviews?turf=${TURF}`, { token: phoneToken() }));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { mine: null, voted: [REVIEW], blocked: null, hint: { kind: "call", at: "2026-10-24T09:00:00+05:30" }, my_price: 1000 });
  assert.equal(net.calls("review_mine")[0].args.p_user_id, "acc-1");
  assert.equal((await getReviews(req(`/api/reviews?turf=x`, { token: phoneToken() }))).status, 400);
});

test("delete: removes the caller's own report only", async () => {
  signedIn();
  net.rpc.review_remove = () => ({ r: "ok" });
  const res = await deleteReview(req(`/api/reviews?turf=${TURF}`, { method: "DELETE", token: phoneToken() }));
  assert.equal(res.status, 200);
  assert.deepEqual(net.calls("review_remove")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_turf_id: TURF });
  net.rpc.review_remove = () => ({ r: "gone" });
  assert.equal((await deleteReview(req(`/api/reviews?turf=${TURF}`, { method: "DELETE", token: phoneToken() }))).status, 400);
});

test("vote: on and off for the caller; own and Google rows refused", async () => {
  signedIn();
  net.rpc.review_vote = (a) => ({ r: "ok", on: a.p_on, upvotes: a.p_on ? 3 : 2 });
  const on = await postVote(req("/api/reviews/vote", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, on: true, user_id: "x" } }));
  assert.deepEqual(await json(on), { r: "ok", on: true, upvotes: 3 });
  assert.deepEqual(net.calls("review_vote")[0].args, { p_key: "test-account-key", p_user_id: "acc-1", p_review_id: REVIEW, p_on: true });
  for (const r of ["own", "google"]) {
    net.rpc.review_vote = () => ({ r });
    const res = await postVote(req("/api/reviews/vote", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, on: true } }));
    assert.equal(res.status, 409);
    assert.deepEqual(await json(res), { reason: r, error: "not_allowed" });
  }
  assert.equal((await postVote(req("/api/reviews/vote", { method: "POST", token: phoneToken(), body: { review_id: REVIEW, on: "yes" } }))).status, 400);
});

test("routes: without ACCOUNT_KEY nothing is written (503)", async () => {
  signedIn();
  const key = process.env.ACCOUNT_KEY;
  delete process.env.ACCOUNT_KEY;
  try {
    const res = await postReview(req("/api/reviews", { method: "POST", token: phoneToken(), body: { turf_id: TURF, rating: 4 } }));
    assert.equal(res.status, 503);
    assert.equal(net.calls("review_save").length, 0);
  } finally {
    process.env.ACCOUNT_KEY = key;
  }
});
