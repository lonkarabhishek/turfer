import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_LINE, MY_SAID, OWNER_BANNED, OWNER_PROMPT_LINE, TEAM_EMAIL, ownerAnswer, ownerAsk, ownerFollowups, ownerNameSpans, ownerText, ownerVenue, type OwnerKind } from "./ownerHelp";
import { systemPrompt } from "../ai/ask";
import { quickAnswer } from "../ai/quick";
import { readFileSync } from "node:fs";
import type { Turf } from "../../types/turf";

const ID = (i: number) => `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`;
// Names as the turfs table has them (Jaipur's arenas, 16 Nov 2026); Badri's and the claimed one are made up.
const rows: [string, string, string | null, boolean][] = [
  ["Badri Sports Arena", "jaipur", "Mansarovar", false],
  ["Dugout turf arena", "jaipur", "Keshupura", false],
  ["Urban Sports Arena", "jaipur", "Mansarovar Extension", false],
  ["Shri Dadu Dayal Sports Arena", "jaipur", "Mansarovar", false],
  ["Greenline Turf", "pune", "Baner", true],
  ["Prime Turf", "mumbai", "Marol", false],
  ["Prime Turf", "ballari", null, false],
  ["Prime Turf", "malegaon", null, true],
  ["Sports Adda", "visakhapatnam", "Kurmannapalem", false],
  ["Dribble Den", "bangalore", "HSR Layout", false],
];
const TURFS = rows.map(([name, city, area, claimed], i) => ({ id: ID(i), name, city, area, address: "", sports: [], total_reviews: 10, claimed }) as unknown as Turf);
const byName = (n: string, city?: string) => TURFS.find((t) => t.name === n && (!city || t.city === city))!;

// ── Which questions are an owner's ──────────────────────────────────────

const OWNER: [string, OwnerKind][] = [
  // The three asked on 16 Nov 2026, as typed.
  ["How to Listing the my venue on tap turf", "list"],
  ["Claim my turf page", "claim"],
  ["How long does verification take", "time"],
  // Claim.
  ["claim my turf", "claim"],
  ["how do i claim my turf", "claim"],
  ["how to claim", "claim"],
  ["I want to claim this turf", "claim"],
  ["badri's sports arena claim", "claim"],
  ["claim Dribble Den", "claim"],
  ["claim kaise kare", "claim"],
  ["turf claim karna hai", "claim"],
  ["is my turf claimed", "claim"],
  ["myTapturf", "claim"],
  ["my tapturf login", "claim"],
  ["how do I open mytapturf", "claim"],
  // List, add, register.
  ["list my turf", "list"],
  ["how can i list my turf on tapturf", "list"],
  ["add my venue", "list"],
  ["i want to add my ground on TapTurf", "list"],
  ["register my academy", "list"],
  ["register our sports academy on tapturf", "list"],
  ["how to add a turf on tapturf", "list"],
  ["how to get listed", "list"],
  ["listing process", "list"],
  ["mera turf list karna hai jaipur", "list"],
  ["turf list karna hai", "list"],
  ["mera ground add karna hai", "list"],
  ["turf register kaise kare", "list"],
  ["apna turf tapturf pe daalna hai", "list"],
  ["list karna hai mera turf", "list"],
  ["partner with tapturf", "list"],
  ["is my turf on tap turf", "list"],
  // Not listed.
  ["my turf is not listed", "not_listed"],
  ["my turf is not showing on tapturf", "not_listed"],
  ["mera turf tapturf pe nahi dikh raha", "not_listed"],
  ["can't find my turf", "not_listed"],
  // I am the owner.
  ["I am the owner", "claim"],
  ["I'm the owner of Dugout turf arena", "claim"],
  ["i am owner of a turf in jaipur", "claim"],
  ["I run a turf in Jaipur", "claim"],
  ["we own a box cricket turf", "claim"],
  ["main turf ka malik hu", "claim"],
  ["turf ka malik hu", "claim"],
  ["mai owner hu", "claim"],
  ["owner login", "claim"],
  ["how do i sign up as an owner", "claim"],
  ["manage my turf page", "manage"],
  // Verified.
  ["how to get verified", "verify"],
  ["how do i get my turf verified", "verify"],
  ["verify my listing", "verify"],
  ["verified badge kaise milega", "verify"],
  ["turf verified kaise kare", "verify"],
  ["verification process", "verify"],
  // How long.
  ["how long does a claim take", "time"],
  ["my claim is pending", "time"],
  ["claim approve kab hoga", "time"],
  ["verification me kitna time lagta hai", "time"],
  ["How long does a claim take?", "time"],
  // Their page.
  ["update my turf prices", "manage"],
  ["how do i change my turf's photos", "manage"],
  ["edit my listing", "manage"],
  ["update my prices on tapturf", "manage"],
  ["wrong price on my turf page", "manage"],
  ["how do I mark free slots as owner", "manage"],
  ["how to take booking requests on tapturf", "manage"],
  ["how many views did my turf get", "manage"],
  ["What can I change on my turf's page?", "manage"],
  ["mere turf ka rate change karna hai", "manage"],
  // Cost.
  ["listing charges", "cost"],
  ["is it free to list my turf", "cost"],
  ["Is it free for owners?", "cost"],
  ["do you take commission", "cost"],
  ["My turf isn't on TapTurf", "not_listed"],
];

