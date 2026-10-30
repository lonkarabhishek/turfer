import { test } from "node:test";
import assert from "node:assert/strict";
import {
  busiestAreas,
  cityDescription,
  cityTitle,
  citySportDescription,
  citySportTitle,
  homeDescription,
  homeTitle,
  listingOgImage,
  sportDescription,
  sportTitle,
  type CityFacts,
  allTurfsDescription,
  nearMeDescription,
  courtNearMeDescription,
  courtNearMeKeywords,
  courtNearMeTitle,
} from "./listingMeta";
import { bannedCopy, DEFAULT_OG_IMAGE, SEO_TEMPLATE_DATE } from "./defaults";
import { listingReach, reachOf, turfFactsFrom, type TurfFactRow } from "./turfFacts";
import { DESCRIPTION_MAX_CHARS, titleFits } from "./width";
import { sportBySlug } from "../sports";
import { gameDates } from "./gameDates";
import type { Turf } from "../../types/turf";

const sport = (slug: string) => sportBySlug(slug)!;

function clean(title: string, description: string) {
  assert.ok(titleFits(title), `title: ${title}`);
  assert.ok(description.length <= DESCRIPTION_MAX_CHARS, `description ${description.length}c: ${description}`);
  assert.equal(bannedCopy(title), null, title);
  assert.equal(bannedCopy(description), null, description);
  assert.ok(!/near you/i.test(description), description);
}

/** Every venue shows timings, photos and a Google rating, and can be called. */
const reachAll = (n: number) => ({ withHours: n, withPhotos: n, rated: n, contactable: n });

const surat: CityFacts = {
  ...reachAll(44),
  label: "Surat",
  count: 44,
  sports: [{ name: "Box Cricket", count: 41 }, { name: "Football", count: 8 }, { name: "Pickleball", count: 3 }],
  areas: ["Vesu", "Mota Varachha", "Pal Gam"],
  floodlit: 17,
  priced: 9,
};

test("city: the design's Surat and Vadodara", () => {
  assert.equal(cityTitle(surat), "44 Turfs in Surat: Box Cricket & Football, Timings & Photos");
  assert.equal(
    cityDescription(surat),
    "44 turfs in Surat: 41 box cricket, 8 football, 3 pickleball. Most in Vesu, Mota Varachha and Pal Gam; 17 floodlit. Call or WhatsApp, no booking fee.",
  );
  clean(cityTitle(surat), cityDescription(surat));
  const vadodara = { ...surat, label: "Vadodara", count: 34 };
  assert.equal(cityTitle(vadodara), "34 Turfs in Vadodara: Box Cricket & Football, Timings");
});

test("city: prices facet only when most turfs list them; long names step down", () => {
  const hyd = { ...surat, label: "Hyderabad", count: 390, priced: 220 };
  assert.equal(cityTitle(hyd), "390 Turfs in Hyderabad: Box Cricket & Football, Prices");
  const tvm = { ...surat, label: "Thiruvananthapuram", count: 120, sports: [{ name: "Football", count: 80 }, { name: "Box Cricket", count: 50 }] };
  const t = cityTitle(tvm);
  assert.ok(titleFits(t), t);
  assert.match(t, /^120 Turfs in Thiruvananthapuram/);
  const tiny = { ...reachAll(1), label: "Beed", count: 1, sports: [{ name: "Box Cricket", count: 1 }], areas: [], floodlit: 0, priced: 0 };
  assert.equal(cityTitle(tiny), "1 Turf in Beed: Box Cricket, Timings & Photos");
  assert.equal(cityDescription(tiny), "1 turf in Beed: 1 box cricket. Call or WhatsApp, no booking fee.");
  clean(cityTitle(tvm), cityDescription(tvm));
});

test("city description drops the least useful parts first to stay within 155", () => {
  const long: CityFacts = {
    ...reachAll(1234),
    label: "Thiruvananthapuram",
    count: 1234,
    sports: [{ name: "Box Cricket", count: 1000 }, { name: "Football", count: 800 }, { name: "Badminton", count: 300 }],
    areas: ["Sreekaryam Junction Extension", "Kazhakkoottam Technopark Phase Three", "Vattiyoorkavu North"],
    floodlit: 999,
    priced: 10,
  };
  const d = cityDescription(long);
  assert.ok(d.length <= 155, d);
  assert.match(d, /^1,234 turfs in Thiruvananthapuram: 1,000 box cricket/);
  assert.match(d, /Call or WhatsApp, no booking fee\.$/);
});

