import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askedAgo,
  capitalizeSkillLevel,
  cardGame,
  durationLabel,
  firstName,
  formatClock,
  formatGameDay,
  formatPrice,
  formatTimeRange,
  formatTimeSlot,
  gamePlace,
  getGameStatus,
  hostNote,
  skillInfo,
  speakTimeRange,
  spotsInfo,
  turfInfo,
} from "./game";
import { usableTurfPhotos } from "./images";
import type { Game } from "../../types/game";

const NB = " ";
/** Readable expectations: "_" stands for the no-break space. */
const nb = (s: string) => s.replace(/_/g, NB);
// 09:30 in India on Thu 29 Oct 2026.
const NOW = Date.UTC(2026, 9, 29, 4, 0);

test("clock times: whole hours drop :00, minutes stay, NBSP before AM/PM", () => {
  assert.equal(formatClock("10:00"), nb("10_AM"));
  assert.equal(formatClock("07:30:00"), nb("7:30_AM"));
  assert.equal(formatClock("00:00"), nb("12_AM"));
  assert.equal(formatClock("12:00"), nb("12_PM"));
  assert.equal(formatClock("23:05:00"), nb("11:05_PM"));
  assert.equal(formatClock(""), "");
  assert.equal(formatClock(null), "");
});

test("time ranges are compact and can only break after the dash", () => {
  assert.equal(formatTimeRange("10:00", "12:00"), nb("10_AM_– 12_PM"));
  assert.equal(formatTimeRange("19:00:00", "21:00:00"), nb("7_– 9_PM"));
  assert.equal(formatTimeRange("18:30", "20:00"), nb("6:30_– 8_PM"));
  assert.equal(formatTimeRange("11:00", "13:00"), nb("11_AM_– 1_PM"));
  assert.equal(formatTimeRange("23:00", "01:00"), nb("11_PM_– 1_AM"));
  assert.equal(formatTimeRange("11:30", "13:30"), nb("11:30_AM_– 1:30_PM"));
  // Overnight within one half of the day still names both halves.
  assert.equal(formatTimeRange("22:00", "21:00"), nb("10_PM_– 9_PM"));
  assert.equal(formatTimeRange("06:30", "08:00"), nb("6:30_– 8_AM"));
  assert.equal(formatTimeRange("10:00", ""), nb("10_AM"));
  // The only ordinary space is the one after the dash.
  for (const [s, e] of [["10:00", "12:00"], ["19:00", "21:00"], ["11:30", "13:30"], ["23:00", "01:00"]]) {
    const r = formatTimeRange(s, e);
    assert.equal(r.split(" ").length, 2, r);
    assert.match(r, /– \d/);
  }
  // The old name everyone else calls gives the same.
  assert.equal(formatTimeSlot("10:00:00", "12:00:00"), nb("10_AM_– 12_PM"));
});

test("screen readers hear the range in words", () => {
  assert.equal(speakTimeRange("10:00", "12:00"), "10 AM to 12 PM");
  assert.equal(speakTimeRange("19:00", "21:00"), "7 PM to 9 PM");
  assert.equal(speakTimeRange("10:00", null), "10 AM");
});

test("durations", () => {
  assert.deepEqual(durationLabel("10:00", "11:00"), { text: "1 hour", endsNextDay: false });
  assert.deepEqual(durationLabel("10:00", "12:00"), { text: "2 hours", endsNextDay: false });
  assert.deepEqual(durationLabel("19:00", "20:30"), { text: "1.5 hours", endsNextDay: false });
  assert.deepEqual(durationLabel("06:30", "07:15"), { text: "45 min", endsNextDay: false });
  assert.deepEqual(durationLabel("16:00", "18:15"), { text: "2 hr 15 min", endsNextDay: false });
  assert.deepEqual(durationLabel("23:00", "01:00"), { text: "2 hours", endsNextDay: true });
  assert.equal(durationLabel("10:00", ""), null);
});

test("the game's day, relative to India's date", () => {
  assert.deepEqual(formatGameDay("2026-10-29", NOW), { title: "Today, Thu 29 Oct", short: "Today", plain: "Thu 29 Oct", weekday: "THU", dom: "29", diff: 0 });
  assert.deepEqual(formatGameDay("2026-10-30", NOW), { title: "Tomorrow, Fri 30 Oct", short: "Tomorrow", plain: "Fri 30 Oct", weekday: "FRI", dom: "30", diff: 1 });
  assert.equal(formatGameDay("2026-10-31", NOW).title, "Sat 31 Oct");
  assert.equal(formatGameDay("2026-10-31", NOW).short, "Sat 31 Oct");
  assert.equal(formatGameDay("2027-01-02", NOW).title, "Sat 2 Jan 2027");
  assert.equal(formatGameDay("2026-10-27", NOW).title, "Tue 27 Oct");
  assert.equal(formatGameDay("2026-10-28", NOW).title, "Wed 28 Oct");
  // 23:00 UTC on the 29th is already the 30th in India: "Today" follows India.
  assert.equal(formatGameDay("2026-10-30", Date.UTC(2026, 9, 29, 23, 0)).short, "Today");
  assert.equal(formatGameDay("soon", NOW).title, "soon");
});

