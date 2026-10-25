import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_CITY, ago, byCity, cityOf, confirmedById, duration, inCity, initial, isVerified, istDateTime, joinedBetween, matches, personId, sitePath, sourceOf, toPeople, whatsappLink, type DetailsRow } from "./people";

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

test("search by name, email, username, city or phone digits", () => {
  const [p] = toPeople([row({ name: "Asha Rao", email: "asha@x.in", phone: "+919876543210", username: "asha_r", city: "pune", city_source: "picked" })]);
  for (const q of ["asha", "RAO", "@asha_r", "x.in", "98765", "+91 98765", "3210", "  ", "098765 43210", "+91 98765 43210", "0091 9876543210", "9876543210", "pune"]) assert.ok(matches(p, q), q);
  for (const q of ["ravi", "12345", "@ravi", "mumbai"]) assert.ok(!matches(p, q), q);
  // A 10-digit stored number found by its +91 or 0 forms.
  const [bare] = toPeople([row({ phone: "9876543210" })]);
  for (const q of ["+91 98765 43210", "09876543210"]) assert.ok(matches(bare, q), q);
  // Digits also find names and emails.
  const [mail] = toPeople([row({ name: "Team 2024", email: "rahul1995@gmail.com", phone: null })]);
  for (const q of ["1995", "2024"]) assert.ok(matches(mail, q), q);
});

test("an account id finds that person only (admin's Open in people list)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const [p, q] = toPeople([row({ id: A, name: "Asha" }), row({ id: "22222222-2222-4222-8222-222222222222", name: A })]);
  assert.ok(matches(p, A));
  assert.ok(matches(p, A.toUpperCase()), "any case");
  assert.ok(!matches(q, A), "never by a name that happens to look like one");
  assert.equal(personId(A.toUpperCase()), A);
  for (const x of [undefined, "", "abc", ["x"], `${A}x`]) assert.equal(personId(x), null, String(x));
});

test("a Google sign-up that never finished, and Google-confirmed emails", () => {
  const [u] = toPeople([row({ method: "google", email: "s@gmail.com", logins: 0, last_login: null })]);
  assert.equal(u.signInUnfinished, true);
  assert.equal(u.emailFromGoogle, true);
  const [g] = toPeople([row({ method: "google", email: "s@gmail.com", logins: 2, last_login: "2026-10-24T10:00:00Z" })]);
  assert.equal(g.signInUnfinished, false);
  const [ph] = toPeople([row({ method: "phone", email: null, logins: 0, last_login: null })]);
  assert.equal(ph.signInUnfinished, false, "only Google");
  assert.equal(ph.emailFromGoogle, false);
});

test("a phone account's typed email and answers", () => {
  const people = toPeople(
    [row({ id: "a", method: "phone", email: null, name: "Asha" }), row({ id: "b", method: "phone", email: null }), row({ id: "c", method: "phone", email: null })],
    [
      { user_id: "a", email: "asha@gmail.com", answer: "saved", source: "prompt", answered_at: "2026-10-25T05:00:00Z", same_as_other_account: true },
      { user_id: "b", email: null, answer: "skipped", source: "prompt", answered_at: null, same_as_other_account: false },
      { user_id: "x", email: "z@x.in", answer: "bogus", source: "prompt", answered_at: null, same_as_other_account: false },
    ],
  );
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  assert.deepEqual(by.a.contact, { email: "asha@gmail.com", answer: "saved", source: "prompt", shared: true, at: Date.parse("2026-10-25T05:00:00Z") });
  assert.equal(by.a.email, null, "never shown as their account email");
  assert.equal(by.b.contact?.answer, "skipped");
  assert.equal(by.c.contact, null, "not asked yet");
  assert.ok(matches(by.a, "asha@gmail"), "searchable");
});

test("the sign-up time is the first sign-in, and a late row is noted", () => {
  const [p] = toPeople([row({ created_at: "2025-10-30T12:51:56Z", signed_up_at: "2025-09-01T10:00:00Z" })]);
  assert.equal(p.joinedAt, Date.parse("2025-09-01T10:00:00Z"));
  assert.equal(p.rowAddedAt, Date.parse("2025-10-30T12:51:56Z"));
  const [same] = toPeople([row({ created_at: "2026-10-22T05:00:30Z", signed_up_at: "2026-10-22T05:00:00Z" })]);
  assert.equal(same.rowAddedAt, null, "within a minute is the same moment");
});

