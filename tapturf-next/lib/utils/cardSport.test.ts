import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandKind,
  cardPrice,
  cardSports,
  isTurfSport,
  labelRank,
  pricesAreForSport,
  sportBandMap,
  sportBandRange,
  sportBandsOf,
  sportLineParts,
  sportMinimumPrice,
  sportPrice,
  type CardSport,
} from "./cardSport";
import { getMinimumPrice, priceRangeText, summarisePrice } from "./prices";
import { SPORT_PAGES, sportBySlug, turfPlaysSport } from "../sports";
import type { PriceBand, Turf } from "../../types/turf";

// A list row as forCard() ships it: price columns null unless set.
const turf = (over: Partial<Turf> = {}): Turf =>
  ({
    id: "t1",
    name: "Venue",
    sports: ["Football"],
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    price_unit: null,
    slot_minutes: null,
    ...over,
  }) as unknown as Turf;

const page = (slug: string): CardSport => ({ labels: sportBySlug(slug)!.labels });
const chip = (c: string): CardSport => ({ chip: c });
const NOT_LISTED = { label: "Prices not listed yet", kind: "unknown", min: null, max: null, unit: "/hr" };

test("unfiltered lists: the first two labels and summarisePrice, exactly as before", () => {
  const labels = ["Box Cricket", "Football", "Badminton"];
  assert.deepEqual(cardSports(labels), ["Box Cricket", "Football"]);
  assert.deepEqual(cardSports(labels, null), ["Box Cricket", "Football"]);
  assert.deepEqual(cardSports(["Football"]), ["Football"]);
  assert.deepEqual(cardSports([]), []);
  const t = turf({ sports: labels, morning_price: 800, evening_price: 1400 });
  assert.deepEqual(cardPrice(t), summarisePrice(t));
  assert.deepEqual(cardPrice(t, null), summarisePrice(t));
});

test("P1: the selected sport leads, then the two sports the card showed before", () => {
  // Sprintplay Sports Arena on /bangalore/badminton (29 Oct): read "Box Cricket, Football".
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Badminton"], page("badminton")), ["Badminton", "Box Cricket", "Football"]);
  // Already first: unchanged.
  assert.deepEqual(cardSports(["Badminton", "Football"], page("badminton")), ["Badminton", "Football"]);
  // Second: moves to the front, and the next other sport keeps the card at three.
  assert.deepEqual(cardSports(["Football", "Badminton", "Box Cricket", "Cricket"], page("badminton")), ["Badminton", "Football", "Box Cricket"]);
  // Only sport.
  assert.deepEqual(cardSports(["Pickleball"], page("pickleball")), ["Pickleball"]);
  // Far down a long list.
  assert.deepEqual(
    cardSports(["Box Cricket", "Football", "Volleyball", "Handball", "Throwball", "Cricket Nets", "Pickleball"], page("pickleball")),
    ["Pickleball", "Box Cricket", "Football"],
  );
});

test("P1: every label of the page matches, the page's own label first", () => {
  // Football page lists Football and Futsal: Football leads whatever the stored order.
  assert.deepEqual(cardSports(["Box Cricket", "Futsal", "Football"], page("football")), ["Football", "Futsal", "Box Cricket"]);
  // A Futsal-only venue on /<city>/football shows Futsal (honest: that is what it lists).
  assert.deepEqual(cardSports(["Futsal", "Box Cricket"], page("football")), ["Futsal", "Box Cricket"]);
  // Tennis page: Lawn Tennis and Tennis; Table Tennis is another sport.
  assert.deepEqual(cardSports(["Table Tennis", "Lawn Tennis"], page("tennis")), ["Lawn Tennis", "Table Tennis"]);
  // Cricket page: nets count, box cricket does not.
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Cricket Nets", "Cricket"], page("cricket")), ["Cricket", "Cricket Nets", "Box Cricket", "Football"]);
});

