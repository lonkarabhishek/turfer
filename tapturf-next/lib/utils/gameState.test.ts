import { test } from "node:test";
import assert from "node:assert/strict";
import { canRequest, canSeeHostNumber, ctaState, waNumber, type CtaInput } from "./gameState";

const base: CtaInput = { isHost: false, status: "open", timing: "upcoming", isParticipant: false, joinStatus: "idle", myRequest: null, spotsLeft: 21 };
const with_ = (o: Partial<CtaInput>) => ctaState({ ...base, ...o });

test("one state per viewer, in the spec's order", () => {
  assert.equal(with_({}), "open");
  assert.equal(with_({ timing: "live" }), "live");
  assert.equal(with_({ spotsLeft: 0 }), "full");
  assert.equal(with_({ spotsLeft: -1 }), "full");
  assert.equal(with_({ myRequest: { status: "declined" } }), "declined");
  assert.equal(with_({ myRequest: { status: "pending" } }), "pending");
  assert.equal(with_({ joinStatus: "sent" }), "pending");
  assert.equal(with_({ isParticipant: true }), "accepted");
  assert.equal(with_({ myRequest: { status: "accepted" } }), "accepted");
  assert.equal(with_({ timing: "expired" }), "ended");
  assert.equal(with_({ status: "cancelled" }), "cancelled");
  assert.equal(with_({ isHost: true }), "host");
});

test("earlier states win", () => {
  // The host's own game is theirs whatever else is true.
  assert.equal(with_({ isHost: true, status: "cancelled", timing: "expired", isParticipant: true, spotsLeft: 0 }), "host");
  assert.equal(with_({ status: "cancelled", timing: "expired" }), "cancelled");
  // A player who was in still sees that the game ended.
  assert.equal(with_({ timing: "expired", isParticipant: true }), "ended");
  // In a full game, you're still in.
  assert.equal(with_({ isParticipant: true, spotsLeft: 0 }), "accepted");
  // A request sent in this visit beats an old decline.
  assert.equal(with_({ joinStatus: "sent", myRequest: { status: "declined" } }), "pending");
  // A pending request in a game that filled up stays pending.
  assert.equal(with_({ myRequest: { status: "pending" }, spotsLeft: 0 }), "pending");
  assert.equal(with_({ myRequest: { status: "declined" }, spotsLeft: 0 }), "declined");
  // Full beats live: no join button while it is on and full.
  assert.equal(with_({ timing: "live", spotsLeft: 0 }), "full");
  // A failed send leaves the button.
  assert.equal(with_({ joinStatus: "error" }), "open");
});

test("who may still ask to join", () => {
  assert.equal(canRequest("open"), true);
  assert.equal(canRequest("live"), true);
  for (const s of ["host", "cancelled", "ended", "accepted", "pending", "declined", "full"] as const) assert.equal(canRequest(s), false, s);
});

test("the host's number: the host and accepted players only", () => {
  assert.equal(canSeeHostNumber({ isHost: false, isParticipant: true, signedIn: true }), true);
  assert.equal(canSeeHostNumber({ isHost: true, isParticipant: true, signedIn: true }), true);
  assert.equal(canSeeHostNumber({ isHost: false, isParticipant: false, signedIn: true }), false);
  assert.equal(canSeeHostNumber({ isHost: false, isParticipant: false, signedIn: false }), false);
  assert.equal(canSeeHostNumber({ isHost: false, isParticipant: true, signedIn: false }), false);
});

test("WhatsApp numbers get India's code when they have 10 digits", () => {
  assert.equal(waNumber("98765 43210"), "919876543210");
  assert.equal(waNumber("+91 98765 43210"), "919876543210");
});