const PLAYER = [
  "turf near me",
  "box cricket in Kukatpally",
  "who owns Dribble Den turf?",
  "who is the owner of Prime Turf",
  "owner number of Prime Turf",
  "Prime Turf owner ka number",
  "contact the owner of Dugout",
  "turf ka malik kaun hai",
  "claimed turfs in Pune",
  "only claimed ones",
  "claimed wale turf dikhao",
  "what is a claimed turf",
  "what does verified mean",
  "what is tapturf verified",
  "verified turfs near me",
  "is Dribble Den verified?",
  "is Dribble Den claimed?",
  "show me verified turfs in Pune",
  "how many verified turfs in pune",
  "how to verify my phone number",
  "what is the blue tick",
  "list of turfs in pune",
  "list turfs near me",
  "list all venues in Jaipur",
  "football turf listing in Baner",
  "add me to the game",
  "register for a tournament",
  "I want to register my academy for the tournament",
  "register my team for the league",
  "host a game at my turf",
  "book my turf",
  "my turf booking tonight",
  "turf near my home",
  "cheapest turf in Jaipur",
  "any turf free tonight",
  "is Dribble Den free at 7",
  "which turf is available near me",
  "update my profile photo",
  "change my phone number",
  "cancel my booking request",
  "my booking request status",
  "how long is Dribble Den open",
  "how much is Prime Turf",
  "does Prime Turf have parking",
  "Dribble Den vs Prime Turf",
  "aaj raat football khelna hai",
  "kothrud me sasta box cricket hai kya",
  "mujhe game banana hai",
  "My Turf Pune",
  "Sports Adda",
  "Dribble den",
  "hi",
  "thanks",
  "pickleball courts in Mumbai with parking",
  "turfs with owner prices in bangalore",
  "owner managed turfs in dehradun",
  "any official turfs in mumbai run by the owner",
  "which turfs are claimed by owners",
  "free games at verified turfs",
  "claim my free slot",
  "how to claim the discount",
  "manage my game",
  "edit my game",
  "is tapturf free",
  // Players' own asks from the log (to 16 Nov 2026).
  "Bro turfs which tapturf has claimed",
  "It says its claimed bro",
  "Its claimed by owner right",
  "No tapturf verified",
  "Which turfs are verified here in blr",
  "Cheapest turf in my city",
  "Calculate our NRR",
  "Confirm whether equipment is provided under my budget",
  "turfs near my office",
  "our team needs a turf tonight",
  "add 2 players to my game",
  "is my game listed",
];

test("an owner's question is read as one, with its kind", () => {
  assert.ok(OWNER.length > 70);
  for (const [q, kind] of OWNER) assert.equal(ownerAsk(q), kind, q);
});

test("a player's search, question or small talk is never an owner's", () => {
  for (const q of PLAYER) assert.equal(ownerAsk(q), null, q);
});

test("the ready answers still read what a mark means: the owner path leaves those alone", () => {
  const data = { areas: {}, turfs: TURFS };
  for (const q of ["what does verified mean", "what is a claimed turf", "what is the blue tick"]) {
    assert.equal(ownerAsk(q), null, q);
    assert.equal(quickAnswer(q, data, {}, 10)?.intent, "other", q);
  }
});