test("P1: chips match by substring, as the /turfs filter does; the chip's own label first", () => {
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Badminton"], chip("Badminton")), ["Badminton", "Box Cricket", "Football"]);
  assert.deepEqual(cardSports(["Box Cricket", "Cricket Nets", "Cricket", "Football"], chip("Cricket")), ["Cricket", "Box Cricket", "Cricket Nets", "Football"]);
  // The Tennis chip lists table tennis venues (substring): the card says so.
  assert.deepEqual(cardSports(["Football", "Table Tennis"], chip("Tennis")), ["Table Tennis", "Football"]);
  assert.deepEqual(cardSports(["Box Cricket"], chip("box cricket")), ["Box Cricket"]);
});

test("P1: no sport is dropped from what the card showed, none repeats, blanks are skipped", () => {
  for (const sp of SPORT_PAGES) {
    const labels = ["Box Cricket", "Football", ...sp.labels.slice(0, 1), "Volleyball"];
    const out = cardSports(labels, { labels: sp.labels });
    assert.equal(out[0], sp.labels[0], sp.slug);
    for (const before of cardSports(labels)) assert.ok(out.includes(before), `${sp.slug} dropped ${before}`);
    assert.equal(new Set(out.map((l) => l.toLowerCase())).size, out.length, sp.slug);
  }
  assert.deepEqual(cardSports(["Badminton", "badminton ", "", "Football"], page("badminton")), ["Badminton", "Football"]);
  // Nothing matches (not a qualifying card): as before.
  assert.deepEqual(cardSports(["Box Cricket", "Football", "Cricket"], page("badminton")), ["Box Cricket", "Football"]);
});

test("sportLineParts: joined, the line reads place · distance · sports · hours; the lead ends with the selected sport", () => {
  const D = "2.1 km away";
  const H = "Open 24 hours";
  const S = ["Badminton", "Box Cricket", "Football"];
  for (const place of ["Hosakerehalli", "", null]) {
    for (const distance of [D, null]) {
      for (const sports of [S, ["Badminton"], []]) {
        for (const hours of [H, null]) {
          const p = sportLineParts(place, { distance, sports, hours });
          const want = [place, distance, sports.join(", ") || null, hours].filter(Boolean).join(" · ");
          assert.equal(p.place + p.lead + p.tail, want, JSON.stringify({ place, distance, sports, hours }));
          assert.equal(p.place, place ?? "");
          // The lead carries the first sport, never anything after it.
          if (sports.length) assert.ok(p.lead.endsWith(sports[0]), p.lead);
          if (distance) assert.ok(p.lead.includes(distance));
          assert.ok(!p.tail.includes("Badminton"));
        }
      }
    }
  }
  assert.deepEqual(sportLineParts("Hosakerehalli", { distance: null, sports: S, hours: H }), {
    place: "Hosakerehalli",
    lead: " · Badminton",
    tail: ", Box Cricket, Football · Open 24 hours",
  });
  assert.deepEqual(sportLineParts(null, { distance: D, sports: ["Pickleball"], hours: null }), { place: "", lead: "2.1 km away · Pickleball", tail: "" });
  assert.deepEqual(sportLineParts("Baner", { distance: null, sports: [], hours: H }), { place: "Baner", lead: "", tail: " · Open 24 hours" });
  // Blank labels never leave an empty slot.
  assert.deepEqual(sportLineParts("Baner", { distance: null, sports: [" ", "Tennis"], hours: null }), { place: "Baner", lead: " · Tennis", tail: "" });
});

test("labelRank agrees with turfPlaysSport for every sport page", () => {
  const all = ["Football", "Futsal", "Box Cricket", "Cricket", "Cricket Nets", "Indoor Cricket Net", "Bowling Machine", "Badminton", "Pickleball", "Volleyball", "Beach Volleyball", "Basketball", "Tennis", "Lawn Tennis", "Table Tennis", "Padel", "Ultimate Frisbee", "Swimming", " badminton "];
  for (const sp of SPORT_PAGES) {
    for (const l of all) assert.equal(labelRank(l, { labels: sp.labels }) != null, turfPlaysSport([l], sp), `${sp.slug} / ${l}`);
  }
  assert.equal(labelRank("", page("football")), null);
  assert.equal(labelRank("Football", chip("")), null);
  assert.equal(labelRank("Beach Volleyball", chip("Volleyball")), 1);
  assert.equal(labelRank("Volleyball", chip("Volleyball")), 0);
});

