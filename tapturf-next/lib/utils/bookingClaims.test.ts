import { test } from "node:test";
import assert from "node:assert/strict";
import { stripBookingClaims } from "./bookingClaims";

// Sentences as the research pass wrote them (turfs.description, 26 Oct).
test("booking-app sentences are dropped", () => {
  assert.equal(
    stripBookingClaims("Turf Up is a box cricket turf in Hinjewadi. It is publicly bookable on Playo. Reviewers praise the lights."),
    "Turf Up is a box cricket turf in Hinjewadi. Reviewers praise the lights.",
  );
  for (const s of [
    "It is listed on Playo for bookings enquiry.",
    "It is publicly bookable on Playo and KheloMore.",
    "It is listed on Hudle for box cricket.",
    "It is listed on Playo and Hudle for box cricket and football.",
    "It is bookable on Playo and KheloMore with late-night slots.",
    "Courts are publicly bookable on both apps.",
    "Its artificial turf is listed on KheloMore for box cricket and football bookings.",
  ]) {
    assert.equal(stripBookingClaims(`A floodlit turf in Wakad. ${s}`), "A floodlit turf in Wakad.", s);
  }
});

test("booking-app clauses go, the rest of the sentence stays", () => {
  assert.equal(
    stripBookingClaims("It is part of the Hotfut chain and is bookable on Playo, KheloMore and Hudle, with slots from early morning until after midnight."),
    "It is part of the Hotfut chain, with slots from early morning until after midnight.",
  );
  assert.equal(
    stripBookingClaims("Listings mention floodlights, washrooms and parking, and the venue is bookable on KheloMore."),
    "Listings mention floodlights, washrooms and parking.",
  );
  assert.equal(
    stripBookingClaims("Samartha Sports Arena is a cricket and football turf on Akkalkot Road in the MIDC area, listed on Playo."),
    "Samartha Sports Arena is a cricket and football turf on Akkalkot Road in the MIDC area.",
  );
  assert.equal(
    stripBookingClaims("Playo lists parking and washroom facilities, and the venue is also listed on KheloMore."),
    "Playo lists parking and washroom facilities.",
  );
  assert.equal(
    stripBookingClaims("Claygrounds Sec 86 is a 5v5 turf at Omaxe World Street, run by Claygrounds and bookable on the Claygrounds site and District."),
    "Claygrounds Sec 86 is a 5v5 turf at Omaxe World Street, run by Claygrounds.",
  );
});

// Live phrasings on 10 active turfs (26 Oct) that the first rules missed.
test("selling and can-be-booked phrasings go too", () => {
  for (const s of [
    "The 5-a-side turf can be booked for football and box cricket on Playo.",
    "It can be booked on the ClayGrounds website and on District.",
    "Its Playo listing offers 5-, 6-, 7- and 8-a-side pitch configurations bookable from early morning to late evening.",
    "Playo sells box cricket and bowling-machine sessions of 12 overs per 60 minutes.",
  ]) {
    assert.equal(stripBookingClaims(`A floodlit turf in Wakad. ${s}`), "A floodlit turf in Wakad.", s);
  }
  assert.equal(
    stripBookingClaims("It runs morning and evening coaching for children, and Playo and KheloMore sell evening slots on the pitch."),
    "It runs morning and evening coaching for children.",
  );
  assert.equal(
    stripBookingClaims("Jersey 7 is a cricket practice venue on Pipe Line Road in Puppalaguda, Manikonda, known for its bowling-machine batting sessions, and Playo also sells box cricket here."),
    "Jersey 7 is a cricket practice venue on Pipe Line Road in Puppalaguda, Manikonda, known for its bowling-machine batting sessions.",
  );
  assert.equal(
    stripBookingClaims("The single turf is used for both football and box cricket and is bookable on Playo, KheloMore and Hudle."),
    "The single turf is used for both football and box cricket.",
  );
  assert.equal(
    stripBookingClaims("Playo lists two 6-a-side box cricket turfs with parking, washroom and drinking water, and the venue is also bookable on Hudle."),
    "Playo lists two 6-a-side box cricket turfs with parking, washroom and drinking water.",
  );
  // What the app lists stays; what it sells goes.
  for (const [s, kept] of [
    ["Playo sells box cricket slots and lists drinking water.", "Playo lists drinking water."],
    ["Playo also sells box cricket and lists washroom, parking and drinking water.", "Playo lists washroom, parking and drinking water."],
    ["Playo sells box cricket and bowling-machine sessions and lists washroom, parking and drinking water.", "Playo lists washroom, parking and drinking water."],
    ["Playo sells box cricket and football slots and lists bats, balls and wickets, a washroom and drinking water.", "Playo lists bats, balls and wickets, a washroom and drinking water."],
    [
      "The venue takes bookings through its Kixar listing, which names cricket and football and lists parking, changing rooms, drinking water, first aid and washrooms.",
      "Its Kixar listing names cricket and football and lists parking, changing rooms, drinking water, first aid and washrooms.",
    ],
  ]) {
    assert.equal(stripBookingClaims(s), kept, s);
  }
});

test("text that only names an app, or talks about booking, is kept", () => {
  for (const s of [
    "Playo lists parking, washroom and drinking water.",
    "Dugout is a box cricket ground near Kompally, listed on Playo as Fitbox Kompally.",
    "Maps and Playo list it as open round the clock.",
    "Reviewers say the turf is busy and recommend booking in advance.",
    "It does not appear on the main booking apps, so slots are booked directly with the venue.",
    "Offside is a football academy and bookable turf in Gruhatara Colony.",
    "Pro Turf (listed on Google Maps as Pro Sports Arena) is a sports complex in Mundhwa.",
    "Playo lists washroom, drinking water and beverages, with slots from 6 AM to 11 PM.",
    "Reviewers say the full ground suits 7- or 11-a-side football and Playo notes it is split into two half courts that can be booked together.",
    "Slots can be booked through the CC Turf app, and the chain also runs turfs in Manish Nagar and Pardi.",
    "It is open from 6 AM to midnight, and one reviewer says slots can be booked up to a week ahead over WhatsApp with a token payment.",
    "A sports shop in the district sells cricket gear.",
    "Reviewers say Playo sells out fast on weekends.",
    "It has two large turfs that can be booked separately or together for a full-pitch cricket game, and it is often used for corporate tournaments.",
    "Its Playo listing, under the name Blaze Box Cricket, offers a medium-size turf from 6 AM to midnight with washroom, parking and drinking water.",
  ]) {
    assert.equal(stripBookingClaims(s), s, s);
  }
});

test("paragraph breaks survive, and nothing left is null", () => {
  assert.equal(
    stripBookingClaims("A turf in Baner. It is publicly bookable on Playo.\n\nGood to know: bring your own bat."),
    "A turf in Baner.\n\nGood to know: bring your own bat.",
  );
  assert.equal(stripBookingClaims("It is publicly bookable on Playo."), null);
  assert.equal(stripBookingClaims(""), null);
  assert.equal(stripBookingClaims(null), null);
});
