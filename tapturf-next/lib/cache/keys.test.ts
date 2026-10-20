import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IGNORE_COLUMNS, LIST_COLUMNS, MAX_KEYS, keysForRow, planPurge } from "./keys";

const sorted = (a: string[]) => [...a].sort();

const row = (over: Record<string, unknown> = {}) => ({
  id: "0a1b2c3d-1111-4222-8333-444455556666",
  slug: "turf-up-hinjewadi",
  name: "Turf Up",
  city: "pune",
  is_active: true,
  description: "Two grounds",
  sports: ["Football", "Box Cricket"],
  listing_review: { ok: true },
  updated_at: "2026-10-20T00:00:00Z",
  ...over,
});

test("planPurge sorts keys and collapses duplicates", () => {
  const p = planPurge(["list:pune", "list:pune", "turf:turf-up-hinjewadi", "games", "list:all", "turf:0a1b2c3d-1111-4222-8333-444455556666"]);
  assert.deepEqual(sorted(p.cities), ["all", "pune"]);
  assert.deepEqual(sorted(p.turfs), ["0a1b2c3d-1111-4222-8333-444455556666", "turf-up-hinjewadi"]);
  assert.equal(p.games, true);
  assert.deepEqual(p.rejected, []);
});

test("planPurge rejects anything that is not a known key shape", () => {
  const bad = ["list:", "list:Pune", "list:p", "turf:../admin", "turf:Turf-Up", "turf:", `turf:${"a".repeat(121)}`, "games:x", "page:/", 42, null];
  const p = planPurge(bad);
  assert.deepEqual(p.cities, []);
  assert.deepEqual(p.turfs, []);
  assert.equal(p.games, false);
  assert.equal(p.rejected.length, bad.length);
});

test("MAX_KEYS matches the flush's batch size", () => {
  assert.equal(MAX_KEYS, 1000);
  assert.match(sql(), /limit 1000/);
});

test("an update of only ignored columns queues nothing", () => {
  const old = row();
  const rec = row({ listing_review: { ok: false }, listing_checked_at: "now", updated_at: "later", data_verified_at: "now" });
  assert.deepEqual(keysForRow("turfs", "UPDATE", rec, old), []);
});

test("jsonb arrays compare by value, so an unchanged array is no change", () => {
  assert.deepEqual(keysForRow("turfs", "UPDATE", row({ sports: ["Football", "Box Cricket"] }), row()), []);
});

test("a detail column queues only the turf page", () => {
  assert.deepEqual(keysForRow("turfs", "UPDATE", row({ description: "Three grounds" }), row()), ["turf:turf-up-hinjewadi"]);
  // A column the lists do not know about (added later) is detail, never ignored.
  assert.deepEqual(keysForRow("turfs", "UPDATE", row({ brand_new_column: 1 }), row()), ["turf:turf-up-hinjewadi"]);
});

test("a list column queues the city lists and the page", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "UPDATE", row({ name: "Turf Up 2" }), row())), ["list:pune", "turf:turf-up-hinjewadi"]);
});

test("a list column on a turf that stays inactive queues only its page", () => {
  const old = row({ is_active: false });
  assert.deepEqual(keysForRow("turfs", "UPDATE", row({ is_active: false, name: "X" }), old), ["turf:turf-up-hinjewadi"]);
});

test("deactivating queues the lists it leaves", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "UPDATE", row({ is_active: false }), row())), ["list:pune", "turf:turf-up-hinjewadi"]);
});

test("a city move queues both cities", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "UPDATE", row({ city: "mumbai" }), row())), ["list:mumbai", "list:pune", "turf:turf-up-hinjewadi"]);
});

test("a slug change queues the old page, the new page and the /turf/<id> redirect", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "UPDATE", row({ slug: "turf-up-wakad" }), row())), [
    "list:pune",
    "turf:0a1b2c3d-1111-4222-8333-444455556666",
    "turf:turf-up-hinjewadi",
    "turf:turf-up-wakad",
  ]);
});

test("an active insert queues the lists and its page (a cached 404 for a re-imported slug)", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "INSERT", row(), null)), ["list:pune", "turf:turf-up-hinjewadi"]);
  assert.deepEqual(keysForRow("turfs", "INSERT", row({ slug: null }), null), ["list:pune", "turf:0a1b2c3d-1111-4222-8333-444455556666"]);
  assert.deepEqual(keysForRow("turfs", "INSERT", row({ is_active: false }), null), []);
});

test("a delete queues the lists, the page and the redirect", () => {
  assert.deepEqual(sorted(keysForRow("turfs", "DELETE", null, row())), ["list:pune", "turf:0a1b2c3d-1111-4222-8333-444455556666", "turf:turf-up-hinjewadi"]);
});

test("a turf without a usable city still refreshes the all-India lists", () => {
  assert.deepEqual(keysForRow("turfs", "INSERT", row({ city: null }), null), ["list:all", "turf:turf-up-hinjewadi"]);
  assert.deepEqual(keysForRow("turfs", "INSERT", row({ city: "Pune City" }), null), ["list:all", "turf:turf-up-hinjewadi"]);
});

test("a trending row queues its city and the turf (by id in the legacy payload)", () => {
  const pick = { city: "pune", turf_id: "0a1b2c3d-1111-4222-8333-444455556666" };
  assert.deepEqual(sorted(keysForRow("trending_turfs", "INSERT", pick, null)), ["list:pune", "turf:0a1b2c3d-1111-4222-8333-444455556666"]);
});

test("every key the legacy rules produce passes the batch parser", () => {
  const keys = [
    ...keysForRow("turfs", "UPDATE", row({ slug: "turf-up-wakad", city: "mumbai" }), row()),
    ...keysForRow("turfs", "INSERT", row({ city: null }), null),
  ];
  assert.deepEqual(planPurge(keys).rejected, []);
});

// The trigger in SQL and these lists must agree, and the list class must
// cover every column the list pages select.

function sql(): string {
  const dir = join(process.cwd(), "supabase", "migrations");
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && readFileSync(join(dir, f), "utf8").includes("function private.mark_turf_dirty()"))
    .sort()
    .at(-1);
  assert.ok(latest, "no migration defines private.mark_turf_dirty()");
  return readFileSync(join(dir, latest), "utf8");
}

function sqlArray(name: string): string[] {
  const m = sql().match(new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`));
  assert.ok(m, `${name} not found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function cardColumns(): string[] {
  const src = readFileSync(join(process.cwd(), "lib", "queries", "turfs.ts"), "utf8");
  const m = src.match(/const CARD_COLUMNS = \[([\s\S]*?)\]\.join/);
  assert.ok(m, "CARD_COLUMNS not found in lib/queries/turfs.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

test("IGNORE_COLUMNS matches the trigger's v_ignore", () => {
  assert.deepEqual(sorted(sqlArray("v_ignore")), sorted([...IGNORE_COLUMNS]));
});

test("LIST_COLUMNS matches the trigger's v_list", () => {
  assert.deepEqual(sorted(sqlArray("v_list")), sorted([...LIST_COLUMNS]));
});

test("LIST_COLUMNS is CARD_COLUMNS plus is_active, city and slug", () => {
  assert.deepEqual(sorted([...LIST_COLUMNS]), sorted([...new Set([...cardColumns(), "is_active", "city", "slug"])]));
});

test("no column is both ignored and listed", () => {
  assert.deepEqual(IGNORE_COLUMNS.filter((c) => LIST_COLUMNS.includes(c)), []);
});