test("city + sport: the design's Hyderabad badminton and Mumbai cricket", () => {
  const hyd = { ...reachAll(31), cityLabel: "Hyderabad", sport: sport("badminton"), count: 31, priced: 30, floodlit: 3, areas: ["Alwal", "Kompally", "Kothapet"], priceMin: 300, priceMax: 800 };
  assert.equal(citySportTitle(hyd), "31 Badminton Courts in Hyderabad: Prices & Timings");
  assert.equal(
    citySportDescription(hyd),
    "31 badminton courts in Hyderabad, 30 with listed prices. Most in Alwal, Kompally and Kothapet. Timings, photos, map. Call or WhatsApp, no booking fee.",
  );
  clean(citySportTitle(hyd), citySportDescription(hyd));
  const mum = { ...reachAll(30), cityLabel: "Mumbai", sport: sport("cricket"), count: 30, priced: 3, floodlit: 20, areas: ["Mira Road East", "Bandra West"], priceMin: null, priceMax: null };
  assert.equal(citySportTitle(mum), "30 Cricket Turfs in Mumbai: Timings, Photos & Ratings");
  assert.match(citySportDescription(mum), /^30 cricket turfs in Mumbai, 3 with listed prices\. Most in Mira Road East and Bandra West; 20 floodlit\./);
  clean(citySportTitle(mum), citySportDescription(mum));
  // No price range in the snippet while QUOTE_CITY_PRICE_RANGE is off.
  assert.ok(!citySportDescription(hyd).includes("₹"));
});

test("city + sport: one venue, all priced, courts never 'floodlit'", () => {
  const one = { ...reachAll(1), cityLabel: "Vijayawada", sport: sport("pickleball"), count: 1, priced: 1, floodlit: 1, areas: [], priceMin: null, priceMax: null };
  assert.equal(citySportTitle(one), "1 Pickleball Court in Vijayawada: Prices & Timings");
  assert.equal(citySportDescription(one), "1 pickleball court in Vijayawada, 1 with a listed price. Timings, photos, map. Call or WhatsApp, no booking fee.");
  const all = { ...one, count: 4, priced: 4 };
  assert.match(citySportDescription(all), /^4 pickleball courts in Vijayawada, all with listed prices\./);
});

test("city: no 'Timings', 'Photos' or 'Call or WhatsApp' that no turf behind the page has", () => {
  // /muzaffarpur: 4 turfs, none with hours; /kolar: 2 turfs, no number to call (28 Oct).
  const muz: CityFacts = { ...reachAll(4), withHours: 0, label: "Muzaffarpur", count: 4, sports: [{ name: "Box Cricket", count: 3 }, { name: "Football", count: 2 }], areas: [], floodlit: 0, priced: 0 };
  assert.equal(cityTitle(muz), "4 Turfs in Muzaffarpur: Box Cricket & Football, Photos");
  assert.equal(cityTitle({ ...muz, withPhotos: 0 }), "4 Turfs in Muzaffarpur: Box Cricket & Football");
  assert.equal(cityTitle({ ...muz, priced: 3 }), "4 Turfs in Muzaffarpur: Box Cricket & Football, Prices");
  const kolar: CityFacts = { ...reachAll(2), contactable: 0, label: "Kolar", count: 2, sports: [{ name: "Football", count: 2 }, { name: "Box Cricket", count: 2 }], areas: [], floodlit: 1, priced: 0 };
  assert.equal(cityDescription(kolar), "2 turfs in Kolar: 2 football, 2 box cricket. 1 floodlit. No booking fee.");
  assert.match(cityDescription({ ...kolar, contactable: 1 }), /Call or WhatsApp, no booking fee\.$/);
  clean(cityTitle(muz), cityDescription(kolar));
});

test("city + sport: facets and the call to action follow the venues", () => {
  // /bhilwara/pickleball: 3 courts, none with hours.
  const bhl = { ...reachAll(3), withHours: 0, cityLabel: "Bhilwara", sport: sport("pickleball"), count: 3, priced: 0, floodlit: 0, areas: [], priceMin: null, priceMax: null };
  assert.equal(citySportTitle(bhl), "3 Pickleball Courts in Bhilwara: Photos & Ratings");
  assert.equal(citySportDescription(bhl), "3 pickleball courts in Bhilwara. Photos, map. Call or WhatsApp, no booking fee.");
  // /delhi/futsal: every number a Delhi 011 landline the page cannot dial as stored.
  const futsal = { ...reachAll(8), contactable: 0, cityLabel: "Delhi", sport: sport("futsal"), count: 8, priced: 0, floodlit: 0, areas: [], priceMin: null, priceMax: null };
  assert.match(citySportDescription(futsal), /Timings, photos, map\. No booking fee\.$/);
  const bare = { ...futsal, withHours: 0, withPhotos: 0, rated: 0 };
  assert.equal(citySportTitle(bare), "8 Futsal Turfs in Delhi");
  assert.equal(citySportDescription(bare), "8 futsal turfs in Delhi. Map and directions. No booking fee.");
  assert.equal(citySportTitle({ ...bare, priced: 5 }), "8 Futsal Turfs in Delhi: Prices");
  clean(citySportTitle(bhl), citySportDescription(bare));
});

