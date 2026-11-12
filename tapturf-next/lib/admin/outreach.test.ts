import { test } from "node:test";
import assert from "node:assert/strict";
import { byOf, claimLabel, noteOf, OUTREACH_STATUSES, outreachCity, outreachDays, outreachFoldLine, STATUS_LABEL, toOutreachList, toSaved } from "./outreach";
import { outreachList, outreachSet, type AdminRpc } from "./outreach.server";
import { callNumber, contactFieldsOf, contactLinks, whatsAppNumber } from "../utils/contact";
import { readReportToken, reportKey } from "../report/token";

// Made-up turfs and numbers only. The admin's Owner outreach section: the list, the numbers, the note.

const T = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;
const link = (id: string) => `https://www.tapturf.in/report/${id}`;
const row = (n: number, o: Record<string, unknown> = {}) => ({
  id: T(n), slug: `turf-${n}`, name: `Turf ${n}`, area: "Gachibowli", views: 0, calls: 0, whatsapp: 0, taps30: 0, views30: 0, claim: null,
  owner_phone: null, contact_phone: null, landline_phone: null, whatsapp_phone: null, status: "not_contacted", note: null, by: null, at: null, ...o,
});
const answer = (turfs: unknown[], o: Record<string, unknown> = {}) => ({ city: "hyderabad", days: 30, since: "2026-10-14", today: "2026-11-12", cities: [{ city: "pune", n: 300 }, { city: "hyderabad", n: 432 }], turfs, ...o });

test("what is asked for: a city slug (else hyderabad), 30 or 90 days", () => {
  assert.deepEqual(["pune", " Pune ", "navi-mumbai", "", null, "admin", "x y", "../etc", 7].map(outreachCity), ["pune", "pune", "navi-mumbai", "hyderabad", "hyderabad", "hyderabad", "hyderabad", "hyderabad", "hyderabad"]);
  assert.deepEqual([90, "90", 30, "30", 60, null, "x", 0].map(outreachDays), [90, 90, 30, 30, 30, 30, 30, 30]);
});

test("the words", () => {
  assert.deepEqual(OUTREACH_STATUSES.map((s) => STATUS_LABEL[s]), ["Not contacted", "Contacted", "Interested", "Not interested", "Wrong number"]);
  assert.deepEqual([claimLabel("active"), claimLabel("pending"), claimLabel(null)], ["Claimed", "Claim waiting", "Not claimed"]);
});

test("the list: most taps, then most views, then by name", () => {
  const l = toOutreachList(answer([row(1, { name: "beta" }), row(2, { name: "Alpha" }), row(3, { views: 9 }), row(4, { calls: 1, whatsapp: 1 }), row(5, { whatsapp: 3 }), row(6, { calls: 2, views: 50 })]), link);
  assert.deepEqual(l?.turfs.map((t) => t.id), [T(5), T(6), T(4), T(3), T(2), T(1)]);
  assert.deepEqual(l?.cities, [{ id: "hyderabad", label: "Hyderabad", n: 432 }, { id: "pune", label: "Pune", n: 300 }]);
  assert.deepEqual([l?.city, l?.days, l?.since, l?.today], ["hyderabad", 30, "2026-10-14", "2026-11-12"]);
  assert.equal(l?.turfs[0].path, "/turf/turf-5");
  assert.equal(toOutreachList(answer([row(1, { slug: null })]), link)?.turfs[0].path, `/turf/${T(1)}`);
});

test("the list: anything that isn't one is null; a row that isn't a turf is left out; a reserved word is no city", () => {
  for (const bad of [null, "x", [], {}, { city: "pune" }, { error: "forbidden" }]) assert.equal(toOutreachList(bad, link), null);
  const l = toOutreachList(answer([row(1), { id: "nope", name: "x" }, row(2, { name: " " }), null], { cities: [{ city: "admin", n: 9 }, { city: "Pune!", n: 1 }, { city: "nashik", n: "4" }, null], days: 7 }), link);
  assert.deepEqual(l?.turfs.map((t) => t.id), [T(1)]);
  assert.deepEqual(l?.cities, [{ id: "nashik", label: "Nashik", n: 0 }]);
  assert.equal(l?.days, 30);
});