test("cities: recorded first, then the best guess, else none", () => {
  const people = toPeople([
    row({ id: "a", city: "pune", city_source: "picked", likely_city: "nashik", likely_share: 0.9 }),
    row({ id: "b", city: null, city_source: "unknown", likely_city: "pune", likely_share: 0.6 }),
    row({ id: "c", likely_city: "nashik", likely_share: 1 }),
    row({ id: "d" }),
    row({ id: "e", city: "Pune!", city_source: "picked" }),
    row({ id: "f", city: "thiruvananthapuram", city_source: "ip", city_ip: "Kazhakkoottam" }),
  ]);
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  assert.deepEqual(cityOf(by.a), { id: "pune", guessed: false });
  assert.deepEqual(cityOf(by.b), { id: "pune", guessed: true });
  assert.equal(cityOf(by.d), null);
  assert.deepEqual(by.e.city?.source, "unknown", "a bad id reads as unknown");
  assert.equal(by.f.city?.ipCity, "Kazhakkoottam");
  const { cities, unknown } = byCity(people);
  assert.deepEqual(cities.map((c) => [c.label, c.recorded, c.guessed, c.total]), [["Pune", 1, 1, 2], ["Nashik", 0, 1, 1], ["Thiruvananthapuram", 1, 0, 1]]);
  assert.equal(unknown, 2);
  assert.deepEqual(people.filter((p) => inCity(p, "pune")).map((p) => p.id).sort(), ["a", "b"]);
  assert.deepEqual(people.filter((p) => inCity(p, NO_CITY)).map((p) => p.id).sort(), ["d", "e"]);
  assert.equal(people.filter((p) => inCity(p, null)).length, people.length);
});

test("only same-site paths become links", () => {
  for (const ok of ["/", "/turfs/pune?x=1", "/turf/the-w-turf-zone"]) assert.equal(sitePath(ok), ok, ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", " /x", null]) assert.equal(sitePath(bad), null, String(bad));
});

test("avatar initials keep whole characters", () => {
  assert.equal(initial({ name: "🏏 Rahul", username: null, email: null }), "🏏");
  assert.equal(initial({ name: "𝐑𝐚𝐡𝐮𝐥", username: null, email: null }), "𝐑");
  assert.equal(initial({ name: null, username: "asha_r", email: null }), "A");
  assert.equal(initial({ name: "  ", username: null, email: null }), "?");
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

test("verified is what sign-ins confirmed, not the old app's flag", () => {
  const rows = [
    row({ id: "g", method: "google", email: "gita@gmail.com", is_verified: false }),
    row({ id: "p", method: "phone", phone: "+919876543210", is_verified: false }),
    row({ id: "o", method: "phone", phone: "+919876543211", is_verified: true }),
    row({ id: "n", method: "phone", phone: "+919876543212" }),
  ];
  const verified = [
    { user_id: "g", email_by_google: true, email_confirmed: true, phone_by_code: false },
    { user_id: "p", email_by_google: false, email_confirmed: false, phone_by_code: true },
    { user_id: "o", email_by_google: false, email_confirmed: false, phone_by_code: false },
  ];
  const by = Object.fromEntries(toPeople(rows, [], verified).map((x) => [x.id, x]));
  assert.deepEqual(by.g.confirmed, { email: "google", phone: false });
  assert.equal(by.g.verified, true, "a Google sign-in's email is verified, whatever the old flag says");
  assert.deepEqual(by.p.confirmed, { email: null, phone: true });
  assert.equal(by.p.verified, true);
  assert.equal(by.o.verified, false, "the old flag alone doesn't count once the facts are read");
  assert.deepEqual(by.n.confirmed, { email: null, phone: false }, "missing from a read that worked: nothing confirmed");
  // The read failed: the old flag, and nothing claimed as confirmed.
  const old = Object.fromEntries(toPeople(rows).map((x) => [x.id, x]));
  assert.equal(old.g.confirmed, null);
  assert.equal(old.g.verified, false);
  assert.equal(old.o.verified, true);
  // An email confirmed by the old app's link, not by Google.
  assert.deepEqual(confirmedById([{ user_id: "e", email_by_google: false, email_confirmed: true, phone_by_code: null }])?.get("e"), { email: "link", phone: false });
  assert.equal(confirmedById(null), null);
  assert.equal(isVerified({ email: null, phone: false }, true), false);
  assert.equal(isVerified(null, null), false);
});
