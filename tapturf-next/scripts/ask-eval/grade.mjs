// node scripts/ask-eval/grade.mjs <replies dir> [--truth truth.json] [--questions questions.json] [--json]
//
// Grades router v10's answers (lib/ai/ask.ts AskFiltersV10) saved from GET
// /api/ask, one <id>.json per question in questions.json (the raw reply
// body). Each reply must be router v10's (router: 10), its reading (the
// memo it sends back for follow-ups, and its intent) must match `expect`, and
// the answer must respect `facts`: what its cards, games and words may say.
// truth.json, read SELECT-only from the database, makes the facts about
// claimed turfs, players' reports and the owner's prices exact:
//   { "claimed": [turf ids], "claimedCities": { "<city>": n }, "reports": { "<turf id>": n },
//     "ownerPrices": [turf ids], "ownerPriceCities": { "<city>": n }, "reportCities": { "<city>": n } }
// Without it those facts are skipped (said as such). Exit code 1 when any check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const dir = args.find((a, i) => !a.startsWith("--") && !["--truth", "--questions"].includes(args[i - 1]));
if (!dir) {
  console.error("usage: node grade.mjs <replies dir> [--truth truth.json] [--questions questions.json] [--json]");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const { questions } = JSON.parse(fs.readFileSync(flag("--questions") ?? path.join(here, "questions.json"), "utf8"));
const truth = flag("--truth") ? JSON.parse(fs.readFileSync(flag("--truth"), "utf8")) : null;

// Copy must never claim a booking on TapTurf (players call or WhatsApp the turf), nor name a booking app.
const BOOKING = /\bbook(?:ed|ing)?\s+(?:it\s+)?(?:on|through|via|with)\s+tapturf\b|\bbook\s+(?:now|online|instantly)\b|\binstant\s+booking\b|\bplayo\b|\bhudle\b|\bkhelomore\b|\bplayspots\b|\bturf\s*town\b|\bkixar\b|\bbookmyshow\b|\bturfwala\b|\bsporloc\b/i;
const say = (j) => [j.reply ?? "", j.summary ?? "", ...(j.followups ?? []), j.answer?.answer ?? ""].join(" \n ");
const cards = (j) => j.turfs ?? [];
const games = (j) => j.games ?? [];
const hasPhoto = (t) => !!t.cover_image || (t.images?.length ?? 0) > 0;
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lc = (s) => String(s ?? "").toLowerCase();

/** The reading as the reply carries it: the memo (snake_case, as the schema), its intent, and the chips' filters for what the memo lacks. */
function reading(j) {
  const m = j.memo ?? {};
  const f = j.filters ?? {};
  return { ...m, intent: j.intent, players: m.players ?? f.players ?? null };
}

/** Each fact: null when it holds, else why not; "skip" when it can't be checked here. */
const FACTS = {
  no_booking_claim: (j) => (BOOKING.test(say(j)) ? `booking claim or app in "${say(j).match(BOOKING)[0]}"` : null),
  cards_claimed: (j) => {
    const bad = cards(j).filter((t) => t.claimed !== true);
    return bad.length ? `${bad.length} unclaimed card(s): ${bad.map((t) => t.name).join(", ")}` : null;
  },
  cards_photos: (j) => {
    const bad = cards(j).filter((t) => !hasPhoto(t));
    return bad.length ? `${bad.length} card(s) without a photo: ${bad.map((t) => t.name).join(", ")}` : null;
  },
  "cards_city": (j, city) => {
    if (j.rows?.length) return null; // headed rows say they are elsewhere
    const bad = cards(j).filter((t) => t.city !== city);
    return bad.length ? `${bad.length} card(s) outside ${city}` : null;
  },
  "cards_sport": (j, label) => {
    const bad = cards(j).filter((t) => !(t.sports ?? []).some((s) => lc(s).includes(lc(label))));
    return bad.length ? `${bad.length} card(s) without ${label}` : null;
  },
  "cards_within_km": (j, km) => {
    const bad = cards(j).filter((t) => t.distanceKm != null && t.distanceKm > Number(km));
    return bad.length && !j.rows?.length ? `${bad.length} card(s) past ${km} km` : null;
  },
  games_free: (j) => {
    const bad = games(j).filter((g) => Number(g.price_per_player ?? 0) !== 0);
    return bad.length ? `${bad.length} paid game(s)` : null;
  },
  games_booked: (j) => {
    const bad = games(j).filter((g) => g.turf_booked !== true);
    return bad.length ? `${bad.length} game(s) without the turf booked` : null;
  },
  "games_spots": (j, n) => {
    const bad = games(j).filter((g) => Number(g.max_players) - Number(g.current_players ?? 0) < Number(n));
    return bad.length ? `${bad.length} game(s) with fewer than ${n} spots` : null;
  },
  "games_skill": (j, s) => {
    const bad = games(j).filter((g) => g.skill_level !== s && g.skill_level !== "all");
    return bad.length ? `${bad.length} game(s) not for ${s}` : null;
  },
  // No game shown: the reply says so ("No free football games ... yet"), never the model's "Here are".
  games_reply_honest: (j) => (games(j).length === 0 && !/^No\b/.test(j.reply ?? "") ? `no games, but the reply reads "${j.reply}"` : null),
  // Numbers said as a count of venues must be the reply's own total.
  count_honest: (j) => {
    const said = [...(j.reply ?? "").matchAll(/\b(\d[\d,]*)\s+(?:claimed\s+)?(?:turfs?|venues?|courts?|games?|on TapTurf|matches)\b|\bThe\s+(\d[\d,]*)\s+on TapTurf\b/g)].map((m) => Number((m[1] ?? m[2]).replace(/,/g, "")));
    const bad = said.filter((n) => n !== Number(j.total));
    return bad.length ? `says ${bad.join(", ")} but the total is ${j.total}` : null;
  },
  "reply_matches": (j, re) => (new RegExp(re, "i").test(j.reply ?? "") ? null : `reply "${j.reply}" lacks /${re}/`),
  "reply_not": (j, re) => (new RegExp(re, "i").test(j.reply ?? "") ? `reply "${j.reply}" has /${re}/` : null),
  // With truth: the cards are claimed turfs and nothing else; none in the city asked means the reply says none.
  truth_claimed: (j) => {
    if (!truth) return "skip";
    const set = new Set(truth.claimed);
    const bad = cards(j).filter((t) => !set.has(t.id));
    return bad.length ? `${bad.length} card(s) not in the claimed set` : null;
  },
  truth_reports: (j) => {
    if (!truth) return "skip";
    const bad = cards(j).filter((t) => !(truth.reports[t.id] > 0));
    return bad.length ? `${bad.length} card(s) with no player reports` : null;
  },
  truth_owner_prices: (j) => {
    if (!truth) return "skip";
    const set = new Set(truth.ownerPrices);
    const bad = cards(j).filter((t) => !set.has(t.id));
    return bad.length ? `${bad.length} card(s) without the owner's prices` : null;
  },
  "zero_copy_if_none": (j, kind, q) => {
    if (!truth) return "skip";
    const city = q.expect.city;
    const counts = { claimed: truth.claimedCities, owner_prices: truth.ownerPriceCities, player_reviews: truth.reportCities }[kind];
    if (!city || !counts || (counts[city] ?? 0) > 0) return null;
    return /^No\b/.test(j.reply ?? "") ? null : `${city} has none, but the reply reads "${j.reply}"`;
  },
  "answer_truth_claimed": (j, name) => {
    if (!truth) return "skip";
    const t = cards(j).find((c) => lc(c.name) === lc(name));
    if (!t) return `no card for ${name}`;
    const yes = truth.claimed.includes(t.id);
    const text = `${j.answer?.answer ?? ""} ${j.reply ?? ""}`;
    if (!j.answer) return "skip";
    return yes === /\b(?:yes|is (?:a )?claimed|claimed turf|owner runs)\b/i.test(text) ? null : `answer "${text.trim()}" disagrees: claimed is ${yes}`;
  },
};

const results = [];
for (const q of questions) {
  const file = path.join(dir, `${q.id}.json`);
  const out = { id: q.id, q: q.q, fails: [], skipped: [] };
  results.push(out);
  if (!fs.existsSync(file)) {
    out.fails.push("no saved reply");
    continue;
  }
  let j;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    out.fails.push("reply is not JSON");
    continue;
  }
  if (j.error) {
    out.fails.push(`error reply: ${j.error}`);
    continue;
  }
  if (j.router !== 10) out.fails.push("not router v10's reply (no router: 10; was x-ask-eval sent with the right key?)");
  if (j.failed) out.fails.push("the search failed on the server");
  const r = reading(j);
  for (const [k, want] of Object.entries(q.expect ?? {})) {
    const got = k === "intent" ? j.intent : r[k];
    const norm = (v) => (Array.isArray(v) ? v.map(lc) : typeof v === "string" ? lc(v) : v ?? null);
    if (!sameValue(norm(got), norm(want))) out.fails.push(`${k}: wanted ${JSON.stringify(want)}, read ${JSON.stringify(got ?? null)}`);
  }
  for (const fact of q.facts ?? []) {
    const [name, arg] = fact.split(/:(.*)/s);
    const check = FACTS[name];
    if (!check) {
      out.fails.push(`unknown fact ${name}`);
      continue;
    }
    const why = check(j, arg, q);
    if (why === "skip") out.skipped.push(name);
    else if (why) out.fails.push(`${fact}: ${why}`);
  }
  out.reply = j.reply;
  out.total = j.total;
  out.via = j.via;
}

const failed = results.filter((r) => r.fails.length);
if (args.includes("--json")) console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
else {
  for (const r of results) {
    console.log(`${r.fails.length ? "FAIL" : "ok  "} ${r.id.padEnd(24)} ${r.via ?? ""} ${r.fails.length ? `\n       ${r.fails.join("\n       ")}` : ""}${r.skipped.length ? ` (skipped without truth: ${r.skipped.join(", ")})` : ""}`);
  }
  console.log(`\n${results.length - failed.length} of ${results.length} passed${truth ? "" : " (no truth.json: the claimed, reports and owner-price facts were skipped)"}`);
}
process.exit(failed.length ? 1 : 0);
