import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, duration, istDateTime, joinedBetween, matches, sourceOf, toPeople, whatsappLink, type DetailsRow } from "./people";

const row = (o: Partial<DetailsRow>): DetailsRow => ({
  id: "u1",
  name: "Asha",
  email: null,
  phone: null,
  profile_image_url: null,
  role: "user",
  is_verified: false,
  created_at: "2026-10-22T05:00:00+00:00",
  updated_at: null,
  method: "phone",
  username: null,
  taggable: null,
  logins: 0,
  last_login: null,
  login_methods: [],
  games_hosted: 0,
  requests: 0,
  requests_accepted: 0,
  games_joined: 0,
  reviews: 0,
  contact_taps: 0,
  contacted: [],
  asks: 0,
  recent_asks: [],
  suggestions: 0,
  turfs: [],
  last_active: null,
  signup: null,
  ...o,
});

test("rows become people, newest first, with a shared joined time marked as an import", () => {
  const people = toPeople([
    row({ id: "a", created_at: "2026-01-01T00:00:00+00:00" }),
    row({ id: "c", created_at: "2026-10-22T05:00:00+00:00" }),
    row({ id: "b", created_at: "2026-01-01T00:00:00+00:00" }),
    row({ id: "bad", created_at: null }),
  ]);
  assert.deepEqual(people.map((p) => [p.id, p.imported]), [["c", false], ["a", true], ["b", true]]);
});

test("missing or odd fields never break a person", () => {
  const [p] = toPeople([row({ name: "  ", method: "carrier pigeon", logins: null, login_methods: null, contacted: "nope", turfs: [{ turf: "T", status: "approved" }, 7], signup: [] })]);
  assert.equal(p.name, null);
  assert.equal(p.method, "unknown");
  assert.equal(p.logins, 0);
  assert.deepEqual(p.loginMethods, []);
  assert.deepEqual(p.contacted, []);
  assert.deepEqual(p.claims, [{ turf: "T", slug: null, status: "approved", role: null }]);
  assert.equal(p.before, null);
});

test("the sign-up context is summed up", () => {
  const [p] = toPeople([
    row({
      signup: {
        v: 1,
        first: { at: "2026-10-22T09:47:50.954Z", ref: "www.google.com/", landing: "/amravati", utm: {}, ad_click: false },
        visits: { sessions: 2, days: 1, first_at: "2026-10-22T09:47:50.954Z" },
        interest: { cities: ["amravati", "pune"], sports: ["box cricket"], turfs_opened: 1 },
        funnel: { first_visit: "2026-10-22T09:47:50.957Z", turf_open: "2026-10-22T10:20:03.872Z", signup: "2026-10-22T10:21:03.426Z" },
        device: { os: "Android", type: "mobile", browser: "Chrome", standalone: false },
        at: { lang: "en-IN" },
      },
    }),
  ]);
  assert.deepEqual(p.before, {
    source: "Google",
    landing: "/amravati",
    firstVisit: Date.parse("2026-10-22T09:47:50.957Z"),
    sessions: 2,
    days: 1,
    cities: ["amravati", "pune"],
    sports: ["box cricket"],
    turfsOpened: 1,
    turfOpen: Date.parse("2026-10-22T10:20:03.872Z"),
    contactClick: null,
    signup: Date.parse("2026-10-22T10:21:03.426Z"),
    device: "Android phone, Chrome",
    installed: false,
    lang: "en-IN",
  });
});

test("where they came from", () => {
  assert.equal(sourceOf(null), "Not recorded");
  assert.equal(sourceOf({ ref: null, utm: {} }), "Typed the address, or an app");
  assert.equal(sourceOf({ ref: "l.instagram.com/", utm: {} }), "Instagram");
  assert.equal(sourceOf({ ref: "m.facebook.com/", utm: {}, ad_click: true }), "Facebook, from an ad");
  assert.equal(sourceOf({ ref: "www.google.co.in/", utm: {} }), "Google");
  assert.equal(sourceOf({ ref: "blog.example.org/x", utm: {} }), "blog.example.org");
  assert.equal(sourceOf({ ref: "www.google.com/", utm: { source: "insta", medium: "story", campaign: "diwali" } }), "insta / story (diwali)");
});

test("the list follows the chart's window", () => {
  const people = toPeople([row({ id: "a", created_at: "2026-10-01T00:00:00Z" }), row({ id: "b", created_at: "2026-10-15T00:00:00Z" }), row({ id: "c", created_at: "2026-10-22T00:00:00Z" })]);
  assert.deepEqual(joinedBetween(people, Date.parse("2026-10-01T00:00:00Z"), Date.parse("2026-10-22T00:00:00Z")).map((p) => p.id), ["b", "a"], "start included, end left out");
});

test("search by name, email, username or phone digits", () => {
  const [p] = toPeople([row({ name: "Asha Rao", email: "asha@x.in", phone: "+919876543210", username: "asha_r" })]);
  for (const q of ["asha", "RAO", "@asha_r", "x.in", "98765", "+91 98765", "3210", "  "]) assert.ok(matches(p, q), q);
  for (const q of ["ravi", "12345", "@ravi"]) assert.ok(!matches(p, q), q);
});

test("India time and durations, without Intl", () => {
  assert.equal(istDateTime(Date.parse("2026-10-22T11:20:00Z")), "22 Oct 2026, 16:50");
  assert.equal(istDateTime(Date.parse("2026-12-31T18:30:00Z")), "1 Jan 2027, 00:00");
  assert.equal(duration(40_000), "40 sec");
  assert.equal(duration(90 * 60_000), "2 h");
  assert.equal(duration(3 * 86_400_000), "3 days");
  assert.equal(duration(20 * 86_400_000), "3 weeks");
  assert.equal(duration(100 * 86_400_000), "3 months");
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(ago(now - 30_000, now), "just now");
  assert.equal(ago(now + 5_000, now), "just now");
  assert.equal(ago(now - 12 * 60_000, now), "12 min ago");
});

test("WhatsApp links", () => {
  assert.equal(whatsappLink("+91 98765 43210"), "https://wa.me/919876543210");
  assert.equal(whatsappLink("9876543210"), "https://wa.me/919876543210");
  assert.equal(whatsappLink("123"), null);
});
