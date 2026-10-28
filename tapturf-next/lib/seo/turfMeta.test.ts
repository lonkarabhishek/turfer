import { test } from "node:test";
import assert from "node:assert/strict";
import { compactHours, displayArea, nameCuts, normPlace, placeFor, seoName, turfMeta, typePhrase } from "./turfMeta";
import { EDGE_ROWS, PROTOTYPE_ROWS, type EdgeRow, type PrototypeRow } from "./turfMeta.fixtures";
import { sharedNameKey, turfFactsFrom, type TurfFactRow } from "./turfFacts";
import { bannedCopy, DEFAULT_OG_IMAGE } from "./defaults";
import { DESCRIPTION_MAX_CHARS, textWidthPx, TITLE_MAX_CHARS, TITLE_MAX_PX, titleFits, withBrand } from "./width";
import type { Turf } from "../../types/turf";

const googlePhoto = (i: number) => `https://lh3.googleusercontent.com/p/AF1Qip${i}=w1600-h1200`;
const ownPhoto = (i: number) => `https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/t/${String(i).padStart(24, "a")}.webp`;

/** A turf row as transformTurf gives it: everything null unless set. */
function turf(over: Partial<Turf> & Record<string, unknown> = {}): Turf {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "a-turf",
    name: "A Turf",
    address: "",
    description: null,
    sports: ["Football"],
    amenities: [],
    images: [],
    cover_image: null,
    rating: 0,
    total_reviews: 0,
    morning_price: null,
    afternoon_price: null,
    evening_price: null,
    weekend_morning_price: null,
    weekend_afternoon_price: null,
    weekend_evening_price: null,
    price_mentions: null,
    pricing_bands: null,
    price_unit: null,
    slot_minutes: null,
    price_owner_confirmed: null,
    opening_hours: null,
    start_time: null,
    end_time: null,
    is_24x7: null,
    has_floodlights: null,
    is_covered: null,
    ground_format: null,
    membership_required: null,
    area: null,
    city: null,
    ...over,
  } as unknown as Turf;
}

function fromRow(r: PrototypeRow) {
  const { key, photos, call, whatsapp, reports, title, description, ...row } = r;
  void title;
  void description;
  return {
    turf: turf({ ...row, slug: key, images: Array.from({ length: photos }, (_, i) => googlePhoto(i)) } as Partial<Turf>),
    contact: { call, whatsapp },
    reports,
  };
}

/** No title over 60 characters or 580px, no description over 155, no banned word, no ★. */
function assertClean(m: { title: string; description: string; name: string }, label: string) {
  assert.ok(m.title.length <= TITLE_MAX_CHARS, `${label}: title ${m.title.length}c: ${m.title}`);
  assert.ok(textWidthPx(m.title) <= TITLE_MAX_PX, `${label}: title ${textWidthPx(m.title)}px: ${m.title}`);
  assert.ok(m.description.length <= DESCRIPTION_MAX_CHARS, `${label}: description ${m.description.length}c: ${m.description}`);
  assert.equal(bannedCopy(m.title.replace(m.name, "")), null, `${label}: title says "${bannedCopy(m.title.replace(m.name, ""))}"`);
  assert.equal(bannedCopy(m.description), null, `${label}: description says "${bannedCopy(m.description)}"`);
  assert.ok(!/★/.test(m.title + m.description), `${label}: star`);
  assert.ok(!m.title.includes(" | TapTurf"), `${label}: brand in a turf title`);
  assert.ok(!m.description.includes(m.name), `${label}: the description repeats the name`);
}

/** A place word (area or city) appears at most once in the title. */
function assertNoRepeatedPlace(title: string, words: (string | null | undefined)[], label: string) {
  for (const w of words) {
    if (!w) continue;
    const n = normPlace(w);
    const hits = ` ${normPlace(title)} `.split(` ${n} `).length - 1;
    assert.ok(hits <= 1, `${label}: "${w}" ${hits} times in "${title}"`);
  }
}

// ── the reviewed prototype, row for row ──

/**
 * Where the page differs from the prototype on purpose. The prototype
 * read turfs.area only; the page also reads the area from the address
 * (areaFor), as every turf page already does, so The Foothill Arena
 * (area not set) is placed in Kothrud from "…, Kothrud, Pune".
 */
