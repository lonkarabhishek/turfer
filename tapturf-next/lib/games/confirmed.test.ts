import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIRMED_COPY,
  CONFIRMED_KEYS,
  EXTRA_MAX,
  NAMES_MAX,
  TAGS_MAX,
  TAG_COPY,
  confirmedFieldOk,
  confirmedIn,
  confirmedLimits,
  confirmedLine,
  confirmedName,
  confirmedOf,
  confirmedReady,
  guestCount,
  hasConfirmedKeys,
  missingConfirmedColumn,
  moreChip,
  nameProblem,
  nameProblemText,
  namedTags,
  shownTagViews,
  tagButtons,
  totalIn,
  type ConfirmedKey,
  type ShownTag,
} from "./confirmed";
import { parseChanges, parseCreate, parseSeries } from "./payload";
import { gameProblem } from "./client";

// The same cases scripts/sql-tests/game_confirmed.check.mjs runs through the database.
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/games/confirmed.cases.json"), "utf8")) as {
  names: { what: string; value: unknown; ok: boolean; problem?: string }[];
  fields: { what: string; key: ConfirmedKey; value: unknown; ok: boolean }[];
};

test("a confirmed friend's name: every shared case, as the database takes it", () => {
  assert.ok(CASES.names.length >= 45);
  for (const c of CASES.names) {
    assert.equal(nameProblem(c.value) === null, c.ok, c.what);
    if (c.problem) assert.equal(nameProblem(c.value), c.problem, `${c.what}: why`);
  }
  assert.ok(CASES.names.some((c) => c.ok) && CASES.names.some((c) => !c.ok));
});

test("a name: stored with spaces collapsed; no digit of any script, so no phone number reaches a public page", () => {
  assert.equal(confirmedName("  Rahul    Dravid "), "Rahul Dravid");
  assert.equal(confirmedName("Rahul  K"), "Rahul K");
  assert.equal(confirmedName("राहुल"), "राहुल");
  for (const bad of ["9822012345", "Rahul 9", "राहुल ९", "Ravi ௯", "call 98 22", "R4hul", "", "   ", null, undefined, 5, ["Rahul"]]) {
    assert.equal(confirmedName(bad), null, String(bad));
  }
  for (const bad of ["rahul.com", "www.rahul", "amit.in", "http://x", "rahul@okaxis", "t.me/rahul", "Rahul/Amit", "Rahul, Amit"]) {
    assert.equal(confirmedName(bad), null, bad);
  }
  // 20 characters as the database counts them (code points), not UTF-16 units.
  assert.equal(confirmedName("क".repeat(20)), "क".repeat(20));
  assert.equal(nameProblem("क".repeat(21)), "long");
});

test("a name's problem is said plainly, and never asks for more than a first name", () => {
  for (const p of ["missing", "long", "digits", "link", "chars"] as const) {
    const t = nameProblemText(p);
    assert.ok(t.length > 10 && !/book/i.test(t) && !/[—–]/.test(t), t);
  }
  assert.match(nameProblemText("digits"), /No numbers here: the game page is public/);
});

test("the four keys: every shared case, as the database takes it", () => {
  assert.ok(CASES.fields.length >= 25);
  for (const c of CASES.fields) assert.equal(confirmedFieldOk(c.key, c.value), c.ok, `${c.key}: ${c.what}`);
  for (const k of CONFIRMED_KEYS) {
    assert.ok(CASES.fields.some((c) => c.key === k && c.ok), `${k} passes somewhere`);
    assert.ok(CASES.fields.some((c) => c.key === k && !c.ok), `${k} fails somewhere`);
  }
  assert.deepEqual([NAMES_MAX, EXTRA_MAX, TAGS_MAX], [20, 30, 20]);
});

test("the keys as stored: names collapsed in the host's order, usernames and ids once each", () => {
  assert.deepEqual(confirmedOf({ confirmed_names: [" Rahul ", "Amit   Bhai"], confirmed_extra: 2, confirmed_tags: ["ravi_k", "ravi_k", "priya23"], confirmed_untag: ["CCCCCCCC-CCCC-4CCC-8CCC-000000000001"] }), {
    confirmed_names: ["Rahul", "Amit Bhai"],
    confirmed_extra: 2,
    confirmed_tags: ["ravi_k", "priya23"],
    confirmed_untag: ["cccccccc-cccc-4ccc-8ccc-000000000001"],
  });
  assert.deepEqual(confirmedOf({ sport: "Football" }), {});
  assert.equal(hasConfirmedKeys({ sport: "Football" }), false);
  assert.equal(hasConfirmedKeys({ confirmed_extra: 0 }), true);
});

