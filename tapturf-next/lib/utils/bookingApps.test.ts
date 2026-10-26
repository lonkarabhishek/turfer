import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_APP_DOMAINS,
  cleanPriceMention,
  cleanPriceMentions,
  cleanPriceNote,
  googleMapsUrl,
  httpUrl,
  isBookingAppHost,
  isBookingAppUrl,
  mentionsBookingApp,
  priceFigures,
  publicLink,
  scrubBookingApps,
} from "./bookingApps";

// Sentences as the research pass and the data team wrote them
// (turfs.description, good_to_know, access_notes; 6 to 26 Oct).

const LEAD = "A floodlit turf in Wakad.";

test("a sentence whose point is booking on an app goes whole", () => {
  for (const s of [
    // Checklist, 26 Oct: "Slots can be booked on Playo and Hudle." became "Slots."
    "Slots can be booked on Playo and Hudle.",
    "You can book slots on Playo.",
    "Booking is via Playo.",
    "It is available on Playo.",
    "It is bookable on Kixar.",
    "It is publicly bookable on the Turf Town app.",
    "Bookable on the app until midnight.",
    "Book slots in advance on the TIDA Sports app.",
    "It is publicly bookable on Playo.",
    "It is listed on Playo for bookings enquiry.",
    "It is publicly bookable on Playo and KheloMore.",
    "It is listed on Hudle for box cricket.",
    "It is listed on Playo and Hudle for box cricket and football.",
    "It is bookable on Playo and KheloMore with late-night slots.",
    "Courts are publicly bookable on both apps.",
    "Its artificial turf is listed on KheloMore for box cricket and football bookings.",
    "The 5-a-side turf can be booked for football and box cricket on Playo.",
    "It can be booked on the ClayGrounds website and on District.",
    "Playo sells box cricket and bowling-machine sessions of 12 overs per 60 minutes.",
    "The venue takes bookings through its Kixar listing, which names cricket and football and lists parking, changing rooms, drinking water, first aid and washrooms.",
    "Reviewers say Playo sells out fast on weekends.",
    "Parking and washrooms are listed on Playo.",
    "It is listed on BookMyShow and Turfwala.",
    "Slots are sold through Zomato's District.",
    "It is bookable on the booking-app.",
    "Its booking-app listing shows ₹300 an hour.",
    "It is bookable on Playo, and costs ₹800 an hour.",
    "Book at playo.co/venue/offside for weekends.",
    "See https://www.district.in/play/kickpitch for slots.",
  ]) {
    assert.equal(scrubBookingApps(`${LEAD} ${s}`), LEAD, s);
    assert.equal(scrubBookingApps(s), null, s);
  }
});