const DIFFERS: Record<string, { description: string }> = {
  foothill: {
    description:
      "Open 6 AM–11 PM daily. Cricket & football turf in Kothrud, Pune, floodlit, 7-a-side. 4.4 on Google (102 reviews). Call the turf for rates, no booking fee.",
  },
};

for (const r of PROTOTYPE_ROWS) {
  test(`prototype row ${r.key}: title and description`, () => {
    const m = turfMeta(fromRow(r));
    assert.equal(m.title, r.title);
    assert.equal(m.description, DIFFERS[r.key]?.description ?? r.description);
    assertClean(m, r.key);
    assertNoRepeatedPlace(m.title, [displayArea(r.area), m.cityLabel], r.key);
  });
}

// ── names ──

test("seoName keeps what identifies the venue and drops the padding", () => {
  // [stored name, city, seoName, area (areaFor)]
  const cases: [string, string | null, string, string?][] = [
    ["Bellator Sports Arena 🏟️ Cricket box ! pickleball !Football academy", "gurgaon", "Bellator Sports Arena"],
    ["24/7 Sports Club & Turf", "indore", "24/7 Sports Club & Turf"],
    ["Hatrics Football/Cricket Turf Thane", "mumbai", "Hatrics Football/Cricket Turf Thane"],
    ["AMRUTHA SPORTS ARENA A/C", "hyderabad", "Amrutha Sports Arena A/C"],
    ["ZESTO FOOTBALL TURF", "pune", "Zesto Football Turf"],
    ["Smash TO PLAY Bangalore", "bangalore", "Smash TO PLAY Bangalore"],
    ["THE TOWN CRICKET TURF - BOX CRICKET TURF Jagatpura", "jaipur", "The Town Cricket Turf", "Jagatpura"],
    // A " - " part goes only when it is sport words plus the area or city, never a name.
    ["Football Turf Thane - Strikers Arena", "mumbai", "Football Turf Thane - Strikers Arena", "Kolshet"],
    ["Proplay - Playpoint Sports Arena", "bangalore", "Proplay - Playpoint Sports Arena", "Gangondanahalli"],
    // ...and never when the part before it is only sport words and a place.
    ["Jaipur Futsal - Jaipur Football Academy", "jaipur", "Jaipur Futsal - Jaipur Football Academy", "Narayan Vihar"],
    ["Kridabhumi - The Multisports Turf", "nashik", "Kridabhumi", "Dwarka"],
    ["COCO - TURF & CAFÉ", "bangalore", "Coco - Turf & Café", "Horamavu"],
    ["Sports Zone Shimoga - First/Best Turf", "shivamogga", "Sports Zone Shimoga", "Malligena Halli"],
    ["The Turf - Cricket Pitch/Ground", "amritsar", "The Turf - Cricket Pitch/Ground", "Nanngli"],
    ["Apollo Turf - Best Turf in Thane", "mumbai", "Apollo Turf", "Kalwa"],
    ["ClayGrounds | Deep VK", "gurgaon", "ClayGrounds Deep VK"],
    ["ClayGrounds | Sec 65 Gurugram", "gurgaon", "ClayGrounds Sec 65"],
    ["Premier League Park | Delhi", "delhi", "Premier League Park"],
    ["Kick Off Arena | Box Cricket", "pune", "Kick Off Arena"],
    ["The Foothill Arena (Gandhi Bhavan)", "pune", "The Foothill Arena (Gandhi Bhavan)"],
    ["Turf Park (Baner)", "pune", "Turf Park (Baner)"],
    ["Goal Zone (Box Cricket & Football)", "pune", "Goal Zone"],
    ["Goal Zone (Turf)", "pune", "Goal Zone"],
    ["Goal Zone (Pune)", "pune", "Goal Zone"],
    ["Turf Up - Hinjewadi", "pune", "Turf Up - Hinjewadi"],
    ["Urban Sports - N R Bhagat Nerul", "mumbai", "Urban Sports - N R Bhagat Nerul"],
    ["Jk Knowledge Sports Center And Turf", "mumbai", "JK Knowledge Sports Center And Turf"],
    ["St Mary Dr Turf", "pune", "St Mary Dr Turf"],
    ["Kick Off - Best Turf in Pune", "pune", "Kick Off"],
    ["Green Turf Cricket, Football Etc", "nashik", "Green Turf"],
    ["PLAYMAKERS SOCCER FIELD", "kochi", "Playmakers Soccer Field"],
    ["SPORTS AND FITNESS HUB", null, "Sports and Fitness Hub"],
    ["KSR FC ARENA", "bangalore", "KSR FC Arena"],
    ["🏏 Cricket Hub", null, "Cricket Hub"],
    // y is a vowel: ordinary words are not initials.
    ["KV Sky Turf", "bangalore", "KV Sky Turf"],
    ["My Cricket Box", "pune", "My Cricket Box"],
    ["Fly High Sports Arena Turf", "pune", "Fly High Sports Arena Turf"],
    ["008 Ultimate powerplay Turf By Fabzia", "mumbai", "008 Ultimate powerplay Turf By Fabzia"],
    ["Ch. Mange Ram Box Cricket", "delhi", "Ch. Mange Ram Box Cricket"],
  ];
  for (const [raw, city, want, area] of cases) assert.equal(seoName(raw, city, area), want, raw);
});

