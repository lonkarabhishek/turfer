import { test } from "node:test";
import assert from "node:assert/strict";
import { googleOnlyPeople, linksById, refusalText, refusalsOf, unfinishedList, UNFINISHED_LABEL, type UnfinishedRow } from "./links";
import { istDateTime, matches, toPeople, type DetailsRow } from "./people";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const G = "33333333-3333-4333-8333-333333333333";

const row = (o: Partial<DetailsRow>): DetailsRow => ({
  id: A,
  name: "Asha",
  email: null,
  phone: "+919000000001",
  profile_image_url: null,
  role: "user",
  is_verified: false,
  created_at: "2026-10-22T05:00:00+00:00",
  updated_at: null,
  method: "phone",
  username: null,
  taggable: null,
  logins: 1,
  last_login: "2026-10-22T05:00:00+00:00",
  login_methods: ["phone"],
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

test("the ways in added from the profile land on the person, and the added address is searchable", () => {
  const [p, q] = toPeople(
    [row({}), row({ id: B, name: "Shaik", method: "google", email: "shaik@example.com", created_at: "2026-10-01T00:00:00Z" })],
    [],
    null,
    [
      { user_id: A, google_email: "asha.p@example.com", google_linked_at: "2026-10-26T06:00:00Z", google_links: 2, google_removed_at: "2026-10-25T06:00:00Z", phone_added_at: null, phone_opens: true },
      { user_id: B.toUpperCase(), google_email: null, google_linked_at: null, google_links: 0, google_removed_at: null, phone_added_at: "2026-10-26T07:00:00Z", phone_opens: true },
    ],
  );
  assert.equal(p.id, A);
  assert.equal(p.links?.googleEmail, "asha.p@example.com");
  assert.equal(p.links?.googleLinks, 2);
  assert.equal(p.links?.googleRemovedAt, Date.parse("2026-10-25T06:00:00Z"));
  assert.equal(p.noAccount, false);
  assert.equal(matches(p, "asha.p@"), true);
  assert.equal(q.links?.phoneAddedAt, Date.parse("2026-10-26T07:00:00Z"), "ids match whatever their case");
  const [none] = toPeople([row({})]);
  assert.equal(none.links, null);
  assert.equal(linksById([{ user_id: "nope" } as never]).size, 0);
});

const unfinished = (o: Partial<UnfinishedRow>): UnfinishedRow => ({
  auth_uid: G,
  email: "ravi@example.com",
  name: "Ravi",
  created_at: "2026-10-26T04:00:00Z",
  last_sign_in_at: null,
  state: "not_finished",
  ...o,
});

test("Google sign-ins that never came back count as sign-ups, with no account", () => {
  const people = googleOnlyPeople([
    unfinished({}),
    unfinished({ auth_uid: B, state: "linking" }),
    unfinished({ auth_uid: "x", state: "not_finished" }),
    unfinished({ auth_uid: A, state: "weird" }),
  ]);
  assert.equal(people.length, 1, "only not_finished, with a real id and state");
  const [p] = people;
  assert.equal(p.id, G);
  assert.equal(p.method, "google");
  assert.equal(p.signInUnfinished, true);
  assert.equal(p.noAccount, true);
  assert.equal(p.joinedAt, Date.parse("2026-10-26T04:00:00Z"));
  assert.deepEqual(p.confirmed, { email: null, phone: false });
});

test("one unfinished list: trigger-made rows and the Google sign-ins with no account, newest first, once each", () => {
  const trigger = toPeople([row({ id: B, method: "google", email: "old@example.com", logins: 0, last_login: null, created_at: "2026-10-20T00:00:00Z" })]);
  const rows = [
    unfinished({}),
    unfinished({ auth_uid: A, state: "replaced", created_at: "2026-10-25T00:00:00Z", name: null }),
    unfinished({ auth_uid: "44444444-4444-4444-8444-444444444444", state: "link_failed", created_at: "2026-10-26T05:00:00Z" }),
  ];
  const counted = [...trigger, ...googleOnlyPeople(rows)];
  const list = unfinishedList(counted, rows);
  assert.deepEqual(
    list.map((u) => [u.id.slice(0, 4), u.state, u.inPeople]),
    [
      ["4444", "link_failed", false],
      ["3333", "not_finished", true],
      ["1111", "replaced", false],
      ["2222", "not_finished", true],
    ],
  );
  assert.equal(UNFINISHED_LABEL.link_failed, "Tried to add it to a phone account");
  assert.equal(UNFINISHED_LABEL.replaced, "Taken off a phone account");
});

test("refusals: the kinds the owner follows up, with the empty flag and the day it was made", () => {
  const list = refusalsOf([
    { at: "2026-10-26T05:00:00Z", kind: "link_has_account", user_id: A, other_user_id: B, other_empty: true, other_made_at: "2026-10-21T10:00:00Z" },
    { at: "2026-10-26T06:00:00Z", kind: "link_over_empty", user_id: A, other_user_id: G, other_empty: true, other_made_at: "2026-10-20T10:00:00Z" },
    { at: "2026-10-26T04:00:00Z", kind: "phone_held", user_id: B, other_user_id: A, other_empty: false, other_made_at: "2026-10-01T10:00:00Z" },
    { at: "2026-10-26T03:00:00Z", kind: "link_other_account", user_id: B, other_user_id: null, other_empty: null, other_made_at: null },
    { at: "2026-10-26T03:00:00Z", kind: "link_bad", user_id: B, other_user_id: null, other_empty: null, other_made_at: null },
    { at: null, kind: "phone_held", user_id: B, other_user_id: null, other_empty: null, other_made_at: null },
  ]);
  assert.deepEqual(
    list.map((r) => r.kind),
    ["over_empty", "has_account", "phone_held", "other_account"],
  );
  const day = (t: number) => istDateTime(t).split(",")[0];
  assert.equal(refusalText(list[1], day), "tried to add a Google account that has its own TapTurf account (empty, made 21 Oct 2026)");
  assert.equal(refusalText(list[2], day), "tried to add a number that's on another account");
  assert.equal(refusalText(list[3], day), "tried to add a Google account already on another account");
  assert.match(refusalText(list[0], day), /^added a Google account that had its own empty TapTurf account \(made 20 Oct 2026\)\. That one stays as it is/);
});
