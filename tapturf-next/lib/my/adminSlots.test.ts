import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_COPY, adminRequestLines, adminStatus, parseAdminSlots, type AdminRequests } from "./adminSlots";
import { ownerStatus } from "../availability/slots";

const NOW = "2026-11-06T10:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const HOURS = { opening_hours: null, start_time: "06:00:00", end_time: "02:00:00", is_24x7: false, closed_days: null };
const answer = (over: Record<string, unknown> = {}) => ({
  ok: true,
  now: NOW,
  updated_at: "2026-11-06T08:00:00.000Z",
  grounds: 2,
  hours: HOURS,
  booked: ["2026-11-07T07:00", "2026-11-08T18:00"],
  admin: true,
  requests: {
    on: true,
    open: true,
    waiting: [{ at: "2026-11-07T19:00", hours: 2, when: "Sat 7 Nov, 7 PM to 9 PM", created_at: "2026-11-06T09:00:00.000Z" }],
    confirmed: [{ at: "2026-11-08T18:00", hours: 1, when: "Sun 8 Nov, 6 PM to 7 PM" }],
  },
  ...over,
});

test("parseAdminSlots: the owner's view of the slots, and the requests by time", () => {
  const r = parseAdminSlots(answer());
  assert.ok(r && !("error" in r));
  assert.deepEqual(r.slots, { ok: true, now: NOW, updated_at: "2026-11-06T08:00:00.000Z", grounds: 2, hours: HOURS, booked: ["2026-11-07T07:00", "2026-11-08T18:00"] });
  assert.deepEqual(r.requests, {
    on: true,
    open: true,
    waiting: [{ at: "2026-11-07T19:00", hours: 2, when: "Sat 7 Nov, 7 PM to 9 PM", status: "waiting" }],
    confirmed: [{ at: "2026-11-08T18:00", hours: 1, when: "Sun 8 Nov, 6 PM to 7 PM", status: "confirmed" }],
  });
});

test("parseAdminSlots: a refusal is an error; anything else malformed is null", () => {
  assert.deepEqual(parseAdminSlots({ error: "forbidden" }), { error: "forbidden" });
  assert.deepEqual(parseAdminSlots({ error: "not_claimed" }), { error: "not_claimed" });
  for (const bad of [null, undefined, 1, "x", [], {}, answer({ admin: undefined }), answer({ admin: "yes" }), answer({ ok: false }), answer({ now: "never" }), answer({ hours: null })])
    assert.equal(parseAdminSlots(bad), null, JSON.stringify(bad));
  // An owner's answer (owner_slots) is not the site owner's view.
  const { admin, requests, ...owner } = answer();
  void admin;
  void requests;
  assert.equal(parseAdminSlots(owner), null);
});

test("parseAdminSlots: never keeps a name, number, note, id or account, even if one were sent", () => {
  const leaky = answer({
    name: "Priya Player",
    requests: {
      on: true,
      open: false,
      waiting: [{ at: "2026-11-07T19:00", hours: 2, when: "Sat 7 Nov, 7 PM to 9 PM", created_at: NOW, id: "r1", name: "Priya Player", phone: "+919100000001", note: "5-a-side, 10 players", user_id: "u1" }],
      confirmed: [{ at: "2026-11-08T18:00", hours: 1, when: "Sun 8 Nov, 6 PM to 7 PM", player_name: "Qasim Player", player_phone: "+919100000002", reason: "x" }],
      extra: "Rohan Player",
    },
  });
  const text = JSON.stringify(parseAdminSlots(leaky));
  for (const s of ["Priya", "Qasim", "Rohan", "9100000001", "9100000002", "5-a-side", "r1", "u1", '"name"', '"phone"', '"note"', '"id"', '"user_id"', '"reason"', "extra"])
    assert.ok(!text.includes(s), s);
});