test("seoName: shouted names read as words, possessives and ordinary short words included", () => {
  const cases: [string, string | null, string][] = [
    ["CHAMPION'S DEN CRICKET & FOOTBALL TURF", "bangalore", "Champion's Den Cricket & Football Turf"],
    ["AGNEL'S TURF", "pune", "Agnel's Turf"],
    ["LET’S PLAY MULTISPORTS TURF", "nashik", "Let’s Play Multisports Turf"],
    ["STYUDS RJ'S MULTI SPORTS TURF", "puducherry", "Styuds RJ's Multi Sports Turf"],
    ["D'SOUZA SPORTS ARENA", "mumbai", "D'Souza Sports Arena"],
    ["THE BIG TURF", "mumbai", "The Big Turf"],
    ["HULK IN THE BOX", "tirupati", "Hulk in the Box"],
    ["HIT AND RUN TURF", "madurai", "Hit and Run Turf"],
    ["KICK OFF TURF", "kozhikode", "Kick Off Turf"],
    ["ELITE TURFS BY CRL", "pune", "Elite Turfs by CRL"],
    // Real acronyms with vowels stay capitals.
    ["SVA SPORTS ARENA", "pune", "SVA Sports Arena"],
    ["OMR SPORTS ARENA", "chennai", "OMR Sports Arena"],
    ["ARK SPORTS ARENA", "pune", "ARK Sports Arena"],
  ];
  for (const [raw, city, want] of cases) assert.equal(seoName(raw, city), want, raw);
});

test("seoName: no stray dot, no split bracket, no name cut down to sport words", () => {
  const cases: [string, string | null, string, string?][] = [
    ["Skyland Turf.", "chennai", "Skyland Turf", "Ayanavaram"],
    ["Game On..!", "kurnool", "Game On", "Kurnool"],
    ["Camp nou Turf, Polukkara.", "thrissur", "Camp nou Turf, Polukkara"],
    // Dotted initials keep their dot.
    ["F.A.S.E.", "pune", "F.A.S.E.", "Pashan"],
    ["M(R)ETRO Play Arena", "bangalore", "M(R)ETRO Play Arena", "Electronic City"],
    ["Ranangan The Multisport's Best Turf in Nashik", "nashik", "Ranangan", "Trimbak Road"],
    ["Turf cricket", "patiala", "Turf cricket", "Sular"],
    // Unchanged: a bracket after a word that is only sport words still goes.
    ["Goal Zone(Turf)", "pune", "Goal Zone"],
  ];
  for (const [raw, city, want, area] of cases) assert.equal(seoName(raw, city, area), want, raw);
});

