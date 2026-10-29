import { test } from "node:test";
import assert from "node:assert/strict";
import { claimCounts, claimTime, claimWhen, claimedTurfs, claimsAnswer, howVerified, phoneLabel, placeOf } from "./claimed";
import { toClaims } from "./claims";
import { ReadFailed } from "./section";

const row = (over: Record<string, unknown> = {}) => ({
  turf_id: "t1",
  user_key: "e:sam@x.in",
  status: "active",
  via: "admin",
  role: "owner",
  name: "Sam",
  created_at: "2026-10-24T05:56:51Z",
  decided_at: "2026-10-24T06:33:44Z",
  turf_name: "Turfit",
  slug: "turfit",
  city: "udaipur",
  area: "Bhuwana",
  user_id: "u1",
  account: { id: "u1", name: "Sam", username: "sam", method: "google" },
  ...over,
});

// Arena (1 manager, newest), Dribble (2 sign-ins of one account, and a second person), Crick (revoked), Box (pending).
const claims = toClaims([
  row({ turf_id: "t3", user_key: "e:ana@x.in", turf_name: "Arena", slug: "arena", city: "dehradun", area: "Pitthuwala", created_at: "2026-10-29T14:26:54Z", decided_at: "2026-10-29T15:25:15Z", user_id: "u3", account: { id: "u3", name: "Ana", username: "ana", method: "google" } }),
  row({ turf_id: "t2", turf_name: "Dribble", slug: null, city: "bangalore", area: null, user_key: "e:dee@x.in", via: "phone_match", verified_phone: "9800000001", created_at: "2026-10-28T14:50:40Z", decided_at: "2026-10-28T14:50:40Z", user_id: "u2", account: { id: "u2", name: "Dee", method: "google" } }),
  row({ turf_id: "t2", turf_name: "Dribble", slug: null, city: "bangalore", area: null, user_key: "p:9800000001", via: "phone_match", created_at: "2026-10-28T10:00:00Z", decided_at: "2026-10-28T10:00:00Z", user_id: "u2", account: { id: "u2", name: "Dee", method: "phone" } }),
  row({ turf_id: "t2", turf_name: "Dribble", slug: null, city: "bangalore", area: null, user_key: "e:kay@x.in", role: "staff", created_at: "2026-10-27T10:00:00Z", decided_at: "2026-10-27T11:00:00Z", user_id: "u4", account: { id: "u4", name: "Kay", method: "google" } }),
  row({ turf_id: "t4", user_key: "e:raj@x.in", turf_name: "Crick", slug: "crick", city: "sambhajinagar", area: "Kumbhephal", status: "revoked", created_at: "2026-10-19T11:22:16Z", decided_at: "2026-10-19T11:26:55Z", user_id: "u5", account: { id: "u5", name: "Raj", method: "google" } }),
  row({ turf_id: "t5", turf_name: "Box", slug: "box", status: "pending", created_at: "2026-10-29T16:00:00Z", decided_at: null, user_id: null, account: null, user_key: "e:new@x.in" }),
  row(),
]);

test("the owner check saying no is not an empty list", () => {
  assert.throws(() => claimsAnswer({ error: "forbidden" }), (e: unknown) => e instanceof ReadFailed && e.reason === "not_allowed");
  assert.throws(() => claimsAnswer(null), (e: unknown) => e instanceof ReadFailed && e.reason === "error");
  assert.throws(() => claimsAnswer({ error: "weird" }), (e: unknown) => e instanceof ReadFailed && e.reason === "error");
  assert.deepEqual(claimsAnswer([]), []);
  assert.equal(claimsAnswer([row(), { junk: true }]).length, 1, "malformed rows left out, as toClaims does");
});

test("claimed now: one entry a turf with an active claim, the latest first", () => {
  const list = claimedTurfs(claims, "all");
  assert.deepEqual(list.map((t) => t.name), ["Arena", "Dribble", "Turfit"]);
  const dribble = list[1];
  assert.equal(dribble.claims.length, 3, "every active claim is shown");
  assert.deepEqual(dribble.claims.map((c) => c.userKey), ["e:dee@x.in", "p:9800000001", "e:kay@x.in"], "newest first");
  assert.equal(dribble.managing, 2, "two sign-ins of one account are one person");
  assert.equal(dribble.waiting, 0);
  assert.equal(dribble.place, "Bangalore");
  assert.equal(list[0].place, "Pitthuwala, Dehradun", "a city the curated list may not have still gets a label");
  assert.equal(list[0].latest, Date.parse("2026-10-29T15:25:15Z"));
});

