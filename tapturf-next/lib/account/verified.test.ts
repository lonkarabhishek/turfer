import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountId,
  askAnswered,
  askWaits,
  parseVerifiedIds,
  phoneAskFits,
  phoneAskFresh,
  readAskedRecords,
  tickedIds,
  tickStepHref,
  tickSteps,
  verifiedBatches,
  type AskedRecord,
  type TickUser,
} from "./verified";
import { createVerifiedStore } from "./verifiedStore";
import { verifiedGet, VERIFIED_FAILED, VERIFIED_FRESH } from "./verifiedRoute";
import { toProfile } from "./server";

const U = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;

/* ------------------------------------------------------------------ */
/* The public read's ids                                               */
/* ------------------------------------------------------------------ */

test("account ids: lowercase uuids only", () => {
  assert.equal(accountId(U(1)), U(1));
  assert.equal(accountId(` ${U(1).toUpperCase()} `), U(1));
  assert.equal(accountId("not-a-uuid"), null);
  assert.equal(accountId(5), null);
  assert.equal(accountId(null), null);
});

test("the read's ids: 1 to 50 lowercase uuids, ascending, no repeats", () => {
  assert.deepEqual(parseVerifiedIds(`${U(1)},${U(2)}`), [U(1), U(2)]);
  assert.deepEqual(parseVerifiedIds(U(7)), [U(7)]);
  assert.equal(parseVerifiedIds(`${U(2)},${U(1)}`), null, "out of order: one set, one address");
  assert.equal(parseVerifiedIds(`${U(1)},${U(1)}`), null, "a repeat");
  assert.equal(parseVerifiedIds(U(1).toUpperCase()), null, "not canonical");
  assert.equal(parseVerifiedIds(`${U(1)},`), null, "an empty id");
  assert.equal(parseVerifiedIds(`${U(1)},nope`), null);
  assert.equal(parseVerifiedIds(""), null);
  assert.equal(parseVerifiedIds(null), null);
  const fifty = Array.from({ length: 50 }, (_, i) => U(i + 1));
  assert.deepEqual(parseVerifiedIds(fifty.join(",")), fifty, "50 is fine");
  assert.equal(parseVerifiedIds([...fifty, U(51)].join(",")), null, "51 is not");
});

test("batches: valid ids only, unique, sorted, 50 a batch", () => {
  assert.deepEqual(verifiedBatches([U(3), U(1), U(3).toUpperCase(), "x", U(2)]), [[U(1), U(2), U(3)]]);
  const many = Array.from({ length: 120 }, (_, i) => U(120 - i));
  const b = verifiedBatches(many);
  assert.deepEqual(b.map((x) => x.length), [50, 50, 20]);
  assert.equal(b[0][0], U(1));
  assert.equal(b[2][19], U(120));
  assert.deepEqual(verifiedBatches([]), []);
});

test("ticked ids in an answer: uuids only", () => {
  assert.deepEqual(tickedIds([U(1), "x", 5, U(2).toUpperCase()]), [U(1), U(2)]);
  assert.deepEqual(tickedIds(null), []);
  assert.deepEqual(tickedIds({ a: U(1) }), []);
});

/* ------------------------------------------------------------------ */
/* The route                                                           */
/* ------------------------------------------------------------------ */

const yes = () => true;
const get = (q: string) => new Request(`http://localhost/api/players/verified${q}`);

test("route: the ticked ids among those asked, cached a minute", async () => {
  let asked: string[] | null = null;
  const res = await verifiedGet(get(`?ids=${U(1)},${U(2)},${U(3)}`), async (ids) => {
    asked = ids;
    return { data: [U(3), U(1), U(9)], error: null };
  }, yes);
  assert.equal(res.status, 200);
  assert.deepEqual(asked, [U(1), U(2), U(3)]);
  assert.deepEqual(await res.json(), { verified: [U(3), U(1)] }, "an id nobody asked about never comes back");
  assert.equal(res.headers.get("cache-control"), VERIFIED_FRESH);
});

test("route: a failing read (or a database from before the tick) is no tick, for a shorter while", async () => {
  const failed = await verifiedGet(get(`?ids=${U(1)}`), async () => ({ data: null, error: { code: "PGRST202", message: "no such function" } }), yes);
  assert.equal(failed.status, 200);
  assert.deepEqual(await failed.json(), { verified: [] });
  assert.equal(failed.headers.get("cache-control"), VERIFIED_FAILED);
  const threw = await verifiedGet(get(`?ids=${U(1)}`), () => Promise.reject(new Error("down")), yes);
  assert.deepEqual([threw.status, await threw.json()], [200, { verified: [] }]);
});