test("nameCuts: at a part's end first, never an open bracket, never a part of sport words", () => {
  const c = nameCuts("BSA - Blitzz Sports Academy - Cricket and Football Turf - Salem");
  // "... - Cricket and Football Turf" ends on sport words, and "BSA" alone is too short.
  assert.deepEqual(c.parts, ["BSA - Blitzz Sports Academy"]);
  assert.deepEqual(nameCuts("ASSC Cricket Academy (Elegants Cricket Nets & Box)").parts, ["ASSC Cricket Academy"]);
  assert.ok(nameCuts("ASSC Cricket Academy (Elegants Cricket Nets & Box)").words.every((w) => !w.includes("(")));
  assert.deepEqual(nameCuts("Sportozen: Box Cricket, Football Turf & Cricket Nets").parts, ["Sportozen"]);
});

// ── real rows the round 3 review found ──

function fromEdge(r: EdgeRow) {
  const { key, photos, call, whatsapp, reports, title, description, seoName: n, nameShared, ...row } = r;
  void title;
  void description;
  void n;
  return {
    turf: turf({ ...row, slug: key, images: Array.from({ length: photos }, (_, i) => googlePhoto(i)) } as Partial<Turf>),
    contact: { call, whatsapp },
    reports,
    nameShared,
  };
}

for (const r of EDGE_ROWS) {
  test(`real row ${r.key}: name, title and description`, () => {
    const m = turfMeta(fromEdge(r));
    assert.equal(m.name, r.seoName);
    assert.equal(m.title, r.title);
    assert.equal(m.description, r.description);
    assert.ok(titleFits(m.title), m.title);
    assert.ok((m.title.match(/\(/g)?.length ?? 0) <= (m.title.match(/\)/g)?.length ?? 0), `open bracket: ${m.title}`);
    assert.ok(!/\.,/.test(m.title), m.title);
    assert.ok(m.cityLabel && normPlace(m.title).includes(normPlace(m.cityLabel)), `no city: ${m.title}`);
  });
}

test("two branches of one brand in a city: the shared name is found, and each title keeps its area", () => {
  const pairs: [string, string][] = [
    ["dynamosOmega", "dynamosGnw"],
    ["sportyzo66", "sportyzo65"],
  ];
  const row = (k: string) => EDGE_ROWS.find((r) => r.key === k)!;
  const facts = turfFactsFrom(
    EDGE_ROWS.map((r) => ({ id: r.key, name: r.name, city: r.city ?? null, opening_hours: null, start_time: null, end_time: null, is_24x7: null, owner_phone: null, landline_phone: null, whatsapp_phone: null, contact_info: null }) as TurfFactRow),
  );
  for (const [a, b] of pairs) {
    const key = sharedNameKey(row(a).name, row(a).city);
    assert.equal(key, sharedNameKey(row(b).name, row(b).city));
    assert.ok(facts.sharedNames.includes(key), key);
    const ta = turfMeta(fromEdge(row(a))).title;
    const tb = turfMeta(fromEdge(row(b))).title;
    assert.notEqual(ta, tb);
    // Without the flag the facets win and the two collide (the bug).
    assert.equal(turfMeta({ ...fromEdge(row(a)), nameShared: false }).title, turfMeta({ ...fromEdge(row(b)), nameShared: false }).title);
  }
  assert.equal(facts.sharedNames.length, 2);
  // Other cities never share: the key carries the city.
  assert.notEqual(sharedNameKey("Goal Zone", "pune"), sharedNameKey("Goal Zone", "mumbai"));
  assert.equal(sharedNameKey("Goal Zone", null), "");
});

test("the description quotes the format the page's Format row shows", () => {
  const base = { name: "Goal Zone", city: "pune", sports: ["Football"], ground_format: "7-a-side" };
  const desc = (over: Partial<Turf>) => turfMeta({ turf: turf({ ...base, ...over }), contact: { call: true, whatsapp: true } }).description;
  assert.match(desc({ formats: ["5-a-side"] } as Partial<Turf>), /Football turf, 5-a-side\./);
  assert.ok(!desc({ formats: ["5-a-side"] } as Partial<Turf>).includes("7-a-side"));
  // "box cricket" is a format the type already says; no side count, no format.
  assert.match(desc({ formats: ["box cricket"] } as Partial<Turf>), /Football turf\./);
  assert.match(desc({ formats: ["6-a-side", "box cricket"] } as Partial<Turf>), /Football turf, 6-a-side\./);
  // No formats: ground_format, as the page.
  assert.match(desc({}), /Football turf, 7-a-side\./);
});