test("a clause that names an app goes, the rest of the sentence stays", () => {
  for (const [s, kept] of [
    [
      "It is part of the Hotfut chain and is bookable on Playo, KheloMore and Hudle, with slots from early morning until after midnight.",
      "It is part of the Hotfut chain, with slots from early morning until after midnight.",
    ],
    ["Listings mention floodlights, washrooms and parking, and the venue is bookable on KheloMore.", "Listings mention floodlights, washrooms and parking."],
    [
      "Samartha Sports Arena is a cricket and football turf on Akkalkot Road in the MIDC area, listed on Playo.",
      "Samartha Sports Arena is a cricket and football turf on Akkalkot Road in the MIDC area.",
    ],
    [
      "Claygrounds Sec 86 is a 5v5 turf at Omaxe World Street, run by Claygrounds and bookable on the Claygrounds site and District.",
      "Claygrounds Sec 86 is a 5v5 turf at Omaxe World Street, run by Claygrounds.",
    ],
    ["Dugout is a box cricket ground near Kompally, listed on Playo as Fitbox Kompally.", "Dugout is a box cricket ground near Kompally."],
    ["It runs morning and evening coaching for children, and Playo and KheloMore sell evening slots on the pitch.", "It runs morning and evening coaching for children."],
    [
      "Jersey 7 is a cricket practice venue on Pipe Line Road in Puppalaguda, Manikonda, known for its bowling-machine batting sessions, and Playo also sells box cricket here.",
      "Jersey 7 is a cricket practice venue on Pipe Line Road in Puppalaguda, Manikonda, known for its bowling-machine batting sessions.",
    ],
    ["The single turf is used for both football and box cricket and is bookable on Playo, KheloMore and Hudle.", "The single turf is used for both football and box cricket."],
    [
      "Reviewers say the full ground suits 7- or 11-a-side football and Playo notes it is split into two half courts that can be booked together.",
      "Reviewers say the full ground suits 7- or 11-a-side football.",
    ],
    // Checklist, 26 Oct: "…parking listed by booking platforms."
    [
      "It offers box cricket, football and pickleball on artificial turf, with floodlights, drinking water, rental equipment, power backup, washrooms and parking listed by booking platforms.",
      "It offers box cricket, football and pickleball on artificial turf, with floodlights, drinking water, rental equipment, power backup, washrooms and parking.",
    ],
    // Checklist: "It does not appear on the main booking apps…" (the old rules kept it whole).
    ["It does not appear on the main booking apps, so slots are booked directly with the venue.", "Slots are booked directly with the venue."],
    [
      "Reviewers mention a 5v5 ground for small-sided games, booking listings cover formats from 4-a-side up to 11-a-side, and coaching is offered.",
      "Reviewers mention a 5v5 ground for small-sided games, and coaching is offered.",
    ],
    [
      "Skyline Turf is a cricket and football turf near Icchadevi Mandir in Ganapati Nagar, listed on Playspots.",
      "Skyline Turf is a cricket and football turf near Icchadevi Mandir in Ganapati Nagar.",
    ],
    [
      "FS Turf, Churchgate (by Sporloc) is an open turf on Fashion Street Road at New Marine Lines, near Churchgate.",
      "FS Turf, Churchgate is an open turf on Fashion Street Road at New Marine Lines, near Churchgate.",
    ],
    [
      "TSG Sports Arena is a multipurpose football and box cricket turf on the Ryan International School campus on Medchal Road, Kompally, operated by Sporloc.",
      "TSG Sports Arena is a multipurpose football and box cricket turf on the Ryan International School campus on Medchal Road, Kompally.",
    ],
    [
      "Greenfield 360 is a circular cricket turf behind Noel School in Jijau Nagar, styled like a small cricket ground, with online booking and late-night hours.",
      "Greenfield 360 is a circular cricket turf behind Noel School in Jijau Nagar, styled like a small cricket ground, with late-night hours.",
    ],
    ["Nova Cricket Turf is a well-lit box cricket turf on Shastripuram Main Road with online booking.", "Nova Cricket Turf is a well-lit box cricket turf on Shastripuram Main Road."],
    ["Pro Turf (listed on Playo as Pro Sports Arena) is a sports complex in Mundhwa.", "Pro Turf is a sports complex in Mundhwa."],
    ["It has floodlights and a cafe, and its external-listing page says it opens at 6.", "It has floodlights and a cafe."],
    ["Playo lists it as open 24 hours, and reviewers praise the lights.", "Reviewers praise the lights."],
    ["According to Playo, it opens at 6 AM daily.", "It opens at 6 AM daily."],
  ]) {
    assert.equal(scrubBookingApps(s), kept, s);
  }
});