test("waiting, revoked or rejected, every claim", () => {
  const waiting = claimedTurfs(claims, "waiting");
  assert.deepEqual(waiting.map((t) => t.name), ["Box"]);
  assert.equal(waiting[0].managing, 0);
  assert.equal(waiting[0].waiting, 1);
  assert.equal(waiting[0].latest, Date.parse("2026-10-29T16:00:00Z"), "a pending claim counts from when it was made");
  assert.deepEqual(claimedTurfs(claims, "ended").map((t) => t.name), ["Crick"]);
  const every = claimedTurfs(claims, "every");
  assert.deepEqual(every.map((t) => t.name), ["Box", "Arena", "Dribble", "Turfit", "Crick"]);
  assert.deepEqual(claimedTurfs([], "all"), []);
  // A turf with an active and a revoked claim is claimed now with its manager, and listed with the revoked one.
  const mixed = toClaims([row(), row({ user_key: "e:old@x.in", status: "revoked", user_id: "u9", account: null })]);
  assert.deepEqual(claimedTurfs(mixed, "all")[0].claims.map((c) => c.userKey), ["e:sam@x.in"]);
  assert.deepEqual(claimedTurfs(mixed, "ended")[0].claims.map((c) => c.userKey), ["e:old@x.in"]);
  assert.equal(claimedTurfs(mixed, "ended")[0].managing, 1);
});

test("times not recorded go last; ties go by name", () => {
  const list = claimedTurfs(toClaims([row({ turf_id: "a", turf_name: "Zed", created_at: null, decided_at: null }), row({ turf_id: "b", turf_name: "Bee" }), row({ turf_id: "c", turf_name: "Ace" })]), "all");
  assert.deepEqual(list.map((t) => t.name), ["Ace", "Bee", "Zed"]);
  assert.equal(claimTime(list[2].claims[0]), null);
});

test("the counts over the list", () => {
  assert.deepEqual(claimCounts(claims), { turfs: 3, people: 4, waiting: 1, ended: 1 });
  assert.deepEqual(claimCounts([]), { turfs: 0, people: 0, waiting: 0, ended: 0 });
});

test("how each claim got in, and the number it proved", () => {
  const by = (key: string) => claims.find((c) => c.userKey === key)!;
  assert.deepEqual(howVerified(by("e:dee@x.in")), { text: "Code to the listed number", phone: "9800000001" });
  assert.deepEqual(howVerified(by("p:9800000001")), { text: "Listed-number match", phone: "9800000001" });
  assert.deepEqual(howVerified(toClaims([row({ user_key: "p:9800000002", via: "phone_match", verified_phone: "9800000002" })])[0]), { text: "Signed in with the listed number", phone: "9800000002" });
  assert.deepEqual(howVerified(by("e:sam@x.in")), { text: "Approved by TapTurf", phone: null });
  assert.deepEqual(howVerified(by("e:new@x.in")), { text: "Waiting for TapTurf's approval", phone: null });
  assert.deepEqual(howVerified(toClaims([row({ status: "rejected" })])[0]), { text: "Turned down by TapTurf", phone: null });
  assert.equal(phoneLabel("9800000001"), "+91 98000 00001");
});

test("when: claimed, then approved, verified, revoked or turned down (India time)", () => {
  const by = (key: string) => claims.find((c) => c.userKey === key)!;
  assert.equal(claimWhen(by("e:sam@x.in")), "Claimed 24 Oct 2026, 11:26 · approved 24 Oct 2026, 12:03");
  assert.equal(claimWhen(by("e:dee@x.in")), "Claimed 28 Oct 2026, 20:20, in at once");
  assert.equal(claimWhen(by("e:new@x.in")), "Claimed 29 Oct 2026, 21:30");
  assert.equal(claimWhen(toClaims([row({ status: "revoked" })])[0]), "Claimed 24 Oct 2026, 11:26 · revoked 24 Oct 2026, 12:03");
  assert.equal(claimWhen(toClaims([row({ status: "rejected" })])[0]), "Claimed 24 Oct 2026, 11:26 · turned down 24 Oct 2026, 12:03");
  assert.equal(claimWhen(toClaims([row({ via: "phone_match", verified_phone: "9800000001" })])[0]), "Claimed 24 Oct 2026, 11:26 · verified 24 Oct 2026, 12:03", "a pending claim proved with a code later");
  assert.equal(claimWhen(toClaims([row({ created_at: null })])[0]), "Claimed (time not recorded) · approved 24 Oct 2026, 12:03");
});

test("place", () => {
  assert.equal(placeOf(null, null), null);
  assert.equal(placeOf("Baner", null), "Baner");
  assert.equal(placeOf(null, "pune"), "Pune");
});