test("displayArea: the first part, no brackets, no 'opposite'", () => {
  assert.equal(displayArea("Karanje / Gendamal Naka"), "Karanje");
  assert.equal(displayArea("Sun City (NH-24)"), "Sun City");
  assert.equal(displayArea("opposite Sector 23"), "Sector 23");
  assert.equal(displayArea("Opp. Metro Station"), "Metro Station");
  assert.equal(displayArea("near Baner Road"), "Baner Road");
  assert.equal(displayArea("  "), null);
  assert.equal(displayArea(null), null);
});

test("placeFor leaves out what the name already says (no 'Hinjewadi Hinjewadi', no 'Bangalore Bangalore')", () => {
  assert.deepEqual(placeFor("Turf Up - Hinjewadi", "Hinjewadi", "pune"), { full: "Pune", city: "Pune" });
  assert.deepEqual(placeFor("Smash TO PLAY Bangalore", null, "bangalore"), { full: "", city: "" });
  assert.deepEqual(placeFor("Smash TO PLAY Bangalore", "Koramangala", "bangalore"), { full: "Koramangala", city: "" });
  assert.deepEqual(placeFor("Urban Sports - N R Bhagat Nerul", "Nerul", "mumbai"), { full: "Mumbai", city: "Mumbai" });
  assert.deepEqual(placeFor("ClayGrounds Sec 65", "Sector 65", "gurgaon"), { full: "Gurgaon", city: "Gurgaon" });
  // An alias counts as the city: Thane is Mumbai's.
  assert.deepEqual(placeFor("Hatrics Football/Cricket Turf Thane", "Thane West", "mumbai"), { full: "Thane West", city: "" });
  assert.deepEqual(placeFor("Gurugram Sports Hub", "Sector 49", "gurgaon"), { full: "Sector 49", city: "" });
  // An area that is the city itself is said once.
  assert.deepEqual(placeFor("Goal Zone", "Pune", "pune"), { full: "Pune", city: "Pune" });
  assert.deepEqual(placeFor("Goal Zone", "Baner", null), { full: "Baner", city: "" });
});

test("the names the design calls out make clean titles", () => {
  const rows: [Partial<Turf>, string][] = [
    [{ name: "Hatrics Football/Cricket Turf Thane", area: "Thane West", city: "mumbai", rating: 4.4, total_reviews: 90, images: [1, 2, 3].map(googlePhoto) }, "Hatrics Football/Cricket Turf Thane – Reviews & Photos"],
    [{ name: "AMRUTHA SPORTS ARENA A/C", area: "Kukatpally", city: "hyderabad", rating: 4.1, total_reviews: 12, sports: ["Badminton"] }, "Amrutha Sports Arena A/C, Kukatpally, Hyderabad"],
    [{ name: "Smash TO PLAY Bangalore", area: null, city: "bangalore", is_24x7: true, rating: 4.5, total_reviews: 40 }, "Smash TO PLAY Bangalore – Timings & Reviews"],
    [{ name: "ZESTO FOOTBALL TURF", area: "Kharadi", city: "pune", morning_price: 900, evening_price: 1200, opening_hours: { daily: "6 AM–11 PM" } }, "Zesto Football Turf, Kharadi, Pune – from ₹900/hr & Timings"],
  ];
  for (const [over, want] of rows) {
    const m = turfMeta({ turf: turf(over), contact: { call: true, whatsapp: true } });
    assert.equal(m.title, want);
    assertClean(m, String(over.name));
    assertNoRepeatedPlace(m.title, [displayArea(over.area), m.cityLabel, "Thane"], String(over.name));
  }
});

// ── facts only from the page's own data ──

test("a reported price never reaches the title or description", () => {
  const m = turfMeta({
    turf: turf({ name: "Goal Zone", area: "Baner", city: "pune", price_mentions: [{ price_inr: 900, context: "a review" }, { text: "Rs 1000 an hour on weekends" }] }),
    contact: { call: true, whatsapp: false },
  });
  assert.ok(!/₹|Rs/.test(m.title + m.description), m.title + " / " + m.description);
  assert.match(m.description, /Call the turf for rates, no booking fee\.$/);
});