test("what an app lists becomes what the venue has, when that reads as a sentence", () => {
  for (const [s, kept] of [
    // Checklist: "District lists washrooms…"
    ["District lists washrooms, showers, a steam room, lockers and parking.", "It has washrooms, showers, a steam room, lockers and parking."],
    ["Playo lists parking, washroom and drinking water.", "It has parking, washroom and drinking water."],
    ["Playo lists parking and washroom facilities, and the venue is also listed on KheloMore.", "It has parking and washroom facilities."],
    [
      "Playo lists two 6-a-side box cricket turfs with parking, washroom and drinking water, and the venue is also bookable on Hudle.",
      "It has two 6-a-side box cricket turfs with parking, washroom and drinking water.",
    ],
    ["Playo lists washroom, drinking water and beverages, with slots from 6 AM to 11 PM.", "It has washroom, drinking water and beverages, with slots from 6 AM to 11 PM."],
    ["Turfwala lists a 6,000 sq ft turf with 5v5, 7v7 and 11v11 formats.", "It has a 6,000 sq ft turf with 5v5, 7v7 and 11v11 formats."],
    [
      "Playspots lists 7's football and 8A cricket formats with washroom, purified water and parking, and Google Maps shows it open 24 hours.",
      "It has 7's football and 8A cricket formats with washroom, purified water and parking, and Google Maps shows it open 24 hours.",
    ],
    ["Playo sells box cricket slots and lists drinking water.", "It has drinking water."],
    ["Playo also sells box cricket and lists washroom, parking and drinking water.", "It has washroom, parking and drinking water."],
    [
      "Its Playo listing, under the name Blaze Box Cricket, offers a medium-size turf from 6 AM to midnight with washroom, parking and drinking water.",
      "It offers a medium-size turf from 6 AM to midnight with washroom, parking and drinking water.",
    ],
    [
      "Its Playo listing offers 5-, 6-, 7- and 8-a-side pitch configurations bookable from early morning to late evening.",
      "It offers 5-, 6-, 7- and 8-a-side pitch configurations bookable from early morning to late evening.",
    ],
    ["Maps and Playo list it as open round the clock.", "Maps lists it as open round the clock."],
  ]) {
    assert.equal(scrubBookingApps(s), kept, s);
  }
  // Never "Listings mention …": that still points at a listing.
  assert.doesNotMatch(scrubBookingApps("Playo lists washroom and parking.") ?? "", /listing/i);
  // "It has" is not forced onto what isn't a thing the venue has.
  assert.equal(scrubBookingApps("Playo lists it as open round the clock."), null);
  assert.equal(scrubBookingApps("Playo lists the turf as 6-a-side."), null);
});

test("venue names and plain words that look alike stay", () => {
  for (const s of [
    "PlayOn Kochi Football & Cricket Turf is a sports venue in Vennala, Kochi, offering box cricket and football.",
    "Playon Sports Arena is a sports venue in Electronic City Phase II, Bengaluru, offering football.",
    "PlayOrbit is a sports venue in Wagholi, Pune, offering box cricket and football.",
    "The Turf Town is a sports venue in Jalalpur, Gwalior, offering box cricket.",
    "Turf Town is a turf in Hatte Nagar.",
    "The Turf District is a multi-sport turf in Gowlidoddi, Financial District, with box cricket, football and volleyball.",
    "District 9, Noida is a multi-sport venue in Sector 33, Noida.",
    "Khelo Noida is a box cricket venue in Sector 51, Noida.",
    "Khelo Patna Elite Turf - Bihar's Tallest Turf is a sports venue in Sandalpur, Patna, offering box cricket and football.",
    "KhelO Box Cricket is a sports venue in Chokha, Jodhpur, offering box cricket.",
    "Super Sports Park near Prestige Sky Tech in the Financial District has box cricket, football and volleyball, with parking and washrooms.",
    "MAP Turf is a cricket and football turf in Government Colony, Vishrambag, near the district court, used for college tournaments and night matches.",
    "A sports shop in the district sells cricket gear.",
    "It is on District Road near the bus stand.",
    "Huddle's website lists hourly turf bookings for cricket, football, volleyball and handball.",
    "Legacy Sports Arena is a football and box cricket turf in Narhe, Pune, opposite Tidake Dairy and near Jadhavar School.",
    "Listings show artificial turf, flood lights and first aid, and Yappe lists it open 6 AM to 2 AM.",
    "Slots can be booked through the CC Turf app, and the chain also runs turfs in Manish Nagar and Pardi.",
    "Recent reviews report a worn surface and booking problems through the venue's app.",
    "Reviewers say the turf is busy and recommend booking in advance.",
    "Offside is a football academy and bookable turf in Gruhatara Colony.",
    "Pro Turf (listed on Google Maps as Pro Sports Arena) is a sports complex in Mundhwa.",
    "Its Maps listing shows 5 AM to midnight daily.",
    "The venue was earlier listed online as Chowdhary Turf.",
    "Max 14 players per football booking and 16 per box cricket booking; external coaches and parties not permitted.",
    "It has two large turfs that can be booked separately or together for a full-pitch cricket game, and it is often used for corporate tournaments.",
  ]) {
    assert.equal(mentionsBookingApp(s), false, s);
    assert.equal(scrubBookingApps(s), s, s);
  }
});

