import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import type { Game } from "../../types/game";
import { forCard } from "../utils/cardTurf";
import { cardPrice, cardSports } from "../utils/cardSport";
import { turfPhotos } from "../utils/images";
import { areaFor } from "../utils/area";
import { SPORT_CHIPS } from "../turfList/query";
import { fromMapTurf, gamePin, mapPoint, mapTurfPin, pagePin, pickedGames, roundDeg, toMapGame, toMapTurf, turfHourly, turfPin } from "./data";

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

test("turfPin: the name and the low end of the card's price, or the sport", () => {
  assert.deepEqual(turfPin(ROWS[0]), { text: "Turf Up | ₹800/hr", label: "Turf Up, ₹800–1,400/hr", name: "Turf Up", tail: "₹800/hr", short: "₹800" });
  assert.deepEqual(turfPin(ROWS[2]), {
    text: "Turf Up | ~₹700/hr",
    label: "Turf Up, players reported ₹700–1,000/hr",
    name: "Turf Up",
    tail: "~₹700/hr",
    short: "~₹700",
  });
  assert.deepEqual(turfPin(ROWS[3]), { text: "Turf Up | Box Cricket", label: "Turf Up, Box Cricket, prices not listed yet", name: "Turf Up", tail: "Box Cricket", short: null });
  assert.deepEqual(turfPin(ROWS[4]), { text: "Turf Up | Badminton", label: "Turf Up, Badminton, prices not listed yet", name: "Turf Up", tail: "Badminton", short: null });
  // A slot price says so, short; the label keeps the slot's length.
  assert.equal(turfPin(ROWS[5]).text, "Turf Up | ₹800/slot");
  assert.equal(turfPin(ROWS[5]).label, "Turf Up, ₹800–1,400/90-min slot");
  assert.equal(turfPin(row({ price_unit: "per_person" })).tail, "₹800/person");
  // A chip shows only that sport's price: the bands' football range, never the card's.
  assert.equal(turfPin(ROWS[6], { chip: "Football" }).text, "Turf Up | ₹1,500/hr");
  assert.equal(turfPin(ROWS[6], { chip: "Box Cricket" }).short, "₹1,000");
  // Badminton at a venue whose prices are another sport's: no price, and the chip already says the sport, so the name alone.
  assert.deepEqual(turfPin(ROWS[6], { chip: "Badminton" }), { text: "Turf Up", label: "Turf Up, Badminton, prices not listed yet", name: "Turf Up", tail: null, short: null });
  // The label leads with the label the chip matched.
  assert.equal(turfPin(ROWS[4], { chip: "Pickleball" }).label, "Turf Up, Pickleball, prices not listed yet");
  // A long name is cut on the pin, whole in the label (the card and a screen reader).
  const long = turfPin(row({ name: "Gamechangers Sports Arena Baner" }));
  assert.equal(long.text, "Gamechangers… | ₹800/hr");
  assert.equal(long.label, "Gamechangers Sports Arena Baner, ₹800–1,400/hr");
  // No name, no sport, no price: still a pin.
  assert.equal(turfPin(row({ name: "", sports: [], morning_price: null, afternoon_price: null, evening_price: null, weekend_evening_price: null })).text, "Turf");
  for (const t of ROWS) assert.ok(!turfPin(t).text.includes("₹0"));
});

test("turfHourly: the pin's listed price per hour, for its bubble's average", () => {
  assert.equal(turfHourly(ROWS[0]), 800, "the low end the pin shows");
  assert.equal(turfHourly(ROWS[2]), null, "a reported price is not a listed one");
  assert.equal(turfHourly(ROWS[3]), null);
  assert.equal(turfHourly(ROWS[4]), null, "no price at all");
  assert.equal(turfHourly(ROWS[5]), (800 * 60) / 90, "₹800 a 90-minute slot is about ₹533 an hour");
  assert.equal(turfHourly(row({ price_unit: "per_slot", slot_minutes: null })), null, "a slot of no stated length has no hourly rate");
  assert.equal(turfHourly(row({ price_unit: "per_person" })), null, "nor has a price per person");
  assert.equal(turfHourly(row({ price_unit: null, slot_minutes: null })), 800, "no unit reads as per hour, as on the card");
  // A chip's price rule: the bands' football range (per hour), never the card's; none for a sport it does not price.
  assert.equal(turfHourly(ROWS[6], { chip: "Football" }), 1500);
  assert.equal(turfHourly(ROWS[6], { chip: "Box Cricket" }), 1000);
  assert.equal(turfHourly(ROWS[6], { chip: "Badminton" }), null);
  assert.equal(
    turfHourly(row({ price_unit: "per_slot", slot_minutes: 90, sports: ["Football", "Box Cricket"], sport_bands: { football: [1200, 1200] } }), { chip: "Football" }),
    1200,
    "a band's price is per hour whatever the card's unit",
  );
  // Always the number the pin shows, per hour.
  for (const t of ROWS) {
    for (const sport of [null, ...SPORT_CHIPS.map((chip) => ({ chip }))]) {
      const h = turfHourly(t, sport);
      if (h != null && cardPrice(t, sport).unit === "/hr") assert.equal(turfPin(t, sport).tail, `₹${h.toLocaleString("en-IN")}/hr`, `${t.name} ${sport?.chip}`);
      if (h != null) assert.ok(h > 0);
    }
  }
});