test("the eval set (scripts/ask-eval/questions.json, read from the app's folder): its owner-* questions are owners', and no other question is", () => {
  const { questions } = JSON.parse(readFileSync("scripts/ask-eval/questions.json", "utf8")) as { questions: { id: string; q: string; expect?: { intent?: string } }[] };
  const owners = questions.filter((x) => x.expect?.intent === "owner");
  assert.ok(owners.length >= 8);
  for (const x of questions) assert.equal(ownerAsk(x.q) != null, x.expect?.intent === "owner", `${x.id}: ${x.q}`);
  for (const x of owners) assert.match(x.id, /^owner-/);
});

test("after an owner's answer, a short follow-up asks about the same; a search is the player's again", () => {
  assert.equal(ownerAsk("how long does it take", true), "time");
  assert.equal(ownerAsk("kitna time lagega", true), "time");
  assert.equal(ownerAsk("is it free", true), "cost");
  assert.equal(ownerAsk("any charges?", true), "cost");
  assert.equal(ownerAsk("it's not there", true), "not_listed");
  assert.equal(ownerAsk("I can't find it", true), "not_listed");
  assert.equal(ownerAsk("what can i change after that", true), "manage");
  assert.equal(ownerAsk("how?", true), "claim");
  assert.equal(ownerAsk("kaise", true), "claim");
  for (const q of ["how long does it take", "is it free", "it's not there", "how?"]) assert.equal(ownerAsk(q), null, `${q}, with no owner answer before it`);
  for (const q of ["turf near me", "box cricket in Kukatpally", "how long is it open", "is it free tonight for a game", "football turfs in Jaipur", "thanks"]) assert.equal(ownerAsk(q, true), null, q);
});

test("every chip under an owner's answer is itself an owner's question", () => {
  for (const kind of ["claim", "list", "not_listed", "time", "verify", "manage", "cost"] as const) {
    const chips = ownerFollowups(kind);
    assert.equal(chips.length, 3);
    for (const c of chips) {
      const read = ownerAsk(c);
      assert.ok(read, c);
      assert.notEqual(read, kind, `${c} under a ${kind} answer`);
    }
  }
});

// ── The turf they name ──────────────────────────────────────────────────

test("the words that could be the turf's name, as typed; none for a question with no name", () => {
  assert.deepEqual(ownerNameSpans("badri's sports arena claim"), ["badri's sports arena"]);
  assert.deepEqual(ownerNameSpans("I'm the owner of Dugout turf arena"), ["Dugout turf arena"]);
  assert.deepEqual(ownerNameSpans("claim Dribble Den"), ["Dribble Den"]);
  assert.deepEqual(ownerNameSpans("I am the owner of Kage, how do I change photos"), ["Kage"]);
  for (const q of ["Claim my turf page", "How to Listing the my venue on tap turf", "How long does verification take", "mera turf list karna hai jaipur", "list my box cricket turf", "register our sports academy on tapturf", "i am owner of a turf in jaipur"])
    assert.deepEqual(ownerNameSpans(q), [], q);
});

test("a turf we list, named: that turf; a shared name: the one in the city, else the few; a name we don't list: said, never guessed", () => {
  assert.deepEqual(ownerVenue(TURFS, "badri's sports arena claim"), { turfs: [byName("Badri Sports Arena")], missed: null });
  assert.deepEqual(ownerVenue(TURFS, "I'm the owner of Dugout turf arena").turfs, [byName("Dugout turf arena")]);
  assert.deepEqual(ownerVenue(TURFS, "claim dugout").turfs, [byName("Dugout turf arena")]);
  assert.deepEqual(ownerVenue(TURFS, "how to claim Greenline Turf").turfs, [byName("Greenline Turf")]);
  // Three Prime Turfs: the city typed, the visitor's, else all three.
  assert.deepEqual(ownerVenue(TURFS, "claim Prime Turf Ballari").turfs, [byName("Prime Turf", "ballari")]);
  assert.deepEqual(ownerVenue(TURFS, "claim Prime Turf", [null, "mumbai"]).turfs, [byName("Prime Turf", "mumbai")]);
  assert.equal(ownerVenue(TURFS, "claim Prime Turf", ["jaipur"]).turfs.length, 3);
  // Not ours: no turf is guessed from a shared word ("Sports Arena" is in four names).
  assert.deepEqual(ownerVenue(TURFS, "zqxv sports arena claim"), { turfs: [], missed: "zqxv sports arena" });
  assert.deepEqual(ownerVenue(TURFS, "claim my sports arena"), { turfs: [], missed: null });
  assert.deepEqual(ownerVenue(TURFS, "mera turf list karna hai jaipur"), { turfs: [], missed: null });
  assert.deepEqual(ownerVenue(TURFS, "Claim my turf page"), { turfs: [], missed: null });
  assert.deepEqual(ownerVenue(TURFS, "How long does verification take"), { turfs: [], missed: null });
  // A name's own words, without "sports arena", are its name; one word of a longer name is not enough to offer its claim link.
  assert.deepEqual(ownerVenue(TURFS, "claim urban").turfs, [byName("Urban Sports Arena")]);
  assert.deepEqual(ownerVenue(TURFS, "claim shri").turfs, []);
  assert.deepEqual(ownerVenue(TURFS, "claim dadu").turfs, []);
});

