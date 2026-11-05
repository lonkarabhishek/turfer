import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FLOW_COPY, CLAIM_ROLES, ROLE_LABELS, asksRunsQuestion, claimFromNext, claimLoginUrl, claimOwnerUrl, claimTurfId, turfPhone10 } from "./claimFlow";
import { BOOKINGS_LINE, claimCopyProblem } from "../turfPage/claimPrompts";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

test("claimTurfId: a turf id or nothing", () => {
  assert.equal(claimTurfId(ID), ID);
  assert.equal(claimTurfId(ID.toUpperCase()), ID);
  assert.equal(claimTurfId(` ${ID} `), ID);
  for (const bad of [null, undefined, "", "abc", `${ID}x`, "../../admin"]) assert.equal(claimTurfId(bad), null, String(bad));
});

test("yes, I run this turf: one tap to the sign-in, which comes back to the form", () => {
  assert.equal(claimOwnerUrl(ID), `/my?claim=${ID}&owner=1`);
  assert.equal(claimLoginUrl(ID), `/login?next=${encodeURIComponent(`/my?claim=${ID}&owner=1`)}`);
  assert.equal(claimFromNext(claimOwnerUrl(ID)), ID, "the sign-in page knows which turf it is for");
});

test("claimFromNext: only a claim on /my", () => {
  assert.equal(claimFromNext(`/my?claim=${ID}`), ID);
  assert.equal(claimFromNext(`/my?owner=1&claim=${ID}#x`), ID);
  for (const n of [null, "", "/", "/my", "/dashboard", `/turf/x?claim=${ID}`, "/my?claim=nope", `https://evil.example/my?claim=${ID}`]) assert.equal(claimFromNext(n), null, String(n));
});

test("the question: asked before the sign-in and before the form, skipped where it would only slow an owner down", () => {
  assert.equal(asksRunsQuestion({ saidOwner: false, home: null }), true, "signed out");
  assert.equal(asksRunsQuestion({ saidOwner: true, home: null }), false, "answered yes, then signed in");
  const home = { admin: false, status: null, match: false } as const;
  assert.equal(asksRunsQuestion({ saidOwner: false, home }), true, "signed in, nothing yet");
  assert.equal(asksRunsQuestion({ saidOwner: false, home: { ...home, status: "pending" } }), false, "a claim waiting");
  assert.equal(asksRunsQuestion({ saidOwner: false, home: { ...home, status: "active" } }), false, "runs it");
  assert.equal(asksRunsQuestion({ saidOwner: false, home: { ...home, admin: true } }), false, "the site owner");
  assert.equal(asksRunsQuestion({ saidOwner: false, home: { ...home, match: true } }), false, "their own number is on the listing");
});

test("turfPhone10: the turf's mobile as typed", () => {
  for (const ok of ["9876543210", "98765 43210", "+91 98765 43210", "09876543210", "+91-98765-43210"]) assert.equal(turfPhone10(ok), "9876543210", ok);
  for (const bad of ["", "12345", "0253 200 0123", "5876543210", "98765"]) assert.equal(turfPhone10(bad), null, bad);
});

test("no default role: three to pick from", () => {
  assert.deepEqual([...CLAIM_ROLES], ["owner", "manager", "staff"]);
  assert.deepEqual(Object.values(ROLE_LABELS), ["Owner", "Manager", "Staff"]);
});

test("the flow's words: the site owner's line for players, nothing that reads like a booking reply", () => {
  assert.equal(CLAIM_FLOW_COPY.playTitle, BOOKINGS_LINE);
  assert.equal(CLAIM_FLOW_COPY.question("Green Box"), "Do you own or manage Green Box?");
  assert.equal(CLAIM_FLOW_COPY.loginTitle("Green Box"), "Sign in to manage Green Box");
  assert.equal(CLAIM_FLOW_COPY.loginTitle(null), "Sign in to manage your turf");
  const c = CLAIM_FLOW_COPY;
  const words: string[] = [
    c.label, c.question("Green Box"), c.lead, c.yes, c.yesSub, c.noSub(true), c.noSub(false), c.no, c.playTitle,
    c.playBody("Green Box", true), c.playBody("Green Box", false), c.playButton(true), c.playButton(false), c.playUndo,
    c.loginTitle("Green Box"), c.loginLead, c.loginDefault, c.rolePick("Green Box"), c.roleNeeded, c.byHandWhy,
    c.phoneLabel, c.phoneHint, c.phoneNeeded, c.noteLabel, c.notePlaceholder, c.sendForCheck, c.thanks("Green Box"), c.thanksMore, c.waiting,
  ];
  assert.equal(words.length, Object.keys(c).length + 3, "every entry read (the three that take a yes or no read twice)");
  for (const s of words) assert.equal(claimCopyProblem(s), null, s);
  const thanks = CLAIM_FLOW_COPY.thanks("Green Box");
  assert.doesNotMatch(thanks, /call|whatsapp/i, "the thanks screen reads like no booking reply");
  assert.match(thanks, /check that you run Green Box/);
  assert.doesNotMatch(CLAIM_FLOW_COPY.loginDefault, /book/i, "the sign-in page says nothing about booking");
});