test("prices", () => {
  assert.equal(formatPrice(0), "Free");
  assert.equal(formatPrice(null), "Free");
  assert.equal(formatPrice(150), "₹150");
  assert.equal(formatPrice(1200), "₹1,200");
  assert.equal(formatPrice(125000), "₹1,25,000");
});

test("skill levels in plain words, with a meter shape for each", () => {
  assert.deepEqual(skillInfo("all"), { key: "all", title: "All levels welcome", hint: "Any skill level can join", chip: "All levels", meter: 0 });
  assert.equal(skillInfo(null).key, "all");
  assert.equal(skillInfo("pro").key, "all");
  assert.equal(skillInfo("Beginner").title, "Beginners");
  assert.equal(skillInfo("beginner").meter, 1);
  assert.equal(skillInfo("intermediate").hint, "Knows the rules, plays now and then");
  assert.equal(skillInfo("intermediate").meter, 2);
  assert.equal(skillInfo("advanced").title, "Advanced players");
  assert.equal(skillInfo("advanced").chip, "Advanced");
  assert.equal(skillInfo("advanced").meter, 3);
  assert.equal(capitalizeSkillLevel("beginner"), "Beginners");
});

test("turf booked or not, as a plain fact", () => {
  assert.deepEqual(turfInfo(true), { booked: true, title: "Turf booked", hint: "The host has booked the slot" });
  assert.equal(turfInfo(false).title, "Turf not booked yet");
  assert.equal(turfInfo(null).booked, false);
  assert.doesNotMatch(turfInfo(false).hint, /will|soon|once/i);
});

test("spots: honest with 1 of 22, no urgency", () => {
  const one = spotsInfo(1, 22, false);
  assert.equal(one.title, "1 of 22 going");
  assert.equal(one.hint, "21 spots open");
  assert.equal(one.line, "21 open spots. Be one of the first to join.");
  assert.equal(one.plainLine, "21 open spots.");
  assert.equal(one.first, true);
  assert.equal(one.open, 21);
  const nearly = spotsInfo(12, 14, false);
  assert.equal(nearly.hint, "2 spots open");
  assert.equal(nearly.line, "2 open spots.");
  assert.equal(nearly.first, false);
  assert.equal(spotsInfo(13, 14, false).hint, "1 spot open");
  assert.equal(spotsInfo(13, 14, false).line, "1 open spot.");
  // Two joined but one spot left: no "be one of the first".
  assert.equal(spotsInfo(2, 3, false).line, "1 open spot.");
  assert.equal(spotsInfo(2, 4, false).line, "2 open spots. Be one of the first to join.");
  const full = spotsInfo(14, 14, false);
  assert.equal(full.hint, "No spots left");
  assert.equal(full.line, "All 14 spots are taken.");
  assert.equal(spotsInfo(15, 14, false).open, 0);
  const ended = spotsInfo(6, 12, true);
  assert.equal(ended.title, "6 of 12 joined");
  assert.equal(ended.hint, "Joining is closed");
  assert.equal(ended.line, "6 players joined this game.");
  assert.equal(spotsInfo(1, 12, true).line, "1 player joined this game.");
  for (const s of [one, nearly, full, ended]) assert.doesNotMatch(`${s.title} ${s.hint} ${s.line}`, /only|last|fast|hurry/i);
});

test("the host's note: their own words only", () => {
  assert.equal(hostNote({ description: "Tennis-ball cricket, 8 overs.", sport: "Cricket", title: "Cricket Game" }), "Tennis-ball cricket, 8 overs.");
  assert.equal(hostNote({ description: "  cricket   game ", sport: "Cricket", title: "Cricket Game" }), null);
  assert.equal(hostNote({ description: "5v5 football game", sport: "5v5 football", title: "5v5 football Game" }), null);
  assert.equal(hostNote({ description: "Cricket Game", sport: "Box Cricket", title: "Cricket Game" }), null);
  assert.equal(hostNote({ description: "", sport: "Cricket" }), null);
  assert.equal(hostNote({ description: null, sport: "Cricket" }), null);
});