test("paragraph breaks survive, a dropped sentence takes no words with it, and nothing left is null", () => {
  assert.equal(
    scrubBookingApps("A turf in Baner. It is publicly bookable on Playo.\n\nGood to know: bring your own bat."),
    "A turf in Baner.\n\nGood to know: bring your own bat.",
  );
  assert.equal(
    scrubBookingApps("Close to Gachibowli and Kondapur. Bookable on the app until midnight. Some players mention damaged nets and pitch wear."),
    "Close to Gachibowli and Kondapur. Some players mention damaged nets and pitch wear.",
  );
  assert.equal(scrubBookingApps("It is publicly bookable on Playo.\n\nIt is listed on Hudle."), null);
  assert.equal(scrubBookingApps(""), null);
  assert.equal(scrubBookingApps(null), null);
  assert.equal(scrubBookingApps(undefined), null);
});

test("no output is a fragment or has stray punctuation", () => {
  const inputs = [
    "Slots can be booked on Playo and Hudle.",
    "It is publicly bookable on the Turf Town app.",
    "Parking, washrooms and floodlights are listed on Playo, and there is a cafe.",
    "Floodlights, parking and washrooms are listed by booking platforms.",
    "It has a turf, listed on Playo, and a cafe.",
    "On Playo, it is listed as Fitbox.",
    "The venue (Playo) has lights.",
    "Booking via Hudle; walk-ins are welcome.",
  ];
  for (const s of inputs) {
    const out = scrubBookingApps(s);
    if (out == null) continue;
    assert.doesNotMatch(out, /\s[,.;:!?]|,[.!?]|,,|\(\s*\)|^\W|\b(?:is|are|on|by|and|the)\.$/, `${s} -> ${out}`);
    assert.equal(mentionsBookingApp(out), false, `${s} -> ${out}`);
    assert.ok(out.split(/\s+/).length >= 3, `${s} -> ${out}`);
  }
  assert.equal(scrubBookingApps("It has a turf, listed on Playo, and a cafe."), "It has a turf, and a cafe.");
  assert.equal(scrubBookingApps("The venue (Playo) has lights."), "The venue has lights.");
  assert.equal(scrubBookingApps("Booking via Hudle; walk-ins are welcome."), "Walk-ins are welcome.");
});

test("what counts as naming an app", () => {
  for (const s of [
    "Playo",
    "on Hudle",
    "KheloMore",
    "Khelo More",
    "Playspots",
    "the Turf Town app",
    "on Turf Town",
    "on District",
    "District lists parking",
    "Kixar",
    "BookMyShow",
    "Turfwala",
    "TIDA Sports",
    "Sporloc",
    "booking-app listing",
    "booking apps",
    "booking platforms",
    "external-listing",
    "both apps",
    "on the app",
    "with online booking",
    "playo.co",
    "https://img1.hudle.in/venues/1.jpg",
  ]) {
    assert.equal(mentionsBookingApp(s), true, s);
  }
});

