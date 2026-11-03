// Applies 20261103_game_other_venue.sql (twice) to an in-memory Postgres (PGlite)
// built by games_lockdown.db.mjs, with both games lockdown files and
// 20261102_game_series.sql applied first (as production is) and a stand-in for
// pg_cron, next to a second database without it, and checks "other venue" end
// to end: the file changes exactly one column (the approved line) and is
// otherwise additive; it refuses to run without the games files; games made
// before it pass its checks; a turf game is made, edited, moved and repeated
// exactly as before (the same answers and rows as the database without it);
// a game at a typed venue is made (words collapsed, the empty ones null, no
// turf), and refused with neither, both, part of a venue, a bad map link, or a
// phone number, link or email in its words; the table's own checks hold for
// direct writes too; every case in lib/games/otherVenue.cases.json is taken or
// refused as lib/games/otherVenue.ts takes it; a repeat at a typed venue puts
// its games up with the venue copied, now and at the daily top-up; moving a
// typed venue's game to a TapTurf turf clears the venue, and a turf game can
// move to a typed venue (who is told, in what words); the site owner's list of
// typed venues (and no one else's); grants. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_other_venue.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261103_game_other_venue.sql`;
const CASES = JSON.parse(fs.readFileSync(path.join(M, "../../lib/games/otherVenue.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const refused = async (p, re, w) => { await assert.rejects(p, re, w); passed++; };

/* ---------------- the file itself ---------------- */
const sql = fs.readFileSync(FILE, "utf8");
const APPROVED = "alter table public.games alter column turf_id drop not null;";
const dropLines = sql.split("\n").filter((l) => /drop/i.test(l));
eq(dropLines, [APPROVED], "the word drop is on one line only: the statement the owner approved, as written");
ok(!/delete|truncate/i.test(sql), "written without the words delete and truncate (not even inside a word)");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications|users|turfs)\b/i.test(sql), "no table grant on a public table changes");
ok(!/(alter|create)\s+policy/i.test(sql), "no policy is made or changed");
ok(!/(insert\s+into|update)\s+public\.turfs\b/i.test(sql), "no turf is added or changed: a typed venue stays on its game");
ok(!/alter\s+table\s+private\.game_series\s+alter/i.test(sql), "private.game_series.turf_id is left as it is (not null)");

const CRON = `create schema if not exists cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;`;
const LOCK1 = fs.readFileSync(`${M}/20261030_games_lockdown.sql`, "utf8");
const LOCK2 = fs.readFileSync(`${M}/20261030_games_lockdown_step2.sql`, "utf8");
const SERIES = fs.readFileSync(`${M}/20261102_game_series.sql`, "utf8");

{
  const bare = await makeDb(PGlite);
  await bare.exec(CRON);
  await bare.exec(LOCK1);
  await bare.exec(LOCK2);
  await refused(bare.exec(sql), /apply 20261030_games_lockdown\.sql and 20261102_game_series\.sql first/, "without the repeats file it refuses");
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name like 'venue%'`)).rows[0].n, 0, "and changes nothing");
  eq((await bare.query(`select is_nullable from information_schema.columns where table_name = 'games' and column_name = 'turf_id'`)).rows[0].is_nullable, "NO", "(turf_id still not null there)");
  await bare.close();
}

/* ---------------- two databases: as production is now (OLD), and with this file (NEW) ---------------- */
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(5), MEERA = U(6);
const NIL = "00000000-0000-0000-0000-000000000000";
async function setUp() {
  const db = await makeDb(PGlite);
  await db.exec(CRON);
  await db.exec(LOCK1);
  await db.exec(LOCK2);
  await db.exec(SERIES);
  await db.exec(`insert into public.users (id, name, phone, profile_image_url) values
    ('${HOST}', 'Asha Rao', '+919000000001', 'https://lh3.example/asha'), ('${RAVI}', 'Ravi Kumar', '+919000000002', null),
    ('${PRIYA}', 'Priya Sharma', '+919000000003', null), ('${KIRAN}', 'Kiran Patil', '+919000000004', null),
    ('${OMAR}', 'Omar Shaikh', '+919000000005', null), ('${MEERA}', 'Meera Iyer', '+919000000006', null);
    insert into public.turfs (id, name, slug, city, area, is_active, sports) values
    ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'),
    ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', true, '["Football"]'),
    ('${T(3)}', 'Closed Turf', 'closed-turf', 'pune', 'Pashan', false, '["Football"]');`);
  return db;
}
const OLD = await setUp();
const NEW = await setUp();
const helpers = (db) => {
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
  return { q, one, rpc };
};
const N = helpers(NEW), O = helpers(OLD);
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const GAME = { sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00",
  price_per_player: 150, description: "Bring a dark tee.", turf_booked: true, host_phone: "+919800000001" };
const TURF_GAME = { ...GAME, turf_id: T(1) };
const VENUE = { venue_name: "  Shivaji   Maidan ", venue_address: "Behind Ganesh Temple,  Baner Road", venue_area: "  ", venue_city: "pune", venue_maps_url: "" };
const VENUE_GAME = { ...GAME, ...VENUE };

// Games made before the file (as production has): they must pass its checks.
const early = [];
for (const db of [OLD, NEW]) early.push((await helpers(db).rpc("game_create", [KEY, HOST, JSON.stringify({ ...TURF_GAME, date: ist(1) })])).r);
eq(early, ["ok", "ok"], "(a turf game made in each before the file)");
const policiesBefore = await N.q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`);
const grantsBefore = await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`);
const rowsBefore = await N.q(`select * from public.games order by id`);
const untouched = ["game_series_problem", "game_series_days", "game_series_tick", "game_series_stop", "game_series_mine", "game_series_public", "game_cancel", "game_request_send", "game_request_answer"];
const srcBefore = await N.q(`select proname, md5(prosrc) m from pg_proc where proname = any($1) order by 1`, [untouched]);

await NEW.exec(sql);
await NEW.exec(sql); // safe to run again
passed++;
eq(await N.q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`), policiesBefore, "every policy as it was");
eq(await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), grantsBefore, "every table grant as it was");
eq((await N.q(`select * from public.games order by id`)).map((g) => {
  const { venue_name, venue_address, venue_area, venue_city, venue_maps_url, ...rest } = g;
  ok([venue_name, venue_address, venue_area, venue_city, venue_maps_url].every((v) => v === null), "(the earlier game has no venue)");
  return rest;
}), rowsBefore, "the game made before is as it was, and passes the checks");
eq(await N.q(`select proname, md5(prosrc) m from pg_proc where proname = any($1) order by 1`, [untouched]), srcBefore, "the functions it doesn't name are as they were");
eq((await N.q(`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name in ('turf_id', 'venue_name', 'venue_address', 'venue_area', 'venue_city', 'venue_maps_url') order by 1`)),
  ["turf_id", "venue_address", "venue_area", "venue_city", "venue_maps_url", "venue_name"].map((c) => ({ column_name: c, is_nullable: "YES" })), "games: turf_id may be null; five venue columns");