test("where a game is, short", () => {
  assert.equal(gamePlace({ area: "Aziz Nagar", city: "hyderabad", address: "Survey No 45, Aziz Nagar, Hyderabad" }), "Aziz Nagar, Hyderabad");
  assert.equal(gamePlace({ area: null, city: "pune", address: "FR6X+969, Survey No 12, Kesnand Road, Wagholi, Pune" }), "Kesnand Road, Pune");
  assert.equal(gamePlace({ area: null, city: "pune", address: "Plot 7, 12 MG Road, Kothrud, Pune" }), "Kothrud, Pune");
  assert.equal(gamePlace({ area: null, city: "nashik", address: "Gut No 4, Shop No 2, College Road, Nashik" }), "College Road, Nashik");
  assert.equal(gamePlace({ area: null, city: "pune", address: "Pune, Maharashtra 411045" }), "Pune");
  assert.equal(gamePlace({ area: null, city: "pune", address: "" }), "Pune");
  // No city on the row: the address names one.
  assert.equal(gamePlace({ area: "Baner", city: null, address: "Baner Road, Pune" }), "Baner, Pune");
  assert.equal(gamePlace({ area: "Pune", city: "pune", address: "x" }), "Pune");
  assert.equal(gamePlace(null), "");
});

test("asked ago", () => {
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  assert.equal(askedAgo(at(20_000), NOW), "just now");
  assert.equal(askedAgo(at(25 * 60_000), NOW), "25 min ago");
  assert.equal(askedAgo(at(60 * 60_000), NOW), "1 hour ago");
  assert.equal(askedAgo(at(2 * 3_600_000), NOW), "2 hours ago");
  assert.equal(askedAgo(at(26 * 3_600_000), NOW), "yesterday");
  assert.equal(askedAgo(at(3 * 86_400_000), NOW), "3 days ago");
  assert.equal(askedAgo("nope", NOW), "");
});

test("the host's first name", () => {
  assert.equal(firstName("Rahul K"), "Rahul");
  assert.equal(firstName("  Asha  "), "Asha");
  assert.equal(firstName("Player"), "the host");
  assert.equal(firstName(""), "the host");
  assert.equal(firstName(null), "the host");
});

test("live and ended follow India's clock", () => {
  // 09:30 IST: a 9 to 10:30 game is on, a 7 to 8 game is over.
  assert.equal(getGameStatus({ date: "2026-10-29", start_time: "09:00", end_time: "10:30" }, NOW), "live");
  assert.equal(getGameStatus({ date: "2026-10-29", start_time: "07:00", end_time: "08:00" }, NOW), "expired");
  assert.equal(getGameStatus({ date: "2026-10-30", start_time: "10:00", end_time: "12:00" }, NOW), "upcoming");
});

const OWN = (h: string) => `https://x.supabase.co/storage/v1/object/public/turf-photos/t1/${h.repeat(24)}.webp`;

test("a turf's usable photos: flagged ones out, best first, capped", () => {
  const row = { cover_image: OWN("e"), images: [OWN("a"), OWN("b"), OWN("c"), OWN("d")], image_review: [{ url: OWN("e"), usable: false }, { url: OWN("b"), usable: false }] };
  assert.deepEqual(usableTurfPhotos(row, 3), [OWN("a"), OWN("c"), OWN("d")]);
  assert.deepEqual(usableTurfPhotos(row, 1), [OWN("a")]);
  assert.deepEqual(usableTurfPhotos({ cover_image: null, images: [] }, 3), []);
  assert.deepEqual(usableTurfPhotos(null, 3), []);
  // Booking apps' photos never show; comma-joined entries split.
  assert.deepEqual(usableTurfPhotos({ images: [`${OWN("a")}, https://playo.gumlet.io/x.jpg`] }, 3), [OWN("a")]);
  // Every photo flagged: nothing is dropped (the turf page does the same).
  assert.deepEqual(usableTurfPhotos({ images: [OWN("a")], image_review: [{ url: OWN("a"), usable: false }] }, 3), [OWN("a")]);
});

test("/games rows carry no host number and no raw photo arrays", () => {
  const raw = {
    id: "g1", creator_id: "u1", turf_id: "t1", title: "Cricket Game", sport: "Cricket", skill_level: "all", date: "2026-10-30",
    start_time: "10:00", end_time: "12:00", current_players: 1, max_players: 22, price_per_player: 0, turf_booked: false,
    status: "open", host_name: "Rahul K", host_phone: "9000000000", created_at: "2026-10-27T00:00:00Z",
    turfs: { id: "t1", slug: "mrr", name: "MRR", address: "Aziz Nagar, Hyderabad", area: "Aziz Nagar", city: "hyderabad", lat: 1, lng: 2, "Gmap Embed link": "<iframe>", cover_image: OWN("a"), images: [OWN("b"), OWN("c")], image_review: null },
  } as unknown as Game;
  const card = cardGame(raw);
  assert.equal("host_phone" in card, false);
  assert.deepEqual(card.turfs?.photos, [OWN("a"), OWN("b")]);
  assert.equal(card.turfs?.area, "Aziz Nagar");
  const t = card.turfs as Record<string, unknown>;
  for (const k of ["cover_image", "images", "image_review", "Gmap Embed link"]) assert.equal(k in t, false, k);
  assert.doesNotMatch(JSON.stringify(card), /host_phone|9000000000/);
  assert.equal(cardGame({ ...raw, turfs: undefined }).turfs, undefined);
});