test("P2 case 4: a venue that lists only the selected sport keeps its price, unchanged", () => {
  const solo = turf({ sports: ["Badminton"], morning_price: 400, evening_price: 600, price_unit: "per_hour" });
  assert.deepEqual(cardPrice(solo, page("badminton")), summarisePrice(solo));
  assert.equal(cardPrice(solo, page("badminton")).kind, "real");
  // Football + Futsal are both the football page's sport.
  const fut = turf({ sports: ["Futsal", "Football"], morning_price: 900, evening_price: 1200 });
  assert.deepEqual(cardPrice(fut, page("football")), summarisePrice(fut));
  // Tennis + Lawn Tennis on the tennis page.
  const ten = turf({ sports: ["Lawn Tennis", "Tennis"], morning_price: 900 });
  assert.deepEqual(cardPrice(ten, page("tennis")), summarisePrice(ten));
  // Reported numbers and notes at a one-sport venue are that sport's too.
  const rep = turf({ sports: ["Pickleball"], price_mentions: [{ price_inr: 900 }] });
  assert.equal(cardPrice(rep, page("pickleball")).kind, "reported");
  const note = turf({ sports: ["Pickleball"], price_mentions: [{ text: "Rates at the gate" }] });
  assert.equal(cardPrice(note, page("pickleball")).kind, "reported_text");
});

test("P2 case 4: at a court, table, pool or nets sport, a multi-sport venue's untagged price never shows as that sport's", () => {
  // Sprintplay Sports Arena: ₹800–1,400 is its 6-a-side and large box cricket rate.
  const sprint = turf({ sports: ["Box Cricket", "Football", "Badminton"], morning_price: 800, evening_price: 1400, price_unit: "per_hour" });
  assert.deepEqual(cardPrice(sprint, page("badminton")), NOT_LISTED);
  for (const slug of ["pickleball", "volleyball", "basketball", "tennis", "padel", "table-tennis", "swimming", "cricket-nets"]) {
    const sp = sportBySlug(slug)!;
    const t = turf({ sports: ["Box Cricket", sp.labels[0]], morning_price: 800 });
    assert.deepEqual(cardPrice(t, page(slug)), NOT_LISTED, slug);
  }
  // Reported numbers and notes at a multi-sport venue: the same.
  const rep = turf({ sports: ["Badminton", "Box Cricket"], price_mentions: [{ price_inr: 900 }] });
  assert.deepEqual(cardPrice(rep, page("badminton")), NOT_LISTED);
  const note = turf({ sports: ["Pickleball", "Badminton"], price_mentions: [{ text: "Court ₹400" }] });
  assert.deepEqual(cardPrice(note, page("pickleball")), NOT_LISTED);
  // Nothing listed stays as it was.
  const none = turf({ sports: ["Badminton", "Football"] });
  assert.deepEqual(cardPrice(none, page("badminton")), summarisePrice(none));
});

test("P2 case 4: at a turf sport, a price the bands do not speak to shows as before (owner's call, D3/V1)", () => {
  // No bands: Sprintplay keeps its card price on the football and box cricket pages.
  const sprint = turf({ sports: ["Box Cricket", "Football", "Badminton"], morning_price: 800, evening_price: 1400, price_unit: "per_hour" });
  for (const sp of [page("football"), page("box-cricket"), page("cricket"), page("futsal"), chip("Football"), chip("Box Cricket"), chip("Cricket")]) {
    assert.deepEqual(cardPrice(sprint, sp), summarisePrice(sprint), JSON.stringify(sp));
  }
  const rep = turf({ sports: ["Football", "Box Cricket"], price_mentions: [{ price_inr: 900 }] });
  assert.deepEqual(cardPrice(rep, page("football")), summarisePrice(rep));
  const note = turf({ sports: ["Football", "Box Cricket"], price_mentions: [{ text: "Rates at the gate" }] });
  assert.deepEqual(cardPrice(note, page("box-cricket")), summarisePrice(note));
});

