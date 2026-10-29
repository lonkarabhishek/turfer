import { test } from "node:test";
import assert from "node:assert/strict";
import { latestLinkSub, methodLabel, recordedLater, starterName, toAdminLiveLink } from "./live";

const ID = "AAAAAAAA-AAAA-4AAA-8AAA-000000000001";
const base = { code: "k7m2q9x4a1b3", status: "live", sport: "cricket", team_a: "Kothrud Kings", team_b: "Baner Blasters", title: "Sunday cup", venue: "Turf Park", events: 42, writes: 40, created_at: "2026-10-29T14:06:01.000Z", updated_at: "2026-10-29T15:00:00.000Z" };

test("a row of admin_live_links2 carries its starter; one of admin_live_links, or with none recorded, has none", () => {
  const withOne = toAdminLiveLink({ ...base, starter_id: ID, starter_name: " Asha Patil ", starter_username: "asha_p", starter_method: "google", started_at: "2026-10-29T14:06:01.500Z" });
  assert.deepEqual(withOne.starter, { id: ID.toLowerCase(), name: "Asha Patil", username: "asha_p", method: "google", at: "2026-10-29T14:06:01.500Z" });
  assert.deepEqual({ ...withOne, starter: null }, { ...base, starter: null }, "the link's own columns as they were");
  // The old read (before the migration) and a link with no row: "Not recorded", never a guess.
  for (const row of [base, { ...base, starter_id: null, starter_name: null, starter_username: null, starter_method: null, started_at: null }]) {
    const l = toAdminLiveLink(row);
    assert.equal(l.starter, null);
    assert.equal(starterName(l.starter), "Not recorded");
  }
  // Odd values read safely.
  const odd = toAdminLiveLink({ ...base, events: null, title: "", starter_id: ID, starter_name: null, starter_username: "Not A Username", starter_method: "email" });
  assert.deepEqual([odd.events, odd.title, odd.starter?.username, odd.starter?.method], [0, null, null, null]);
  assert.equal(toAdminLiveLink({ ...base, starter_id: "not-a-uuid", starter_name: "X" }).starter, null);
});

test("names and sign-in methods as the admin reads them", () => {
  assert.equal(starterName({ id: ID, name: "Asha Patil", username: "asha_p", method: "google", at: null }), "Asha Patil");
  assert.equal(starterName({ id: ID, name: null, username: "asha_p", method: "phone", at: null }), "@asha_p");
  assert.equal(starterName({ id: ID, name: null, username: null, method: "phone", at: null }), "No name on the account");
  assert.deepEqual([methodLabel("google"), methodLabel("phone"), methodLabel(null)], ["Google", "Phone", "Sign-in"]);
});

test("a starter recorded well after the link began says so (a later signed-in write)", () => {
  const at = (iso: string | null) => ({ created_at: base.created_at, starter: { id: ID, name: "A", username: null, method: "google" as const, at: iso } });
  assert.equal(recordedLater(at("2026-10-29T14:06:01.500Z")), false, "its first write");
  assert.equal(recordedLater(at("2026-10-29T14:15:00.000Z")), false);
  assert.equal(recordedLater(at("2026-10-30T09:00:00.000Z")), true);
  assert.equal(recordedLater(at(null)), false);
  assert.equal(recordedLater({ created_at: base.created_at, starter: null }), false);
});

test("the admin home's line under the latest link", () => {
  // base was last updated at 15:00; 20 minutes on it still takes updates.
  const soon = Date.parse("2026-10-29T15:20:00.000Z");
  const recorded = toAdminLiveLink({ ...base, starter_id: ID, starter_name: "Asha Patil", starter_username: "asha_p", starter_method: "google", started_at: base.created_at });
  assert.equal(latestLinkSub(recorded, "2 hr ago", soon), "Cricket · live now · started 2 hr ago · @asha_p · Google");
  const board = toAdminLiveLink({ ...base, sport: "table-tennis", status: "done", starter_id: ID, starter_name: "Ravi", starter_username: null, starter_method: "phone" });
  assert.equal(latestLinkSub(board, "1 day ago", soon), "Table tennis · finished · started 1 day ago · Phone");
  const older = toAdminLiveLink({ ...base, sport: null, status: "stopped" });
  assert.equal(latestLinkSub(older, "3 days ago", soon), "stopped · started 3 days ago");
  // No update for 2 hours: closed, as /admin/live and the live count have it, though the database still says live.
  const idle = Date.parse("2026-10-29T17:00:00.000Z");
  assert.equal(latestLinkSub(recorded, "3 hr ago", idle - 1), "Cricket · live now · started 3 hr ago · @asha_p · Google");
  assert.equal(latestLinkSub(recorded, "3 hr ago", idle), "Cricket · closed (idle) · started 3 hr ago · @asha_p · Google");
  assert.equal(latestLinkSub(board, "1 day ago", idle), "Table tennis · finished · started 1 day ago · Phone", "a finished one keeps its result");
  assert.equal(latestLinkSub(toAdminLiveLink({ ...base, updated_at: "" }), "3 hr ago", idle), "Cricket · live now · started 3 hr ago", "no update time: as stored");
});