eq((await N.one(`select is_nullable from information_schema.columns where table_schema = 'private' and table_name = 'game_series' and column_name = 'turf_id'`)).is_nullable, "NO", "private.game_series.turf_id is still not null");
eq((await N.q(`select conname from pg_constraint where conname in ('games_turf_or_venue', 'games_venue_fields', 'game_series_turf_or_venue', 'game_series_venue_fields', 'games_turf_id_fkey') order by 1`)).map((r) => r.conname),
  ["game_series_turf_or_venue", "game_series_venue_fields", "games_turf_id_fkey", "games_turf_or_venue", "games_venue_fields"], "the four checks, once each (run twice), and the turf's foreign key kept");

/* ---------------- a turf game: exactly as before ---------------- */
// The same calls on both databases; the answers and the rows they leave must match, but for ids and times.
const strip = (x) => {
  if (Array.isArray(x)) return x.map(strip);
  if (!x || typeof x !== "object") return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) {
    if (["id", "created_at", "updated_at", "game_id", "series_id", "stopped_at"].includes(k)) continue;
    if (k.startsWith("venue_")) { assert.equal(v, null, `${k} is null for a turf game`); continue; }
    out[k] = strip(v);
  }
  return out;
};
const turfCalls = [
  ["the host's turf game", HOST, TURF_GAME],
  ["at least", HOST, { sport: "Cricket", skill_level: "beginner", max_players: 22, date: ist(3), start_time: "07:00", end_time: "09:00", price_per_player: 0, turf_id: T(2).toUpperCase() }],
  ["a turf not listed", HOST, { ...TURF_GAME, turf_id: T(3) }],
  ["a turf not there", HOST, { ...TURF_GAME, turf_id: T(9) }],
  ["no turf", HOST, GAME],
  ["a null turf", HOST, { ...GAME, turf_id: null }],
  ["a bad turf id", HOST, { ...GAME, turf_id: "kings-turf" }],
  ["naming the host", HOST, { ...TURF_GAME, creator_id: RAVI }],
  ["a day past", HOST, { ...TURF_GAME, date: ist(-1) }],
  ["51 players", HOST, { ...TURF_GAME, max_players: 51 }],
  ["no sport", HOST, { ...TURF_GAME, sport: undefined }],
  ["an account not there", U(99), TURF_GAME],
];
for (const [what, user, body] of turfCalls) {
  const [a, b] = [await O.rpc("game_create", [KEY, user, JSON.stringify(body)]), await N.rpc("game_create", [KEY, user, JSON.stringify(body)])];
  eq(strip(b), strip(a), `game_create, ${what}: the same answer as before (${a.r}${a.field ? ` ${a.field}` : ""})`);
}
eq([(await N.rpc("game_create", ["wrong", HOST, JSON.stringify(TURF_GAME)])).r, (await N.rpc("game_create", [KEY, null, JSON.stringify(TURF_GAME)])).r], ["unavailable", "bad"], "the server key and the host, as before");
// Ten single games a day, then the limit (two made above, one before the file): the same on both.
const limits = [];
for (const db of [O, N]) {
  const rs = [];
  for (let i = 0; i < 9; i++) rs.push((await db.rpc("game_create", [KEY, HOST, JSON.stringify({ ...TURF_GAME, date: ist(4) })])).r);
  limits.push(rs);
}
eq(limits[1], limits[0], `the daily limit as before: ${limits[0].join(" ")}`);
ok(limits[1].at(-1) === "limit" && limits[1].includes("ok"), "(it ends at the limit)");
const rowsOf = async (db, host) => strip(await helpers(db).q(`select * from public.games where creator_id = $1 order by date, start_time, sport, created_at`, [host]));
eq(await rowsOf(NEW, HOST), await rowsOf(OLD, HOST), "and the rows they made are the same");
// An edit and a move, on both.
const firstOf = async (db, host) => (await helpers(db).one(`select id from public.games where creator_id = $1 and date = $2 order by created_at limit 1`, [host, ist(2)])).id;
for (const [what, changes, notice] of [
  ["an edit", { max_players: 12, description: "  Studs fine " }, null],
  ["a move", { turf_id: T(2), turf_booked: false }, null],
  ["a move with the route's words", { turf_id: T(1) }, { title: "Venue changed", message: "Asha moved Football to Kings Turf, Baner" }],
  ["a move to a turf not listed", { turf_id: T(3) }, null],
  ["a venue for a game", { turf_id: T(2), max_players: 1 }, null],
]) {
  const ans = [];
  for (const db of [OLD, NEW]) {
    const h = helpers(db);
    const id = await firstOf(db, HOST);
    if (what === "a move") {
      const ask = await h.rpc("game_request_send", [KEY, RAVI, id, null]);
      await h.rpc("game_request_answer", [KEY, HOST, ask.request.id, true]);
      await h.rpc("game_request_send", [KEY, PRIYA, id, "Keeper"]);
    }
    ans.push(strip(await h.rpc("game_update", [KEY, HOST, id, JSON.stringify(changes), notice ? JSON.stringify(notice) : null])));
  }
  eq(ans[1], ans[0], `game_update, ${what}: the same answer as before`);
}
const notes = async (db) => strip(await helpers(db).q(`select user_id, type, title, message, metadata - 'gameId' m from public.notifications where type = 'game_venue_changed' order by created_at, user_id`));
eq(await notes(NEW), await notes(OLD), "and the same players told, in the same words");
eq((await notes(NEW)).length, 4, "(two moves, two players each)");
// A turf repeat, on both.
const W = dowOf(ist(1));
const weekly = (days, ends = { type: "never" }) => ({ rule: { freq: "weekly", interval: 1, days }, ends });
const series = [];
for (const db of [OLD, NEW]) series.push(strip(await helpers(db).rpc("game_series_create", [KEY, OMAR, JSON.stringify({ ...TURF_GAME, date: ist(1) }), JSON.stringify(weekly([W, (W + 3) % 7]))])));
eq(series[1], series[0], "a turf repeat: the same series and games as before");
eq(series[1].made, 8, "(8 up)");
eq(strip(await N.rpc("game_series_create", [KEY, OMAR, JSON.stringify({ ...TURF_GAME, date: ist(1), turf_id: T(3) }), JSON.stringify(weekly([W]))])),
  strip(await O.rpc("game_series_create", [KEY, OMAR, JSON.stringify({ ...TURF_GAME, date: ist(1), turf_id: T(3) }), JSON.stringify(weekly([W]))])), "a repeat at a turf not listed: refused as before (venue)");