// Bands as the database has them (29 Oct production rows).
const band = (format: string | null, price_per_hour: number, b: PriceBand["band"] = "morning"): PriceBand => ({ band: b, days: "all", format, price_per_hour });
const withBands = (over: Partial<Turf>, bands: PriceBand[]): Turf => turf({ ...over, sport_bands: sportBandsOf(bands) });

// The P2 rule on a sport-filtered card (29 Oct):
//   1. the bands give the sport exactly the card's range: the card's price, unchanged;
//   2. they give the sport another range: that range, worded as any listed per-hour price;
//   3. they name other sports only: "Prices not listed yet";
//   4. they name no sport: a turf sport keeps the price, any other only at a one-sport venue;
//   5. unfiltered: summarisePrice(), unchanged.

test("P2 case 1: the bands give the sport exactly the card's range: the card's price, unchanged", () => {
  // Agira Cricket academy and Box cricket (Bangalore): 6-a-side and box cricket both ₹800–1,200.
  const agira = withBands({ sports: ["Box Cricket", "Football"], morning_price: 800, evening_price: 1200, price_unit: "per_hour" }, [
    band("6-a-side", 800), band("6-a-side", 1200, "evening"), band("box cricket", 800), band("box cricket", 1200, "evening"),
  ]);
  for (const sp of [page("football"), page("box-cricket"), page("futsal"), chip("Football"), chip("Cricket"), chip("Box Cricket")]) {
    assert.deepEqual(cardPrice(agira, sp), summarisePrice(agira), JSON.stringify(sp));
    assert.equal(cardPrice(agira, sp).label, "₹800 – ₹1200/hr");
    assert.deepEqual(sportPrice(agira, summarisePrice(agira), sp), { from: "card" });
  }
  // A single value: CHAMPION'S DEN (Bangalore), every slot and its 6-a-side ₹1,400.
  const den = withBands({ sports: ["Box Cricket", "Football"], morning_price: 1400, afternoon_price: 1400, evening_price: 1400, price_unit: "per_hour" }, [
    band("6-a-side", 1400), band("6-a-side", 1400, "night"), band("box cricket (Medium)", 1500), band("box cricket (Medium)", 1500, "night"),
  ]);
  assert.equal(cardPrice(den, page("football")).label, "₹1400/hr");
  assert.deepEqual(cardPrice(den, chip("Football")), summarisePrice(den));
  // A per-slot card whose number the bands give the sport keeps its own wording.
  const slot = withBands({ sports: ["Football"], morning_price: 1200, price_unit: "per_slot", slot_minutes: 90 }, [band("7-a-side", 1200)]);
  assert.deepEqual(cardPrice(slot, page("football")), summarisePrice(slot));
  assert.equal(cardPrice(slot, page("football")).unit, "/90-min slot");
  // Reported numbers the bands match stay reported.
  const rep = withBands({ sports: ["Football"], price_mentions: [{ price_inr: 1000 }] }, [band("6-a-side", 1000)]);
  assert.deepEqual(cardPrice(rep, page("football")), summarisePrice(rep));
  assert.equal(cardPrice(rep, page("football")).kind, "reported");
});

