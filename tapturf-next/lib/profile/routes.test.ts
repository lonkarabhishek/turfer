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

test("passport: the games they were tagged in and never answered about (Did you play?)", async () => {
  const TID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const row = (n: number, date: string, o: Record<string, unknown> = {}) => ({ game_id: TID(n), sport: "Football", date, start_time: "19:00", end_time: "20:00", venue: "Kings Turf", host: "Ravi", ...o });
  const { d } = deps();
  // Before 20261118_game_tags_shown.sql (no such read), and when it can't say: no card, the passport as it was.
  assert.deepEqual(((await (await getPassport(get("/api/me/passport"), d)).json()) as PassportResponse).tagged, []);
  for (const tagged of [async () => null, async () => { throw new Error("down"); }]) {
    const res = await getPassport(get("/api/me/passport"), { ...d, tagged });
    assert.equal(res.status, 200, "a failed read of the card never holds the passport up");
    assert.deepEqual(((await res.json()) as PassportResponse).tagged, []);
  }
  const asked: string[] = [];
  const res = await getPassport(get("/api/me/passport"), {
    ...d,
    tagged: async (id) => {
      asked.push(id);
      // 1 Nov 2026, 6 PM in India: yesterday's game, one three weeks ago, tonight's (not over), one 91 days ago.
      return [row(2, "2026-10-10"), row(1, "2026-10-31", { phone: "+919800000009" }), row(3, "2026-11-01"), row(4, "2026-08-02"), { game_id: "g1", date: "2026-10-21" }];
    },
  });
  const body = (await res.json()) as PassportResponse;
  assert.deepEqual(asked, [ME], "for the verified caller only");
  assert.deepEqual(body.tagged, [
    { gameId: TID(1), sport: "Football", venue: "Kings Turf", date: "2026-10-31", start_time: "19:00", end_time: "20:00", host: "Ravi" },
    { gameId: TID(2), sport: "Football", venue: "Kings Turf", date: "2026-10-10", start_time: "19:00", end_time: "20:00", host: "Ravi" },
  ], "over and within 90 days, newest first, these keys only");
  assert.equal(body.passport.numbers.games, 2, "none of them counts for anything until they say yes");
  assert.doesNotMatch(JSON.stringify(body), /98000000/);
});

test("played and passport: the caller's best medal goes to the database for their badge, and never holds a reply up", async () => {
  for (const handler of [getPlayed, getPassport]) {
    const sent: [string, string[]][] = [];
    const { d } = deps();
    const res = await handler(get("/x"), { ...d, badge: (id, medals) => void sent.push([id, [...medals]]) });
    assert.equal(res.status, 200);
    assert.deepEqual(sent, [[ME, ["first-game", "first-host", "first-review"]]], "the verified caller's own earned medals, best first, once");
    // A send that throws changes nothing about the answer.
    const boom = await handler(get("/x"), { ...d, badge: () => { throw new Error("down"); } });
    assert.equal(boom.status, 200);
    assert.deepEqual(await boom.json(), await (await handler(get("/x"), d)).json(), "the same body as without it");
    // Signed out, or a read that failed: nothing is sent.
    sent.length = 0;
    await handler(get("/x"), { ...deps({ who: "out" }).d, badge: (id, medals) => void sent.push([id, [...medals]]) });
    await handler(get("/x"), { ...deps({ fail: true }).d, badge: (id, medals) => void sent.push([id, [...medals]]) });
    assert.deepEqual(sent, []);
  }
});

test("passport: the medal on the photo of the people they played with, read beside their names", async () => {
  const asked: string[][] = [];
  const { d } = deps({ extras: "on" });
  const badges = async (ids: readonly string[]) => {
    asked.push([...ids]);
    return new Map([
      ["acc-ravi", { medal: "games-25", medals: 7, username: "ravi" }],
      // Kiran never played with them: never in the list, whatever comes back.
      ["acc-kiran", { medal: "games-5", medals: 2, username: "kiran" }],
    ]);
  };
  const body = (await (await getPassport(get("/api/me/passport"), { ...d, badges })).json()) as PassportResponse;
  assert.deepEqual(asked, [["acc-ravi", "acc-priya"]], "one read, for the people in the list");
  assert.deepEqual(body.playedWith.map((p) => [p.name, p.badge ?? null]), [
    ["Ravi Kumar", { medal: "games-25", medals: 7 }],
    ["Priya Sharma", null],
  ]);
  assert.doesNotMatch(JSON.stringify(body), /acc-/, "no account ids");
  // Before 20261121_player_badges.sql (null), or a read that fails: the list as it was.
  const plain = (await (await getPassport(get("/api/me/passport"), d)).json()) as PassportResponse;
  for (const b of [async () => null, async () => { throw new Error("down"); }]) {
    const res = await getPassport(get("/api/me/passport"), { ...d, badges: b });
    assert.equal(res.status, 200, "a failed badge read never holds the passport up");
    assert.deepEqual(((await res.json()) as PassportResponse).playedWith, plain.playedWith);
  }
  // The played read never asks about anyone's badge.
  asked.length = 0;
  await getPlayed(get("/api/me/played"), { ...d, badges });
  assert.deepEqual(asked, []);
});
