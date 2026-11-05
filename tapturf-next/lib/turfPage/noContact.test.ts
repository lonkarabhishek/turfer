import { test } from "node:test";
import assert from "node:assert/strict";
import type { Turf } from "../../types/turf";
import { bookingFeeLine, detailsLink, httpsLink, instagramLink, isNotTurfSite, membersNote, noContactLinks, reportedPricesNote, turfCheck, websiteLink } from "./noContact";
import { callNumber, contactFieldsOf, hasUsableContact, parseContactInfo, whatsAppNumber, type ContactFields } from "../utils/contact";
import { directionsUrl } from "../utils/maps";

// Made-up numbers only (98000 0000x, a 0253 200 0xxx landline).
const none: ContactFields = { owner_phone: null, contact_info: null, landline_phone: null, whatsapp_phone: null };
const c = (o: Partial<ContactFields>): ContactFields => ({ ...none, ...o });

test("contact rule: a call number is the first dialable one of owner_phone, contact_info.phone, landline_phone", () => {
  assert.equal(callNumber(none), null);
  assert.equal(callNumber(c({ owner_phone: "+91 98000 00001" })), "+91 98000 00001");
  // Junk in the first column does not hide a good one after it.
  assert.equal(callNumber(c({ owner_phone: "12345", contact_info: { phone: "98000 00002" } })), "98000 00002");
  assert.equal(callNumber(c({ landline_phone: "0253 200 0123" })), "0253 200 0123");
  // whatsapp_phone is never the call number.
  assert.equal(callNumber(c({ whatsapp_phone: "9800000003" })), null);
  for (const bad of ["12345", "+44 20 7946 0958", "1800 123 4567", "  ", "0000000000", "98000 0000"]) assert.equal(callNumber(c({ owner_phone: bad })), null, bad);
  for (const good of ["0091 98000 00004", "091 9800000005", "919800000006", "09800000007", "+91-98000-00008"]) assert.equal(callNumber(c({ owner_phone: good })), good, good);
});

test("contact rule: WhatsApp needs a mobile, whatsapp_phone first, never the landline column", () => {
  assert.equal(whatsAppNumber(c({ whatsapp_phone: "9800000003", owner_phone: "9800000001" })), "9800000003");
  assert.equal(whatsAppNumber(c({ owner_phone: "9800000001" })), "9800000001");
  assert.equal(whatsAppNumber(c({ owner_phone: "0253 200 0123" })), null);
  assert.equal(whatsAppNumber(c({ landline_phone: "9800000009" })), null);
  assert.equal(whatsAppNumber(c({ whatsapp_phone: "0253 200 0123" })), null);
});

test("contact rule: a page has a number when it shows Call or WhatsApp", () => {
  assert.equal(hasUsableContact(none), false);
  assert.equal(hasUsableContact(c({ owner_phone: "junk" })), false);
  assert.equal(hasUsableContact(c({ whatsapp_phone: "9800000003" })), true, "WhatsApp alone");
  assert.equal(hasUsableContact(c({ landline_phone: "0253 200 0123" })), true, "a landline alone");
  // A landline-shaped WhatsApp number is no channel at all: not a mobile, and not a call column.
  assert.equal(hasUsableContact(c({ whatsapp_phone: "0253 200 0123" })), false);
});

test("contact rule: contact_info as an object or as JSON text, as the page reads it", () => {
  assert.deepEqual(parseContactInfo({ phone: "9800000002" }), { phone: "9800000002" });
  assert.deepEqual(parseContactInfo('{"phone":"9800000002"}'), { phone: "9800000002" });
  assert.equal(parseContactInfo("not json"), null);
  assert.equal(parseContactInfo(""), null);
  assert.equal(parseContactInfo(null), null);
  assert.equal(hasUsableContact(contactFieldsOf({ contact_info: '{"phone":"9800000002"}' })), true);
  assert.equal(hasUsableContact(contactFieldsOf({ contact_info: { phone: 9800000002 } })), false, "a phone stored as a number is no string: the page shows none");
  assert.deepEqual(contactFieldsOf({ owner_phone: "", landline_phone: undefined }), none);
});