test("on a turf's page, a question that names no turf is about that turf; one that names another is about the other", () => {
  const page = byName("Urban Sports Arena");
  assert.deepEqual(ownerVenue(TURFS, "claim this turf", [], page).turfs, [page]);
  assert.deepEqual(ownerVenue(TURFS, "I am the owner", [], page).turfs, [page]);
  assert.deepEqual(ownerVenue(TURFS, "claim Dribble Den", [], page).turfs, [byName("Dribble Den")]);
});

// ── The answer ──────────────────────────────────────────────────────────

const KINDS = ["claim", "list", "not_listed", "time", "verify", "manage", "cost"] as const;
const every = () => [
  ...KINDS.map((k) => ownerAnswer(k)),
  ...KINDS.map((k) => ownerAnswer(k, { turfs: [], missed: "zqxv sports arena" })),
  ...KINDS.map((k) => ownerAnswer(k, { turfs: [byName("Badri Sports Arena")], missed: null })),
  ...KINDS.map((k) => ownerAnswer(k, { turfs: [byName("Greenline Turf")], missed: null })),
  ...KINDS.map((k) => ownerAnswer(k, { turfs: TURFS.filter((t) => t.name === "Prime Turf"), missed: null })),
];

test("no answer says what the model made up, claims a booking, or uses a dash for a pause", () => {
  for (const a of every()) {
    const said = [ownerText(a), ...a.links.map((l) => l.label), ...a.followups].join(" ");
    assert.doesNotMatch(said, OWNER_BANNED, said);
    assert.doesNotMatch(said, /few (?:working )?days|team checks it before|venue details|sign up on tapturf|book (?:now|online)|instant/i, said);
    assert.doesNotMatch(said, /[—–]/, said);
    assert.ok(a.reply.length <= 320, `${a.reply.length}: ${a.reply}`);
    assert.ok(a.links.length >= 1 && a.links.length <= 4);
    assert.equal(a.links.filter((l) => l.primary).length >= 1, true, said);
    for (const l of a.links) assert.match(l.href, /^(?:\/my(?:\?claim=[0-9a-f-]{36}&owner=1)?|mailto:info@tapturf\.in)$/, l.href);
  }
  assert.match("our team checks it before the verified stamp goes up", OWNER_BANNED);
  assert.match("Send your venue details through the claim form", OWNER_BANNED);
  assert.match("within a few working days", OWNER_BANNED);
});