const turfSeries = (await N.one(`select id, turf_id from private.game_series where host_id = $1`, [OMAR]));
eq(turfSeries.turf_id, T(1), "a turf repeat keeps its turf");
await NEW.query(`update public.turfs set is_active = false where id = $1`, [T(1)]);
eq((await N.one(`select private.game_series_fill($1, $2::timestamptz) n`, [turfSeries.id, new Date(Date.now() + 7 * 86400000).toISOString()])).n, 0, "a turf repeat still waits while its turf is not listed");
await NEW.query(`update public.turfs set is_active = true where id = $1`, [T(1)]);

/* ---------------- a game at a typed venue ---------------- */
await NEW.query(`delete from private.test_dirty`);
const v1 = await N.rpc("game_create", [KEY, PRIYA, JSON.stringify(VENUE_GAME)]);
eq(v1.r, "ok", "a host makes a game at a venue not on TapTurf");
const g1 = v1.game;
eq([g1.turf_id, g1.venue_name, g1.venue_address, g1.venue_area, g1.venue_city, g1.venue_maps_url],
  [null, "Shivaji Maidan", "Behind Ganesh Temple, Baner Road", null, "pune", null], "no turf; the words with spaces collapsed, the empty ones null");
ok(g1.creator_id === PRIYA && g1.status === "open" && g1.current_players === 1 && g1.title === "Football Game" && g1.host_name === "Priya Sharma" && g1.turf_booked === true,
  "made as any game: open, 1 player, the host's name from the account");
