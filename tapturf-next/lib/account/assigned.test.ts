import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGNED_NOTICE,
  ASSIGNED_WORDS,
  BASE_MAX,
  FALLBACK,
  SNOOZE_KEY,
  SNOOZE_MS,
  assignUsername,
  assignedBase,
  assignedCandidate,
  keepError,
  snoozeValue,
  snoozed,
} from "./assigned";
import { usernameProblem } from "./usernames";
import { USERNAME_RE } from "./tag";

// The username TapTurf gives an account, and the words about it (npm run test:account). The same cases are run
// against the database's functions by scripts/sql-tests/usernames_assigned.check.mjs. Made-up people only.

type Case = { what: string; name: string; emails?: (string | null)[]; taken?: string[]; want: string };
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/account/assigned.cases.json"), "utf8")) as {
  names: Case[];
  notice: { type: string; title: string; message: string; link: string };
};

test("assigned: every case of the shared file", () => {
  assert.ok(CASES.names.length >= 50, "the file has its cases");
  for (const c of CASES.names) {
    const taken = new Set(c.taken ?? []);
    assert.equal(assignUsername(c.name, c.emails ?? [], (u) => taken.has(u)), c.want, c.what);
  }
});

test("assigned: every username given is one the rules take, at most 20 long, and never one that is taken", () => {
  for (const c of CASES.names) {
    assert.match(c.want, USERNAME_RE, c.what);
    assert.equal(usernameProblem(c.want), null, `${c.what}: ${c.want} passes the username rules`);
    assert.ok(!(c.taken ?? []).includes(c.want), c.what);
  }
  // The longest it can get: a 16 character base and four digits.
  const taken = new Set<string>();
  let last = "";
  for (let i = 0; i < 9999; i++) {
    last = assignUsername("Venkatanarasimharajuvaripeta", [], (u) => taken.has(u)) ?? "";
    taken.add(last);
  }
  assert.equal(last, "venkatanarasimha9999");
  assert.equal(last.length, 20);
  assert.equal(usernameProblem(last), null);
  assert.equal(assignUsername("Venkatanarasimharajuvaripeta", [], (u) => taken.has(u)), null, "after 9999 there is none to give");
  assert.equal(BASE_MAX, 16);
});

test("assigned: nothing of a phone number or an email address is ever used", () => {
  // No digit of the name survives, wherever it is.
  for (const name of ["9800000012", "+91 98000 00012", "Asha 9800000012", "98000Asha00012", "Asha Rao (9800000012)", "٩٨٠٠٠٠٠٠١٢", "९८००००००१२", "①②③ Asha"]) {
    const got = assignUsername(name, [], () => false) ?? "";
    assert.doesNotMatch(got.replace(/^turfer1$/, ""), /[0-9]/, name);
  }
  assert.equal(assignedBase("9800000012"), null);
  assert.equal(assignedBase("Asha 9800000012"), "asha");
  // An address typed as the name, or the name a Google account without one was given (the part before the @).
  assert.equal(assignedBase("someone@example.com"), null);
  assert.equal(assignedBase("first.last"), "first_last", "a handle that is no address of the account");
  assert.equal(assignedBase("first.last", ["first.last@example.com"]), null);
  assert.equal(assignedBase("First.Last", [null, undefined, "  FIRST.LAST@Example.com "]), null, "capitals and spaces around the address do not matter");
  assert.equal(assignedBase("first.last", ["other@example.com", "first.last@example.org"]), null, "any of the account's addresses");
  // The functions take the name and the addresses only: there is no way to hand them a phone number.
  assert.equal(assignedBase.length, 1);
  assert.equal(assignUsername.length, 3);
  const src = fs.readFileSync(path.join(process.cwd(), "lib/account/assigned.ts"), "utf8");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /phone/i, "the code never reads a phone number");
});

test("assigned: the candidates, in order", () => {
  assert.deepEqual([1, 2, 3, 10].map((n) => assignedCandidate("asha_rao", n)), ["asha_rao", "asha_rao2", "asha_rao3", "asha_rao10"]);
  assert.deepEqual([1, 2, 3].map((n) => assignedCandidate(null, n)), ["turfer1", "turfer2", "turfer3"]);
  assert.equal(FALLBACK, "turfer");
  assert.equal(usernameProblem(FALLBACK), null, "the fallback word is not reserved");
  // Two people with one name: the second gets the next number, whoever holds the first (a username, an old one, or one waiting).
  const taken = new Set<string>();
  const give = (name: string) => {
    const u = assignUsername(name, [], (x) => taken.has(x)) ?? "";
    taken.add(u);
    return u;
  };
  assert.deepEqual([give("Asha Rao"), give("asha rao"), give("ASHA RAO"), give("Kabir"), give("पाटील"), give("தமிழ்")], ["asha_rao", "asha_rao2", "asha_rao3", "kabir", "turfer1", "turfer2"]);
});

