import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import type { Game } from "../../types/game";
import { forCard } from "../utils/cardTurf";
import { cardPrice, cardSports } from "../utils/cardSport";
import { turfPhotos } from "../utils/images";
import { areaFor } from "../utils/area";
import { SPORT_CHIPS } from "../turfList/query";
import { fromMapTurf, gamePin, pickedGames, roundDeg, toMapGame, toMapTurf, turfPin } from "./data";

/** A card row as getNearTurfs hands it over: forCard() of a full row, sport bands added when it has any. */
function row(p: Partial<Turf> & Record<string, unknown> = {}): Turf {
  const full = {
    id: "5b9f50b1-dcce-45a9-9c8f-c847812b18d0",
    slug: "turf-up-baner",
    name: "Turf Up",
    address: "Survey 12, Baner Rd, Baner, Pune, Maharashtra",
    area: "Baner",
    city: "pune",
    sports: ["Box Cricket", "Football"],
    images: ["https://example.supabase.co/storage/v1/object/public/turf-photos/5b9f50b1-dcce-45a9-9c8f-c847812b18d0/0123456789abcdef01234567.webp"],
    cover_image: null,
    rating: 4.6,
    total_reviews: 120,
    lat: 18.5610585,
    lng: 73.7890204,
    morning_price: 800,
    afternoon_price: 800,
    evening_price: 1200,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: 1400,
    price_mentions: null,
    price_unit: "per_hour",
    slot_minutes: 60,
    is_24x7: null,
    claimed: false,
    has_floodlights: true,
    is_covered: null,
    // Never on the map.
    owner_phone: "9800000000",
    owner_name: "Owner Person",
    contact_info: { phone: "9800000001", email: "owner@example.com" },
    description: "Long text",
    amenities: ["Parking"],
    ...p,
  };
  const card = forCard(full as unknown as Turf);
  return p.sport_bands ? ({ ...card, sport_bands: p.sport_bands } as Turf) : card;
}

const ROWS: Turf[] = [
  row(),
  row({ slug: null, id: "9c029dc9-f608-4de7-a42a-9c0070bb2b5c", area: null, address: "HQWG+P5C, Lane 2, Chilekar Nagar, Wakad, Pune", is_24x7: true, claimed: true }),
  row({ morning_price: null, afternoon_price: null, evening_price: null, weekend_evening_price: null, price_mentions: [{ price_inr: 1000, context: "x" }, { text: "Rs 900 at night" }, { price_inr: 700 }] }),
  row({ morning_price: null, afternoon_price: null, evening_price: null, weekend_evening_price: null, price_mentions: [{ text: "ask at the desk" }] }),
  row({ morning_price: null, afternoon_price: null, evening_price: null, weekend_evening_price: null, price_mentions: null, images: [], sports: ["Badminton", "Pickleball"] }),
  row({ price_unit: "per_slot", slot_minutes: 90, sports: ["Badminton", "Box Cricket"] }),
  row({ sports: ["Football", "Badminton", "Box Cricket"], sport_bands: { football: [1500, 1800], "box-cricket": [1000, 1000] } }),
  row({ sports: ["Football"], sport_bands: { football: [900, 900], owner: true } }),
  row({ cover_image: "https://lh3.googleusercontent.com/p/AF1Qip-abc=w1600-h1200", images: [] }),
];

test("toMapTurf: key, rounded place, empty values left out", () => {
  const w = toMapTurf(ROWS[0])!;
  assert.equal(w.k, "turf-up-baner");
  assert.equal(w.y, 18.56106);
  assert.equal(w.x, 73.78902);
  assert.equal(w.p, "Baner");
  assert.equal(w.c, "pune");
  assert.deepEqual(w.pr, [800, 800, 1200, null, null, 1400]);
  assert.equal(w.u, undefined, "per hour is the default");
  assert.equal(w.h, undefined);
  assert.equal(w.o, undefined);
  assert.equal(w.m, undefined);
  assert.equal(roundDeg(-0.000004), -0);
  const noSlug = toMapTurf(ROWS[1])!;
  assert.equal(noSlug.k, "9c029dc9-f608-4de7-a42a-9c0070bb2b5c");
  assert.equal(noSlug.p, "Wakad", "the area found in the address, as TurfCard shows it");
  assert.equal(noSlug.h, 1);
  assert.equal(noSlug.o, 1);
});

test("toMapTurf: no location, no pin", () => {
  assert.equal(toMapTurf(row({ lat: null, lng: null })), null);
  assert.equal(toMapTurf(row({ lat: 0, lng: 0 })), null);
  assert.equal(toMapTurf(row({ lat: 95, lng: 73 })), null);
  assert.equal(toMapTurf(row({ lat: Number.NaN })), null);
  assert.equal(toMapTurf(row({ lat: "18.5" as unknown as number, lng: "73.8" as unknown as number }))?.y, 18.5);
});

test("toMapTurf: only public listing fields travel", () => {
  const json = JSON.stringify(ROWS.map(toMapTurf));
  for (const secret of ["9800000000", "9800000001", "owner@example.com", "Owner Person", "Long text", "Parking", "contact", "phone", "email"]) {
    assert.ok(!json.includes(secret), secret);
  }
  assert.deepEqual(
    [...new Set(ROWS.flatMap((r) => Object.keys(toMapTurf(r)!)))].sort(),
    ["b", "c", "h", "k", "m", "n", "o", "p", "ph", "pr", "r", "s", "sm", "u", "v", "x", "y"],
  );
});

