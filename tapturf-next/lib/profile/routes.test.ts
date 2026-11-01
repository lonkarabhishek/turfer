import { test } from "node:test";
import assert from "node:assert/strict";
import { getPassport, getPlayed, patchWhatsapp, type ProfileDeps } from "./routes";
import type { GameRow } from "./history";
import type { WhatsAppResult } from "./server";
import type { PassportResponse, PlayedResponse } from "./types";

// The passport routes with every dependency faked: who is asking, the
// public rows and the account functions. Fake people and numbers.

const NOW = Date.parse("2026-11-01T12:30:00Z");
const ME = "acc-asha";
const g = (id: string, date: string, creator: string, turf: string, o: Partial<GameRow> = {}): GameRow => ({
  id, creator_id: creator, turf_id: turf, sport: "Football", date, start_time: "19:00", end_time: "20:00", status: "completed", ...o,
});
const GAMES = [
  g("g1", "2026-10-21", ME, "t1"),
  g("g2", "2026-10-28", "acc-ravi", "t2"),
  g("g3", "2026-11-05", "acc-ravi", "t2"),
  g("g4", "2026-10-14", "acc-neha", "t1", { status: "cancelled" }),
];
const ROSTERS: Record<string, string[]> = {
  g1: [ME, "acc-ravi", "acc-priya"],
  g2: ["acc-ravi", ME],
  g3: ["acc-ravi", ME, "acc-kiran"],
  g4: ["acc-neha", ME],
};

type Seen = { rosters: string[][]; people: string[][]; whatsapp: [string, boolean | null][] };

function deps(o: { who?: "phone" | "out"; extras?: "missing" | "on"; whatsapp?: WhatsAppResult; fail?: boolean } = {}) {
  const seen: Seen = { rosters: [], people: [], whatsapp: [] };
  const d: ProfileDeps = {
    who: async () => (o.who === "out" ? { reply: Response.json({ error: "sign_in" }, { status: 401 }) } : { userId: ME, since: "2026-09-12T09:00:00Z" }),
    history: async () => {
      if (o.fail) throw new Error("down");
      return {
        games: GAMES,
        turfs: [
          { id: "t1", slug: "turf-one", name: "Turf One", city: "pune", cityLabel: "Pune" },
          { id: "t2", slug: "box-arena", name: "Box Arena", city: "pune", cityLabel: "Pune" },
        ],
        reviews: [{ turf_id: "t1", rating: 5, created_at: "2026-10-22T06:00:00Z" }],
      };
    },
    rosters: async (games) => {
      seen.rosters.push(games.map((x) => x.id));
      return new Map(games.map((x) => [x.id, ROSTERS[x.id] ?? []]));
    },
    people: async (ids) => {
      seen.people.push([...ids]);
      return new Map([
        ["acc-ravi", { name: "Ravi Kumar", photo: null }],
        ["acc-priya", { name: "Priya Sharma", photo: "/avatars/football.svg" }],
        ["acc-kiran", { name: "Kiran", photo: null }],
        ["acc-neha", { name: "Neha Joshi", photo: null }],
      ]);
    },
    // The database's answer: Ravi shares his number; Priya has a username and no sharing.
    extras: async () => (o.extras === "missing" ? null : new Map([
      ["acc-ravi", { username: "ravi", whatsapp: o.extras === "on" ? "+919800000002" : null }],
      ["acc-priya", { username: "priya", whatsapp: null }],
    ])),
    whatsapp: async (id, on) => {
      seen.whatsapp.push([id, on]);
      return o.whatsapp ?? { ok: { on: on ?? false, phone: "ok" } };
    },
    now: () => NOW,
  };
  return { d, seen };
}

const get = (path: string) => new Request(`https://www.tapturf.in${path}`, { headers: { Authorization: "Bearer t" } });
const patch = (body: string) => new Request("https://www.tapturf.in/api/me/whatsapp", { method: "PATCH", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body });

