import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "@/types/turf";
import { NO_MANAGERS } from "./managers";
import { OWNER_PRICE_STALE_DAYS, istDate, managedByLead, ownerPriceNote, ownerPriceSetOn, ownerPriceText } from "./owner";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;

/** A turf with the owner's own prices, set at `at`. */
const owned = (at: string | null | undefined, extra: Partial<Turf> = {}) =>
  ({ morning_price: 800, evening_price: 1100, price_owner_confirmed: true, price_verified_at: at, ...extra }) as unknown as Turf;

test("owner: the day in India, whatever the machine's zone", () => {
  assert.equal(istDate("2026-10-21T09:15:00.123456+00:00", NOW), "21 Oct 2026", "Postgres microseconds");
  // IST is UTC+5:30: 18:29:59 UTC is still the 21st there, 18:30 is the 22nd.
  assert.equal(istDate("2026-10-21T18:29:59+00:00", NOW), "21 Oct 2026");
  assert.equal(istDate("2026-10-21T18:30:00+00:00", NOW), "22 Oct 2026");
  assert.equal(istDate("2026-10-21T00:10:00+05:30", NOW), "21 Oct 2026", "just after midnight in India");
  assert.equal(istDate("2026-10-20T23:50:00+05:30", NOW), "20 Oct 2026", "just before it");
  assert.equal(istDate("2025-12-31T18:30:00Z", NOW), "1 Jan 2026", "the year turns in India first");
  assert.equal(istDate("2026-03-03T06:00:00Z", NOW), "3 Mar 2026", "no leading zero");
});

test("owner: no date for missing, unreadable or future times", () => {
  for (const bad of [null, undefined, "", "  ", "garbage", "2026-13-45T00:00:00Z"]) assert.equal(istDate(bad, NOW), null, String(bad));
  assert.equal(istDate(new Date(NOW + DAY + 1000).toISOString(), NOW), null, "more than a day ahead");
  assert.equal(istDate(new Date(NOW + DAY - 1000).toISOString(), NOW), "29 Oct 2026", "a clock a little ahead still reads");
});

test("owner: the price note only for a claimed turf with the owner's own prices", () => {
  assert.equal(ownerPriceNote(owned("2026-10-21T09:15:00Z"), false, NOW), null, "unclaimed (a claim that ended)");
  assert.equal(ownerPriceNote(owned("2026-10-21T09:15:00Z", { price_owner_confirmed: false }), true, NOW), null, "not the owner's prices");
  assert.equal(ownerPriceNote(owned("2026-10-21T09:15:00Z", { price_owner_confirmed: null }), true, NOW), null);
  assert.equal(ownerPriceNote(owned("2026-10-21T09:15:00Z", { morning_price: null, evening_price: 0 }), true, NOW), null, "no real price left");
  assert.deepEqual(ownerPriceNote(owned("2026-10-21T09:15:00Z"), true, NOW), { date: "21 Oct 2026", stale: false });
  assert.deepEqual(ownerPriceNote(owned(null), true, NOW), { date: null, stale: false }, "no date: still the owner's prices");
  assert.deepEqual(ownerPriceNote(owned("garbage"), true, NOW), { date: null, stale: false });
  assert.deepEqual(ownerPriceNote(owned(new Date(NOW + 3 * DAY).toISOString()), true, NOW), { date: null, stale: false }, "a future date is not shown");
});

test("owner: prices older than six months read 'last set'", () => {
  const at = (days: number) => new Date(NOW - days * DAY).toISOString();
  assert.equal(ownerPriceNote(owned(at(OWNER_PRICE_STALE_DAYS)), true, NOW)?.stale, false, "exactly 183 days: not yet");
  assert.equal(ownerPriceNote(owned(new Date(NOW - OWNER_PRICE_STALE_DAYS * DAY - 1000).toISOString()), true, NOW)?.stale, true, "a moment past it");
  assert.equal(ownerPriceNote(owned(at(1)), true, NOW)?.stale, false);
  assert.equal(ownerPriceNote(owned(at(400)), true, NOW)?.stale, true);
});

test("owner: the price label's words", () => {
  const fresh = { date: "21 Oct 2026", stale: false };
  const old = { date: "3 Mar 2026", stale: true };
  const none = { date: null, stale: false };
  assert.equal(ownerPriceText(fresh, "long"), "From the owner, set on 21 Oct 2026");
  assert.equal(ownerPriceText(old, "long"), "From the owner, last set on 3 Mar 2026");
  assert.equal(ownerPriceText(none, "long"), "Prices from the owner");
  assert.equal(ownerPriceText(fresh, "short"), "From the owner · 21 Oct 2026");
  assert.equal(ownerPriceText(old, "short"), "From the owner · last set 3 Mar 2026");
  assert.equal(ownerPriceText(none, "short"), "Prices from the owner");
  assert.equal(ownerPriceSetOn(fresh), "Set on 21 Oct 2026");
  assert.equal(ownerPriceSetOn(old), "Last set on 3 Mar 2026");
  assert.equal(ownerPriceSetOn(none), null);
});

test("owner: who the line under the name leads with", () => {
  assert.equal(managedByLead(NO_MANAGERS), null, "nobody to name: the badge alone");
  assert.equal(managedByLead({ list: [], more: 3 }), null, "a count alone names nobody");
  assert.deepEqual(managedByLead({ list: [{ u: "turfking", v: true }], more: 0 }), { first: { u: "turfking", v: true }, more: 0 });
  assert.deepEqual(managedByLead({ list: [{ u: "asha_k", v: false }, { u: "ravi_turf", v: true }], more: 0 }), { first: { u: "asha_k", v: false }, more: 1 });
  // Three names shown and 2 more counted: "by @owner_one and 4 more".
  assert.equal(
    managedByLead({ list: [{ u: "owner_one", v: true }, { u: "manager_two", v: false }, { u: "staff_three", v: false }], more: 2 })?.more,
    4,
  );
});
