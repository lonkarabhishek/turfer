import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VENUE_KEYS,
  VENUE_LENGTH,
  asciiDigits,
  isMapsUrl,
  missingVenueColumn,
  storedVenueCity,
  venueCityId,
  venueCityValue,
  venueFieldOk,
  venueFormProblems,
  venueOf,
  venueSearchUrl,
  venueText,
  venueTextProblem,
  type VenueKey,
} from "./otherVenue";

// The same cases scripts/sql-tests/game_other_venue.check.mjs runs through the database.
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/games/otherVenue.cases.json"), "utf8")) as {
  fields: { what: string; key: VenueKey; value: unknown; ok: boolean; problem?: string }[];
};

test("venue fields: every shared case, as the database takes it", () => {
  assert.ok(CASES.fields.length >= 50);
  for (const c of CASES.fields) {
    assert.equal(venueFieldOk(c.key, c.value), c.ok, c.what);
    if (c.problem && typeof c.value === "string") {
      const [min, max] = VENUE_LENGTH[c.key];
      assert.equal(venueTextProblem(c.value, min, max), c.problem, `${c.what}: why`);
    }
  }
  // Each field has cases that pass and cases that don't.
  for (const k of VENUE_KEYS) {
    assert.ok(CASES.fields.some((c) => c.key === k && c.ok), `${k} passes somewhere`);
    assert.ok(CASES.fields.some((c) => c.key === k && !c.ok), `${k} fails somewhere`);
  }
});

test("venue words: spaces collapsed and trimmed, code points counted", () => {
  assert.equal(venueText("  Kings \t\n Turf  "), "Kings Turf");
  assert.equal(venueText("Kings  Turf"), "Kings Turf");
  // A long emoji name counts as the database counts it.
  assert.equal(venueTextProblem("🏏".repeat(80), 2, 80), null);
  assert.equal(venueTextProblem("🏏".repeat(81), 2, 80), "long");
});

test("maps links: https Google Maps only", () => {
  assert.equal(isMapsUrl("https://maps.app.goo.gl/Ab12"), true);
  assert.equal(isMapsUrl("HTTPS://MAPS.APP.GOO.GL/Ab12"), true);
  assert.equal(isMapsUrl("https://maps.app.goo.gl.evil.example/x"), false);
  assert.equal(isMapsUrl(null), false);
  assert.equal(isMapsUrl("data:text/html,x"), false);
  // Browsers resolve dot segments before they open a link: /maps/../url is Google's redirect page.
  assert.equal(isMapsUrl("https://www.google.com/maps/../url?q=https://evil.example"), false);
  assert.equal(isMapsUrl("https://www.google.com/maps/%2e%2e/search?q=x"), false);
});

test("the stored venue: trimmed, optional ones null, the city as an id when it is one", () => {
  assert.deepEqual(
    venueOf({ venue_name: "  Kings   Turf ", venue_address: " Baner Road,  Pune ", venue_area: "  ", venue_city: "Bengaluru", venue_maps_url: "" }),
    { venue_name: "Kings Turf", venue_address: "Baner Road, Pune", venue_area: null, venue_city: "bangalore", venue_maps_url: null },
  );
  assert.deepEqual(venueOf({ venue_name: "Wai Ground", venue_address: "Near bus stand", venue_area: "Ganpati Ali", venue_city: " Wai ", venue_maps_url: " https://maps.app.goo.gl/x " }), {
    venue_name: "Wai Ground",
    venue_address: "Near bus stand",
    venue_area: "Ganpati Ali",
    venue_city: "Wai",
    venue_maps_url: "https://maps.app.goo.gl/x",
  });
});

