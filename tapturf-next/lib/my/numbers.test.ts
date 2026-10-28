import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numberInput, numberKind, numberPatch, readCallNumber, readWhatsApp, saveMessage, shownCallNumber } from "./numbers";
import { normalizeIndianPhone } from "../utils/phone";
import { getPhone } from "../utils/seo";
import type { Turf } from "../../types/turf";

// The same table owner_call_number.check.mjs runs through private.call_phone10.
const CASES = (JSON.parse(readFileSync(join(process.cwd(), "lib/my/numberCases.json"), "utf8")) as { cases: [string, string | null, "mobile" | "landline" | null][] }).cases;

test("the format table: what the Call button dials, and what the editor saves", () => {
  assert.ok(CASES.length >= 20);
  for (const [typed, ten, kind] of CASES) {
    assert.equal(normalizeIndianPhone(typed)?.local ?? null, ten, `normalizeIndianPhone(${JSON.stringify(typed)})`);
    assert.equal(numberKind(typed), kind, `numberKind(${JSON.stringify(typed)})`);
    if (typed.trim()) assert.equal(readCallNumber(typed), ten ? `+91${ten}` : null, `readCallNumber(${JSON.stringify(typed)})`);
    assert.equal(readWhatsApp(typed), !typed.trim() ? "" : kind === "mobile" ? `+91${ten}` : null, `readWhatsApp(${JSON.stringify(typed)})`);
  }
});

test("prefixes, spaces and dashes; STD landlines; what is refused", () => {
  for (const t of ["+91 98765 43210", "0 98765 43210", "091 98765 43210", "0091 98765 43210", "98765-43210", " 9876543210 "]) assert.equal(readCallNumber(t), "+919876543210", t);
  assert.equal(readCallNumber("0253 235 0977"), "+912532350977");
  assert.equal(readCallNumber("022-2437-9284"), "+912224379284");
  assert.equal(readCallNumber("2350977"), null, "a 7-digit number without its STD code");
  assert.equal(readCallNumber("1800 123 4567"), null, "toll-free");
  assert.equal(readCallNumber("+44 20 7946 0958"), null, "foreign");
  assert.equal(readWhatsApp("0253 235 0977"), null, "WhatsApp takes mobiles only");
});

test("a blank field clears the number", () => {
  assert.equal(readCallNumber(""), "");
  assert.equal(readCallNumber("   "), "");
  assert.equal(readWhatsApp(""), "");
});

test("numberInput: how a stored number shows after +91", () => {
  assert.equal(numberInput("+91 98765 43210"), "9876543210");
  assert.equal(numberInput("+912532350977"), "02532350977", "a landline keeps its 0 and STD code");
  assert.equal(numberInput("0253 2350977"), "02532350977");
  assert.equal(numberInput("12345"), "");
  assert.equal(numberInput(null), "");
  // What the editor shows reads back as the same number.
  for (const raw of ["+919876543210", "+912224379284", "9876543210"]) assert.equal(readCallNumber(numberInput(raw)), normalizeIndianPhone(raw)?.e164);
});

const turf = (over: Partial<Turf>): Turf => ({ owner_phone: null, contact_info: null, landline_phone: null, whatsapp_phone: null, ...over }) as unknown as Turf;
const fixtures: Partial<Turf>[] = [
  { owner_phone: "9876543210" },
  { owner_phone: "12345", contact_info: { phone: "+91 90000 00001" } },
  { owner_phone: null, contact_info: { phone: "0253 2350977" }, landline_phone: "022 2437 9284" },
  { owner_phone: "junk", contact_info: { phone: "also junk" }, landline_phone: "0253 2350977" },
  { owner_phone: "+919876543210", contact_info: { phone: "+919000000001" }, landline_phone: "0253 2350977" },
  { owner_phone: null, contact_info: null, landline_phone: null, whatsapp_phone: "+919000000002" },
  { owner_phone: "1800 123 4567", contact_info: { email: "x@example.com" } },
];

test("shownCallNumber is the number the turf page's Call button dials (getPhone)", () => {
  for (const f of fixtures) {
    const t = turf(f);
    assert.equal(shownCallNumber({ owner_phone: t.owner_phone, contact_phone: t.contact_info?.phone ?? null, landline_phone: t.landline_phone }), getPhone(t), JSON.stringify(f));
  }
  assert.equal(shownCallNumber({}), null, "an older database sends none of them");
});