test("reach: a number the page can dial or WhatsApp, hours from opening_hours or start/end", () => {
  const row = (id: string, over: Partial<TurfFactRow> = {}): TurfFactRow =>
    ({ id, name: `Turf ${id}`, city: "delhi", owner_phone: null, landline_phone: null, whatsapp_phone: null, contact_info: null, opening_hours: null, start_time: null, end_time: null, is_24x7: null, ...over }) as TurfFactRow;
  const facts = turfFactsFrom([
    row("mobile", { owner_phone: "98765 43210" }),
    // A Delhi 011 landline stored without its 0 dials nowhere (normalizeIndianPhone).
    row("delhi-landline", { landline_phone: "1123456789" }),
    row("whatsapp", { whatsapp_phone: "+91 91234 56789" }),
    row("contact-info", { contact_info: JSON.stringify({ phone: "9812345678" }) }),
    row("hours", { opening_hours: { monday: "6 AM–11 PM" } as unknown as TurfFactRow["opening_hours"] }),
    row("default-hours", { start_time: "00:00:00", end_time: "23:59:00" }),
  ]);
  assert.deepEqual(facts.contact, ["mobile", "whatsapp", "contact-info"]);
  assert.deepEqual(facts.hours, ["hours"]);
  const card = (id: string, over: Partial<Turf> = {}) => ({ id, images: [], rating: 0, total_reviews: 0, opening_hours: null, start_time: null, end_time: null, is_24x7: null, ...over }) as unknown as Turf;
  const turfs = [card("mobile", { images: ["https://lh3.googleusercontent.com/p/a=w1"] }), card("delhi-landline", { is_24x7: true, rating: 4.2, total_reviews: 10 }), card("hours")];
  assert.deepEqual(listingReach(turfs, reachOf(facts)), { withHours: 2, withPhotos: 1, rated: 1, contactable: 1 });
  // A failed facts read: hours from the list rows only, and nobody to call.
  assert.deepEqual(listingReach(turfs, null), { withHours: 1, withPhotos: 1, rated: 1, contactable: 0 });
});

/** Why a SEO_TEMPLATE_DATE value is not a moment in the past, or null. */
function templateDateProblem(v: string, now: number): string | null {
  // A date alone, or a time with no offset, reads as midnight UTC or the machine's own zone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return "not a full timestamp with an offset";
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return "not a date";
  if (/T00:00(:00(\.0+)?)?(Z|[+-])/.test(v)) return "midnight";
  if (new Date(t + 5.5 * 3_600_000).toISOString().slice(11, 16) === "00:00") return "midnight in India";
  if (t > now) return "in the future";
  return null;
}

test("SEO_TEMPLATE_DATE is a moment, not a day, and not in the future", () => {
  assert.equal(templateDateProblem(SEO_TEMPLATE_DATE, Date.now()), null, SEO_TEMPLATE_DATE);
  const now = new Date("2026-11-03T12:00:00+05:30").getTime();
  assert.equal(templateDateProblem("2026-11-02T16:30:00+05:30", now), null);
  assert.equal(templateDateProblem("2026-11-02T11:00Z", now), null);
  for (const [v, why] of [
    ["2026-11-02", "not a full timestamp with an offset"],
    ["2026-11-02T16:30", "not a full timestamp with an offset"],
    ["2026-11-02 16:30+05:30", "not a full timestamp with an offset"],
    ["2026-11-02T00:00:00+05:30", "midnight"],
    ["2026-11-02T00:00Z", "midnight"],
    ["2026-11-01T18:30:00Z", "midnight in India"],
    ["2026-11-03T16:30:00+05:30", "in the future"],
  ]) {
    assert.equal(templateDateProblem(v, now), why, v);
  }
});