test("directions: the point when there is one, with the place id; else name and address", () => {
  const id = "ChIJ0000000000000000000000";
  assert.equal(
    directionsUrl({ lat: 20.0123, lng: 73.7901, name: "Kick Off Arena", address: "Plot 1, College Road", placeId: id }),
    `https://www.google.com/maps/dir/?api=1&destination=20.0123,73.7901&destination_place_id=${id}`,
  );
  assert.equal(directionsUrl({ lat: "18.52", lng: "73.85" }), "https://www.google.com/maps/dir/?api=1&destination=18.52,73.85");
  // 0,0 and out of range are no place: name and address instead.
  assert.equal(
    directionsUrl({ lat: 0, lng: 0, name: "Kings Turf & Box", address: "College Road, Nashik" }),
    "https://www.google.com/maps/dir/?api=1&destination=Kings%20Turf%20%26%20Box%2C%20College%20Road%2C%20Nashik",
  );
  assert.equal(directionsUrl({ lat: 200, lng: 73, address: "Baner" }), "https://www.google.com/maps/dir/?api=1&destination=Baner");
  assert.equal(directionsUrl({ lat: null, lng: 73, name: "  ", address: "Baner", placeId: id }), `https://www.google.com/maps/dir/?api=1&destination=Baner&destination_place_id=${id}`);
  // A place id that isn't one is left out, never pasted into the link.
  for (const bad of ["", "short", "ChIJ0000 0000000000000000", "ChIJ&x=1000000000000000000", `${"a".repeat(301)}`]) {
    assert.equal(directionsUrl({ lat: 20, lng: 73, placeId: bad }), "https://www.google.com/maps/dir/?api=1&destination=20,73", bad);
  }
  assert.equal(directionsUrl({}), null);
  assert.equal(directionsUrl({ name: " ", address: null, placeId: id }), null, "a place id alone has no destination");
});

test("https links: absolute https to a named host, no booking app, as the parser writes it", () => {
  assert.equal(httpsLink("https://kickoffarena.in"), "https://kickoffarena.in/");
  assert.equal(httpsLink(" https://Kickoffarena.IN/about "), "https://kickoffarena.in/about");
  assert.equal(httpsLink("https://xn--80ak6aa92e.xn--p1ai/"), "https://xn--80ak6aa92e.xn--p1ai/");
  for (const bad of [
    "http://kickoffarena.in",
    "kickoffarena.in",
    "//kickoffarena.in",
    "javascript:alert(1)",
    "https://",
    "https://localhost/",
    "https://192.168.1.10/",
    "https://user:pass@kickoffarena.in/",
    "https://kickoff arena.in/",
    "https://playo.co/venue/x",
    "https://www.playspots.in/x",
    "external-listing",
    `https://a.in/${"x".repeat(2000)}`,
    null,
    42,
  ]) {
    assert.equal(httpsLink(bad), null, String(bad));
  }
});

test("website and Instagram: Instagram only on instagram.com to a profile; the website never Instagram", () => {
  assert.equal(instagramLink("https://www.instagram.com/kickoffarena/"), "https://www.instagram.com/kickoffarena/");
  assert.equal(instagramLink("https://instagram.com/kickoffarena?igsh=x"), "https://instagram.com/kickoffarena?igsh=x");
  assert.equal(instagramLink("https://www.instagram.com/"), null, "the front page is no profile");
  assert.equal(instagramLink("http://instagram.com/kickoffarena"), null);
  assert.equal(instagramLink("https://instagram.com.evil.in/kickoffarena"), null);
  assert.equal(instagramLink("https://kickoffarena.in"), null);
  assert.equal(websiteLink("https://kickoffarena.in"), "https://kickoffarena.in/");
  assert.equal(websiteLink("https://www.instagram.com/kickoffarena/"), null);
  assert.equal(websiteLink("http://kickoffarena.in"), null);
});