test("a game row's confirmed people: none before the columns exist, and never more than the limits", () => {
  const none = { names: [], extra: 0, tagged: 0 };
  assert.deepEqual(confirmedIn(null), none);
  assert.deepEqual(confirmedIn({}), none);
  assert.deepEqual(confirmedIn({ confirmed_names: null, confirmed_extra: null, confirmed_tagged: undefined }), none);
  assert.deepEqual(confirmedIn({ confirmed_names: ["Rahul", "", 4, "Amit"], confirmed_extra: 2, confirmed_tagged: 1 }), { names: ["Rahul", "Amit"], extra: 2, tagged: 1 });
  assert.deepEqual(confirmedIn({ confirmed_names: "Rahul", confirmed_extra: -3, confirmed_tagged: 99 }), { names: [], extra: 0, tagged: 20 });
  assert.equal(confirmedReady({ id: "g" }), false);
  assert.equal(confirmedReady({ id: "g", confirmed_names: [] }), true);
  assert.equal(confirmedReady(null), false);
});

test("totals: the host and joined players plus names, people without one and waiting tags", () => {
  const c = { names: ["Rahul", "Amit"], extra: 2, tagged: 1 };
  assert.equal(guestCount(c), 5);
  // The site owner's example: the host and 5 confirmed in a game of 10 is "6 of 10", 4 spots left.
  assert.equal(totalIn(1, c), 6);
  assert.equal(10 - totalIn(1, c), 4);
  assert.equal(totalIn(3, { names: [], extra: 0, tagged: 0 }), 3);
  assert.equal(totalIn(-2, c), 5);
});

test("the lineup's chips: names, then one '+N more' for people without a name and tags nobody may see yet", () => {
  const c = { names: ["Rahul", "Amit"], extra: 2, tagged: 1 };
  // Everyone but the host: the waiting tag is one more of the unnamed.
  assert.equal(moreChip(c), "+3 more");
  // The host sees the tagged player by name, so only the unnamed are "more".
  assert.equal(moreChip(c, 1), "+2 more");
  assert.equal(moreChip({ names: ["Rahul"], extra: 0, tagged: 0 }), null);
  assert.equal(moreChip({ names: [], extra: 0, tagged: 2 }), "+2 more");
  assert.equal(moreChip({ names: [], extra: 0, tagged: 2 }, 2), null);
  assert.equal(moreChip({ names: [], extra: 1, tagged: 1 }, 5), "+1 more");
  assert.equal(confirmedLine(c), "Rahul, Amit and 3 more");
  assert.equal(confirmedLine({ names: ["Rahul"], extra: 0, tagged: 0 }), "Rahul");
  assert.equal(confirmedLine({ names: [], extra: 2, tagged: 0 }), "2 more");
  assert.equal(confirmedLine({ names: [], extra: 0, tagged: 0 }), null);
});

test("limits while creating: the host plus the confirmed people never pass max players", () => {
  const at = (names: number, extra: number, tags: number, max = 10) => confirmedLimits({ max, joined: 1, names, extra, tags });
  assert.deepEqual(at(0, 0, 0), { total: 1, room: 9, minMax: 2, over: false, canAddName: true, canAddTag: true, canAddExtra: true });
  assert.deepEqual(at(2, 2, 1), { total: 6, room: 4, minMax: 6, over: false, canAddName: true, canAddTag: true, canAddExtra: true });
  // Full: nothing more fits, and max players can't go under it.
  assert.deepEqual(at(3, 4, 2), { total: 10, room: 0, minMax: 10, over: false, canAddName: false, canAddTag: false, canAddExtra: false });
  // Max players was lowered under the lineup (the sport changed): said, not hidden.
  assert.equal(at(3, 4, 2, 8).over, true);
  // The caps of each kind, with room to spare.
  assert.equal(confirmedLimits({ max: 50, joined: 1, names: 20, extra: 0, tags: 0 }).canAddName, false);
  assert.equal(confirmedLimits({ max: 50, joined: 1, names: 0, extra: 30, tags: 0 }).canAddExtra, false);
  assert.equal(confirmedLimits({ max: 50, joined: 1, names: 0, extra: 0, tags: 20 }).canAddTag, false);
  assert.equal(confirmedLimits({ max: 50, joined: 1, names: 20, extra: 0, tags: 0 }).canAddTag, true);
});

