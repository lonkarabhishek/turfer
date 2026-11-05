import { test } from "node:test";
import assert from "node:assert/strict";
import { noPhoneList, noPhoneWhy, turfViewsOf, type RawContactRow } from "./noPhone";
import { contactFieldsOf } from "../utils/contact";
import { getPhone, getWhatsAppPhone } from "../utils/seo";

// Made-up numbers only. Each row as the admin reads it from turfs (contact_info may be JSON text).
const SAMPLES: { what: string; row: RawContactRow; why: "none" | "bad" | null }[] = [
  { what: "nothing stored", row: {}, why: "none" },
  { what: "all empty or spaces", row: { owner_phone: "", contact_info: null, landline_phone: "  ", whatsapp_phone: null }, why: "none" },
  { what: "a mobile as the call number", row: { owner_phone: "+91 98000 00001" }, why: null },
  { what: "junk call number", row: { owner_phone: "12345" }, why: "bad" },
  { what: "junk, then a good contact_info phone", row: { owner_phone: "12345", contact_info: { phone: "98000 00002" } }, why: null },
  { what: "contact_info as JSON text", row: { contact_info: '{"phone":"9800000002"}' }, why: null },
  { what: "contact_info text that isn't JSON", row: { contact_info: "call the manager" }, why: "none" },
  { what: "a phone stored as a number in contact_info", row: { contact_info: { phone: 9800000002 } }, why: "bad" },
  { what: "a landline alone", row: { landline_phone: "0253 200 0123" }, why: null },
  { what: "WhatsApp alone", row: { whatsapp_phone: "9800000003" }, why: null },
  { what: "a landline-shaped WhatsApp number", row: { whatsapp_phone: "0253 200 0123" }, why: "bad" },
  { what: "a mobile in the landline column (calls, no WhatsApp)", row: { landline_phone: "9800000009" }, why: null },
  { what: "foreign", row: { owner_phone: "+44 20 7946 0958" }, why: "bad" },
  { what: "toll-free", row: { owner_phone: "1800 123 4567" }, why: "bad" },
  { what: "0091 prefix", row: { owner_phone: "0091 98000 00004" }, why: null },
  { what: "091 prefix", row: { owner_phone: "091 9800000005" }, why: null },
  { what: "nine digits", row: { owner_phone: "98000 0000" }, why: "bad" },
];

test("No phone is exactly the page's rule: no Call (getPhone) and no WhatsApp (getWhatsAppPhone)", () => {
  for (const { what, row, why } of SAMPLES) {
    const f = contactFieldsOf(row);
    const pageShowsNumber = !!(getPhone(f) || getWhatsAppPhone(f));
    assert.equal(noPhoneWhy(row) === null, pageShowsNumber, `${what}: the list and the page agree`);
    assert.equal(noPhoneWhy(row), why, what);
  }
});

test("views: admin_turf_views' answer, and nothing else", () => {
  const v = turfViewsOf({ days: 28, since: "2026-10-09", today: "2026-11-05", views: { a: 12, b: "3", c: 0, d: -1, e: "x" } });
  assert.ok(v);
  assert.equal(v.days, 28);
  assert.equal(v.since, "2026-10-09");
  assert.deepEqual([...v.byTurf], [["a", 12], ["b", 3]]);
  assert.equal(turfViewsOf({ days: 28, since: "soon", views: {} })?.since, null);
  for (const bad of [null, [], "x", { days: 0, views: {} }, { days: 28 }, { days: 28, views: [] }, { days: 1.5, views: {} }]) assert.equal(turfViewsOf(bad), null, JSON.stringify(bad));
});

test("the list: only the pages with no number, most viewed first, ties and no views by name", () => {
  const rows = [
    { id: "t1", name: "Arena", owner_phone: "9800000001" },
    { id: "t2", name: "Box Park", owner_phone: null },
    { id: "t3", name: "Corner Flag", owner_phone: "12345" },
    { id: "t4", name: "Goal Zone", owner_phone: null },
    { id: "t5", name: "Kick Off", owner_phone: null },
  ];
  const views = turfViewsOf({ days: 28, since: "2026-10-09", views: { t1: 900, t4: 40, t5: 40, t3: 7 } });
  assert.deepEqual(
    noPhoneList(rows, views).map((r) => [r.id, r.views, r.why]),
    [["t4", 40, "none"], ["t5", 40, "none"], ["t3", 7, "bad"], ["t2", 0, "none"]],
  );
  // Views not read: by name, views null.
  assert.deepEqual(noPhoneList(rows, null).map((r) => [r.id, r.views]), [["t2", null], ["t3", null], ["t4", null], ["t5", null]]);
});