test("fromMapTurf: every card and pin reads the same price, sports, place and photo as the card row", () => {
  for (const t of ROWS) {
    const back = fromMapTurf(JSON.parse(JSON.stringify(toMapTurf(t)!)));
    for (const sport of [null, ...SPORT_CHIPS.map((chip) => ({ chip }))]) {
      assert.deepEqual(cardPrice(back, sport), cardPrice(t, sport), `${t.name} ${t.sports} ${sport?.chip}`);
      assert.deepEqual(cardSports(back.sports, sport), cardSports(t.sports, sport));
    }
    assert.equal(turfPhotos(back)[0], turfPhotos(t)[0]);
    assert.equal(areaFor(back) ?? back.address, areaFor(t) ?? t.address);
    assert.equal(back.rating, t.rating);
    assert.equal(back.total_reviews, t.total_reviews);
    assert.equal(back.is_24x7 === true, t.is_24x7 === true);
    assert.equal(back.claimed === true, t.claimed === true);
    assert.equal(back.id, t.slug || t.id);
  }
});

test("turfPin: the low end of the card's price, or the sport", () => {
  assert.deepEqual(turfPin(ROWS[0]), { text: "₹800", label: "Turf Up, ₹800–1,400/hr" });
  assert.deepEqual(turfPin(ROWS[2]), { text: "~₹700", label: "Turf Up, players reported ₹700–1,000/hr" });
  assert.deepEqual(turfPin(ROWS[3]), { text: "Box Cricket", label: "Turf Up, Box Cricket, prices not listed yet" });
  assert.deepEqual(turfPin(ROWS[4]), { text: "Badminton", label: "Turf Up, Badminton, prices not listed yet" });
  assert.equal(turfPin(ROWS[5]).label, "Turf Up, ₹800–1,400/90-min slot");
  // A chip shows only that sport's price: the bands' football range, never the card's.
  assert.equal(turfPin(ROWS[6], { chip: "Football" }).text, "₹1,500");
  assert.equal(turfPin(ROWS[6], { chip: "Box Cricket" }).text, "₹1,000");
  // Badminton at a venue whose prices are another sport's: no price, the chip's sport leads.
  assert.deepEqual(turfPin(ROWS[6], { chip: "Badminton" }), { text: "Badminton", label: "Turf Up, Badminton, prices not listed yet" });
  // "Cricket" leads with the label it matched.
  assert.equal(turfPin(ROWS[4], { chip: "Pickleball" }).text, "Pickleball");
  for (const t of ROWS) assert.ok(!turfPin(t).text.includes("₹0"));
});

const GAME: Game = {
  id: "00000000-0000-4000-8000-00000000a001",
  creator_id: "00000000-0000-4000-8000-0000000000c1",
  turf_id: "t1",
  title: "Football Game",
  sport: "football",
  skill_level: "all",
  date: "2026-11-02",
  start_time: "19:00:00",
  end_time: "20:00:00",
  current_players: 6,
  max_players: 10,
  price_per_player: 150,
  description: "Bring a dark tee",
  turf_booked: true,
  status: "open",
  host_name: "Asha Rao",
  host_phone: "9800000002",
  host_profile_image_url: "",
  created_at: "2026-10-30T10:00:00+00:00",
  turfs: { id: "t1", slug: "turf-up-baner", name: "Turf Up", address: "Baner, Pune", area: "Baner", city: "pune", lat: 18.5610585, lng: 73.7890204, photos: ["a", "b", "c"] },
};

test("toMapGame: what GameCard shows, never the host's number", () => {
  const g = toMapGame(GAME)!;
  assert.equal(g.turfs.lat, 18.56106);
  assert.deepEqual(g.turfs.photos, ["a", "b"]);
  const json = JSON.stringify(g);
  for (const secret of ["9800000002", "host_phone", "Bring a dark tee", "created_at", "turf_id"]) assert.ok(!json.includes(secret), secret);
  assert.equal("host_profile_image_url" in g, false, "an empty photo is left out");
  assert.equal(toMapGame({ ...GAME, turfs: undefined }), null);
  assert.equal(toMapGame({ ...GAME, turfs: { ...GAME.turfs!, lat: null, lng: null } }), null);
});

test("pickedGames: a turf's weekly games, every one, soonest first", () => {
  const at = (id: string, date: string, start: string) => toMapGame({ ...GAME, id, date, start_time: start })!;
  // As a bubble's leaves come (supercluster's order), plus one elsewhere.
  const games = [at("a008", "2026-11-16", "19:00:00"), at("a001", "2026-11-02", "19:00:00"), at("x", "2026-11-03", "07:00:00"), at("a007", "2026-11-09", "19:00:00"), at("a009", "2026-11-02", "06:30:00")];
  assert.deepEqual(pickedGames(["a008", "a001", "a007", "a009"], games).map((g) => g.id), ["a009", "a001", "a007", "a008"]);
  assert.deepEqual(pickedGames(["a001"], games).map((g) => g.id), ["a001"]);
  assert.deepEqual(pickedGames(["gone"], games), [], "a game no longer on the map");
});

test("gamePin: when it starts, short", () => {
  // 1 Nov 2026, 10:00 in India.
  const now = Date.UTC(2026, 10, 1, 4, 30);
  const at = (date: string, start = "19:00:00") => gamePin({ ...toMapGame({ ...GAME, date, start_time: start })! }, now);
  assert.equal(at("2026-11-01").text, "Today 7 PM");
  assert.equal(at("2026-11-02", "06:30:00").text, "Tmrw 6:30 AM");
  assert.equal(at("2026-11-04").text, "Wed 7 PM");
  assert.equal(at("2026-11-09").text, "9 Nov");
  assert.equal(at("2026-11-02").label, "Football game at Turf Up, Tomorrow, Mon 2 Nov, 7 PM");
});