eq((await N.q(`select user_id from public.game_participants where game_id = $1`, [g1.id])).map((r) => r.user_id), [PRIYA], "the host is its first player");
eq((await N.q(`select distinct key from private.test_dirty order by 1`)).map((r) => r.key), ["games"], "the cache: /games is marked, no turf page");
const v2 = await N.rpc("game_create", [KEY, PRIYA, JSON.stringify({ ...GAME, venue_name: "Wai Ground", venue_address: "Near the bus stand, Wai", venue_area: "Ganpati Ali", venue_city: "Wai",
  venue_maps_url: " https://maps.app.goo.gl/AbCd123 " })]);
eq([v2.r, v2.game.venue_area, v2.game.venue_city, v2.game.venue_maps_url], ["ok", "Ganpati Ali", "Wai", "https://maps.app.goo.gl/AbCd123"], "with an area, a town TapTurf has no turfs in, and a map link");
eq((await N.rpc("game_create", [KEY, PRIYA, JSON.stringify({ ...GAME, venue_name: "Wai Ground", venue_address: "Near the bus stand", venue_city: "Wai" })])).r, "ok", "the area and the link may be left out");

const venueBads = [
  ["neither a turf nor a venue", GAME, "body"],
  ["both", { ...VENUE_GAME, turf_id: T(1) }, "venue_name"],
  ["no name", { ...GAME, venue_address: "Baner Road", venue_city: "pune" }, "venue_name"],
  ["no address", { ...GAME, venue_name: "Shivaji Maidan", venue_city: "pune" }, "venue_address"],
  ["no city", { ...GAME, venue_name: "Shivaji Maidan", venue_address: "Baner Road" }, "venue_city"],
  ["only an area", { ...GAME, venue_area: "Baner" }, "venue_name"],
  ["a null name", { ...VENUE_GAME, venue_name: null }, "venue_name"],
  ["a name of 1", { ...VENUE_GAME, venue_name: " K " }, "venue_name"],
  ["a name of 81", { ...VENUE_GAME, venue_name: "x".repeat(81) }, "venue_name"],
  ["an address of 4", { ...VENUE_GAME, venue_address: "Pune" }, "venue_address"],
  ["a phone number in the name", { ...VENUE_GAME, venue_name: "Shivaji 98220 12345" }, "venue_name"],
  ["a phone number with dashes", { ...VENUE_GAME, venue_name: "Call 020-2567-8901" }, "venue_name"],
  ["a link in the name", { ...VENUE_GAME, venue_name: "shivajimaidan.in" }, "venue_name"],
  ["an email in the name", { ...VENUE_GAME, venue_name: "asha@example.org" }, "venue_name"],
  ["a phone number in the address", { ...VENUE_GAME, venue_address: "Baner, ring 9822012345" }, "venue_address"],
  ["a link in the area", { ...VENUE_GAME, venue_area: "www.baner" }, "venue_area"],
  ["an http map link", { ...VENUE_GAME, venue_maps_url: "http://maps.app.goo.gl/AbCd" }, "venue_maps_url"],
  ["a javascript link", { ...VENUE_GAME, venue_maps_url: "javascript:alert(1)" }, "venue_maps_url"],
  ["another site's link", { ...VENUE_GAME, venue_maps_url: "https://example.com/maps" }, "venue_maps_url"],
  ["a look-alike host", { ...VENUE_GAME, venue_maps_url: "https://google.com.evil.example/maps" }, "venue_maps_url"],
  ["a link of 301", { ...VENUE_GAME, venue_maps_url: `https://maps.app.goo.gl/${"a".repeat(277)}` }, "venue_maps_url"],
  ["a number for a link", { ...VENUE_GAME, venue_maps_url: 5 }, "venue_maps_url"],
];
const venueCount = async () => (await N.one(`select count(*)::int n from public.games where turf_id is null`)).n;
const madeSoFar = await venueCount();
for (const [what, body, field] of venueBads) {
  const a = await N.rpc("game_create", [KEY, PRIYA, JSON.stringify(body)]);
  eq([a.r, a.field], ["bad", field], `game_create refuses ${what} (${field})`);
}
eq(await venueCount(), madeSoFar, "and makes nothing for any of them");