test("booking app hosts: the apps' domains, their subdomains and stand-ins; venues that look alike are not", () => {
  for (const u of [
    "https://playo.co/venue/x",
    "https://www.playo.co",
    "https://playo.gumlet.io/OFFSIDE2022/offside.jpg",
    "https://img.playo.io/x.png",
    "https://www.hudle.in/venues/1",
    "https://img1.hudle.in/venues/3528/images/1040x490/x.jpg",
    "https://khelomore.com/venue",
    "https://www.playspots.in/v",
    "https://book.playspots.in/v",
    "https://app.playspots.in/v",
    "https://playspots.page.link/abc",
    "https://open.turftown.in/x",
    "https://turftown.in",
    "https://www.district.in/play/x",
    "https://link.district.in/abc",
    "https://cdn.district.in/assets/events/x.jpg",
    "https://kixar.in/v",
    "https://in.bookmyshow.com/x",
    "https://turfwala.com/public/storage/images/x.png",
    "https://www.sporloc.com",
    "https://d3mt0x61rkkfy3.cloudfront.net/venue/abc/original/1-web_image",
    "www.playspots.in/v",
    "external-listing",
    "https://img1.booking-app.com/venues/1.jpg",
  ]) {
    assert.equal(isBookingAppUrl(u), true, u);
  }
  for (const u of [
    "https://www.district9.co.in",
    "https://www.huddle.co.in",
    "https://khelopatna.in",
    "https://files.yappe.in/place/full/x.webp",
    "https://lh3.googleusercontent.com/gps-cs-s/x=w1600-h1200",
    "https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/t/abc.webp",
    "https://www.claygrounds.com",
    "https://www.playall.in",
    "https://playon.in",
    "https://d1234.cloudfront.net/x.jpg",
    "/turf/external-listing-arena",
    "",
    null,
    42,
  ]) {
    assert.equal(isBookingAppUrl(u), false, String(u));
  }
  assert.equal(isBookingAppHost("CDN.District.IN."), true);
  assert.equal(isBookingAppHost("notdistrict.in"), false);
  assert.ok(BOOKING_APP_DOMAINS.includes("playo.gumlet.io"), "listed for the web search's blocked_domains");
});

test("links a page may render: absolute http(s) only, and no booking app", () => {
  assert.equal(httpUrl("https://www.niwec.org/sport-fees/"), "https://www.niwec.org/sport-fees/");
  assert.equal(httpUrl(" http://example.in/x "), "http://example.in/x");
  for (const u of ["external-listing", "/turf/external-listing", "javascript:alert(1)", "mailto:a@b.in", "ftp://x.in/a", "https://localhost/x", "", null, undefined]) {
    assert.equal(httpUrl(u), null, String(u));
  }
  assert.equal(publicLink("https://www.claygrounds.com/x"), "https://www.claygrounds.com/x");
  assert.equal(publicLink("https://book.playspots.in/x"), null);
  assert.equal(publicLink("https://link.district.in/x"), null);
  assert.equal(publicLink("external-listing"), null);
});

test("Google review links: Google Maps only", () => {
  for (const u of [
    "https://www.google.com/maps/place/X/@18.5,73.7,17z",
    "https://google.com/maps?cid=123",
    "https://maps.google.com/?cid=4392305395487991261",
    "https://maps.google.co.in/?cid=1",
    "https://maps.app.goo.gl/abc",
    "https://g.page/x/review",
    "https://goo.gl/maps/abc",
  ]) {
    assert.equal(googleMapsUrl(u), u, u);
  }
  for (const u of [
    "https://www.google.com/search?q=The+SSK+World+Club",
    "https://playo.co/venue/x",
    "https://www.google.com.evil.in/maps",
    "https://goo.gl/abc",
    "external-listing",
    null,
  ]) {
    assert.equal(googleMapsUrl(u), null, String(u));
  }
});