test("parseAdminSlots: a row that isn't a time, or asks for 0 or 4 hours, is left out; bad requests are none", () => {
  const r = parseAdminSlots(
    answer({
      requests: {
        on: true,
        open: true,
        waiting: [{ at: "tomorrow", hours: 1, when: "x" }, { at: "2026-11-07T24:00", hours: 1, when: "x" }, { at: "2026-11-07T19:00", hours: 0, when: "x" }, { at: "2026-11-07T19:00", hours: 4, when: "x" }, { at: "2026-11-07T19:00", hours: 1.5, when: "x" }, { at: "2026-11-07T19:00", hours: 1, when: "" }, { at: "2026-11-07T19:00", hours: 1, when: "x".repeat(61) }, null, "row"],
        confirmed: [],
      },
    }),
  );
  assert.ok(r && !("error" in r));
  assert.deepEqual(r.requests, { on: true, open: true, waiting: [], confirmed: [] });
  for (const requests of [null, undefined, {}, { on: true, open: true }, { on: "yes", open: true, waiting: [], confirmed: [] }, { on: true, open: true, waiting: {}, confirmed: [] }]) {
    const x = parseAdminSlots(answer({ requests }));
    assert.ok(x && !("error" in x));
    assert.equal(x.requests, null, JSON.stringify(requests));
  }
});

test("adminStatus: the owner's line while players see it or it is hidden; about the owner otherwise; never a button", () => {
  const h = (n: number) => new Date(NOW_MS - n * 3_600_000).toISOString();
  for (const at of [h(1), h(21), h(30)]) assert.deepEqual(adminStatus(at, NOW_MS), { kind: ownerStatus(at, NOW_MS).kind, line: ownerStatus(at, NOW_MS).line });
  assert.equal(adminStatus(h(1), NOW_MS).line, "Players see this · updated 1 h ago");
  assert.equal(adminStatus(h(21), NOW_MS).kind, "ending");
  assert.equal(adminStatus(h(30), NOW_MS).line, "Hidden from players · last updated 5 Nov, 9:30 AM");
  assert.deepEqual(adminStatus(null, NOW_MS), { kind: "never", line: "Players don't see this yet: the owner hasn't shown the free hours." });
  assert.deepEqual(adminStatus(h(1), NOW_MS, false), { kind: "no_number", line: "Players don't see these: the turf's page has no number to call or WhatsApp yet." });
  for (const at of [null, h(1), h(21), h(30)]) {
    const s = adminStatus(at, NOW_MS);
    assert.ok(!/\bTap\b|\bMark\b|\byour\b|All correct below/i.test(s.line), s.line);
    assert.ok(!("button" in s));
  }
});

const REQ = (over: Partial<AdminRequests> = {}): AdminRequests => ({
  on: true,
  open: true,
  waiting: [
    { at: "2026-11-09T07:00", hours: 1, when: "Mon 9 Nov, 7 AM to 8 AM", status: "waiting" },
    { at: "2026-11-07T19:00", hours: 2, when: "Sat 7 Nov, 7 PM to 9 PM", status: "waiting" },
  ],
  confirmed: [{ at: "2026-11-08T18:00", hours: 1, when: "Sun 8 Nov, 6 PM to 7 PM", status: "confirmed" }],
  ...over,
});

test("adminRequestLines: On or Off, whether players can send now, counts, and each request by time, soonest first", () => {
  const l = adminRequestLines(REQ());
  assert.equal(l.state, "On");
  assert.equal(l.status, "Players can send requests now.");
  assert.equal(l.counts, "2 waiting · 1 confirmed");
  assert.deepEqual(l.rows.map((r) => r.text), ["Sat 7 Nov, 7 PM to 9 PM · waiting", "Sun 8 Nov, 6 PM to 7 PM · confirmed", "Mon 9 Nov, 7 AM to 8 AM · waiting"]);
  assert.equal(new Set(l.rows.map((r) => r.key)).size, 3, "unique keys");
  assert.equal(adminRequestLines(REQ({ open: false })).status, "Players can't send requests until the owner's free hours show.");
  assert.equal(adminRequestLines(REQ({ on: false, open: false })).state, "Off");
  assert.equal(adminRequestLines(REQ({ on: false, open: false })).status, "Players can't send new requests while they're off.");
  const none = adminRequestLines(REQ({ waiting: [], confirmed: [] }));
  assert.deepEqual([none.counts, none.rows], ["No waiting or confirmed requests.", []]);
  // A confirmed one and a waiting one at the same time (another ground): both, confirmed first.
  const same = adminRequestLines(REQ({ waiting: [{ at: "2026-11-08T18:00", hours: 1, when: "Sun 8 Nov, 6 PM to 7 PM", status: "waiting" }] }));
  assert.deepEqual(same.rows.map((r) => r.text), ["Sun 8 Nov, 6 PM to 7 PM · confirmed", "Sun 8 Nov, 6 PM to 7 PM · waiting"]);
});