test("with no turf named: the steps myTapturf has, its own words for the code and the check, and the way in for a turf we don't list", () => {
  const a = ownerAnswer("claim");
  assert.equal(a.about, "none");
  assert.equal(a.reply, `You claim your turf's page yourself on myTapturf (${MY_SAID}). It's free.`);
  assert.deepEqual(a.steps, [`Sign in at ${MY_SAID} with Google or your phone.`, 'Under "Claim a turf", search your turf by name and tap "This is mine".', CODE_LINE]);
  assert.match(CODE_LINE, /We send it a code and you get in at once\. Otherwise we check with you first, usually within a day\./);
  assert.match(a.notes.join(" "), /prices, hours, photos, numbers, ground size and roof, mark hours Free or Booked, turn on booking requests/);
  assert.match(a.notes.join(" "), new RegExp(`Email ${TEAM_EMAIL} with its name, area and city, Google Maps link, sports, phone or WhatsApp number, hours and prices`));
  assert.deepEqual(a.links, [{ label: "Open myTapturf", href: "/my", primary: true }, { label: "Email info@tapturf.in", href: "mailto:info@tapturf.in" }]);
  assert.deepEqual(a.turfIds, []);

  const list = ownerAnswer("list");
  assert.match(list.reply, /already on TapTurf, claim its page yourself on myTapturf \(tapturf\.in\/my\)\. It's free\. If it isn't listed yet, email info@tapturf\.in and we add it\./);
  const time = ownerAnswer("time");
  assert.equal(time.reply, "With the phone whose number is on your listing, we send it a code and you get in at once. Otherwise we check with you first, usually within a day.");
  assert.match(time.notes.join(" "), /notification on TapTurf, not an email or SMS/);
  const verify = ownerAnswer("verify");
  assert.match(verify.reply, /no separate verification on TapTurf\. A turf whose owner has claimed its page shows Claimed and TapTurf verified/);
  const none = ownerAnswer("not_listed");
  assert.match(none.reply, /no form to add a turf yourself yet\. Email info@tapturf\.in and we add it/);
  assert.equal(none.links[0].href, "mailto:info@tapturf.in");
  assert.equal(none.links[0].primary, true);
  assert.match(ownerAnswer("cost").reply, /is free\.$/);
  assert.match(ownerAnswer("manage").reply, /Your page tab, hours Free or Booked and booking requests on Slots, and views and Call and WhatsApp taps on Analytics/);
});

test("a turf we list: its own claim link with owner=1; a claimed one: said, with the sign-in; a shared name: one link each, with its place", () => {
  const badri = byName("Badri Sports Arena");
  const a = ownerAnswer("claim", { turfs: [badri], missed: null });
  assert.equal(a.about, "named");
  assert.equal(a.reply, "Badri Sports Arena in Mansarovar, Jaipur is on TapTurf and nobody has claimed its page yet. If you own or manage it, claim it. It's free.");
  assert.deepEqual(a.links, [{ label: "Claim Badri Sports Arena", href: `/my?claim=${badri.id}&owner=1`, primary: true }]);
  assert.deepEqual(a.steps, ["Tap Claim Badri Sports Arena below and sign in with Google or your phone.", CODE_LINE]);
  assert.deepEqual(a.turfIds, [badri.id]);
  assert.match(ownerAnswer("time", { turfs: [badri], missed: null }).reply, /you get in at once; otherwise we check with you first, usually within a day\.$/);
  assert.match(ownerAnswer("verify", { turfs: [badri], missed: null }).reply, /TapTurf verified is what a claimed page shows/);

  const taken = ownerAnswer("claim", { turfs: [byName("Greenline Turf")], missed: null });
  assert.equal(taken.about, "claimed");
  assert.match(taken.reply, /^Greenline Turf in Baner, Pune is already claimed on TapTurf/);
  assert.match(taken.reply, /sign in at tapturf\.in\/my\.$/);
  assert.ok(!taken.links.some((l) => l.href.includes("claim=")), "no claim link for a claimed turf");
  assert.match(taken.notes[0], /can't get in\? Email info@tapturf\.in\./);

  const primes = TURFS.filter((t) => t.name === "Prime Turf");
  const several = ownerAnswer("claim", { turfs: primes, missed: null });
  assert.equal(several.about, "several");
  assert.deepEqual(several.links.map((l) => l.label), ["Claim Prime Turf, Marol, Mumbai", "Claim Prime Turf, Ballari", "Open myTapturf"]);

  const missed = ownerAnswer("claim", { turfs: [], missed: "badri's sports arena" });
  assert.equal(missed.about, "missed");
  assert.match(missed.reply, /^I couldn't match "badri's sports arena" to a turf on TapTurf\. You claim your turf's page yourself/);
});

test("the model's prompt says the claim flow as it is, in v9 and v10, and forbids inventing one", () => {
  for (const v of [9, 10] as const) {
    const p = systemPrompt({ pune: ["Baner"] }, v);
    assert.ok(p.includes(OWNER_PROMPT_LINE), `v${v}`);
  }
  assert.match(OWNER_PROMPT_LINE, /never invent a process, a form, a stamp or a timeline/);
  assert.match(OWNER_PROMPT_LINE, /usually within a day/);
  assert.match(OWNER_PROMPT_LINE, /info@tapturf\.in/);
  assert.doesNotMatch(OWNER_PROMPT_LINE, OWNER_BANNED);
});