test("listed bands win over the slot columns, and the unit follows price_unit", () => {
  const bands = turfMeta({
    turf: turf({ name: "PlayAll Noida 105", area: "Sector 105", city: "noida", morning_price: 660, pricing_bands: [{ band: "evening", days: "all", format: "5-a-side", price_per_hour: 1760 }] }),
    contact: { call: true, whatsapp: true },
  });
  assert.match(bands.title, /₹1,760\/hr/);
  assert.ok(!bands.title.includes("660") && !bands.description.includes("660"));
  const slot = turfMeta({ turf: turf({ name: "Slot Turf", city: "pune", morning_price: 1500, evening_price: 1800, price_unit: "per_slot", slot_minutes: 90 }), contact: { call: true, whatsapp: true } });
  assert.match(slot.title, /from ₹1,500\/slot/);
  assert.match(slot.description, /^₹1,500–1,800\/slot\./);
  const person = turfMeta({ turf: turf({ name: "Pool Club", city: "pune", sports: ["Swimming"], morning_price: 150, price_unit: "per_person" }), contact: { call: true, whatsapp: false } });
  assert.match(person.title, /₹150\/person/);
});

test("a Google rating needs 5 reviews, and reads 'on Google', never a star", () => {
  const photos = [1, 2, 3].map(googlePhoto);
  const few = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", rating: 5, total_reviews: 4, images: photos }), contact: { call: true, whatsapp: true } });
  assert.ok(!few.description.includes("on Google"));
  assert.ok(!few.title.includes("Reviews"));
  const many = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", rating: 4.25, total_reviews: 1234, images: photos }), contact: { call: true, whatsapp: true } });
  assert.match(many.description, /4\.3 on Google \(1,234 reviews\)/);
  assert.match(many.title, /Reviews/);
});

test("TapTurf player reports: counted from 1, averaged from 5", () => {
  const one = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", images: [1, 2, 3].map(googlePhoto) }), contact: { call: true, whatsapp: true }, reports: { count: 1, average: 4 } });
  assert.match(one.description, /1 TapTurf player report, 3 photos\./);
  assert.match(one.title, /Reviews/);
  const five = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune" }), contact: { call: true, whatsapp: true }, reports: { count: 5, average: 4.4 } });
  assert.match(five.description, /4\.4 from 5 TapTurf player reports/);
});

test("photos: counted from 3, booking apps' photos left out", () => {
  const two = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", images: [googlePhoto(1), googlePhoto(2)] }), contact: { call: true, whatsapp: true } });
  assert.ok(!two.description.includes("photos") && !two.title.includes("Photos"));
  const apps = turfMeta({
    turf: turf({ name: "Goal Zone", city: "pune", images: [googlePhoto(1), googlePhoto(2), "https://playo.gumlet.io/a.jpg", "https://playo.gumlet.io/b.jpg"] }),
    contact: { call: true, whatsapp: true },
  });
  assert.ok(!apps.description.includes("photos"));
  const three = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", images: [1, 2, 3].map(googlePhoto) }), contact: { call: true, whatsapp: true } });
  assert.match(three.description, /3 photos/);
});

test("the call to action names only the channels the page has", () => {
  const base = { name: "Goal Zone", city: "pune", morning_price: 800 };
  assert.match(turfMeta({ turf: turf(base), contact: { call: true, whatsapp: true } }).description, /Call or WhatsApp the turf, no booking fee\.$/);
  assert.match(turfMeta({ turf: turf(base), contact: { call: true, whatsapp: false } }).description, /Call the turf, no booking fee\.$/);
  assert.match(turfMeta({ turf: turf(base), contact: { call: false, whatsapp: true } }).description, /WhatsApp the turf, no booking fee\.$/);
  assert.match(turfMeta({ turf: turf(base), contact: { call: false, whatsapp: false } }).description, /See the map and directions\.$/);
  assert.match(
    turfMeta({ turf: turf({ ...base, membership_required: true }), contact: { call: true, whatsapp: false } }).description,
    /Members' club: call to ask about guest access\.$/,
  );
});