test("adminRequestLines: no number on the turf's page means players can't send, whatever the database's open flag says", () => {
  const noNumber = "Players can't send requests until the turf's page has a number to call or WhatsApp.";
  assert.equal(adminRequestLines(REQ(), false).status, noNumber, "on and open, but the page shows no slots card");
  assert.equal(adminRequestLines(REQ({ open: false }), false).status, noNumber, "the number comes first");
  assert.equal(adminRequestLines(REQ(), true).status, "Players can send requests now.");
  assert.equal(adminRequestLines(REQ()).status, "Players can send requests now.", "a number unless told otherwise, as MyTurf's pageHasNumber(t) ?? true");
  // Off with no number: Off says it all.
  assert.equal(adminRequestLines(REQ({ on: false, open: false }), false).status, "Players can't send new requests while they're off.");
  assert.equal(adminRequestLines(REQ(), false).state, "On");
  assert.equal(adminRequestLines(REQ(), false).rows.length, 3, "the requests already sent still show");
});

test("adminRequestLines: Off after taking requests keeps them and never says the owner hasn't turned them on", () => {
  const l = adminRequestLines(REQ({ on: false, open: false }));
  assert.deepEqual([l.state, l.counts], ["Off", "2 waiting · 1 confirmed"]);
  assert.equal(l.rows.length, 3);
  for (const hasNumber of [true, false]) {
    const s = adminRequestLines(REQ({ on: false, open: false }), hasNumber).status;
    assert.doesNotMatch(s, /hasn't turned|never|any\b/, s);
    assert.match(s, /new requests/);
  }
});

test("the words: short, plain, no dashes, no number; the banner names the turf and who can change it", () => {
  assert.equal(ADMIN_COPY.banner("Night Owl Arena"), "Admin view: you see Night Owl Arena's slots as its owner does. Only its owner, managers and staff can change them.");
  assert.equal(ADMIN_COPY.private, "Player names and numbers show only to the turf's owner and managers.");
  assert.equal(ADMIN_COPY.hour("7 PM to 8 PM", true), "7 PM to 8 PM, booked. Read only.");
  assert.equal(ADMIN_COPY.grounds(3), "3 grounds: the owner marks an hour Booked only when all of them are taken.");
  const all: string[] = [ADMIN_COPY.banner("X"), ADMIN_COPY.grounds(2), ADMIN_COPY.hour("7 PM to 8 PM", false)];
  for (const v of Object.values(ADMIN_COPY) as unknown[]) if (typeof v === "string") all.push(v);
  for (const s of all) {
    assert.ok(!/[—–]/.test(s), s);
    assert.ok(!/\d{6,}/.test(s), s);
    assert.ok(s.length <= 140, s);
  }
});

test("the migration's booking_admin_state builds only these fields, from the time columns alone", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261106_admin_slots_view.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  const body = sql.slice(sql.indexOf("function private.booking_admin_state"), sql.indexOf("revoke all on function private.booking_admin_state"));
  const keys = [...body.matchAll(/'(\w+)', /g)].map((m) => m[1]);
  assert.deepEqual(keys, ["on", "open", "waiting", "at", "hours", "when", "created_at", "confirmed", "at", "hours", "when"]);
  assert.doesNotMatch(body, /player_name|player_phone|\bnote\b|user_id|reason|select b from|select \*/);
  assert.match(sql, /'admin', true, 'requests', private\.booking_admin_state\(p_turf_id, now\(\)\)/);
});