test("P2 case 2: the bands give the sport another range: the card shows that range, as a listed per-hour price", () => {
  // CHAMPION'S DEN: ₹1,400 is its 6-a-side rate; box cricket (Medium) is ₹1,500. A single value.
  const den = withBands({ sports: ["Box Cricket", "Football"], morning_price: 1400, afternoon_price: 1400, evening_price: 1400, price_unit: "per_hour" }, [
    band("6-a-side", 1400), band("6-a-side", 1400, "night"), band("box cricket (Medium)", 1500), band("box cricket (Medium)", 1500, "night"),
  ]);
  const want = { label: "₹1500/hr", kind: "real", min: 1500, max: 1500, unit: "/hr" };
  assert.deepEqual(cardPrice(den, page("box-cricket")), want);
  assert.deepEqual(cardPrice(den, chip("Box Cricket")), want);
  // The Cricket chip lists box cricket (substring): its bands are the chip's.
  assert.deepEqual(cardPrice(den, chip("Cricket")), want);
  // Worded exactly as summarisePrice words a listed per-hour range, and the card renders it the same way.
  const same = turf({ sports: ["Box Cricket"], morning_price: 1500, price_unit: "per_hour" });
  assert.deepEqual(cardPrice(den, page("box-cricket")), summarisePrice(same));
  assert.equal(priceRangeText(want.min, want.max), "₹1,500");
  // Switch Sports Station (Hyderabad): card ₹700–1,500; box cricket ₹800–1,500, 7-a-side ₹700–1,500.
  const sw = withBands({ sports: ["Box Cricket", "Football"], morning_price: 700, evening_price: 1500 }, [
    band("box cricket", 800), band("box cricket", 1500, "evening"), band("7-a-side", 700), band("7-a-side", 1500, "evening"),
  ]);
  assert.deepEqual(cardPrice(sw, page("box-cricket")), { label: "₹800 – ₹1500/hr", kind: "real", min: 800, max: 1500, unit: "/hr" });
  assert.equal(priceRangeText(800, 1500), "₹800–1,500");
  assert.deepEqual(cardPrice(sw, page("football")), summarisePrice(sw));
  // Football bands count for the Football and Futsal labels: page, futsal page and chip alike.
  const fut = withBands({ sports: ["Futsal", "Box Cricket"], morning_price: 600, evening_price: 1100 }, [band("5-a-side", 1000), band("5-a-side", 1100, "evening"), band("box cricket", 600)]);
  for (const sp of [page("football"), page("futsal"), chip("Football")]) {
    assert.deepEqual(cardPrice(fut, sp), { label: "₹1000 – ₹1100/hr", kind: "real", min: 1000, max: 1100, unit: "/hr" }, JSON.stringify(sp));
  }
  assert.equal(cardPrice(fut, page("box-cricket")).label, "₹600/hr");
  // A per-slot card: the band's own unit, per hour.
  const slot = withBands({ sports: ["Football", "Box Cricket"], morning_price: 900, price_unit: "per_slot", slot_minutes: 90 }, [band("6-a-side", 1200)]);
  assert.deepEqual(cardPrice(slot, page("football")), { label: "₹1200/hr", kind: "real", min: 1200, max: 1200, unit: "/hr" });
  // Reported numbers or notes the bands do not match: the bands' range, a listed price.
  const rep = withBands({ sports: ["Football"], price_mentions: [{ price_inr: 900 }] }, [band("6-a-side", 1000)]);
  assert.deepEqual(cardPrice(rep, page("football")), { label: "₹1000/hr", kind: "real", min: 1000, max: 1000, unit: "/hr" });
  const note = withBands({ sports: ["Football", "Box Cricket"], price_mentions: [{ text: "Rates at the gate" }] }, [band("6-a-side", 1000)]);
  assert.equal(cardPrice(note, page("football")).label, "₹1000/hr");
  assert.deepEqual(sportPrice(sw, summarisePrice(sw), page("box-cricket")), { from: "band", min: 800, max: 1500 });
});