test("price notes: the app's name and grid out, a plain price statement kept", () => {
  assert.equal(cleanPriceNote("booking-app listing: '₹999 onwards' (slot length and unit not stated)"), "₹999 onwards (slot length and unit not stated)");
  assert.equal(cleanPriceNote("booking-app listing: Rs 600 onwards (slot length not stated)"), "Rs 600 onwards (slot length not stated)");
  assert.equal(cleanPriceNote("Playo: ₹1,200 per hour on weekends"), "₹1,200 per hour on weekends");
  assert.equal(
    cleanPriceNote(
      "booking-app live booking grid (hourly = 2×30-min slots where slot is 30 min): Thu 23 Oct: cheapest turf court 'Medium Turf 1' (Box Cricket) hourly morning ₹1200, afternoon ₹1200, evening ₹1400; other courts Box Cricket:Medium Turf 1 1200 | Sat 25 Oct: cheapest turf court 'Medium Turf 1' (Box Cricket) hourly morning ₹1400",
    ),
    null,
  );
  assert.equal(cleanPriceNote("Listed on Playo"), null);
  // Notes that name no app stay as written.
  assert.equal(cleanPriceNote("Rs 500 per hour (Day), Rs 600 (Night)"), "Rs 500 per hour (Day), Rs 600 (Night)");
});

test("price mentions: dropped when only the app's note is left, else cleaned, and the link only to a plain web page", () => {
  // 1,248 turfs on 26 Oct: source_url "external-listing" (a relative link to /turf/external-listing).
  assert.deepEqual(cleanPriceMention({ text: "booking-app listing: '₹999 onwards' (slot length and unit not stated)", source_url: "external-listing" }), {
    text: "₹999 onwards (slot length and unit not stated)",
    context: null,
    source: null,
    source_url: null,
  });
  assert.equal(cleanPriceMention({ text: "booking-app live booking grid: Thu 23 Oct: cheapest turf court 'Turf 1' hourly morning ₹800 | Sat", source_url: "external-listing" }), null);
  // A number stays; the note naming the app goes.
  assert.deepEqual(cleanPriceMention({ price_inr: 800, context: "Playo listing", source: "Playo", source_url: "https://playo.co/x" }), {
    price_inr: 800,
    text: null,
    context: null,
    source: null,
    source_url: null,
  });
  assert.deepEqual(cleanPriceMention({ text: "Rs 500 per hour (Day)", source: "club fee page", source_url: "https://www.niwec.org/sport-fees/", date: "2026-09-30" }), {
    text: "Rs 500 per hour (Day)",
    context: null,
    source: "club fee page",
    source_url: "https://www.niwec.org/sport-fees/",
    date: "2026-09-30",
  });
  assert.deepEqual(cleanPriceMention({ price_inr: 700, context: "a reviewer, Sep 2026" })?.context, "a reviewer, Sep 2026");
  assert.equal(cleanPriceMention(null), null);
  assert.equal(cleanPriceMentions(null), null);
  assert.deepEqual(cleanPriceMentions([{ text: "booking-app grid: | x" }, { price_inr: 600 }]), [{ price_inr: 600, text: null, context: null, source: null, source_url: null }]);
  // Nothing in what is kept names an app.
  const kept = cleanPriceMentions([
    { text: "booking-app listing: '₹999 onwards'", source: "booking-app", source_url: "external-listing" },
    { price_inr: 1200, context: "booking-app live grid", source_url: "https://hudle.in/x" },
  ]);
  assert.equal(mentionsBookingApp(JSON.stringify(kept)), false, JSON.stringify(kept));
});

test("price figures: the rupee amounts alone", () => {
  assert.deepEqual(priceFigures("₹999 onwards (slot length not stated)"), ["₹999"]);
  assert.deepEqual(priceFigures("Rs 500 per hour (Day), Rs 600 (Night), rs.1,200 weekends, ₹500 again"), ["₹500", "₹600", "₹1,200"]);
  assert.deepEqual(priceFigures("Call for rates"), []);
  assert.deepEqual(priceFigures(null), []);
});
