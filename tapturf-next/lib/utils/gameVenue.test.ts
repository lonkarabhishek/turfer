import { test } from "node:test";
import assert from "node:assert/strict";
import { sportBySlug } from "../sports";
import {
  NEARBY_MAX_KM,
  gameSportPage,
  nearbyVenues,
  venueDistance,
  venueLine,
  venueMoveNotice,
  venueMoveRecipients,
  venueProblem,
  type VenueRow,
} from "./gameVenue";

// Baner, Pune, and turfs at known offsets (0.01 deg of latitude is about 1.11 km).
const here = { id: "t0", lat: 18.559, lng: 73.786 };
const row = (id: string, dLat: number, sports: string[], extra: Partial<VenueRow> = {}): VenueRow => ({
  id,
  name: `Turf ${id}`,
  area: "Baner",
  city: "pune",
  lat: here.lat + dLat,
  lng: here.lng,
  sports,
  ...extra,
});

test("venue: a game's sport finds its sport page, exactly or by the words it names", () => {
  assert.equal(gameSportPage("Football")?.slug, "football");
  assert.equal(gameSportPage("football")?.slug, "football");
  assert.equal(gameSportPage("Box Cricket")?.slug, "box-cricket");
  assert.equal(gameSportPage("cricket")?.slug, "cricket");
  assert.equal(gameSportPage("5v5 Football")?.slug, "football");
  // The longest label it names wins: box cricket is not plain cricket.
  assert.equal(gameSportPage("Indoor Box Cricket")?.slug, "box-cricket");
  assert.equal(gameSportPage("Kabaddi"), undefined);
  assert.equal(gameSportPage(""), undefined);
});

test("venue: nearby lists other turfs that list the sport, nearest first, within the cap", () => {
  const football = sportBySlug("football")!;
  const rows = [
    row("far", 0.3, ["Football"]),
    row("b", 0.03, ["Football", "Box Cricket"]),
    row("a", 0.01, ["futsal"]),
    row("cricket-only", 0.005, ["Box Cricket"]),
    row("t0", 0, ["Football"]),
    row("closed", 0.002, ["Football"], { is_active: false }),
    row("nowhere", 0, ["Football"], { lat: null }),
    row("b", 0.03, ["Football"]),
  ];
  const got = nearbyVenues(here, rows, football);
  assert.deepEqual(got.map((v) => v.id), ["a", "b"]);
  assert.ok(Math.abs((got[0].km ?? 0) - 1.11) < 0.02);
  assert.ok(got.every((v) => (v.km ?? 0) <= NEARBY_MAX_KM));
  assert.equal(nearbyVenues(here, rows, football, 1).length, 1);
});

test("venue: no list without the current turf's place or a sport page", () => {
  const football = sportBySlug("football")!;
  const rows = [row("a", 0.01, ["Football"])];
  assert.deepEqual(nearbyVenues({ id: "t0", lat: null, lng: null }, rows, football), []);
  assert.deepEqual(nearbyVenues(here, rows, undefined), []);
  assert.deepEqual(nearbyVenues(null, rows, football), []);
});

test("venue: distance and the one-line place", () => {
  assert.equal(venueDistance(0.8), "800 m");
  assert.equal(venueDistance(2.43), "2.4 km");
  assert.equal(venueDistance(null), null);
  assert.equal(venueDistance(NaN), null);
  assert.equal(venueLine({ name: "Dribble Den", area: "Begur", city: "bangalore" }), "Dribble Den, Begur");
  assert.equal(venueLine({ name: "Arena Seven", area: null, city: "pune" }), "Arena Seven, Pune");
  assert.equal(venueLine({ name: "Pune", area: null, city: "pune" }), "Pune");
  assert.equal(venueLine({ name: "Ascend - The Turf (Baner)", area: "Baner", city: "pune" }), "Ascend - The Turf (Baner)");
  assert.equal(venueLine({ name: "Baneria Arena", area: "Baner", city: "pune" }), "Baneria Arena, Baner");
  assert.equal(venueLine({ name: " ", area: "Baner" }), "");
});

test("venue: the save takes only a listed turf, and no change is no problem", () => {
  assert.equal(venueProblem(null, "t0", null), null);
  assert.equal(venueProblem({ id: "t0" }, "t0", null), null);
  assert.equal(venueProblem({ id: "t1" }, "t0", { id: "t1" }), null);
  assert.match(venueProblem({ id: "t1" }, "t0", null) ?? "", /isn't listed/);
  assert.match(venueProblem({ id: "t1" }, "t0", { id: "t2" }) ?? "", /isn't listed/);
});

test("venue: the players' note says who moved which game where, with the date itself", () => {
  const n = venueMoveNotice({ host_name: "Asha Rao", sport: "football", date: "2026-11-07" }, { name: "Dribble Den", area: "Begur", city: "bangalore" });
  assert.equal(n.title, "Venue changed");
  assert.equal(n.message, "Asha moved Football on Sat 7 Nov to Dribble Den, Begur");
  assert.ok(!/book/i.test(n.message));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  assert.ok(!/today|tomorrow/i.test(venueMoveNotice({ host_name: "Asha", sport: "cricket", date: today }, { name: "X Arena" }).message));
  assert.equal(venueMoveNotice({ host_name: "Player", sport: "5v5 football", date: null }, { name: "Arena Seven", city: "pune" }).message, "Your host moved 5v5 Football to Arena Seven, Pune");
});

test("venue: everyone playing and everyone waiting hears once, never the host", () => {
  const got = venueMoveRecipients(
    "host",
    [{ user_id: "host" }, { user_id: "p1" }, { user_id: "p2" }],
    [
      { user_id: "p1", status: "accepted" },
      { user_id: "r1", status: "pending" },
      { user_id: "d1", status: "declined" },
      { user_id: "", status: "pending" },
      { user_id: null, status: "pending" },
      { user_id: "r1", status: "pending" },
    ],
  );
  assert.deepEqual(got, ["p1", "p2", "r1"]);
});
