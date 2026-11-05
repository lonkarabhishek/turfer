import { test } from "node:test";
import assert from "node:assert/strict";
import { MANY_TURFS_OPENED, bookingLikeNote, claimFacts, playerSignalLine, playerSignals, signalsByClaim, withSignals, type ClaimFacts } from "./claimSignals";

test("withSignals: each waiting claim gets its row and whether its page shows a number; the rest as they came", () => {
  const sig = signalsByClaim([
    { turf_id: "t1", user_key: "p:9800000001", games: 1, requests: 0, pre_contact_tap: true, pre_turfs_opened: 5 },
    { turf_id: "t2", user_key: "e:sam@x.in", games: 0, requests: 0, pre_contact_tap: null, pre_turfs_opened: null },
    { turf_id: 3, user_key: "x" },
    null,
  ]);
  assert.equal(sig.size, 2, "malformed rows left out");
  assert.equal(signalsByClaim({ error: "forbidden" }).size, 0, "an error answer gives none");
  const claims = [
    { turf_id: "t1", user_key: "p:9800000001", status: "pending" },
    { turf_id: "t2", user_key: "e:sam@x.in", status: "pending" },
    { turf_id: "t2", user_key: "e:sam@x.in", status: "active" },
    { turf_id: "t3", user_key: "p:9800000003", status: "pending" },
  ];
  const out = withSignals(claims, sig, new Map([["t1", false]])) as Record<string, unknown>[];
  assert.deepEqual(out[0].signals, { games: 1, requests: 0, pre_contact_tap: true, pre_turfs_opened: 5, turf_has_number: false });
  assert.deepEqual(out[1].signals, { games: 0, requests: 0, pre_contact_tap: null, pre_turfs_opened: null, turf_has_number: null }, "a turf not read: unknown");
  assert.equal(out[2].signals, undefined, "decided claims get none");
  assert.equal(out[3].signals, undefined, "no row: none");
  assert.deepEqual(claimFacts({ userKey: "p:9800000001", note: null }, out[0].signals as never) && playerSignals(claimFacts({ userKey: "p:9800000001", note: null }, out[0].signals as never)!), [
    "phone sign-in on a turf with no number",
    "made 1 game",
    "tapped Call or WhatsApp before signing up",
    "opened 5 turfs before signing up",
  ]);
});

// Made-up notes only, in the shapes claimants write (5 Nov 2026: the one booking note, with its digits changed).
const BOOKING = [
  "We want to book box cricket for 2 hours",
  "we want to book box cricket for # hours".replace("#", "3"),
  "Can I book a slot for tomorrow evening?",
  "can we play here on sunday",
  "book karna hai 7 to 9",
  "Booking chahiye kal ke liye",
  "slot chahiye 8 baje",
  "Is the ground available tonight?",
  "is it available tomorrow at 7",
  "What is the rate per hour",
  "what's the price",
  "how much for 2 hrs",
  "We are 12 players, need turf on Sunday",
  "team of 10 for football",
  "Please reserve for 2 hrs",
  "reservation for saturday",
  "Need a slot at 6 pm",
  "football khelna hai",
  "Want to play box cricket",
  "I would like to book the turf",
  "booking for 1.5 hours",
  "WE WANT TO BOOK",
  "One slot for tomorrow 7 pm please",
  "can we book at 7 pm",
];
const NOT_BOOKING = [
  "",
  "Open 24 hours",
  "We're open for 24 hours, 7 days a week",
  "open 24 hrs",
  "Available 24x7",
  "This is my turf, my real brother and me manage it",
  "Call on this number to verification ##### #####.",
  "I manage bookings here",
  "We take bookings on WhatsApp",
  "we take booking on whatsapp only",
  "For bookings call the number on the page",
  "Booking number is the WhatsApp one",
  "Owner. Update prices and add photos",
  "I'll add photos tomorrow",
  "Our ground fits 14 players",
  "We are 2 partners running this turf",
  "Manager here, please update the timings",
  "The turf is open from 6 am to 11 pm",
  "I want to update the prices",
  "Staff at the turf, the owner asked me to claim it",
  "Slots available from 6 am to midnight",
  "Slots for weekends are 1200",
  "Booking on WhatsApp only",
  "Booking at the counter or on call",
];