test("sport page: count and top cities first", () => {
  const f = {
    sport: sport("pickleball"),
    count: 53,
    priced: 30,
    cities: [{ label: "Pune", count: 12 }, { label: "Hyderabad", count: 9 }, { label: "Bangalore", count: 7 }, ...Array.from({ length: 47 }, (_, i) => ({ label: `C${i}`, count: 1 }))],
  };
  assert.equal(sportTitle(f), "53 Pickleball Courts in 50 Cities: Prices & Timings");
  assert.equal(
    sportDescription(f),
    "53 pickleball courts in 50 cities, most in Pune (12), Hyderabad (9) and Bangalore (7). Timings, photos and listed prices. Call or WhatsApp, no booking fee.",
  );
  clean(sportTitle(f), sportDescription(f));
  const two = { sport: sport("padel"), count: 3, priced: 0, cities: [{ label: "Pune", count: 2 }, { label: "Mumbai", count: 1 }] };
  assert.equal(sportTitle(two), "3 Padel Courts in Pune & Mumbai: Timings & Photos");
  assert.equal(sportDescription(two), "3 padel courts in Pune and Mumbai. Timings, photos and maps. Call or WhatsApp, no booking fee.");
  const none = { sport: sport("pickleball"), count: 0, priced: 0, cities: [] };
  assert.equal(sportTitle(none), "Pickleball Courts in India");
  assert.equal(sportDescription(none), "Pickleball courts for the fastest growing racquet sport. Call or WhatsApp the venue, no booking fee.");
});

test("home: the design's title and description", () => {
  assert.equal(homeTitle(3662, 174), "Find a Turf Near You: 3,660+ Turfs in 174 Cities | TapTurf");
  assert.equal(
    homeDescription(["Hyderabad", "Bangalore", "Pune", "Mumbai"], 174),
    "Football, box cricket and pickleball turfs in Hyderabad, Bangalore, Pune and 171 more cities. Timings, photos, prices. Call or WhatsApp, no booking fee.",
  );
  assert.ok(titleFits(homeTitle(123456, 1234)));
  assert.equal(homeTitle(0, 0), "Find a Turf Near You: Football & Box Cricket Turfs in India");
});

test("busiest areas: 2 or more venues, cleaned names", () => {
  const t = (area: string) => ({ address: "", city: "pune", area });
  assert.deepEqual(busiestAreas([t("Baner"), t("Baner"), t("Karanje / Gendamal Naka"), t("Karanje"), t("Wakad")]), ["Baner", "Karanje"]);
});

test("listing share card: the top venue's own photo, else the site card", () => {
  const own = "https://x.supabase.co/storage/v1/object/public/turf-photos/a/aaaaaaaaaaaaaaaaaaaaaaaa.webp";
  const turfs = [{ images: ["https://lh3.googleusercontent.com/p/x=w1", own], cover_image: null }] as unknown as Turf[];
  assert.equal(listingOgImage(turfs, "Turfs in Pune").url, own);
  assert.deepEqual(listingOgImage([{ images: ["https://lh3.googleusercontent.com/p/x=w1"], cover_image: null }] as unknown as Turf[], "x"), { ...DEFAULT_OG_IMAGE });
  assert.deepEqual(listingOgImage([], "x"), { ...DEFAULT_OG_IMAGE });
});

test("/turfs and /turf-near-me descriptions: within 155, en-IN digits, no 'sorted by distance' promise", () => {
  const labels = ["Hyderabad", "Bangalore", "Pune", "Mumbai", "Delhi", "Thiruvananthapuram"];
  const all = allTurfsDescription(labels, 88);
  assert.ok(all.length <= 155, all);
  assert.ok(!/compare/i.test(all), all);
  assert.match(all, /^Football, box cricket and sports turfs in Hyderabad, /);
  const near = nearMeDescription(3662, labels, 174);
  assert.equal(
    near,
    "Tap Use my location to sort 3,662 football and box cricket turfs by distance, or browse Hyderabad, Bangalore, Pune and 171 more cities. No booking fee.",
  );
  assert.ok(near.length <= 155);
});

