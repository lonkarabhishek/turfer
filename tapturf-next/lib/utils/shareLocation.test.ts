import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_LOCATION, locationShareText, placeUrl, turfLocationText } from "./shareLocation";

test("placeUrl opens the place: by its place id, else its point, else a search", () => {
  const turf = { name: "Kings Turf Arena", address: "Gangapur Road, Nashik", lat: 19.99, lng: 73.78 };
  assert.equal(
    placeUrl({ ...turf, placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" }),
    "https://www.google.com/maps/search/?api=1&query=Kings%20Turf%20Arena%2C%20Gangapur%20Road%2C%20Nashik&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4",
  );
  // No place id, or one that is not an id: the point.
  assert.equal(placeUrl(turf), "https://www.google.com/maps/search/?api=1&query=19.99,73.78");
  assert.equal(placeUrl({ ...turf, placeId: "x y&z=1" }), "https://www.google.com/maps/search/?api=1&query=19.99,73.78");
  // 0,0 is no place: the words instead.
  assert.equal(placeUrl({ ...turf, lat: 0, lng: 0 }), "https://www.google.com/maps/search/?api=1&query=Kings%20Turf%20Arena%2C%20Gangapur%20Road%2C%20Nashik");
  assert.equal(placeUrl({ name: "Kings Turf Arena" }), "https://www.google.com/maps/search/?api=1&query=Kings%20Turf%20Arena");
  assert.equal(placeUrl({}), null);
  assert.equal(placeUrl({ placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" }), null);
});

test("the message is the place: name, address, the Maps link, then its TapTurf page", () => {
  assert.equal(
    turfLocationText({ name: "Kings Turf Arena", address: "Gangapur Road,\n Nashik", lat: 19.99, lng: 73.78 }, "https://www.tapturf.in/turf/kings-turf-arena-nashik"),
    "📍 Kings Turf Arena\nGangapur Road, Nashik\nhttps://www.google.com/maps/search/?api=1&query=19.99,73.78\nOn TapTurf: https://www.tapturf.in/turf/kings-turf-arena-nashik",
  );
  // A venue its host typed: the host's own Maps link, no TapTurf page.
  assert.equal(
    locationShareText({ name: "Society Ground", address: "Baner", mapUrl: "https://maps.app.goo.gl/abc" }),
    "📍 Society Ground\nBaner\nhttps://maps.app.goo.gl/abc",
  );
  // An address that only repeats the name is said once.
  assert.equal(locationShareText({ name: "Kings Turf", address: "kings turf", mapUrl: "https://maps.app.goo.gl/abc" }), "📍 Kings Turf\nhttps://maps.app.goo.gl/abc");
  // Nothing worth sending without a name or a link.
  assert.equal(locationShareText({ name: "Kings Turf" }), null);
  assert.equal(locationShareText({ mapUrl: "https://maps.app.goo.gl/abc" }), null);
  assert.equal(turfLocationText({}), null);
});

test("the button's words never say book, and name whose location it is", () => {
  const words = [SHARE_LOCATION.label, SHARE_LOCATION.copied, SHARE_LOCATION.aria("Kings Turf")].join(" ");
  assert.doesNotMatch(words, /book/i);
  assert.equal(SHARE_LOCATION.aria("Kings Turf"), "Share Kings Turf's location");
  assert.doesNotMatch(turfLocationText({ name: "Kings Turf", address: "Nashik" }, "https://www.tapturf.in/turf/kings") ?? "", /book/i);
});