test("the venue's city: a curated id, label or other name; a live one; else the words", () => {
  assert.equal(venueCityId("Pune"), "pune");
  assert.equal(venueCityId("pune"), "pune");
  assert.equal(venueCityId("  NAVI   MUMBAI "), "mumbai");
  assert.equal(venueCityId("Gurugram"), "gurgaon");
  assert.equal(venueCityId("Wai"), null);
  assert.equal(venueCityId("New Town", ["new-town"]), "new-town");
  assert.equal(venueCityId(""), null);
  assert.equal(venueCityValue("Wai"), "Wai");
  assert.equal(venueCityValue("bengaluru"), "bangalore");
  // Words that name a curated city among others: that city, as the suggestions' "Pune, Maharashtra" invites.
  assert.equal(venueCityValue("Pune, Maharashtra"), "pune");
  assert.equal(venueCityValue("Pune city"), "pune");
  assert.equal(venueCityValue("Hyderabad, Telangana"), "hyderabad");
  assert.equal(venueCityValue("Bangalore Urban"), "bangalore");
  assert.equal(venueCityValue("Thane West"), "mumbai");
  // No guess from a state alone, and a town TapTurf has no city for stays the host's words.
  assert.equal(venueCityValue("Karimnagar, Telangana"), "Karimnagar, Telangana");
  assert.equal(venueCityValue("Lonavala"), "Lonavala");
  // The address is never read for the city: its roads name other cities.
  assert.equal(venueOf({ venue_name: "Hill Ground", venue_address: "Mumbai Pune Highway, Lonavala", venue_city: "Lonavala" }).venue_city, "Lonavala");
  assert.equal(venueOf({ venue_name: "Shivaji Maidan", venue_address: "Behind Ganesh Temple, Baner Road", venue_city: "Pune, Maharashtra" }).venue_city, "pune");
  // A stored value: an id stays one; words are matched; other words are no TapTurf city.
  assert.equal(storedVenueCity("pune"), "pune");
  assert.equal(storedVenueCity("Pune"), "pune");
  assert.equal(storedVenueCity("Wai Town"), null);
  assert.equal(storedVenueCity(null), null);
  // A row written with the words (before they were matched): read as its city too.
  assert.equal(storedVenueCity("Pune, Maharashtra"), "pune");
  assert.equal(storedVenueCity("Hyderabad, Telangana"), "hyderabad");
});

test("digits of any of India's scripts count as digits", () => {
  assert.equal(asciiDigits("९८२२० १२३४५"), "98220 12345");
  assert.equal(asciiDigits("௧௨௩ ੧੨੩ ১২৩ ٣٤٥ ۴۵۶ ９"), "123 123 123 345 456 9");
  assert.equal(asciiDigits("Baner 12, मैदान"), "Baner 12, मैदान");
});

test("the form: each field's problem in the page's words", () => {
  assert.deepEqual(venueFormProblems({ name: "Kings Turf", address: "Baner Road, Pune", area: "", city: "Pune", mapsUrl: "" }), {});
  const p = venueFormProblems({ name: "K", address: "", area: "a.com", city: "", mapsUrl: "https://example.com" });
  assert.deepEqual(Object.keys(p).sort(), ["venue_address", "venue_area", "venue_city", "venue_maps_url", "venue_name"]);
  assert.match(p.venue_name ?? "", /at least 2/);
  assert.match(p.venue_address ?? "", /Add the address/);
  assert.match(p.venue_maps_url ?? "", /maps\.app\.goo\.gl/);
  assert.match(venueFormProblems({ name: "Turf 9876543210", address: "Baner Road", area: "", city: "Pune", mapsUrl: "" }).venue_name ?? "", /phone numbers/);
});

test("open in Maps without a link: a search for the name, address and city", () => {
  assert.equal(
    venueSearchUrl({ name: "Kings Turf", address: "Behind Ganesh Temple, Baner", city: "Pune" }),
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Kings Turf, Behind Ganesh Temple, Baner, Pune")}`,
  );
  // The city once, when the address says it.
  assert.equal(venueSearchUrl({ name: "Kings Turf", address: "Baner Road, Pune", city: "Pune" }), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Kings Turf, Baner Road, Pune")}`);
  assert.equal(venueSearchUrl({}), null);
});

test("a database without the venue columns yet", () => {
  assert.equal(missingVenueColumn({ code: "42703", message: "column games.venue_name does not exist" }), true);
  assert.equal(missingVenueColumn({ code: "42703", message: "column games.other does not exist" }), false);
  assert.equal(missingVenueColumn({ code: "57014", message: "venue_name timeout" }), false);
  assert.equal(missingVenueColumn(null), false);
});