test("assigned: the card's words, as the site owner's design has them", () => {
  assert.equal(ASSIGNED_WORDS.title("asha_rao"), "Your username is @asha_rao");
  assert.equal(ASSIGNED_WORDS.keep, "Keep it");
  assert.equal(ASSIGNED_WORDS.change, "Change");
  assert.equal(ASSIGNED_WORDS.line, "Keeping it lets other players find and tag you, and gives you a public profile. You can turn that off any time in Profile.");
  assert.equal(ASSIGNED_WORDS.notNow, "Not now");
  assert.equal(ASSIGNED_WORDS.keptTitle("asha_rao"), "@asha_rao is yours");
  assert.equal(ASSIGNED_WORDS.moved("asha_rao2"), "Someone just took that one. Yours is now @asha_rao2.");
  assert.equal(ASSIGNED_WORDS.meLabel("asha_rao"), "Your username @asha_rao, shown only to you until you keep it");
  assert.equal(keepError("sign_in"), ASSIGNED_WORDS.signIn);
  assert.equal(keepError("new"), ASSIGNED_WORDS.signIn);
  assert.equal(keepError("unavailable"), ASSIGNED_WORDS.offline);
  assert.equal(keepError("slow"), ASSIGNED_WORDS.offline);
  assert.equal(keepError("bad"), ASSIGNED_WORDS.failed);
  assert.equal(keepError(null), ASSIGNED_WORDS.failed);
  // Plain words: no em or en dash anywhere a person reads.
  const all = [
    ...Object.values(ASSIGNED_WORDS).map((w) => (typeof w === "function" ? w("asha_rao") : w)),
    ASSIGNED_NOTICE.title,
    ASSIGNED_NOTICE.message("asha_rao"),
    ASSIGNED_NOTICE.linkLabel,
  ];
  for (const w of all) assert.doesNotMatch(w, /[—–]/, w);
});

test("assigned: the notice is the one the migration writes", () => {
  assert.equal(ASSIGNED_NOTICE.type, CASES.notice.type);
  assert.equal(ASSIGNED_NOTICE.title, CASES.notice.title);
  assert.equal(ASSIGNED_NOTICE.message("asha_rao"), CASES.notice.message.replace("{username}", "asha_rao"));
  assert.equal(ASSIGNED_NOTICE.message("asha_rao"), "Your TapTurf username is @asha_rao. Keep it or change it in Profile. It stays private until you say so.");
  assert.equal(ASSIGNED_NOTICE.link, CASES.notice.link);
  assert.equal(ASSIGNED_NOTICE.link, "/dashboard?tab=profile#username");
  // The Alerts list links it there (lib/my/claimNotice.ts; its own test, npm run test:my, runs the link).
  const links = fs.readFileSync(path.join(process.cwd(), "lib/my/claimNotice.ts"), "utf8");
  assert.ok(links.includes(`export const USERNAME_ASSIGNED = "${ASSIGNED_NOTICE.type}";`));
  assert.ok(links.includes(`if (type === USERNAME_ASSIGNED) return { href: "${ASSIGNED_NOTICE.link}", label: "${ASSIGNED_NOTICE.linkLabel}" };`));
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261128_usernames_assigned.sql"), "utf8");
  assert.ok(sql.includes(`'${ASSIGNED_NOTICE.type}'`), "the type");
  assert.ok(sql.includes(`'${ASSIGNED_NOTICE.title}'`), "the title");
  assert.ok(sql.includes("'Your TapTurf username is @' || a.username || '. Keep it or change it in Profile. It stays private until you say so.'"), "the message");
});

test("assigned: Not now hides the card for 7 days on this device, for that account only", () => {
  const now = Date.UTC(2026, 10, 28, 6, 0, 0);
  assert.equal(SNOOZE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(SNOOZE_KEY, "tapturf_username_card_v1");
  assert.equal(snoozed(null, "a", now), false);
  const v = snoozeValue(null, "a", now);
  assert.deepEqual(JSON.parse(v), { a: now + SNOOZE_MS });
  assert.equal(snoozed(v, "a", now), true);
  assert.equal(snoozed(v, "a", now + SNOOZE_MS - 1), true);
  assert.equal(snoozed(v, "a", now + SNOOZE_MS), false, "back after 7 days");
  assert.equal(snoozed(v, "b", now), false, "another account on the same phone still sees its own");
  // A clock set back never hides it longer; a broken value hides nothing.
  assert.equal(snoozed(v, "a", now - 3 * SNOOZE_MS), false);
  for (const bad of ["", "nope", "[]", "null", '{"a":"soon"}', '{"a":null}']) assert.equal(snoozed(bad, "a", now), false, bad);
  // A second account is added; ones that ran out go; 20 at most.
  const two = snoozeValue(v, "b", now + 1000);
  assert.deepEqual(JSON.parse(two), { a: now + SNOOZE_MS, b: now + 1000 + SNOOZE_MS });
  assert.deepEqual(JSON.parse(snoozeValue(two, "c", now + SNOOZE_MS + 500)), { b: now + 1000 + SNOOZE_MS, c: now + 2 * SNOOZE_MS + 500 });
  let many: string | null = null;
  for (let i = 0; i < 30; i++) many = snoozeValue(many, `u${i}`, now + i);
  const kept = Object.keys(JSON.parse(many ?? "{}"));
  assert.equal(kept.length, 20);
  assert.ok(kept.includes("u29") && kept.includes("u10") && !kept.includes("u9"));
  // Only the account id and a time are kept: never the username.
  assert.doesNotMatch(v, /asha|username/);
});
