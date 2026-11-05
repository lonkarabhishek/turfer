import { test } from "node:test";
import assert from "node:assert/strict";
import { BAD_HEADERS, FAILED_HEADERS, OK_HEADERS, availabilityResponse, type Reader } from "./route";

const ID = "cccccccc-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-11-05T13:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const reads: string[] = [];
const reader = (answer: Awaited<ReturnType<Reader>> | (() => never)): Reader => async (id) => {
  reads.push(id);
  if (typeof answer === "function") return answer();
  return answer;
};
const fresh = { fresh: true, updated_at: iso(NOW - 3_600_000), now: iso(NOW), booked: ["2026-11-05T19:00"] };

test("not a turf id: 404; a query string: 400; neither reads the database; both kept a day", async () => {
  reads.length = 0;
  for (const id of ["nope", "../x", `${ID}x`, ""]) {
    const r = await availabilityResponse(id, "", reader({ data: fresh, error: null }), NOW);
    assert.deepEqual([r.status, r.body, r.headers], [404, '{"error":"not_found"}', BAD_HEADERS]);
  }
  for (const q of ["?x=1", "?", "?fresh=1"]) {
    const r = await availabilityResponse(ID, q === "?" ? "?" : q, reader({ data: fresh, error: null }), NOW);
    assert.deepEqual([r.status, r.body, r.headers], [400, '{"error":"bad_request"}', BAD_HEADERS]);
  }
  assert.equal(reads.length, 0);
  assert.equal(BAD_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=86400");
});

test("fresh: 200 with the database's own shape, kept a minute and served stale a minute more", async () => {
  const r = await availabilityResponse(ID, "", reader({ data: fresh, error: null }), NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), fresh);
  assert.deepEqual(r.headers, OK_HEADERS);
  assert.equal(OK_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
  const none = await availabilityResponse(ID, "", reader({ data: { fresh: false }, error: null }), NOW);
  assert.deepEqual([none.status, none.body, none.headers], [200, '{"fresh":false}', OK_HEADERS]);
});

test("before the migration: nothing to show, as for any turf; a failed read: nothing, kept 15 s, never 503", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const r = await availabilityResponse(ID, "", reader({ data: null, error: { code, message: "Could not find the function" } }), NOW);
    assert.deepEqual([r.status, r.body, r.headers, r.failed], [200, '{"fresh":false}', OK_HEADERS, undefined]);
  }
  const other = await availabilityResponse(ID, "", reader({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }), NOW);
  assert.deepEqual([other.status, other.body, other.headers], [200, '{"fresh":false}', FAILED_HEADERS]);
  assert.match(other.failed ?? "", /57014/);
  const thrown = await availabilityResponse(ID, "", reader(() => { throw new Error("fetch failed"); }), NOW);
  assert.deepEqual([thrown.status, thrown.body, thrown.headers, thrown.failed], [200, '{"fresh":false}', FAILED_HEADERS, "fetch failed"]);
  assert.equal(FAILED_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=15");
});

test("a stale answer is no answer; malformed keys are left out", async () => {
  const stale = await availabilityResponse(ID, "", reader({ data: { ...fresh, updated_at: iso(NOW - 25 * 3_600_000) }, error: null }), NOW);
  assert.equal(stale.body, '{"fresh":false}');
  const junk = await availabilityResponse(ID, "", reader({ data: { ...fresh, booked: ["2026-11-05T19:00", "2026-11-05T24:00", "<b>", 7] }, error: null }), NOW);
  assert.deepEqual(JSON.parse(junk.body).booked, ["2026-11-05T19:00"]);
  const odd = await availabilityResponse(ID, "", reader({ data: "<html>", error: null }), NOW);
  assert.equal(odd.body, '{"fresh":false}');
});

test("every answer is noindex JSON", async () => {
  for (const h of [OK_HEADERS, FAILED_HEADERS, BAD_HEADERS]) {
    assert.equal(h["X-Robots-Tag"], "noindex");
    assert.equal(h["Content-Type"], "application/json; charset=utf-8");
  }
});