test("the numbers are the page's own: exactly what its Call and WhatsApp buttons use", () => {
  const cases: Record<string, unknown>[] = [
    { owner_phone: "+91 98765 43210" },
    { owner_phone: "junk", contact_phone: "9876543211" },
    { landline_phone: "040 2300 0000" },
    { landline_phone: "040 2300 0000", whatsapp_phone: "9876543212" },
    { owner_phone: "9876543213", whatsapp_phone: "919876543214" },
    { whatsapp_phone: "9876543215" },
    { owner_phone: "12345", whatsapp_phone: "040 2300 0000" },
    {},
  ];
  const l = toOutreachList(answer(cases.map((c, i) => row(i + 1, { name: `T${i}`, ...c }))), link)!;
  cases.forEach((c, i) => {
    const t = l.turfs.find((x) => x.name === `T${i}`)!;
    // The turf page: getPhone and getWhatsAppPhone (callNumber, whatsAppNumber) into CTAButtons' contactLinks.
    const f = contactFieldsOf({ owner_phone: c.owner_phone, contact_info: c.contact_phone ? { phone: c.contact_phone } : null, landline_phone: c.landline_phone, whatsapp_phone: c.whatsapp_phone });
    const page = contactLinks(callNumber(f), whatsAppNumber(f));
    assert.equal(t.call?.e164 ?? null, page.call?.e164 ?? null, `call ${i}`);
    assert.equal(t.wa?.digits ?? null, page.whatsapp?.digits ?? null, `whatsapp ${i}`);
  });
  const by = (i: number) => l.turfs.find((x) => x.name === `T${i}`)!;
  assert.deepEqual(by(0).call, { e164: "+919876543210", local: "9876543210", landline: false });
  assert.deepEqual(by(0).wa, { digits: "919876543210", local: "9876543210" });
  assert.deepEqual([by(1).call?.local, by(2).call?.landline, by(2).wa], ["9876543211", true, null]);
  assert.deepEqual([by(3).call?.landline, by(3).wa?.local, by(4).call?.local, by(4).wa?.local], [true, "9876543212", "9876543213", "9876543214"]);
  assert.deepEqual([by(5).call, by(5).wa?.local, by(6).call, by(6).wa, by(7).call, by(7).wa], [null, "9876543215", null, null, null, null]);
});

