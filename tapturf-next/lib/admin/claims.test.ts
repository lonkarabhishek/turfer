import { test } from "node:test";
import assert from "node:assert/strict";
import { keyLabel, toClaims, typedNameDiffers } from "./claims";

const row = (over: Record<string, unknown> = {}) => ({
  turf_id: "t1",
  user_key: "e:sam@x.in",
  status: "pending",
  via: "admin",
  role: "owner",
  note: "Call me",
  name: "Sam Account",
  created_at: "2026-10-24T05:56:51Z",
  turf_name: "Turfit",
  slug: "turfit",
  city: "udaipur",
  area: "Bhuwana",
  listed_phones: ["9800000001", 5],
  verified_phone: null,
  phone_given: "9800000002",
  site_owner: false,
  user_id: "u1",
  account: { id: "u1", name: "Sam Account", username: "sam", email: "sam@x.in", phone: null, method: "google", signed_up_at: "2026-10-24T05:55:59Z", last_seen: "2026-10-24T05:56:00Z", other_claims: 2 },
  ...over,
});

test("a full row", () => {
  const [c] = toClaims([row()]);
  assert.equal(c.turfId, "t1");
  assert.equal(c.status, "pending");
  assert.equal(c.pending, true);
  assert.deepEqual(c.listedPhones, ["9800000001"], "only strings");
  assert.equal(c.phoneGiven, "9800000002");
  assert.equal(c.account?.method, "google");
  assert.equal(c.account?.otherClaims, 2);
  assert.equal(c.account?.signedUpAt, Date.parse("2026-10-24T05:55:59Z"));
  assert.equal(c.createdAt, Date.parse("2026-10-24T05:56:51Z"));
  assert.equal(c.account?.signInFinished, true, "true unless the database says false");
  const [d] = toClaims([row({ account: { id: "u1", method: "google", signin_finished: false } })]);
  assert.equal(d.account?.signInFinished, false);
  assert.equal(c.account?.emailChecked, false, "only when the database says so");
  const [e] = toClaims([row({ rejected_at: "2026-10-20T10:00:00Z", their_listed_phone: "9800000001", account: { id: "u1", method: "google", email_checked: true } })]);
  assert.equal(e.rejectedAt, Date.parse("2026-10-20T10:00:00Z"));
  assert.equal(e.theirListedPhone, "9800000001");
  assert.equal(e.account?.emailChecked, true);
});

test("no account, odd values", () => {
  const [c] = toClaims([row({ account: null, user_id: null, role: "boss", via: "x", method: "?", created_at: "not a date" })]);
  assert.equal(c.account, null);
  assert.equal(c.userId, null);
  assert.equal(c.role, null);
  assert.equal(c.via, "admin");
  assert.equal(c.createdAt, null);
  const [d] = toClaims([row({ account: { id: "u2", method: "carrier pigeon", other_claims: "lots" } })]);
  assert.equal(d.account?.method, "unknown");
  assert.equal(d.account?.otherClaims, 0);
});

test("malformed rows are left out", () => {
  assert.deepEqual(toClaims(null), []);
  assert.deepEqual(toClaims({ error: "forbidden" }), []);
  assert.equal(toClaims([row(), row({ status: "weird" }), row({ turf_id: null }), "x", null]).length, 1);
});

test("typed names that differ from the account", () => {
  const [c] = toClaims([row({ name: "  sam   ACCOUNT " })]);
  assert.equal(typedNameDiffers(c), false, "case and spacing do not count");
  const [d] = toClaims([row({ name: "Someone Else" })]);
  assert.equal(typedNameDiffers(d), true);
  const [e] = toClaims([row({ account: null })]);
  assert.equal(typedNameDiffers(e), false, "nothing to compare");
});

test("key labels", () => {
  assert.equal(keyLabel("p:9800000001"), "+91 9800000001");
  assert.equal(keyLabel("e:sam@x.in"), "sam@x.in");
});
