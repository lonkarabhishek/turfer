import { test } from "node:test";
import assert from "node:assert/strict";
import { BAD_HEADERS, FAILED_HEADERS, OK_HEADERS, availabilityPath, availabilityResponse, type Reader } from "./route";

const ID = "cccccccc-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-11-05T13:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const reads: string[] = [];
const reader = (answer: Awaited<ReturnType<Reader>> | (() => never)): Reader => async (id) => {
  reads.push(id);
  if (typeof answer === "function") return answer();
  return answer;
};
/** As the handler calls it: the decoded param, and the request URL's own path and query. */
const get = (id: string, search: string, read: Reader, path: string = availabilityPath(id)) => availabilityResponse({ id, pathname: path, search }, read, NOW);
const fresh = { fresh: true, updated_at: iso(NOW - 3_600_000), now: iso(NOW), booked: ["2026-11-05T19:00"] };

test("not a turf id: 404; a query string: 400; neither reads the database; both kept a day", async () => {
  reads.length = 0;
  for (const id of ["nope", "../x", `${ID}x`, ""]) {
    const r = await get(id, "", reader({ data: fresh, error: null }));
    assert.deepEqual([r.status, r.body, r.headers], [404, '{"error":"not_found"}', BAD_HEADERS]);
  }
  for (const q of ["?x=1", "?", "?fresh=1"]) {
    const r = await get(ID, q === "?" ? "?" : q, reader({ data: fresh, error: null }));
    assert.deepEqual([r.status, r.body, r.headers], [400, '{"error":"bad_request"}', BAD_HEADERS]);
  }
  assert.equal(reads.length, 0);
  assert.equal(BAD_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=86400");
});

test("one URL per turf: capital letters or percent-escapes in the path are 404 without a database read", async () => {
  reads.length = 0;
  assert.equal(availabilityPath(ID), `/api/availability/${ID}`);
  const upper = ID.toUpperCase();
  const mixed = `cCcC${ID.slice(4)}`;
  // Next hands the route its param decoded: "%63" arrives as "c", the URL keeps "%63".
  const escaped = `/api/availability/%63${ID.slice(1)}`;
  for (const [id, path] of [[upper, `/api/availability/${upper}`], [mixed, `/api/availability/${mixed}`], [ID, escaped], [ID, `/api/availability/${ID}/`], [ID, `/api/x/${ID}`]]) {
    const r = await get(id, "", reader({ data: fresh, error: null }), path);
    assert.deepEqual([r.status, r.body, r.headers], [404, '{"error":"not_found"}', BAD_HEADERS], path);
  }
  assert.equal(reads.length, 0);
  const ok = await get(ID, "", reader({ data: fresh, error: null }));
  assert.equal(ok.status, 200);
  assert.deepEqual(reads, [ID]);
});

test("fresh: 200 with the database's own shape, kept a minute and served stale a minute more", async () => {
  const r = await get(ID, "", reader({ data: fresh, error: null }));
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), { ...fresh, requests: false });
  assert.deepEqual(r.headers, OK_HEADERS);
  assert.equal(OK_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=60, stale-while-revalidate=60");
  const none = await get(ID, "", reader({ data: { fresh: false }, error: null }));
  assert.deepEqual([none.status, none.body, none.headers], [200, '{"fresh":false}', OK_HEADERS]);
});

test("before the migration: nothing to show, as for any turf; a failed read: nothing, kept 15 s, never 503", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const r = await get(ID, "", reader({ data: null, error: { code, message: "Could not find the function" } }));
    assert.deepEqual([r.status, r.body, r.headers, r.failed], [200, '{"fresh":false}', OK_HEADERS, undefined]);
  }
  const other = await get(ID, "", reader({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }));
  assert.deepEqual([other.status, other.body, other.headers], [200, '{"fresh":false}', FAILED_HEADERS]);
  assert.match(other.failed ?? "", /57014/);
  const thrown = await get(ID, "", reader(() => { throw new Error("fetch failed"); }));
  assert.deepEqual([thrown.status, thrown.body, thrown.headers, thrown.failed], [200, '{"fresh":false}', FAILED_HEADERS, "fetch failed"]);
  assert.equal(FAILED_HEADERS["Cache-Control"], "public, max-age=0, s-maxage=15");
});

test("a stale answer is no answer; malformed keys are left out", async () => {
  const stale = await get(ID, "", reader({ data: { ...fresh, updated_at: iso(NOW - 25 * 3_600_000) }, error: null }));
  assert.equal(stale.body, '{"fresh":false}');
  const junk = await get(ID, "", reader({ data: { ...fresh, booked: ["2026-11-05T19:00", "2026-11-05T24:00", "<b>", 7] }, error: null }));
  assert.deepEqual(JSON.parse(junk.body).booked, ["2026-11-05T19:00"]);
  const odd = await get(ID, "", reader({ data: "<html>", error: null }));
  assert.equal(odd.body, '{"fresh":false}');
});

test("every answer is noindex JSON", async () => {
  for (const h of [OK_HEADERS, FAILED_HEADERS, BAD_HEADERS]) {
    assert.equal(h["X-Robots-Tag"], "noindex");
    assert.equal(h["Content-Type"], "application/json; charset=utf-8");
  }
});

/** As the handler calls it, with the booking requests flag read alongside. */
const withFlag = (read: Reader, flag: Reader) => availabilityResponse({ id: ID, pathname: availabilityPath(ID), search: "" }, read, NOW, flag);