test("passport: the verified caller's own, private, with the people they played with", async () => {
  const { d, seen } = deps({ extras: "on" });
  const res = await getPassport(get("/api/me/passport"), d);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = (await res.json()) as PassportResponse;
  assert.deepEqual(body.passport.numbers, { games: 2, hosted: 1, turfs: 2, cities: 1, sports: 1, reviews: 1, since: "2026-09-12T09:00:00Z" });
  assert.deepEqual(seen.rosters, [["g1", "g2"]], "only played games: not the future one, not the cancelled one");
  assert.deepEqual(body.playedWith.map((p) => [p.name, p.together, p.username, p.whatsapp]), [
    ["Ravi Kumar", 2, "ravi", "+919800000002"],
    ["Priya Sharma", 1, "priya", null],
  ], "Kiran and Neha never played a game with them");
  assert.deepEqual(body.whatsapp, { on: false, phone: "ok" });
  // The summary every other page uses, from the same rows: the Me card, the home and the badges agree with it.
  assert.equal(body.played.games, body.passport.numbers.games);
  assert.equal(body.played.people, 2);
  assert.deepEqual(body.played.toReview, ["t2"], "played at Box Arena, reviewed only Turf One");
  assert.deepEqual(body.played.medals, ["first-game", "first-host", "first-review"]);
  assert.deepEqual(seen.whatsapp, [[ME, null]], "read, never changed");
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /acc-/, "no account ids");
  assert.equal((text.match(/\+91\d{10}/g) ?? []).length, 1, "the one number is the one its owner shares");
  assert.doesNotMatch(text, /host_phone|email/);
});

test("passport: before the migration, the list without usernames or numbers, and no switch", async () => {
  const { d } = deps({ extras: "missing", whatsapp: { missing: true } });
  const body = (await (await getPassport(get("/api/me/passport"), d)).json()) as PassportResponse;
  assert.equal(body.whatsapp, null);
  assert.ok(body.playedWith.length === 2 && body.playedWith.every((p) => p.username === null && p.whatsapp === null));
  assert.doesNotMatch(JSON.stringify(body), /\+91/);
});

test("passport and played: signed out gets the sign-in reply; a failed read is 503, never an empty passport", async () => {
  for (const handler of [getPassport, getPlayed]) {
    const out = await handler(get("/x"), deps({ who: "out" }).d);
    assert.equal(out.status, 401);
    const down = await handler(get("/x"), deps({ fail: true }).d);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { error: "unavailable" });
  }
});

test("played: the latest day per turf, the streak, the counts, the medals and what to review", async () => {
  const { d, seen } = deps();
  const res = await getPlayed(get("/api/me/played"), d);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = (await res.json()) as PlayedResponse;
  assert.deepEqual(body.turfs, { t1: "2026-10-21", t2: "2026-10-28" });
  assert.equal(body.games, 2);
  assert.equal(body.people, 2, "Ravi and Priya: Kiran's and Neha's games didn't happen");
  assert.equal(body.sports, 1);
  assert.equal(body.streak.current, 2);
  assert.equal(body.streak.thisWeek, true);
  assert.deepEqual(body.medals, ["first-game", "first-host", "first-review"], "earned, best first (one tier: the catalog's order)");
  assert.deepEqual(body.toReview, ["t2"]);
  assert.deepEqual(seen.rosters, [["g1", "g2"]], "the played games' rosters, to count");
  assert.deepEqual(seen.people, [], "nobody's name is read");
  assert.doesNotMatch(JSON.stringify(body), /acc-/, "and no ids go back");
});

test("whatsapp: on or off for the caller only; refused without a proved number; not there yet before the migration", async () => {
  const ok = deps();
  let res = await patchWhatsapp(patch(JSON.stringify({ on: true })), ok.d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { whatsapp: { on: true, phone: "ok" } });
  assert.deepEqual(ok.seen.whatsapp, [[ME, true]]);

  for (const bad of ["", "{", "[]", JSON.stringify({ on: "yes" }), JSON.stringify({ on: true, user_id: "acc-ravi" }), "x".repeat(300)]) {
    const b = deps();
    res = await patchWhatsapp(patch(bad), b.d);
    assert.equal(res.status, 400, bad.slice(0, 30));
    assert.deepEqual(b.seen.whatsapp, [], "nothing changed");
  }

  res = await patchWhatsapp(patch(JSON.stringify({ on: true })), deps({ whatsapp: { refused: { on: false, phone: "unproven" } } }).d);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { whatsapp: { on: false, phone: "unproven" }, error: "not_allowed" });

  res = await patchWhatsapp(patch(JSON.stringify({ on: true })), deps({ whatsapp: { missing: true } }).d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { whatsapp: null });

  res = await patchWhatsapp(patch(JSON.stringify({ on: false })), deps({ whatsapp: { unavailable: true } }).d);
  assert.equal(res.status, 503);

  res = await patchWhatsapp(patch(JSON.stringify({ on: true })), deps({ who: "out" }).d);
  assert.equal(res.status, 401);
});