test("share card: our own photo first, else the first photo, else the site card", () => {
  const own = turfMeta({ turf: turf({ name: "Goal Zone", area: "Baner", city: "pune", images: [googlePhoto(1), ownPhoto(2)] }), contact: { call: true, whatsapp: true } });
  assert.equal(own.ogImage.url, ownPhoto(2));
  assert.equal(own.ogImage.alt, "Goal Zone, Baner, Pune");
  const google = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", images: [googlePhoto(1)] }), contact: { call: true, whatsapp: true } });
  assert.equal(google.ogImage.url, googlePhoto(1));
  const none = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune" }), contact: { call: true, whatsapp: true } });
  assert.deepEqual(none.ogImage, { ...DEFAULT_OG_IMAGE });
});

test("hours: compact, and lower-case day keys count", () => {
  assert.equal(compactHours("Open 6:00 AM – 12:00 AM daily"), "Open 6 AM–midnight daily");
  assert.equal(compactHours("Open 6:00 AM – 11:30 PM daily"), "Open 6 AM–11:30 PM daily");
  assert.equal(compactHours("Open 6:00 AM – 12:00 PM, 4:00 PM – 11:00 PM daily"), "Open 6 AM–noon, 4 PM–11 PM daily");
  const lower = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, "6 AM–11 PM"]));
  const m = turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", opening_hours: lower as Turf["opening_hours"], images: [1, 2, 3].map(googlePhoto) }), contact: { call: true, whatsapp: true } });
  assert.match(m.description, /^Open 6 AM–11 PM daily\./);
  assert.equal(m.title, "Goal Zone, Pune – Timings & Photos");
  // One fact that is not a price is not worth a title slot.
  assert.equal(turfMeta({ turf: turf({ name: "Goal Zone", city: "pune", opening_hours: lower as Turf["opening_hours"] }), contact: { call: true, whatsapp: true } }).title, "Goal Zone, Pune");
});

test("type phrase: turf sports first, courts after", () => {
  assert.equal(typePhrase(["Box Cricket", "Football"]), "Box cricket & football turf");
  assert.equal(typePhrase(["Box Cricket", "Pickleball"]), "Box cricket turf with pickleball court");
  assert.equal(typePhrase(["Football", "Badminton", "Pickleball"]), "Football turf with badminton & pickleball courts");
  assert.equal(typePhrase(["Badminton"]), "Badminton court");
  assert.equal(typePhrase(["Badminton", "Pickleball"]), "Badminton & pickleball courts");
  assert.equal(typePhrase(["Hockey"]), "Hockey venue");
  assert.equal(typePhrase([]), "Sports venue");
});

test("long names and places still fit: title cut at a word, description kept under 155", () => {
  const m = turfMeta({
    turf: turf({
      name: "Kshetram Sports Academy Fitness Club Football Cricket Bowling Machine Turf Kids Coaching Centre",
      area: "Sri Venkateswara Nagar Colony Extension Phase Two",
      city: "thiruvananthapuram",
      sports: ["Box Cricket", "Football", "Badminton", "Pickleball"],
      morning_price: 1200,
      evening_price: 1800,
      opening_hours: { daily: "5:30 AM–11:30 PM" },
      rating: 4.7,
      total_reviews: 2345,
      has_floodlights: true,
      is_covered: true,
      ground_format: "5-a-side",
      images: [1, 2, 3, 4, 5].map(googlePhoto),
    }),
    contact: { call: true, whatsapp: true },
    reports: { count: 12, average: 4.6 },
  });
  assert.ok(titleFits(m.title), m.title);
  assert.ok(m.title.endsWith(", Thiruvananthapuram"), m.title);
  assert.ok(!/\s(?:and|&|of)$/.test(m.title.split(",")[0]), m.title);
  assertClean(m, "long");
  assert.match(m.description, /^₹1,200–1,800\/hr · Open 5:30 AM–11:30 PM daily\./);
  assert.match(m.description, /Call or WhatsApp the turf, no booking fee\.$/);
});

test("withBrand adds ' | TapTurf' only when the whole title fits", () => {
  assert.equal(withBrand("Free Cricket Tools: Live Scorer, NRR, Toss & More"), "Free Cricket Tools: Live Scorer, NRR, Toss & More | TapTurf");
  assert.equal(withBrand("Pickleball Rules for Beginners: Serve, Kitchen & Scoring"), "Pickleball Rules for Beginners: Serve, Kitchen & Scoring");
});