test("booking requests: requests true only on a fresh body whose flag read says a plain true; both reads run together", async () => {
  const order: string[] = [];
  const slow = (answer: Awaited<ReturnType<Reader>>, name: string, ms: number): Reader => async () => {
    order.push(`${name}:start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name}:end`);
    return answer;
  };
  const yes = await withFlag(slow({ data: fresh, error: null }, "slots", 20), slow({ data: true, error: null }, "flag", 5));
  assert.deepEqual(JSON.parse(yes.body), { ...fresh, requests: true });
  assert.deepEqual(order.slice(0, 2), ["slots:start", "flag:start"], "in parallel");
  assert.deepEqual(yes.headers, OK_HEADERS, "cached as before");
  for (const data of [false, null, "true", 1, { requests: true }]) {
    const r = await withFlag(reader({ data: fresh, error: null }), reader({ data, error: null }));
    assert.equal(JSON.parse(r.body).requests, false, JSON.stringify(data));
  }
  // A turf with nothing fresh shows no card at all, whatever the flag says.
  const stale = await withFlag(reader({ data: { fresh: false }, error: null }), reader({ data: true, error: null }));
  assert.equal(stale.body, '{"fresh":false}');
  // The database's own answer can't turn it on: only the flag read can.
  const sneaky = await withFlag(reader({ data: { ...fresh, requests: true }, error: null }), reader({ data: false, error: null }));
  assert.equal(JSON.parse(sneaky.body).requests, false);
});

test("booking requests: before the migration, on an error or a throw, requests false and never a failed body", async () => {
  for (const flag of [
    reader({ data: null, error: { code: "PGRST202", message: "Could not find the function public.turf_takes_requests" } }),
    reader({ data: true, error: { code: "57014", message: "statement timeout" } }),
    reader(() => {
      throw new Error("fetch failed");
    }),
  ]) {
    const r = await withFlag(reader({ data: fresh, error: null }), flag);
    assert.deepEqual([r.status, r.headers, r.failed, JSON.parse(r.body)], [200, OK_HEADERS, undefined, { ...fresh, requests: false }]);
  }
});

// ── GET /api/availability/free/<city or india> ──
import { ALL_INDIA, freePath, freeResponse } from "./route";
import type { FreeAnswer } from "./free";

const FREE_NOW = Date.parse("2026-11-10T11:00:00Z");
const freeRow = (i: number, city: string) => ({
  id: `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`, slug: `t${i}`, name: `Turf ${i}`, area: "Made-up Layout", city, lat: 12.9, lng: 77.6,
  updatedAt: new Date(FREE_NOW - 3_600_000).toISOString(), requests: i === 1, booked: [], bookedUntil: FREE_NOW + 36 * 3_600_000,
  hours: { opening_hours: null, start_time: "06:00:00", end_time: "23:00:00", is_24x7: false, closed_days: null },
});
const freeRead = (rows = [freeRow(1, "bangalore"), freeRow(2, "pune")]) => {
  const calls: number[] = [];
  return { calls, read: async (): Promise<FreeAnswer> => (calls.push(1), { now: new Date(FREE_NOW).toISOString(), rows }) };
};
const getFree = (scope: string, search: string, read: () => Promise<FreeAnswer>, path = `/api/availability/free/${scope}`) => freeResponse({ scope, pathname: path, search }, read, FREE_NOW);

test("free: one URL per city (or india); anything else 404, a query string 400, neither reads, both kept a day", async () => {
  assert.equal(freePath("bangalore"), "/api/availability/free/bangalore");
  assert.equal(freePath(null), `/api/availability/free/${ALL_INDIA}`);
  const r = freeRead();
  for (const [scope, path] of [["Bangalore", "/api/availability/free/Bangalore"], ["b", "/api/availability/free/b"], ["bangalore", "/api/availability/free/%62angalore"], ["bangalore", "/api/availability/free/bangalore/"]]) {
    const out = await getFree(scope, "", r.read, path);
    assert.deepEqual([out.status, out.headers], [404, BAD_HEADERS], path);
  }
  for (const q of ["?x=1", "?", "?hours=192"]) {
    const out = await getFree("bangalore", q, r.read);
    assert.deepEqual([out.status, out.body, out.headers], [400, '{"error":"bad_request"}', BAD_HEADERS]);
  }
  assert.equal(r.calls.length, 0);
});

test("free: a city's turfs with their next free times, kept a minute; india: all; a city with none: an empty list", async () => {
  const r = freeRead();
  const blr = await getFree("bangalore", "", r.read);
  assert.deepEqual([blr.status, blr.headers], [200, OK_HEADERS]);
  const body = JSON.parse(blr.body);
  assert.equal(body.now, new Date(FREE_NOW).toISOString());
  assert.deepEqual(body.turfs.map((t: { name: string }) => t.name), ["Turf 1"]);
  assert.equal(body.turfs[0].requests, true);
  assert.equal(body.turfs[0].days[0].keys[0], "2026-11-10T17:00", "4:30 PM in India: 5 PM first");
  assert.deepEqual(Object.keys(body.turfs[0]).sort(), ["area", "city", "days", "id", "lat", "lng", "name", "requests", "slug", "updatedAt"]);
  assert.deepEqual(JSON.parse((await getFree(ALL_INDIA, "", r.read)).body).turfs.map((t: { name: string }) => t.name), ["Turf 1", "Turf 2"]);
  assert.deepEqual(JSON.parse((await getFree("nashik", "", r.read)).body).turfs, []);
});

test("free: a failed read is 503, kept 15 s, never an empty list", async () => {
  const out = await getFree("bangalore", "", async () => {
    throw new Error("down");
  });
  assert.deepEqual([out.status, out.body, out.headers, out.failed], [503, '{"error":"unavailable"}', FAILED_HEADERS, "down"]);
});
