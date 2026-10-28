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
} from "./listingMeta";
import { bannedCopy, DEFAULT_OG_IMAGE } from "./defaults";
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

const surat: CityFacts = {
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
  const tiny = { label: "Beed", count: 1, sports: [{ name: "Box Cricket", count: 1 }], areas: [], floodlit: 0, priced: 0 };
  assert.equal(cityTitle(tiny), "1 Turf in Beed: Box Cricket, Timings & Photos");
  assert.equal(cityDescription(tiny), "1 turf in Beed: 1 box cricket. Call or WhatsApp, no booking fee.");
  clean(cityTitle(tvm), cityDescription(tvm));
});

test("city description drops the least useful parts first to stay within 155", () => {
  const long: CityFacts = {
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
  const hyd = { cityLabel: "Hyderabad", sport: sport("badminton"), count: 31, priced: 30, floodlit: 3, areas: ["Alwal", "Kompally", "Kothapet"], priceMin: 300, priceMax: 800 };
  assert.equal(citySportTitle(hyd), "31 Badminton Courts in Hyderabad: Prices & Timings");
  assert.equal(
    citySportDescription(hyd),
    "31 badminton courts in Hyderabad, 30 with listed prices. Most in Alwal, Kompally and Kothapet. Timings, photos, map. Call or WhatsApp, no booking fee.",
  );
  clean(citySportTitle(hyd), citySportDescription(hyd));
  const mum = { cityLabel: "Mumbai", sport: sport("cricket"), count: 30, priced: 3, floodlit: 20, areas: ["Mira Road East", "Bandra West"], priceMin: null, priceMax: null };
  assert.equal(citySportTitle(mum), "30 Cricket Turfs in Mumbai: Timings, Photos & Ratings");
  assert.match(citySportDescription(mum), /^30 cricket turfs in Mumbai, 3 with listed prices\. Most in Mira Road East and Bandra West; 20 floodlit\./);
  clean(citySportTitle(mum), citySportDescription(mum));
  // No price range in the snippet while QUOTE_CITY_PRICE_RANGE is off.
  assert.ok(!citySportDescription(hyd).includes("₹"));
});

test("city + sport: one venue, all priced, courts never 'floodlit'", () => {
  const one = { cityLabel: "Vijayawada", sport: sport("pickleball"), count: 1, priced: 1, floodlit: 1, areas: [], priceMin: null, priceMax: null };
  assert.equal(citySportTitle(one), "1 Pickleball Court in Vijayawada: Prices & Timings");
  assert.equal(citySportDescription(one), "1 pickleball court in Vijayawada, 1 with a listed price. Timings, photos, map. Call or WhatsApp, no booking fee.");
  const all = { ...one, count: 4, priced: 4 };
  assert.match(citySportDescription(all), /^4 pickleball courts in Vijayawada, all with listed prices\./);
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