test("P2 case 3: the bands name other sports only: Prices not listed yet", () => {
  // Eden Sports (Hyderabad): lists Football; its only bands are box cricket ₹1,400–1,600.
  const eden = withBands({ sports: ["Football"], morning_price: 1400, evening_price: 1600 }, [band("box cricket", 1400), band("box cricket", 1600, "evening")]);
  assert.deepEqual(cardPrice(eden, page("football")), NOT_LISTED);
  assert.deepEqual(cardPrice(eden, chip("Football")), NOT_LISTED);
  // Gymlife Turf (Pune): lists Box Cricket; its only band is 6-a-side ₹1,200.
  const gym = withBands({ sports: ["Box Cricket"], morning_price: 1200 }, [band("6-a-side", 1200)]);
  assert.deepEqual(cardPrice(gym, page("box-cricket")), NOT_LISTED);
  assert.deepEqual(cardPrice(gym, chip("Cricket")), NOT_LISTED);
  // A cricket ground page is not box cricket (exact labels): box cricket bands are another sport's.
  const ground = withBands({ sports: ["Cricket", "Box Cricket"], morning_price: 1000 }, [band("box cricket", 1000)]);
  assert.deepEqual(cardPrice(ground, page("cricket")), NOT_LISTED);
  assert.deepEqual(cardPrice(ground, page("cricket-nets")), NOT_LISTED);
  // The Cricket chip lists box cricket (substring): there it is the chip's own rate (case 1).
  assert.deepEqual(cardPrice(ground, chip("Cricket")), summarisePrice(ground));
  // A court at a venue whose bands are all turf formats; reported numbers and notes too.
  assert.deepEqual(cardPrice(withBands({ sports: ["Badminton", "Football"], morning_price: 1000 }, [band("5-a-side", 1000)]), page("badminton")), NOT_LISTED);
  assert.deepEqual(cardPrice(withBands({ sports: ["Badminton"], morning_price: 400 }, [band("5-a-side", 1000)]), chip("Badminton")), NOT_LISTED);
  assert.deepEqual(cardPrice(withBands({ sports: ["Football"], price_mentions: [{ price_inr: 900 }] }, [band("box cricket", 900)]), page("football")), NOT_LISTED);
  assert.deepEqual(cardPrice(withBands({ sports: ["Football"], price_mentions: [{ text: "Rates at the gate" }] }, [band("box cricket", 900)]), page("football")), NOT_LISTED);
  // The hidden price keeps the venue's unit, so nothing else on the card changes.
  const slot = withBands({ sports: ["Football"], morning_price: 600, price_unit: "per_slot", slot_minutes: 90 }, [band("box cricket", 600)]);
  assert.equal(cardPrice(slot, page("football")).unit, "/90-min slot");
  assert.deepEqual(sportPrice(eden, summarisePrice(eden), page("football")), { from: "none" });
});

test("P2: a card with nothing listed stays so, bands or not", () => {
  const none = withBands({ sports: ["Football", "Box Cricket"] }, [band("6-a-side", 1200)]);
  for (const sp of [page("football"), page("box-cricket"), chip("Football"), chip("Cricket")]) assert.deepEqual(cardPrice(none, sp), summarisePrice(none), JSON.stringify(sp));
  assert.equal(sportMinimumPrice(none, chip("Football")), null);
});

test("P2 bands: only formats that name a sport count", () => {
  assert.equal(bandKind("box cricket"), "box-cricket");
  assert.equal(bandKind("box cricket (7-a-side)"), "box-cricket");
  assert.equal(bandKind("Box Cricket (Large (Tennis))"), "box-cricket");
  for (const f of ["5-a-side", "11-a-side", "6 - a - side", "4 a side", " 7-a-side (turf 2)"]) assert.equal(bandKind(f), "football", f);
  for (const f of [null, undefined, "", "standard", "turf 1", "a-side"]) assert.equal(bandKind(f), null, String(f));
  assert.equal(sportBandsOf(null), null);
  assert.equal(sportBandsOf([]), null);
  assert.equal(sportBandsOf([band(null, 900), band("full court", 900)]), null);
  assert.deepEqual(sportBandsOf([band("5-a-side", 900), band("7-a-side", 1300), band("box cricket (Half)", 700), band("box cricket", 0), band(null, 5000)]), {
    football: [900, 1300],
    "box-cricket": [700, 700],
  });
  // A venue whose only bands name no sport is decided without them (case 4).
  const plain = turf({ sports: ["Football", "Badminton"], morning_price: 900, sport_bands: sportBandsOf([band(null, 900)]) });
  assert.equal(cardPrice(plain, page("football")).kind, "real");
  assert.deepEqual(cardPrice(plain, page("badminton")), NOT_LISTED);
});

test("sportBandRange: every band kind the sport's filter matches; null for other sports only; undefined for none", () => {
  const both = { football: [900, 1300], "box-cricket": [700, 1500] } as const;
  assert.deepEqual(sportBandRange(both, page("football")), [900, 1300]);
  assert.deepEqual(sportBandRange(both, page("futsal")), [900, 1300]);
  assert.deepEqual(sportBandRange(both, chip("Football")), [900, 1300]);
  assert.deepEqual(sportBandRange(both, page("box-cricket")), [700, 1500]);
  assert.deepEqual(sportBandRange(both, chip("Box Cricket")), [700, 1500]);
  assert.deepEqual(sportBandRange(both, chip("Cricket")), [700, 1500]);
  assert.equal(sportBandRange(both, page("cricket")), null);
  assert.equal(sportBandRange(both, page("badminton")), null);
  assert.equal(sportBandRange(both, chip("Tennis")), null);
  assert.equal(sportBandRange({ football: [900, 900] }, page("box-cricket")), null);
  assert.equal(sportBandRange(null, page("football")), undefined);
  assert.equal(sportBandRange(undefined, chip("Badminton")), undefined);
  assert.equal(sportBandRange({}, page("football")), undefined);
});