test("Instagram: a profile only, not a post, reel, explore or stories page", () => {
  assert.equal(instagramLink("https://www.instagram.com/kick_off.arena/"), "https://www.instagram.com/kick_off.arena/");
  assert.equal(instagramLink("https://m.instagram.com/kickoffarena"), "https://m.instagram.com/kickoffarena");
  for (const bad of [
    "https://www.instagram.com/p/abc123/",
    "https://www.instagram.com/reel/abc/",
    "https://www.instagram.com/reels/abc/",
    "https://www.instagram.com/tv/abc/",
    "https://www.instagram.com/explore/tags/turf/",
    "https://www.instagram.com/stories/kickoffarena/123/",
    "https://www.instagram.com/share/abc",
    "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com/direct/inbox/",
    "https://www.instagram.com/kick-off-arena/", // no user name has a hyphen
    `https://www.instagram.com/${"a".repeat(31)}/`,
    "https://l.instagram.com/?u=https%3A%2F%2Fwa.me%2F919800000009",
  ]) {
    assert.equal(instagramLink(bad), null, bad);
  }
});

test("website: no chat, redirect, shortener or map link; nothing but an https link at all", () => {
  // Made-up numbers only. Each of these opens a chat to a number, hides where it goes, or is the map.
  for (const bad of [
    "https://wa.me/919800000009",
    "https://api.whatsapp.com/send?phone=919800000009",
    "https://chat.whatsapp.com/AbCdEf",
    "https://call.whatsapp.com/voice/AbCdEf",
    "https://whatsapp.com/channel/x",
    "https://www.whatsapp.com/",
    "https://wa.link/abc123",
    "https://l.instagram.com/?u=https%3A%2F%2Fkickoffarena.in",
    "https://l.facebook.com/l.php?u=https%3A%2F%2Fkickoffarena.in",
    "https://bit.ly/3abcdef",
    "https://rb.gy/abc",
    "https://abr.ge/abc",
    "https://tinyurl.com/abc",
    "https://maps.app.goo.gl/abc",
    "https://z34v4.app.goo.gl/abc",
    "https://www.google.com/maps/place/Kick+Off+Arena",
    "https://maps.google.co.in/?q=20,73",
    "https://g.page/kickoffarena",
    // Not https links at all.
    "data:text/html,<a>x</a>",
    "tel:+919800000009",
    "mailto:a@b.com",
    "+91 98000 00009",
    "9800000009",
    "a@b.com",
    "javascript:alert(1)",
  ]) {
    assert.equal(websiteLink(bad), null, bad);
  }
  // A venue's own site, a Google Sites page, a Linktree and a Facebook page stay.
  for (const good of ["https://kickoffarena.in/", "https://sites.google.com/view/kickoffarena", "https://linktr.ee/kickoffarena", "https://www.facebook.com/kickoffarena"]) {
    assert.equal(websiteLink(good), good, good);
  }
  // Look-alike hosts are other sites.
  assert.equal(websiteLink("https://notwa.me/"), "https://notwa.me/");
  assert.equal(websiteLink("https://whatsappturf.in/"), "https://whatsappturf.in/");
  assert.equal(isNotTurfSite("https://wa.me.example.in/"), false);
  assert.equal(isNotTurfSite("http://wa.link/abc"), true, "http too, for Turf details");
  assert.equal(isNotTurfSite("not a link"), false);
  assert.equal(isNotTurfSite(null), false);
});

test("Turf details' links: as before with a number; without one, no chat, redirect or map link", () => {
  for (const hasContact of [true, false]) {
    assert.equal(detailsLink("https://kickoffarena.in/", hasContact), "https://kickoffarena.in/");
    assert.equal(detailsLink("http://kickoffarena.in", hasContact), "http://kickoffarena.in", "http stays, as publicLink keeps it");
    assert.equal(detailsLink("https://playo.co/venue/x", hasContact), null);
    assert.equal(detailsLink("external-listing", hasContact), null);
  }
  // A page with a number: exactly what it showed before (publicLink).
  assert.equal(detailsLink("https://api.whatsapp.com/send?phone=919800000009", true), "https://api.whatsapp.com/send?phone=919800000009");
  // A page with none opens no chat to a number nobody checked.
  for (const bad of ["https://api.whatsapp.com/send?phone=919800000009", "http://wa.link/abc", "https://wa.me/919800000009", "https://g.page/x", "https://bit.ly/x"]) {
    assert.equal(detailsLink(bad, false), null, bad);
  }
});