test("limits while editing: joined players count, and are never what gives way", () => {
  // The host and 3 joined, a name and 2 more, a waiting tag: 8 of 10.
  const l = confirmedLimits({ max: 10, joined: 4, names: 1, extra: 2, tags: 1 });
  assert.deepEqual([l.total, l.room, l.minMax], [8, 2, 8]);
  // Max players can go down to everyone in, no lower.
  assert.equal(confirmedLimits({ max: 8, joined: 4, names: 1, extra: 2, tags: 1 }).over, false);
  assert.equal(confirmedLimits({ max: 7, joined: 4, names: 1, extra: 2, tags: 1 }).over, true);
  // With nobody confirmed the floor is the joined players (2 at least, as the form always had).
  assert.equal(confirmedLimits({ max: 10, joined: 4, names: 0, extra: 0, tags: 0 }).minMax, 4);
  assert.equal(confirmedLimits({ max: 10, joined: 1, names: 0, extra: 0, tags: 0 }).minMax, 2);
  // A full game takes nobody new.
  const full = confirmedLimits({ max: 6, joined: 6, names: 0, extra: 0, tags: 0 });
  assert.deepEqual([full.room, full.canAddName, full.canAddExtra, full.canAddTag], [0, false, false, false]);
});

const day = (d: number) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const BODY = { turf_id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", sport: "Football", skill_level: "all", max_players: 10, date: day(1), start_time: "19:00", end_time: "20:00", price_per_player: 150 };

test("a create body: confirmed people are checked, stored collapsed and must fit with the host", () => {
  const p = parseCreate({ ...BODY, confirmed_names: [" Rahul ", "Amit"], confirmed_extra: 2, confirmed_tags: ["ravi_k"] });
  assert.ok("ok" in p);
  assert.deepEqual([p.ok.confirmed_names, p.ok.confirmed_extra, p.ok.confirmed_tags], [["Rahul", "Amit"], 2, ["ravi_k"]]);
  // A game without them is the body it always was: no new key.
  const plain = parseCreate(BODY);
  assert.ok("ok" in plain && !hasConfirmedKeys(plain.ok as Record<string, unknown>));
  assert.deepEqual(parseCreate({ ...BODY, max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1 }), parseCreate({ ...BODY, max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1 }));
  assert.ok("ok" in parseCreate({ ...BODY, max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1 }), "the host and 3 fill a game of 4");
  assert.deepEqual(parseCreate({ ...BODY, max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2 }), { bad: "confirmed" });
  assert.deepEqual(parseCreate({ ...BODY, max_players: 4, confirmed_extra: 2, confirmed_tags: ["ravi_k", "priya23"] }), { bad: "confirmed" });
  assert.deepEqual(parseCreate({ ...BODY, confirmed_names: ["Rahul 9822012345"] }), { bad: "confirmed_names" });
  assert.deepEqual(parseCreate({ ...BODY, confirmed_extra: 31 }), { bad: "confirmed_extra" });
  assert.deepEqual(parseCreate({ ...BODY, confirmed_tags: ["Ravi K"] }), { bad: "confirmed_tags" });
  assert.deepEqual(parseCreate({ ...BODY, confirmed_untag: [] }), { bad: "confirmed_untag" }, "nothing to untag on a new game");
  const s = parseSeries({ game: { ...BODY, confirmed_names: ["Rahul"], confirmed_extra: 1 }, repeat: { rule: { freq: "weekly", interval: 1, days: [new Date(`${day(1)}T00:00:00Z`).getUTCDay()] }, ends: { type: "never" } } });
  assert.ok("ok" in s && s.ok.game.confirmed_extra === 1, "a repeat's game carries them too");
});

test("an edit body: the four keys, each on its own; the fit is the database's to check (it knows who joined)", () => {
  assert.deepEqual(parseChanges({ confirmed_names: ["Rahul  K"] }), { ok: { confirmed_names: ["Rahul K"] } });
  assert.deepEqual(parseChanges({ confirmed_extra: 0 }), { ok: { confirmed_extra: 0 } });
  assert.deepEqual(parseChanges({ confirmed_tags: ["ravi_k"], confirmed_untag: ["cccccccc-cccc-4ccc-8ccc-000000000001"] }), {
    ok: { confirmed_tags: ["ravi_k"], confirmed_untag: ["cccccccc-cccc-4ccc-8ccc-000000000001"] },
  });
  assert.deepEqual(parseChanges({ confirmed_names: ["Rahul", "98220"] }), { bad: "confirmed_names" });
  assert.deepEqual(parseChanges({ confirmed_untag: ["ravi_k"] }), { bad: "confirmed_untag" });
  assert.deepEqual(parseChanges({ max_players: 4, confirmed_extra: 9 }), { ok: { max_players: 4, confirmed_extra: 9 } });
});

test("refusals in the page's words", () => {
  const no = (status: number, body: object) => gameProblem({ status, body: body as never });
  assert.equal(no(400, { error: "bad", field: "confirmed" }), "That's more people than spots. Raise max players, or confirm fewer.");
  assert.match(no(400, { error: "bad", field: "confirmed_names" }) ?? "", /a first name or nickname each/);
  assert.equal(no(503, { error: "unavailable", reason: "confirmed_off" }), "Adding confirmed players isn't on just yet. Post the game without them for now.");
  for (const t of [...Object.values(CONFIRMED_COPY), ...Object.values(TAG_COPY)]) assert.ok(!/book/i.test(t) && !/[—–]/.test(t), t);
  assert.equal(CONFIRMED_COPY.title, "Already confirmed (optional)");
});

test("a database without the columns yet says so (and nothing else does)", () => {
  assert.equal(missingConfirmedColumn({ code: "42703", message: "column games.confirmed_names does not exist" }), true);
  assert.equal(missingConfirmedColumn({ code: "PGRST204", message: "Could not find the 'confirmed_names' column" }), true);
  assert.equal(missingConfirmedColumn({ code: "42703", message: "column games.venue_name does not exist" }), false);
  assert.equal(missingConfirmedColumn({ code: "57014", message: "canceling statement" }), false);
  assert.equal(missingConfirmedColumn(null), false);
});

/* ---------------- tagged players shown at once (20261118_game_tags_shown.sql) ---------------- */

const TID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const shown = (n: number, name: string): ShownTag => ({ id: TID(100 + n), uid: TID(n), name, photo: null, u: name.toLowerCase() });

test("a shown tag offers I'm in and Remove me; one from before the file, the older question", () => {
  assert.deepEqual(tagButtons(true), { yes: "I'm in", no: "Remove me" });
  assert.deepEqual(tagButtons(false), { yes: "Yes, I'm in", no: "Not me" });
});

test("what the page takes of the tagged players it is sent", () => {
  const rows = [
    { id: TID(101), uid: TID(1), name: " Ravi Kumar ", photo: "https://lh3.example/ravi", u: "ravi_k", phone: "+919800000001", email: "x@example.com" },
    { id: TID(102), uid: TID(2), name: "", photo: "javascript:alert(1)", u: "Not A Username" },
    { id: TID(103), uid: TID(1), name: "Ravi again", photo: null, u: "ravi_k" },
    { id: "nope", uid: TID(4), name: "No id" },
    { id: TID(105), name: "No account" },
    null,
  ];
  assert.deepEqual(shownTagViews(rows), [
    { id: TID(101), uid: TID(1), name: "Ravi Kumar", photo: "https://lh3.example/ravi", u: "ravi_k" },
    { id: TID(102), uid: TID(2), name: "Player", photo: null, u: null },
  ], "these keys only, each player once, a photo only from https, a username only when it is one");
  assert.deepEqual([shownTagViews(null), shownTagViews("x"), shownTagViews({})], [[], [], []]);
  assert.equal(shownTagViews(Array.from({ length: 30 }, (_, i) => ({ id: TID(200 + i), uid: TID(300 + i), name: "P" }))).length, TAGS_MAX);
});

test("who a visitor is shown by name: the page's copy against the row read now", () => {
  const named = [shown(1, "Ravi"), shown(2, "Priya"), shown(3, "Kiran")];
  const none = new Set<string>();
  assert.deepEqual(namedTags({ named, tagged: 3, inGame: none }).map((t) => t.name), ["Ravi", "Priya", "Kiran"], "the copy and the count agree: all named");
  assert.deepEqual(namedTags({ named, tagged: 4, inGame: none }).map((t) => t.name), ["Ravi", "Priya", "Kiran"], "one more tagged since (or one with tagging off): those known are named, the page says +1 more");
  assert.deepEqual(namedTags({ named, tagged: 2, inGame: new Set([TID(2)]) }).map((t) => t.name), ["Ravi", "Kiran"], "someone said I'm in since: they are in the lineup, not twice");
  assert.deepEqual(namedTags({ named, tagged: 2, inGame: none }), [], "someone took themselves off since and the copy can't say who: nobody is named until it is fresh");
  assert.deepEqual(namedTags({ named, tagged: 2, inGame: none, left: new Set([TID(3)]) }).map((t) => t.name), ["Ravi", "Priya"], "the viewer's own Remove me: gone at once, the others stay");
  assert.deepEqual(namedTags({ named, tagged: 0, inGame: none }), [], "nobody waits: nobody named");
  assert.deepEqual(namedTags({ named: [], tagged: 3, inGame: none }), [], "before the file (or a failed read): a count only, as before");
  assert.equal(moreChip({ names: [], extra: 1, tagged: 3 }, namedTags({ named: named.slice(0, 2), tagged: 3, inGame: none }).length), "+2 more", "the rest are a number, with the people without a name");
});

test("the section's words are true before and after tagged players show at once", () => {
  assert.equal(CONFIRMED_COPY.publicNote, "Names show on the game page. A TapTurf player you tag gets a notification and can take themselves off.");
  assert.deepEqual([TAG_COPY.in, TAG_COPY.remove, TAG_COPY.yes, TAG_COPY.no], ["I'm in", "Remove me", "Yes, I'm in", "Not me"]);
});