test("sportBandMap: each venue's sport bands; none for a venue whose owner confirmed its prices", () => {
  const map = sportBandMap([
    { id: "a", pricing_bands: [band("6-a-side", 1200), band("box cricket", 1400)], price_owner_confirmed: null },
    // The owner set prices on myTapturf: theirs win over the bands, as on the turf page.
    { id: "owner", pricing_bands: [band("6-a-side", 1200)], price_owner_confirmed: true },
    { id: "unconfirmed", pricing_bands: [band("5-a-side", 900)], price_owner_confirmed: false },
    // Bands that name no sport, or none at all: no entry.
    { id: "plain", pricing_bands: [band(null, 900)], price_owner_confirmed: null },
    { id: "empty", pricing_bands: null, price_owner_confirmed: null },
  ]);
  assert.deepEqual(map, { a: { football: [1200, 1200], "box-cricket": [1400, 1400] }, unconfirmed: { football: [900, 900] } });
  // So the owner's card decides without bands: its price shows at a turf sport, as before.
  const owner = turf({ sports: ["Box Cricket", "Football"], morning_price: 800, sport_bands: map.owner });
  assert.deepEqual(cardPrice(owner, page("box-cricket")), summarisePrice(owner));
  assert.deepEqual(cardPrice(owner, page("football")), summarisePrice(owner));
});

test("P2 case 5: unfiltered, every card is exactly as before, bands or not", () => {
  const shapes: Partial<Turf>[] = [
    { sports: ["Box Cricket", "Football", "Badminton"], morning_price: 800, evening_price: 1400 },
    { sports: ["Football"], morning_price: 1400, evening_price: 1600, sport_bands: { "box-cricket": [1400, 1600] } },
    { sports: ["Box Cricket", "Football"], morning_price: 1400, sport_bands: { football: [1400, 1400], "box-cricket": [1500, 1500] } },
    { sports: ["Football"], morning_price: 900, price_unit: "per_slot", slot_minutes: 90, sport_bands: { football: [1200, 1200] } },
    { sports: ["Pickleball"], price_mentions: [{ price_inr: 900 }], sport_bands: { football: [1000, 1000] } },
    { sports: ["Football", "Box Cricket"], price_mentions: [{ text: "Rates at the gate" }], sport_bands: { football: [1000, 1000] } },
    { sports: ["Badminton"] },
  ];
  for (const over of shapes) {
    const t = turf(over);
    for (const sp of [undefined, null]) {
      assert.deepEqual(cardPrice(t, sp), summarisePrice(t));
      assert.equal(JSON.stringify(cardPrice(t, sp)), JSON.stringify(summarisePrice(t)));
      assert.equal(sportMinimumPrice(t, sp), getMinimumPrice(t));
    }
  }
});

test("isTurfSport: the sport pages whose venue is a turf, and the chips that are those sports", () => {
  for (const sp of SPORT_PAGES) assert.equal(isTurfSport({ labels: sp.labels }), sp.venue === "turf", sp.slug);
  for (const c of ["Football", "Box Cricket", "Cricket", "football"]) assert.equal(isTurfSport(chip(c)), true, c);
  for (const c of ["Badminton", "Volleyball", "Yoga", "Pickleball", "Basketball", "Tennis"]) assert.equal(isTurfSport(chip(c)), false, c);
  // Labels in another order, or one page label, still find the page.
  assert.equal(isTurfSport({ labels: ["Futsal", "Football"] }), true);
  assert.equal(isTurfSport({ labels: ["Badminton"] }), false);
  assert.equal(isTurfSport({ labels: ["Squash"] }), false);
});