test("confirm lines: with the turf where there is a number, at the turf where there is none", () => {
  assert.equal(turfCheck(true), "confirm with the turf");
  assert.equal(turfCheck(true, "the rate"), "confirm the rate with the turf");
  assert.equal(turfCheck(false), "check at the turf");
  assert.equal(turfCheck(false, "the rate"), "check the rate at the turf");
  // The lines as the page writes them, word for word as before with a number.
  assert.equal(`See Pricing below. Unverified, ${turfCheck(true)}.`, "See Pricing below. Unverified, confirm with the turf.");
  assert.equal(`A guide from the sizes; ${turfCheck(true)}.`, "A guide from the sizes; confirm with the turf.");
  for (const line of [turfCheck(false), turfCheck(false, "the rate")]) assert.doesNotMatch(line, /\b(call|book|booking|reserve|with the turf)\b/i);
});

const turf = (o: Partial<Turf> = {}) =>
  ({
    id: "11111111-2222-4333-8444-555555555555",
    name: "Kick Off Arena 7",
    address: "Plot 7, Made-up Road, Nashik",
    lat: 20.01,
    lng: 73.79,
    google_place_id: null,
    website_url: null,
    instagram_url: null,
    ...o,
  }) as Turf;

test("no-number links: directions and the turf's own links, never a claim link", () => {
  assert.deepEqual(noContactLinks(turf()), {
    directions: "https://www.google.com/maps/dir/?api=1&destination=20.01,73.79",
    website: null,
    instagram: null,
  });
  const both = noContactLinks(turf({ website_url: "https://kickoffarena.in", instagram_url: "https://www.instagram.com/kickoffarena/" }));
  assert.equal(both.website, "https://kickoffarena.in/");
  assert.equal(both.instagram, "https://www.instagram.com/kickoffarena/");
  // An Instagram profile stored as the website is the Instagram button, once.
  const instaAsSite = noContactLinks(turf({ website_url: "https://www.instagram.com/kickoffarena/" }));
  assert.equal(instaAsSite.website, null);
  assert.equal(instaAsSite.instagram, "https://www.instagram.com/kickoffarena/");
  // http, a booking app and junk give no button.
  const none_ = noContactLinks(turf({ website_url: "http://kickoffarena.in", instagram_url: "external-listing" }));
  assert.equal(none_.website, null);
  assert.equal(none_.instagram, null);
  assert.equal(noContactLinks(turf({ website_url: "https://playo.co/venues/x" })).website, null);
  // A WhatsApp chat or a map stored as the website, a post as the Instagram: no button.
  const chat = noContactLinks(turf({ website_url: "https://api.whatsapp.com/send?phone=919800000009", instagram_url: "https://www.instagram.com/p/abc123/" }));
  assert.equal(chat.website, null);
  assert.equal(chat.instagram, null);
  assert.equal(noContactLinks(turf({ website_url: "https://g.page/kickoffarena" })).website, null);
  assert.equal(noContactLinks(turf({ lat: null, lng: null, google_place_id: "ChIJ0000000000000000000000" })).directions,
    "https://www.google.com/maps/dir/?api=1&destination=Kick%20Off%20Arena%207%2C%20Plot%207%2C%20Made-up%20Road%2C%20Nashik&destination_place_id=ChIJ0000000000000000000000");
});

test("sidebar lines: with a number, word for word as before; without one, no call, book or reserve", () => {
  assert.equal(membersNote(null, true), "Booking is for members. Call to ask about guest access.");
  assert.equal(bookingFeeLine(false, true), "No booking fee. Contact turf directly to reserve your slot.");
  assert.equal(bookingFeeLine(true, true), null, "a members' club never had it");
  assert.equal(bookingFeeLine(false, false), null);
  assert.equal(bookingFeeLine(true, false), null);
  const noNumber = membersNote(null, false);
  assert.equal(noNumber, "For members only. We don't have a number for it yet.");
  assert.doesNotMatch(noNumber, /\b(call|book|booking|reserve)\b/i);
  assert.equal(reportedPricesNote(true), "Reported prices, not confirmed by the turf. Check the rate with the turf before you book.");
  assert.doesNotMatch(reportedPricesNote(false), /\b(call|book|booking|reserve)\b/i);
  // The turf's own access notes stay as written, either way.
  assert.equal(membersNote("Members and their guests only.", false), "Members and their guests only.");
  assert.equal(membersNote("Members and their guests only.", true), "Members and their guests only.");
});