/* ---------------- the shared cases (lib/games/otherVenue.ts takes the same) ---------------- */
for (const c of CASES.fields) {
  const r = await N.one(`select private.game_field_problem(jsonb_build_object($1::text, $2::jsonb), array[$1::text]) p`, [c.key, JSON.stringify(c.value)]);
  eq(r.p === null, c.ok, `case: ${c.what}`);
}

/* ---------------- the table's own checks, for any writer ---------------- */
const insert = (cols) => NEW.query(`insert into public.games (creator_id, title, sport, max_players, date, start_time, end_time, price_per_player, ${Object.keys(cols).join(", ")})
  values ('${HOST}', 'x', 'Football', 10, '${ist(2)}', '19:00', '20:00', 0, ${Object.keys(cols).map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(cols));
await refused(insert({ description: "none" }), /games_turf_or_venue/, "a row with neither a turf nor a venue is refused");
await refused(insert({ turf_id: T(1), venue_name: "Shivaji Maidan" }), /games_turf_or_venue/, "a row with both");
await refused(insert({ venue_name: "Shivaji Maidan", venue_address: "Baner Road" }), /games_turf_or_venue/, "a venue with no city");
await refused(insert({ venue_name: "S", venue_address: "Baner Road", venue_city: "pune" }), /games_venue_fields/, "a name of 1");
await refused(insert({ venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune", venue_maps_url: "http://maps.app.goo.gl/x" }), /games_venue_fields/, "an http map link");
await refused(insert({ venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune", venue_maps_url: "https://maps.app.goo.gl/a\"b" }), /games_venue_fields/, "a quote in the map link");
await insert({ venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune", venue_maps_url: "https://www.google.com/maps/place/x" });
passed++;
await refused(NEW.query(`update public.games set venue_name = 'x y' where id = $1`, [(await N.one(`select id from public.games where turf_id is not null limit 1`)).id]), /games_turf_or_venue/, "a turf game can't be given a venue as well");
await refused(NEW.query(`insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player, rule, starts_on)
  values ($1, $2, 'Football', 'all', 10, '19:00', '20:00', 0, '{}', $3)`, [HOST, NIL, ist(2)]), /game_series_turf_or_venue/, "a series with the no-turf marker and no venue is refused");
await refused(NEW.query(`insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player, rule, starts_on, venue_name, venue_address, venue_city)
  values ($1, $2, 'Football', 'all', 10, '19:00', '20:00', 0, '{}', $3, 'Shivaji Maidan', 'Baner Road', 'pune')`, [HOST, T(1), ist(2)]), /game_series_turf_or_venue/, "a series with a turf and a venue");

/* ---------------- a repeat at a typed venue ---------------- */
const START = ist(1);
const SW = dowOf(START);
const vs = await N.rpc("game_series_create", [KEY, MEERA, JSON.stringify({ ...VENUE_GAME, date: START, venue_maps_url: "https://maps.app.goo.gl/Xy9" }), JSON.stringify(weekly([SW, (SW + 2) % 7]))]);
eq([vs.r, vs.made], ["ok", 8], "a host starts a weekly repeat at a typed venue: 8 games go up");
eq([vs.series.turf_id, vs.series.venue_name, vs.series.venue_address, vs.series.venue_area, vs.series.venue_city, vs.series.venue_maps_url],
  [null, "Shivaji Maidan", "Behind Ganesh Temple, Baner Road", null, "pune", "https://maps.app.goo.gl/Xy9"], "its series reads with no turf and the venue");
eq((await N.one(`select turf_id from private.game_series where id = $1`, [vs.series.id])).turf_id, NIL, "(kept with the no-turf marker in the not-null column)");
const vGames = async () => N.q(`select turf_id, venue_name, venue_address, venue_area, venue_city, venue_maps_url, turf_booked, date::text d from public.games where series_id = $1 order by date`, [vs.series.id]);
ok((await vGames()).every((g) => g.turf_id === null && g.venue_name === "Shivaji Maidan" && g.venue_address === "Behind Ganesh Temple, Baner Road" && g.venue_area === null
  && g.venue_city === "pune" && g.venue_maps_url === "https://maps.app.goo.gl/Xy9"), "every game carries the venue, none a turf");
eq((await vGames()).map((g) => g.turf_booked), [true, false, false, false, false, false, false, false], "the host's \"booked\" on the first only, as for a turf");
const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString();
eq((await N.one(`select private.game_series_fill($1, $2::timestamptz) n`, [vs.series.id, inAWeek])).n, 2, "a week on, the daily top-up puts up the next two");
const topped = (await vGames()).slice(-2);
ok(topped.every((g) => g.turf_id === null && g.venue_name === "Shivaji Maidan" && g.venue_city === "pune" && g.venue_maps_url === "https://maps.app.goo.gl/Xy9"), "with the venue copied");
await NEW.query(`update public.turfs set is_active = false`);
const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString();
eq((await N.one(`select private.game_series_fill($1, $2::timestamptz) n`, [vs.series.id, inTwoWeeks])).n, 2, "with no turf listed at all, a typed venue's repeat still tops up: it waits for no listing");
await NEW.query(`update public.turfs set is_active = true where id <> $1`, [T(3)]);
const mineList = await N.rpc("game_series_mine", [KEY, MEERA]);
eq([mineList.series[0].turf_id, mineList.series[0].venue_name, mineList.series[0].upcoming], [null, "Shivaji Maidan", 12], "the host's list names the venue");
ok(!("host_phone" in mineList.series[0]) && !("host_id" in mineList.series[0]), "and still no number or account id");
eq((await N.rpc("game_series_create", [KEY, MEERA, JSON.stringify({ ...VENUE_GAME, date: START, turf_id: T(1) }), JSON.stringify(weekly([SW]))])).field, "venue_name", "a repeat with a turf and a venue is refused");
eq((await N.rpc("game_series_create", [KEY, MEERA, JSON.stringify({ ...GAME, date: START, venue_name: "Shivaji 9822012345", venue_address: "Baner Road", venue_city: "pune" }), JSON.stringify(weekly([SW]))])).field, "venue_name", "and a number in its name");
eq((await N.one(`select count(*)::int n from private.game_series where host_id = $1`, [MEERA])).n, 1, "(neither is saved)");
const stopV = await N.rpc("game_series_stop", [KEY, MEERA, vs.series.id, false]);
eq([stopV.r, stopV.series.turf_id, stopV.series.venue_name], ["ok", null, "Shivaji Maidan"], "stopping it answers with the venue");

/* ---------------- moves ---------------- */
await NEW.query(`delete from public.notifications`);
const ask1 = await N.rpc("game_request_send", [KEY, RAVI, g1.id, null]);
await N.rpc("game_request_answer", [KEY, PRIYA, ask1.request.id, true]);
await N.rpc("game_request_send", [KEY, KIRAN, g1.id, "Keeper"]);
await NEW.query(`delete from public.notifications`);
eq((await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ turf_id: T(3) }), null])).r, "venue", "moving a typed venue's game to a turf not listed is refused");
const toTurf = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ turf_id: T(1), turf_booked: false }), null]);
eq([toTurf.r, toTurf.notified, toTurf.game.turf_id, toTurf.game.turf_booked], ["ok", 2, T(1), false], "the host moves it to a TapTurf turf: the two players are told");
eq([toTurf.game.venue_name, toTurf.game.venue_address, toTurf.game.venue_area, toTurf.game.venue_city, toTurf.game.venue_maps_url], [null, null, null, null, null], "and the typed venue is cleared");
eq((await N.q(`select user_id, message, metadata from public.notifications where type = 'game_venue_changed' order by user_id`)),
  [RAVI, KIRAN].sort().map((u) => ({ user_id: u, message: "Your game moved to Kings Turf", metadata: { gameId: g1.id, turfId: T(1), fromTurfId: null } })), "in the database's words, from no turf");
await NEW.query(`delete from public.notifications`);
const toVenue = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ venue_name: " Shivaji  Maidan", venue_address: "Behind Ganesh Temple, Baner Road", venue_city: "pune", venue_area: "Baner" }),
  JSON.stringify({ title: "Venue changed", message: "Priya moved Football to Shivaji Maidan, Baner" })]);
eq([toVenue.r, toVenue.notified, toVenue.game.turf_id, toVenue.game.venue_name, toVenue.game.venue_area, toVenue.game.venue_maps_url], ["ok", 2, null, "Shivaji Maidan", "Baner", null],
  "the host moves it back off TapTurf to a typed venue: no turf, the venue, the players told");
eq((await N.q(`select message, metadata from public.notifications where type = 'game_venue_changed' limit 1`))[0],
  { message: "Priya moved Football to Shivaji Maidan, Baner", metadata: { gameId: g1.id, turfId: null, fromTurfId: T(1) } }, "in the route's words");
await NEW.query(`delete from public.notifications`);
const areaOnly = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ venue_name: "Shivaji Maidan", venue_address: "behind ganesh temple, baner road", venue_city: "pune", venue_area: "Baner Gaon", venue_maps_url: "https://maps.app.goo.gl/Qq1" }), null]);
eq([areaOnly.r, areaOnly.notified, areaOnly.game.venue_area, areaOnly.game.venue_address, areaOnly.game.venue_maps_url], ["ok", 0, "Baner Gaon", "behind ganesh temple, baner road", "https://maps.app.goo.gl/Qq1"],
  "only the area, the case or the map link: saved, and no one is told");
const other = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ venue_name: "Balewadi Ground", venue_address: "Balewadi High Street", venue_city: "pune" }), null]);
eq([other.notified, (await N.one(`select message from public.notifications where type = 'game_venue_changed' limit 1`)).message, other.game.venue_area, other.game.venue_maps_url],
  [2, "Your game moved to Balewadi Ground", null, null], "another typed place is a move (the database's words); what it leaves out is cleared");
const plain = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify({ max_players: 14 }), null]);
eq([plain.r, plain.game.max_players, plain.game.turf_id, plain.game.venue_name], ["ok", 14, null, "Balewadi Ground"], "an edit that moves nothing keeps the venue");
for (const [what, changes, field] of [
  ["a turf and a venue at once", { turf_id: T(2), venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune" }, "venue_name"],
  ["part of a venue", { venue_name: "Shivaji Maidan" }, "venue_address"],
  ["a number in the venue's name", { venue_name: "Shivaji 9822012345", venue_address: "Baner Road", venue_city: "pune" }, "venue_name"],
  ["a bad map link", { venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune", venue_maps_url: "https://evil.example" }, "venue_maps_url"],
]) {
  const a = await N.rpc("game_update", [KEY, PRIYA, g1.id, JSON.stringify(changes), null]);
  eq([a.r, a.field], ["bad", field], `game_update refuses ${what}`);
}
eq((await N.rpc("game_update", [KEY, RAVI, g1.id, JSON.stringify({ turf_id: T(2) }), null])).r, "not_host", "only the host moves it");
const turfToVenue = await N.rpc("game_update", [KEY, HOST, await firstOf(NEW, HOST), JSON.stringify({ venue_name: "Shivaji Maidan", venue_address: "Baner Road", venue_city: "pune" }), null]);
eq([turfToVenue.r, turfToVenue.game.turf_id, turfToVenue.game.venue_name], ["ok", null, "Shivaji Maidan"], "a turf game moves to a typed venue");
ok((await N.q(`select message from public.notifications where type = 'game_venue_changed' and metadata ->> 'gameId' = $1`, [turfToVenue.game.id])).every((n) => n.message === "Your game moved to Shivaji Maidan"),
  "its players told where");

/* ---------------- the site owner's list ---------------- */
await N.rpc("game_create", [KEY, RAVI, JSON.stringify({ ...GAME, venue_name: "shivaji maidan", venue_address: "Baner Road, Pune", venue_city: "pune", venue_area: "Baner" })]);
await refused(N.q(`select * from public.admin_typed_venues(null)`), /not allowed/, "only the site owner reads the typed venues");
await NEW.query(`set test.owner = 'yes'`);
const listed = await N.q(`select * from public.admin_typed_venues('token')`);
await NEW.query(`set test.owner = 'no'`);
eq(Object.keys(listed[0]).sort(), ["games", "hosts", "last_day", "last_posted", "venue_area", "venue_city", "venue_name"], "name, area, city, games, hosts, when: no address, no host, no number");
const shivaji = listed.find((r) => r.venue_name.toLowerCase() === "shivaji maidan");
eq([listed[0].venue_name.toLowerCase(), Number(shivaji.games), Number(shivaji.hosts), shivaji.venue_city], ["shivaji maidan", 15, 3, "pune"],
  "one row per name and city whatever the case, the most used first (Meera's repeat's 12, Ravi's, Asha's written one and her moved one; Priya's moved off it: 15 games, 3 hosts)");
ok(listed.some((r) => r.venue_name === "Wai Ground" && r.venue_city === "Wai" && Number(r.games) === 2), "a town TapTurf has no turfs in, counted too");
ok(!listed.some((r) => r.venue_name === "Kings Turf"), "TapTurf turfs are not in it");

/* ---------------- grants ---------------- */
for (const fn of ["game_create", "game_update", "game_series_create", "admin_typed_venues"]) {
  const r = await N.one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [fn]);
  eq([r.a, r.b, r.p, r.prosecdef, String(r.proconfig).includes("search_path=")], [true, true, false, true, true], `${fn}: anon and authenticated may call it, PUBLIC not; definer, empty search_path`);
}
for (const fn of ["game_venue_text", "game_venue_text_ok", "game_venue_maps_ok", "game_venue_problem", "game_series_no_turf", "game_field_problem", "game_series_fill", "game_series_json"]) {
  const r = await N.one(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) a, bool_or(has_function_privilege('authenticated', p.oid, 'execute')) b, bool_and(proconfig::text like '%search_path=%') s
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq([r.a, r.b, r.s], [false, false, true], `private.${fn}: closed to the API roles, empty search_path`);
}
const anonRead = await NEW.query(`set role anon`).then(() => N.q(`select venue_name, venue_city from public.games where id = $1`, [g1.id])).finally(() => NEW.query(`reset role`));
eq(anonRead, [{ venue_name: "Balewadi Ground", venue_city: "pune" }], "anyone reads a typed venue, as a game's turf (the browser's table read)");
await refused(NEW.query(`set role anon`).then(() => NEW.query(`update public.games set venue_name = 'x'`)).finally(() => NEW.query(`reset role`)), /permission denied/, "the browser still cannot write a game");

await OLD.close();
await NEW.close();
console.log(`game_other_venue: ${passed} checks passed`);