test("P2: the unit follows the venue, so a hidden price never changes another card's wording", () => {
  const slot = turf({ sports: ["Pickleball", "Football"], morning_price: 600, price_unit: "per_slot", slot_minutes: 90 });
  assert.equal(cardPrice(slot, page("pickleball")).unit, "/90-min slot");
  assert.equal(cardPrice(slot, page("pickleball")).label, "Prices not listed yet");
});

test("P2: court chips use their own filter: every label must contain the chip", () => {
  const both = turf({ sports: ["Badminton", "Football"], morning_price: 1000 });
  assert.deepEqual(cardPrice(both, chip("Badminton")), NOT_LISTED);
  const solo = turf({ sports: ["Badminton"], morning_price: 1000 });
  assert.equal(cardPrice(solo, chip("Badminton")).kind, "real");
  const tt = turf({ sports: ["Table Tennis", "Football"], morning_price: 300 });
  assert.deepEqual(cardPrice(tt, chip("Tennis")), NOT_LISTED);
  assert.equal(cardPrice(turf({ sports: ["Table Tennis"], morning_price: 300 }), chip("Tennis")).kind, "real");
  assert.deepEqual(cardPrice(turf({ sports: ["Yoga", "Football"], morning_price: 300 }), chip("Yoga")), NOT_LISTED);
});

test("sportMinimumPrice: the low end of the listed price the card shows, for the chip price sorts", () => {
  const sprint = turf({ sports: ["Box Cricket", "Football", "Badminton"], morning_price: 800, evening_price: 1400 });
  assert.equal(sportMinimumPrice(sprint, null), getMinimumPrice(sprint));
  assert.equal(sportMinimumPrice(sprint, chip("Badminton")), null);
  assert.equal(sportMinimumPrice(sprint, chip("Football")), 800);
  const den = withBands({ sports: ["Box Cricket", "Football"], morning_price: 1400 }, [band("6-a-side", 1400), band("box cricket", 1500)]);
  assert.equal(sportMinimumPrice(den, chip("Football")), 1400);
  // Case 2: the band minimum the card shows.
  assert.equal(sportMinimumPrice(den, chip("Cricket")), 1500);
  assert.equal(sportMinimumPrice(den, chip("Box Cricket")), 1500);
  const sw = withBands({ sports: ["Box Cricket", "Football"], morning_price: 700, evening_price: 1500 }, [band("box cricket", 800), band("box cricket", 1500), band("7-a-side", 700)]);
  assert.equal(sportMinimumPrice(sw, chip("Box Cricket")), 800);
  // Case 3: none.
  const eden = withBands({ sports: ["Football"], morning_price: 1400 }, [band("box cricket", 1400)]);
  assert.equal(sportMinimumPrice(eden, chip("Football")), null);
  // A reported price orders nothing, as before, unless the bands give the sport a listed one.
  assert.equal(sportMinimumPrice(turf({ sports: ["Football"], price_mentions: [{ price_inr: 900 }] }), chip("Football")), null);
  assert.equal(sportMinimumPrice(withBands({ sports: ["Football"], price_mentions: [{ price_inr: 900 }] }, [band("6-a-side", 1000)]), chip("Football")), 1000);
  assert.equal(sportMinimumPrice(turf({ sports: ["Football"] }), chip("Football")), null);
  // The same decision as the card, for every shown price.
  for (const t of [sprint, den, sw, eden]) {
    for (const sp of [chip("Football"), chip("Cricket"), chip("Box Cricket"), chip("Badminton"), page("football")]) {
      const shown = cardPrice(t, sp);
      assert.equal(sportMinimumPrice(t, sp), shown.kind === "real" ? shown.min : null, JSON.stringify(sp));
    }
  }
});

test("pricesAreForSport: needs at least one listed sport, ignores blanks", () => {
  assert.equal(pricesAreForSport([], page("badminton")), false);
  assert.equal(pricesAreForSport(["", " "], page("badminton")), false);
  assert.equal(pricesAreForSport(["Badminton", " "], page("badminton")), true);
  assert.equal(pricesAreForSport(["badminton"], page("badminton")), true);
  assert.equal(pricesAreForSport(["Badminton", "Squash"], page("badminton")), false);
});