test("mapTurfPin: a map turf's pin, its key, point, place, hourly price and words", () => {
  const t = fromMapTurf(toMapTurf(ROWS[0])!);
  assert.deepEqual(mapTurfPin(t), { key: "turf-up-baner", lat: 18.56106, lng: 73.78902, place: "Turf Up", hourly: 800, ...turfPin(t) });
  assert.equal(mapTurfPin(t).text, "Turf Up | ₹800/hr");
  const banded = fromMapTurf(toMapTurf(ROWS[6])!);
  assert.deepEqual(mapTurfPin(banded, { chip: "Football" }), { key: "turf-up-baner", lat: 18.56106, lng: 73.78902, place: "Turf Up", hourly: 1500, ...turfPin(banded, { chip: "Football" }) });
});

test("pagePin: a turf page's own pin is exactly the one /map draws for it", () => {
  // The page's row is the whole row (notes, contact and all); /map's comes through forCard and the wire.
  const page = {
    ...ROWS[0],
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_evening_price: null,
    price_mentions: [{ price_inr: 1000, context: "weekday nights" }, { text: "Rs 900 before 7" }, { price_inr: 700, source: "player" }],
    description: "Long text",
    owner_phone: "9800000000",
    contact_info: { phone: "9800000001", email: "owner@example.com" },
    images: ["https://example.supabase.co/a.webp", "https://example.supabase.co/b.webp", "https://example.supabase.co/c.webp", "https://example.supabase.co/d.webp", "https://example.supabase.co/e.webp"],
  } as unknown as Turf;
  const onMap = mapTurfPin(fromMapTurf(JSON.parse(JSON.stringify(toMapTurf(forCard(page))))));
  assert.deepEqual(pagePin(page), onMap);
  assert.equal(pagePin(page)!.text, "Turf Up | ~₹700/hr", "the reported low end, as the map shows it");
  for (const t of ROWS) assert.deepEqual(pagePin(t), mapTurfPin(fromMapTurf(toMapTurf(t)!)), t.name);
  const json = JSON.stringify(pagePin(page));
  for (const secret of ["9800000000", "9800000001", "owner@example.com", "Long text", "weekday", "Rs 900"]) assert.ok(!json.includes(secret), secret);
  // No point on the map: no map card.
  for (const at of [{ lat: null, lng: null }, { lat: 0, lng: 0 }, { lat: 18.5, lng: null }, { lat: 91, lng: 73 }]) {
    assert.equal(pagePin({ ...page, ...at } as unknown as Turf), null, JSON.stringify(at));
  }
});

test("mapPoint: the pin's key and point, or none", () => {
  assert.deepEqual(mapPoint(ROWS[0]), { k: "turf-up-baner", y: 18.56106, x: 73.78902 });
  assert.deepEqual(mapPoint(ROWS[1]), { k: "9c029dc9-f608-4de7-a42a-9c0070bb2b5c", y: 18.56106, x: 73.78902 });
  assert.equal(mapPoint({ id: "a", lat: 0, lng: 0 }), null);
  assert.equal(mapPoint({ id: "a", lat: null, lng: 73 }), null);
  for (const t of ROWS) {
    const w = toMapTurf(t)!;
    assert.deepEqual(mapPoint(t), { k: w.k, y: w.y, x: w.x }, "the same point as the pin");
  }
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