test("route: bad ids are refused before any read; a flood is shed", async () => {
  let reads = 0;
  const read = async () => {
    reads++;
    return { data: [], error: null };
  };
  for (const q of ["", "?ids=", `?ids=${U(2)},${U(1)}`, "?ids=1,2", `?ids=${U(1)}x`, `?ids=${U(1)}%2C${U(1)}`]) {
    const res = await verifiedGet(get(q), read, yes);
    assert.equal(res.status, 400, q);
  }
  const slow = await verifiedGet(get(`?ids=${U(1)}`), read, () => false);
  assert.equal(slow.status, 429);
  assert.equal(slow.headers.get("cache-control"), "no-store");
  assert.equal(reads, 0);
});

/* ------------------------------------------------------------------ */
/* The store                                                           */
/* ------------------------------------------------------------------ */

function fakeStore(answer: (ids: string[]) => string[] | null | Promise<string[] | null>) {
  let t = 1_000;
  const timers: (() => void)[] = [];
  const calls: string[][] = [];
  const store = createVerifiedStore({
    fetchBatch: async (ids) => {
      calls.push(ids);
      return answer(ids);
    },
    now: () => t,
    schedule: (run) => void timers.push(run),
  });
  const run = async () => {
    while (timers.length) timers.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { store, calls, run, advance: (ms: number) => (t += ms), timers };
}

test("store: ids asked together are read together, sorted, in batches of 50", async () => {
  const f = fakeStore((ids) => ids.filter((id) => id === U(2) || id === U(70)));
  let heard = 0;
  f.store.subscribe(() => heard++);
  f.store.want(U(3));
  f.store.want(U(2));
  f.store.want(U(2));
  f.store.want("nope");
  for (let i = 4; i <= 80; i++) f.store.want(U(i));
  assert.equal(f.store.get(U(2)), false, "false until it knows");
  assert.equal(f.timers.length, 1, "one read scheduled for all of them");
  await f.run();
  assert.deepEqual(f.calls.map((c) => c.length), [50, 29]);
  assert.equal(f.calls[0][0], U(2));
  assert.equal(f.store.get(U(2)), true);
  assert.equal(f.store.get(U(70)), true);
  assert.equal(f.store.get(U(3)), false);
  assert.equal(f.store.get("nope"), false);
  assert.equal(heard, 2, "listeners hear each batch");
});

test("store: an answer is kept a minute, then read again", async () => {
  let ticked = [U(1)];
  const f = fakeStore(() => ticked);
  f.store.want(U(1));
  await f.run();
  assert.equal(f.store.get(U(1)), true);
  f.advance(59_000);
  f.store.want(U(1));
  await f.run();
  assert.equal(f.calls.length, 1, "fresh: not read again");
  f.advance(2_000);
  ticked = [];
  f.store.want(U(1));
  await f.run();
  assert.equal(f.calls.length, 2, "a minute on: read again");
  assert.equal(f.store.get(U(1)), false, "the link ended: the tick goes");
});

test("store: a failed read keeps what was known and tries again after 30 s", async () => {
  let fail = false;
  const f = fakeStore(() => (fail ? null : [U(1)]));
  f.store.want(U(1));
  await f.run();
  f.advance(61_000);
  fail = true;
  f.store.want(U(1));
  f.store.want(U(5));
  await f.run();
  assert.equal(f.store.get(U(1)), true, "still what it was");
  assert.equal(f.store.get(U(5)), false);
  f.advance(10_000);
  f.store.want(U(5));
  await f.run();
  assert.equal(f.calls.length, 2, "not again within 30 s");
  f.advance(21_000);
  fail = false;
  f.store.want(U(5));
  await f.run();
  assert.equal(f.calls.length, 3, "then again");
});

test("store: a fetch that throws counts as a failed read", async () => {
  const f = fakeStore(() => Promise.reject(new Error("offline")));
  f.store.want(U(1));
  await f.run();
  assert.equal(f.store.get(U(1)), false);
});

/* ------------------------------------------------------------------ */
/* The profile                                                         */
/* ------------------------------------------------------------------ */

test("profile: the tick and its halves, null before the database has it", () => {
  const before = toProfile({ id: "u", name: "A" });
  assert.deepEqual([before?.verified, before?.phone_proven, before?.email_proven], [null, false, false]);
  const p = toProfile({ id: "u", name: "A", verified: true, phone_proven: true, email_proven: true });
  assert.deepEqual([p?.verified, p?.phone_proven, p?.email_proven], [true, true, true]);
  const q = toProfile({ id: "u", name: "A", verified: "yes", phone_proven: 1, email_proven: "true" });
  assert.deepEqual([q?.verified, q?.phone_proven, q?.email_proven], [null, false, false], "only real booleans");
});

/* ------------------------------------------------------------------ */
/* Where the card, the owner's line and the phone ask show             */
/* ------------------------------------------------------------------ */

const phoneUser = (o: Partial<TickUser> = {}): TickUser => ({
  verified: false,
  phoneProven: false,
  emailProven: false,
  phone: "+919000000001",
  phoneConfirmed: true,
  phoneSettable: false,
  googleLinkable: true,
  ...o,
});
const googleUser = (o: Partial<TickUser> = {}): TickUser => ({
  verified: false,
  phoneProven: false,
  emailProven: true,
  phoneConfirmed: false,
  phoneSettable: true,
  googleLinkable: false,
  ...o,
});

test("card: a phone sign-in adds Google; its number counts as done at once", () => {
  assert.deepEqual(tickSteps(phoneUser(), "phone"), { phone: "done", email: "add", action: "email", typedEmail: false },
    "the first load before the server recorded the phone check");
  assert.deepEqual(tickSteps(phoneUser({ phoneProven: true, contactEmail: "a@b.co" }), "phone"), { phone: "done", email: "add", action: "email", typedEmail: true });
  assert.equal(tickSteps(phoneUser({ googleLinkable: false }), "phone"), null, "an old-app row with an email it can't change: nothing to do here");
  assert.equal(tickSteps(phoneUser({ phoneConfirmed: false }), "phone"), null, "a number that doesn't open it can't be proved from here");
});

test("card: a Google sign-in adds or confirms its number", () => {
  assert.deepEqual(tickSteps(googleUser(), "google"), { phone: "add", email: "done", action: "phone", typedEmail: false });
  assert.deepEqual(tickSteps(googleUser({ phone: "+919000000002", phoneConfirmed: true }), "google"), { phone: "confirm", email: "done", action: "phone", typedEmail: false },
    "a number that opens it but was never proved: Confirm");
  assert.equal(tickSteps(googleUser({ emailProven: false }), "google"), null, "the email can't be proved from here: adding a number wouldn't give the tick");
  assert.equal(tickSteps(googleUser({ phoneSettable: false }), "google"), null, "a phone account reached through its Google link keeps its number");
  assert.equal(tickSteps(phoneUser(), "google"), null, "a Google sign-in on a phone account: Google can't be added from it");
});

test("card: nothing with the tick, before the database has it, or signed out", () => {
  assert.equal(tickSteps(phoneUser({ verified: true }), "phone"), null);
  assert.equal(tickSteps(phoneUser({ verified: null }), "phone"), null);
  assert.equal(tickSteps(phoneUser({ verified: undefined }), "phone"), null);
  assert.equal(tickSteps(phoneUser(), null), null);
  assert.equal(tickSteps(null, "phone"), null);
  assert.equal(tickSteps(googleUser({ phoneProven: true }), "google"), null, "both proved but no tick yet: nothing to ask");
});

test("owner's line: where each step is done", () => {
  assert.equal(tickStepHref("phone"), "/dashboard?tab=profile&add=phone-step", "not add=phone, the way back from Google that skips the freshness check");
  assert.equal(tickStepHref("email"), "/dashboard?tab=profile#verify");
});

test("phone ask: only within 5 minutes of the Google sign-in, for a Google account missing its number", () => {
  assert.equal(phoneAskFits(googleUser(), "google", 30), true);
  assert.equal(phoneAskFits(googleUser(), "google", 299), true);
  assert.equal(phoneAskFits(googleUser(), "google", 300), false, "the form would need another trip to Google");
  assert.equal(phoneAskFits(googleUser(), "google", null), false, "can't tell");
  assert.equal(phoneAskFits(googleUser(), "google", -30), true, "a clock a little behind");
  assert.equal(phoneAskFits(googleUser(), "google", -600), false);
  assert.equal(phoneAskFits(googleUser({ emailProven: false }), "google", 30), false);
  assert.equal(phoneAskFits(phoneUser(), "phone", 30), false, "a phone sign-in gets the email ask instead");
  assert.equal(phoneAskFresh(10), true);
});

test("phone ask: put off once comes back once a week later, then never; done is never", () => {
  const day = 86_400_000;
  let a: AskedRecord | undefined;
  assert.equal(askWaits(a, 0), false, "never asked");
  a = askAnswered(a, "later", 0);
  assert.deepEqual(a, { later: 0, times: 1 });
  assert.equal(askWaits(a, 6 * day), true, "within the week");
  assert.equal(askWaits(a, 7 * day), false, "a week on: once more");
  a = askAnswered(a, "later", 7 * day);
  assert.deepEqual(a, { later: 7 * day, times: 2 });
  assert.equal(askWaits(a, 100 * day), true, "twice: never again");
  assert.equal(askWaits(askAnswered(undefined, "done", 0), 100 * day), true, "the main button: never again");
  assert.equal(askAnswered({ later: 0, times: 1 }, "done", 5), "done");
});

test("phone ask: stored answers are read defensively", () => {
  assert.deepEqual(readAskedRecords(JSON.stringify({ a: "done", b: { later: 5, times: 1 }, c: { later: "x" }, d: 7 })), { a: "done", b: { later: 5, times: 1 } });
  assert.deepEqual(readAskedRecords("not json"), {});
  assert.deepEqual(readAskedRecords("[1]"), {});
  assert.deepEqual(readAskedRecords(null), {});
});