test("court near-me pages: the approved titles and descriptions, from the venues' own counts", () => {
  // Production on 29 Oct: venues that list the sport, cities most venues first (ties by city size).
  const cities = (top: [string, number][], total: number) => [
    ...top.map(([label, count]) => ({ label, count })),
    ...Array.from({ length: total - top.length }, (_, i) => ({ label: `C${i}`, count: 1 })),
  ];
  const badminton = { sport: sport("badminton"), count: 252, priced: 0, cities: cities([["Bangalore", 55], ["Pune", 38], ["Hyderabad", 31]], 46) };
  const pickleball = { sport: sport("pickleball"), count: 303, priced: 0, cities: cities([["Hyderabad", 53], ["Bangalore", 53], ["Delhi", 23]], 52) };
  const tennis = { sport: sport("tennis"), count: 29, priced: 0, cities: cities([["Hyderabad", 5], ["Bangalore", 5], ["Chennai", 3]], 14) };
  assert.equal(courtNearMeTitle(badminton), "Badminton Courts Near Me: 252 Courts in 46 Cities | TapTurf");
  assert.equal(
    courtNearMeDescription(badminton),
    "252 badminton courts in Bangalore, Pune, Hyderabad and 43 more cities. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.",
  );
  assert.equal(courtNearMeTitle(pickleball), "Pickleball Courts Near Me: 303 Courts in 52 Cities | TapTurf");
  assert.equal(
    courtNearMeDescription(pickleball),
    "303 pickleball courts in Hyderabad, Bangalore, Delhi and 49 more cities. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.",
  );
  assert.equal(courtNearMeTitle(tennis), "Tennis Courts Near Me: 29 Courts in 14 Cities | TapTurf");
  assert.equal(
    courtNearMeDescription(tennis),
    "29 tennis courts in Hyderabad, Bangalore, Chennai and 11 more cities. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.",
  );
  for (const f of [badminton, pickleball, tennis]) clean(courtNearMeTitle(f), courtNearMeDescription(f));
  assert.equal(
    courtNearMeKeywords(badminton),
    "badminton court near me, badminton courts near me, badminton near me, badminton court bangalore, badminton court pune, badminton court hyderabad, badminton court c0, badminton court c1, badminton court c2, badminton court c3, badminton court c4",
  );
});

test("court near-me pages: few venues or cities read right, long names step down, nothing when empty", () => {
  const one = { sport: sport("tennis"), count: 1, priced: 0, cities: [{ label: "Pune", count: 1 }] };
  assert.equal(courtNearMeTitle(one), "Tennis Courts Near Me: 1 Court in Pune | TapTurf");
  assert.equal(courtNearMeDescription(one), "1 tennis court in Pune. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.");
  const three = { sport: sport("pickleball"), count: 7, priced: 0, cities: [{ label: "Pune", count: 4 }, { label: "Nashik", count: 2 }, { label: "Nagpur", count: 1 }] };
  assert.equal(courtNearMeTitle(three), "Pickleball Courts Near Me: 7 Courts in Pune, Nashik & Nagpur");
  assert.equal(courtNearMeDescription(three), "7 pickleball courts in Pune, Nashik and Nagpur. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.");
  const long = { sport: sport("badminton"), count: 1234, priced: 0, cities: [{ label: "Thiruvananthapuram", count: 900 }, { label: "Tiruchirappalli", count: 300 }, { label: "Sambhajinagar", count: 34 }] };
  assert.equal(courtNearMeTitle(long), "Badminton Courts Near Me: 1,234 Courts | TapTurf");
  const wide = { ...long, cities: [...long.cities, { label: "Visakhapatnam", count: 1 }] };
  assert.equal(
    courtNearMeDescription(wide),
    "1,234 badminton courts in Thiruvananthapuram and 3 more cities. Tap Use my location to see the closest first. Call or WhatsApp, no booking fee.",
  );
  for (const f of [one, three, long, wide]) clean(courtNearMeTitle(f), courtNearMeDescription(f));
  const none = { sport: sport("badminton"), count: 0, priced: 0, cities: [] };
  assert.equal(courtNearMeTitle(none), "Badminton Courts Near Me | TapTurf");
  assert.equal(courtNearMeDescription(none), "Indoor badminton courts with proper flooring and lighting. Call or WhatsApp the venue, no booking fee.");
  clean(courtNearMeTitle(none), courtNearMeDescription(none));
});

test("game dates carry India's offset; a game past midnight ends the next day", () => {
  assert.deepEqual(gameDates({ date: "2026-11-02", start_time: "19:00:00", end_time: "20:30:00" }), {
    startDate: "2026-11-02T19:00:00+05:30",
    endDate: "2026-11-02T20:30:00+05:30",
  });
  assert.deepEqual(gameDates({ date: "2026-12-31", start_time: "22:00", end_time: "01:00" }), {
    startDate: "2026-12-31T22:00:00+05:30",
    endDate: "2027-01-01T01:00:00+05:30",
  });
  assert.deepEqual(gameDates({ date: "2026-11-02", start_time: null, end_time: null }), { startDate: "2026-11-02" });
});