test("numberPatch sends a number only when it changes", () => {
  const base = { owner_phone: "9876543210", whatsapp_phone: "9000000002" };
  assert.deepEqual(numberPatch(base, base), { patch: {}, error: null });
  assert.deepEqual(numberPatch(base, { owner_phone: "+91 98765-43210", whatsapp_phone: "09000000002" }), { patch: {}, error: null }, "the same numbers typed another way");
  assert.deepEqual(numberPatch(base, { ...base, owner_phone: "0253 235 0977" }), { patch: { owner_phone: "+912532350977" }, error: null });
  assert.deepEqual(numberPatch(base, { ...base, whatsapp_phone: "" }), { patch: { whatsapp_phone: "" }, error: null }, "WhatsApp cleared: the call number stays");
  assert.deepEqual(numberPatch(base, { owner_phone: "", whatsapp_phone: "9000000002" }), { patch: { owner_phone: "" }, error: null }, "call cleared: WhatsApp stays");
  assert.deepEqual(numberPatch({ whatsapp_phone: "" }, { whatsapp_phone: "9000000003" }), { patch: { whatsapp_phone: "+919000000003" }, error: null }, "no call field on an older database");
});

test("numberPatch says what's wrong before the save", () => {
  const base = { owner_phone: "9876543210", whatsapp_phone: "" };
  assert.deepEqual(numberPatch(base, { ...base, owner_phone: "2350977" }), { patch: {}, error: { error: "bad_value", field: "owner_phone" } });
  assert.deepEqual(numberPatch(base, { ...base, whatsapp_phone: "0253 2350977" }), { patch: {}, error: { error: "bad_value", field: "whatsapp_phone" } });
  assert.deepEqual(numberPatch(base, { ...base, owner_phone: "" }), { patch: {}, error: { error: "no_number" } }, "the last number");
  assert.deepEqual(numberPatch({ owner_phone: "", whatsapp_phone: "9000000002" }, { owner_phone: "", whatsapp_phone: "" }), { patch: {}, error: { error: "no_number" } });
  assert.deepEqual(numberPatch({ whatsapp_phone: "9000000002" }, { whatsapp_phone: "" }, "0253 2350977"), { patch: { whatsapp_phone: "" }, error: null }, "an older database: the page still dials its call number");
  assert.deepEqual(numberPatch({ whatsapp_phone: "9000000002" }, { whatsapp_phone: "" }, null), { patch: {}, error: { error: "no_number" } });
  // A stored number the editor can't read is left alone, unless it's changed.
  assert.deepEqual(numberPatch({ owner_phone: "", whatsapp_phone: "12345" }, { owner_phone: "9876543210", whatsapp_phone: "12345" }), { patch: { owner_phone: "+919876543210" }, error: null });
});

test("saveMessage covers every answer", () => {
  assert.equal(saveMessage({ error: "bad_value", field: "owner_phone" }), "Check the call number: use a 10-digit mobile, or a landline with its STD code.");
  assert.equal(saveMessage({ error: "bad_value", field: "whatsapp_phone" }), "Check the WhatsApp number: it needs to be a 10-digit mobile.");
  assert.equal(saveMessage({ error: "bad_value", field: "number_of_grounds" }), "Check number of grounds: that value doesn't look right.");
  assert.equal(saveMessage({ error: "bad_value" }), "Check your changes: that value doesn't look right.");
  assert.equal(saveMessage({ error: "held", field: "owner_phone" }), "You can change your numbers two weeks after you got in. Undo the number change to save the rest. If it's urgent, email info@tapturf.in.");
  assert.equal(saveMessage({ error: "held", field: "whatsapp_phone" }), saveMessage({ error: "held", field: "owner_phone" }));
  assert.equal(saveMessage({ error: "no_number" }), "Keep at least one number, so players can reach you.");
  assert.equal(saveMessage({ error: "forbidden" }), "Couldn't save. Sign in again and retry.");
  assert.equal(saveMessage({ error: "bad_patch" }), "Couldn't save. Sign in again and retry.");
});
