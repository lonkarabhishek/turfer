// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFormat, toAdminTournament, tournamentTotals } from "./tournaments";

const NOW = Date.parse("2026-11-02T10:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  code: "abcdefghijkl",
  name: " Sunday League ",
  format: "league",
  status: "on",
  playoffs: "semis",
  teams: 5,
  fixtures: 13,
  played: 4,
  live_now: 1,
  views: "12",
  viewers: 30,
  organiser_id: "11111111-1111-4111-8111-111111111111",
  organiser_name: "Asha Rao",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-02T09:00:00Z",
  ...over,
});

test("a row in the admin's words", () => {
  const t = toAdminTournament(row());
  assert.equal(t.name, "Sunday League");
  assert.equal(t.format, "League + semi-finals");
  assert.equal(t.views, 12, "a count that came as text");
  assert.equal(t.viewers, 12, "never more viewers than views");
  assert.deepEqual(t.organiser, { id: "11111111-1111-4111-8111-111111111111", name: "Asha Rao" });
  assert.equal(toAdminTournament(row({ organiser_id: null })).organiser, null, "made signed out");
  assert.equal(toAdminTournament(row({ teams: -3, played: "x" })).teams, 0);
  assert.equal(toAdminTournament(row({ status: "removed" })).status, "removed");
});

test("formats", () => {
  assert.equal(adminFormat("bilateral", "none"), "Bilateral series");
  assert.equal(adminFormat("tri", "final"), "Tri-series + final");
  assert.equal(adminFormat("league", null), "League");
});

test("the home line's totals", () => {
  const list = [row(), row({ code: "b", created_at: "2026-10-01T10:00:00Z", live_now: 2, status: "removed", organiser_id: null, views: 3, viewers: 1 }), row({ code: "c", live_now: 0 })].map(toAdminTournament);
  assert.deepEqual(tournamentTotals(list, NOW), { total: 3, last7: 2, liveNow: 1, views: 27, viewers: 25, signedIn: 2 });
  assert.deepEqual(tournamentTotals([], NOW), { total: 0, last7: 0, liveNow: 0, views: 0, viewers: 0, signedIn: 0 });
});
