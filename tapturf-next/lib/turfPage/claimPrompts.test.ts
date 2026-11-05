import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKINGS_LINE, CLAIM_COPY, claimCopyProblem, claimPrompts, invitePlayersLine, phoneClaimPromptCount } from "./claimPrompts";
import { BOOKING_LINE, bookingLine } from "./noContact";

test("the invite's players line: the booking line only where the phone bar has it (a number, not a members' club)", () => {
  assert.equal(BOOKINGS_LINE, BOOKING_LINE, "one source for the site owner's line");
  for (const hasNumber of [true, false]) for (const membersOnly of [true, false]) {
    const p = invitePlayersLine({ hasNumber, membersOnly });
    const bar = bookingLine(membersOnly, hasNumber);
    if (bar) assert.deepEqual(p, { lead: "Here to play?", line: BOOKING_LINE });
    else assert.ok(!p || !p.line.includes(BOOKING_LINE), `no booking line: number ${hasNumber}, members ${membersOnly}`);
  }
  // No number (a members' club or not): where to tell us one, and no call, book or reserve.
  for (const membersOnly of [true, false]) {
    const p = invitePlayersLine({ hasNumber: false, membersOnly });
    assert.ok(p);
    assert.equal(p.line, "If you know the turf's number, tap I know the number.");
    assert.doesNotMatch(`${p.lead} ${p.line}`, /\b(call|book|booking|bookings|reserve)\b/i);
    assert.equal(claimCopyProblem(`${p.lead} ${p.line}`), null);
  }
  // A members' club with a number: no players line (its page says how to ask about guest access).
  assert.equal(invitePlayersLine({ hasNumber: true, membersOnly: true }), null);
  // The invite's other no-number words for players: no call, book or reserve.
  assert.doesNotMatch("How many players view your page, and how they find it.", /\b(call|book|booking|reserve)\b/i);
});

const KINDS = [
  { kind: "number + prices", hasNumber: true, noPrices: false, want: { hint: true, pricingLine: false, invite: true, sidebar: true }, phone: 2 },
  { kind: "number + no prices", hasNumber: true, noPrices: true, want: { hint: true, pricingLine: false, invite: true, sidebar: true }, phone: 2 },
  { kind: "no number + prices", hasNumber: false, noPrices: false, want: { hint: false, pricingLine: false, invite: true, sidebar: false }, phone: 1 },
  { kind: "no number + no prices", hasNumber: false, noPrices: true, want: { hint: false, pricingLine: true, invite: true, sidebar: false }, phone: 2 },
];

test("prompts per page kind, and at most two on a phone", () => {
  for (const k of KINDS) {
    const p = claimPrompts({ claimed: false, hasNumber: k.hasNumber, noPrices: k.noPrices });
    assert.deepEqual(p, k.want, k.kind);
    assert.equal(phoneClaimPromptCount(p), k.phone, k.kind);
    assert.ok(phoneClaimPromptCount(p) <= 2, k.kind);
  }
});

test("no hint on a page with no usable number; the invite on every unclaimed page", () => {
  for (const noPrices of [true, false]) {
    assert.equal(claimPrompts({ claimed: false, hasNumber: false, noPrices }).hint, false);
    assert.equal(claimPrompts({ claimed: false, hasNumber: false, noPrices }).invite, true);
    assert.equal(claimPrompts({ claimed: false, hasNumber: true, noPrices }).invite, true);
  }
});

test("a claimed turf shows no claim prompt", () => {
  for (const hasNumber of [true, false]) for (const noPrices of [true, false]) {
    const p = claimPrompts({ claimed: true, hasNumber, noPrices });
    assert.deepEqual(p, { hint: false, pricingLine: false, invite: false, sidebar: false });
    assert.equal(phoneClaimPromptCount(p), 0);
  }
});

test("the site owner's line, word for word", () => {
  assert.equal(BOOKINGS_LINE, "For bookings, contact the turf directly.");
});

test("every prompt's words: the role named, no bare Claim it free, nothing that reads like a booking", () => {
  assert.match(CLAIM_COPY.hint.ask, /own or manage/i);
  assert.match(CLAIM_COPY.pricingLine.ask, /owner/i);
  assert.match(CLAIM_COPY.invite.label, /owner or manager/i);
  const all = [
    ...Object.values(CLAIM_COPY.hint),
    ...Object.values(CLAIM_COPY.pricingLine),
    ...Object.values(CLAIM_COPY.sidebar),
    ...Object.values(CLAIM_COPY.invite),
    `${CLAIM_COPY.invite.players} ${BOOKINGS_LINE}`,
  ];
  for (const s of all) assert.equal(claimCopyProblem(s), null, s);
  assert.notEqual(`${CLAIM_COPY.hint.ask} ${CLAIM_COPY.hint.link}`.toLowerCase(), "claim it free");
});

test("claimCopyProblem catches what the site owner ruled out", () => {
  assert.equal(claimCopyProblem("Own this turf? Claim it free"), "bare claim it free");
  assert.equal(claimCopyProblem("TapTurf doesn't take bookings"), "ruled-out booking phrasing");
  assert.equal(claimCopyProblem("We don't take bookings."), "ruled-out booking phrasing");
  assert.equal(claimCopyProblem("TapTurf takes no bookings"), "ruled-out booking phrasing");
  assert.equal(claimCopyProblem("Book now"), "booking word outside the site owner's line");
  assert.equal(claimCopyProblem("Reserve your slot"), "reserve");
  assert.equal(claimCopyProblem("Hurry, filling fast"), "urgency");
  assert.equal(claimCopyProblem(`Here to play? ${BOOKINGS_LINE}`), null);
});