test("the message uses the last 30 days whatever the window, and the turf's own report link", () => {
  const l = toOutreachList(answer([row(1, { name: "Kings Turf", calls: 40, whatsapp: 20, views: 900, taps30: 14, views30: 240 }), row(2, { taps30: 0, views30: 6 }), row(3), row(4, { claim: "active", taps30: 2 }), row(5, { claim: "pending", taps30: 2 })], { days: 90 }), link)!;
  const m = (n: number) => l.turfs.find((t) => t.id === T(n))!;
  assert.equal(l.days, 90);
  assert.match(m(1).message!, /In the last 30 days, players tapped Call or WhatsApp 14 times on Kings Turf's page/);
  assert.ok(m(1).message!.includes(`Your free report: ${link(T(1))}`));
  assert.equal(m(1).report, link(T(1)));
  assert.match(m(2).message!, /was opened 6 times/);
  assert.match(m(3).message!, /Turf 3 has a page on TapTurf\./);
  assert.doesNotMatch(m(4).message!, /claim/i);
  assert.match(m(5).message!, /You can claim your page for free/);
  // No key to sign with: no link and no message, never a link that wouldn't open.
  const none = toOutreachList(answer([row(1)]), () => null)!;
  assert.deepEqual([none.turfs[0].report, none.turfs[0].message], [null, null]);
});

test("the note: status, note, who and when", () => {
  const l = toOutreachList(answer([row(1, { status: "interested", note: " call Friday ", by: "Asha", at: "2026-11-12T10:00:00+00:00" }), row(2, { status: "something" }), row(3, { claim: "active" })]), link)!;
  const one = l.turfs.find((t) => t.id === T(1))!;
  assert.deepEqual([one.status, one.note, one.by, one.at], ["interested", "call Friday", "Asha", "2026-11-12T10:00:00+00:00"]);
  assert.equal(l.turfs.find((t) => t.id === T(2))!.status, "not_contacted");
  assert.equal(outreachFoldLine(l), "Hyderabad: 3 turfs, 1 claimed, 1 contacted");
  assert.equal(toSaved({ status: "nope" }), null);
  assert.deepEqual(toSaved({ ok: true, status: "contacted", note: null, by: "Site owner", at: "not a time" }), { status: "contacted", note: null, by: "Site owner", at: null });
  assert.deepEqual([noteOf(null), noteOf("  "), noteOf(" a \n b "), noteOf("x".repeat(200)), noteOf("x".repeat(201)), noteOf(7)], [null, null, "a b", "x".repeat(200), false, false]);
  assert.deepEqual([byOf(null), byOf("  "), byOf("  Asha   K "), byOf("N".repeat(60))?.length], [null, null, "Asha K", 40]);
});

/* ── The routes ── */

function fakeRpc(answers: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: AdminRpc = async (fn, args) => {
    calls.push({ fn, args });
    const a = answers[fn];
    if (a instanceof Error) throw a;
    if (a && typeof a === "object" && "__error" in a) return { data: null, error: (a as { __error: { code: string } }).__error };
    return { data: a ?? null, error: null };
  };
  return { rpc, calls };
}
const get = (q = "") => new Request(`http://localhost:3000/api/admin/outreach${q}`);
const post = (body: unknown, type = "application/json") =>
  new Request("http://localhost:3000/api/admin/outreach", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ENV = { ACCOUNT_KEY: "test-account-key" };

test("GET: asks for the city and the days, signs each turf's report link, never cached", async () => {
  const db = fakeRpc({ admin_owner_outreach: answer([row(1, { owner_phone: "9876543210", taps30: 3 })]) });
  const res = await outreachList(db.rpc, get("?city=Pune&days=90"), ENV);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(db.calls, [{ fn: "admin_owner_outreach", args: { p_city: "pune", p_days: 90 } }]);
  const j = await res.json();
  assert.equal(j.ok, true);
  const t = j.list.turfs[0];
  assert.match(t.report, /^https:\/\/www\.tapturf\.in\/report\/[0-9a-f]{66}$/);
  assert.deepEqual(readReportToken(reportKey("test-account-key"), t.report.split("/").pop()), { turfId: T(1) });
  assert.ok(t.message.includes(t.report));
  // Only what the section shows: no raw column names from the database.
  assert.deepEqual(Object.keys(t).sort(), ["area", "at", "by", "call", "calls", "claim", "id", "message", "name", "note", "path", "report", "status", "views", "wa", "whatsapp"]);
  const d = fakeRpc({ admin_owner_outreach: answer([]) });
  await outreachList(d.rpc, get("?city=../x&days=7"), ENV);
  assert.deepEqual(d.calls[0].args, { p_city: "hyderabad", p_days: 30 });
});

test("GET: without ACCOUNT_KEY the list still shows, with no link", async () => {
  const j = await (await outreachList(fakeRpc({ admin_owner_outreach: answer([row(1)]) }).rpc, get(), {})).json();
  assert.deepEqual([j.ok, j.list.turfs[0].report, j.list.turfs[0].message], [true, null, null]);
});

test("GET and POST: refused, not set up, unavailable", async () => {
  const cases: [unknown, number, string][] = [
    [{ error: "forbidden" }, 403, "forbidden"],
    [{ __error: { code: "PGRST202" } }, 503, "not_set_up"],
    [{ __error: { code: "42883" } }, 503, "not_set_up"],
    [{ __error: { code: "57014" } }, 503, "unavailable"],
    [new Error("network"), 503, "unavailable"],
    ["nonsense", 502, "unavailable"],
  ];
  for (const [a, status, error] of cases) {
    const g = await outreachList(fakeRpc({ admin_owner_outreach: a }).rpc, get(), ENV);
    assert.deepEqual([g.status, (await g.json()).error], [status, error]);
    const p = await outreachSet(fakeRpc({ admin_owner_outreach_set: a }).rpc, post({ turf: T(1), status: "contacted" }));
    assert.deepEqual([p.status, (await p.json()).error], [status, error]);
    assert.equal(p.headers.get("cache-control"), "private, no-store");
  }
});

test("POST: saves one turf's note", async () => {
  const db = fakeRpc({ admin_owner_outreach_set: { ok: true, status: "interested", note: "call Friday", by: "Asha", at: "2026-11-12T10:00:00+00:00" } });
  const res = await outreachSet(db.rpc, post({ turf: T(1), status: "interested", note: "  call   Friday ", by: " Asha " }));
  assert.equal(res.status, 200);
  assert.deepEqual(db.calls, [{ fn: "admin_owner_outreach_set", args: { p_turf_id: T(1), p_status: "interested", p_note: "call Friday", p_by: "Asha" } }]);
  assert.deepEqual(await res.json(), { ok: true, saved: { status: "interested", note: "call Friday", by: "Asha", at: "2026-11-12T10:00:00+00:00" } });
  const bare = fakeRpc({ admin_owner_outreach_set: { ok: true, status: "contacted", note: null, by: "Site owner", at: "2026-11-12T10:00:00+00:00" } });
  await outreachSet(bare.rpc, post({ turf: T(1), status: "contacted" }));
  assert.deepEqual(bare.calls[0].args, { p_turf_id: T(1), p_status: "contacted", p_note: null, p_by: null });
});

test("POST: a bad body never reaches the database", async () => {
  const db = fakeRpc({ admin_owner_outreach_set: { ok: true, status: "contacted" } });
  for (const body of [{}, { turf: "nope", status: "contacted" }, { turf: T(1), status: "called" }, { turf: T(1) }, { turf: T(1), status: "contacted", note: "x".repeat(201) }, { turf: T(1), status: "contacted", note: 7 }, "not json", [1]]) {
    const res = await outreachSet(db.rpc, post(body));
    assert.deepEqual([res.status, (await res.json()).error], [400, "bad"], JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await outreachSet(db.rpc, post({ turf: T(1), status: "contacted" }, "text/plain"))).status, 400);
  assert.equal((await outreachSet(db.rpc, post({ turf: T(1), status: "contacted", note: "y".repeat(3000) }))).status, 400);
  assert.equal(db.calls.length, 0);
  const nf = await outreachSet(fakeRpc({ admin_owner_outreach_set: { error: "not_found" } }).rpc, post({ turf: T(1), status: "contacted" }));
  assert.deepEqual([nf.status, (await nf.json()).error], [404, "not_found"]);
  const bad = await outreachSet(fakeRpc({ admin_owner_outreach_set: { error: "bad" } }).rpc, post({ turf: T(1), status: "contacted" }));
  assert.equal(bad.status, 400);
});