test("booking-like notes: requests to book or play count, in English and Hinglish", () => {
  for (const n of BOOKING) assert.equal(bookingLikeNote(n), true, n);
});

test("booking-like notes: an owner's notes never count, open 24 hours included", () => {
  for (const n of NOT_BOOKING) assert.equal(bookingLikeNote(n), false, n);
  assert.equal(bookingLikeNote(null), false);
  assert.equal(bookingLikeNote(undefined), false);
});

const none: ClaimFacts = { note: null, phoneSignIn: false, turfHasNumber: true, games: 0, requests: 0, tappedBeforeSignup: false, turfsOpenedBeforeSignup: 1 };

test("signals: an owner-like claim has none, so no line", () => {
  assert.deepEqual(playerSignals(none), []);
  assert.equal(playerSignalLine(playerSignals(none)), null);
  assert.deepEqual(playerSignals({ ...none, note: "This is my turf, my brother and I manage it", phoneSignIn: true }), [], "a phone sign-in on a turf with a number is normal for an owner");
});

test("signals: each fact in plain words, in a fixed order", () => {
  const all = playerSignals({ note: "We want to book box cricket for 2 hours", phoneSignIn: true, turfHasNumber: false, games: 1, requests: 3, tappedBeforeSignup: true, turfsOpenedBeforeSignup: 5 });
  assert.deepEqual(all, [
    "note reads like a booking",
    "phone sign-in on a turf with no number",
    "made 1 game",
    "sent 3 join requests",
    "tapped Call or WhatsApp before signing up",
    "opened 5 turfs before signing up",
  ]);
  assert.equal(playerSignalLine(all.slice(0, 2)), "Looks like a player: note reads like a booking, phone sign-in on a turf with no number.");
  assert.deepEqual(playerSignals({ ...none, games: 2, requests: 1 }), ["made 2 games", "sent 1 join request"]);
});

test("signals: a Google sign-in on a no-number turf, or an unknown number, is not the phone signal", () => {
  assert.deepEqual(playerSignals({ ...none, phoneSignIn: false, turfHasNumber: false }), []);
  assert.deepEqual(playerSignals({ ...none, phoneSignIn: true, turfHasNumber: null }), []);
});

test("signals: turfs opened count from the threshold; not recorded is not a signal", () => {
  assert.deepEqual(playerSignals({ ...none, turfsOpenedBeforeSignup: MANY_TURFS_OPENED - 1 }), []);
  assert.deepEqual(playerSignals({ ...none, turfsOpenedBeforeSignup: MANY_TURFS_OPENED }), [`opened ${MANY_TURFS_OPENED} turfs before signing up`]);
  assert.deepEqual(playerSignals({ ...none, turfsOpenedBeforeSignup: null, tappedBeforeSignup: null }), []);
});

test("claimFacts: from the claim's key and the signals row; malformed reads as unknown; no row is null", () => {
  const f = claimFacts({ userKey: "p:9800000001", note: "hi" }, { games: 2, requests: "x", pre_contact_tap: true, pre_turfs_opened: 4.4, turf_has_number: false });
  assert.deepEqual(f, { note: "hi", phoneSignIn: true, turfHasNumber: false, games: 2, requests: 0, tappedBeforeSignup: true, turfsOpenedBeforeSignup: 4 });
  const g = claimFacts({ userKey: "e:sam@x.in", note: null }, { pre_contact_tap: null, pre_turfs_opened: null });
  assert.deepEqual(g, { note: null, phoneSignIn: false, turfHasNumber: null, games: 0, requests: 0, tappedBeforeSignup: null, turfsOpenedBeforeSignup: null });
  assert.equal(claimFacts({ userKey: "p:9800000001", note: null }, null), null);
  assert.equal(claimFacts({ userKey: "p:9800000001", note: null }, undefined), null);
});
