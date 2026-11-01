// Applies 20261102_game_series.sql (twice) to an in-memory Postgres (PGlite) built
// by games_lockdown.db.mjs, with both games lockdown files applied first (as
// production is) and a stand-in for pg_cron, and checks repeat games end to end:
// the recurrence maths against the cases lib/games/repeat.ts is checked against
// (lib/games/repeat.cases.json: weekly on several days, every 2 to 4 weeks,
// monthly on a date with the 31st in short months, the nth and the last weekday,
// ending on a date or after N), the days going by India's clock, the games each
// series puts up (as game_create makes a game, the host the first player, the
// turf booked on the first only), never a day twice (run again, a day later, a
// game moved), a game the host cancels holding no place (the next goes up), the
// limits (3 running, 5 a day, 30 series games a day, and game_create's 10 a day
// counting single games only), the server key and the host only, stopping with
// and without cancelling (who is told), the host's list (with what a stop would
// cancel), the public read, the daily job, grants, and that no grant or policy on
// a public table changes. Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_series.check.mjs supabase/migrations
// REPEAT_JS=<lib/games/repeat.js as npm run test:games builds it> also compares
// the TS maths with the database's on random rules.
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261102_game_series.sql`;
const CASES = JSON.parse(fs.readFileSync(path.join(M, "../../lib/games/repeat.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const refused = async (p, re, w) => { await assert.rejects(p, re, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
// Not even inside a word: "dropped", "deleted" and "truncated" are out too.
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications|users|turfs)\b/i.test(sql), "no table grant on a public table changes");
ok(!/(alter|create)\s+policy/i.test(sql), "no policy is made or changed");

const CRON = `create schema if not exists cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;`;
const LOCK1 = fs.readFileSync(`${M}/20261030_games_lockdown.sql`, "utf8");
const LOCK2 = fs.readFileSync(`${M}/20261030_games_lockdown_step2.sql`, "utf8");

{
  const bare = await makeDb(PGlite);
  await bare.exec(CRON);
  await refused(bare.exec(sql), /apply 20261030_games_lockdown\.sql first/, "without the games lockdown it refuses");
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name = 'series_id'`)).rows[0].n, 0, "and changes nothing");
  await bare.close();
}

const db = await makeDb(PGlite);
await db.exec(CRON);
await db.exec(LOCK1);
await db.exec(LOCK2);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const asRole = async (role, fn) => {
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); }
};
const createSrcBefore = (await one(`select prosrc from pg_proc where proname = 'game_create'`)).prosrc;
const policiesBefore = await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`);
const grantsBefore = await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`);

await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;
eq(await q(`select name, schedule, command from cron.jobs`), [{ name: "game-series-fill", schedule: "7 0 * * *", command: "select private.game_series_tick()" }], "the daily job (05:37 IST), scheduled once");
eq(await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`), policiesBefore, "every policy as it was");
eq(await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), grantsBefore, "every table grant as it was");
eq((await one(`select prosrc from pg_proc where proname = 'game_create'`)).prosrc,
  createSrcBefore.replace("where g.creator_id = p_user_id and g.created_at > now() - interval '1 day'", "where g.creator_id = p_user_id and g.series_id is null and g.created_at > now() - interval '1 day'"),
  "game_create is the lockdown's, but its daily count is of single games");
ok(createSrcBefore.includes("where g.creator_id = p_user_id and g.created_at > now() - interval '1 day'"), "(the line it changes)");

/* ---------------- the maths: the cases repeat.ts is checked against ---------------- */
const days = async (repeat, start) => {
  const e = repeat.ends;
  const last = e.type === "on" ? e.date : null;
  return (await q(`select day::text d from private.game_series_days($1::jsonb, $2::date, coalesce($3::date, $2::date + 365), $4::integer)`,
    [JSON.stringify(repeat.rule), start, last, e.type === "after" ? e.count : null])).map((r) => r.d);
};
const problem = async (repeat, start) => (await one(`select private.game_series_problem($1::jsonb, $2::date) p`, [JSON.stringify(repeat), start])).p;
for (const c of CASES.days) eq(await days(c.repeat, c.start), c.days, `days: ${c.what}`);
for (const c of CASES.problems) eq(await problem(c.repeat, c.start), c.problem, `problem: ${c.what}`);
eq(await problem({ rule: { freq: "weekly", interval: 1, days: [2] }, ends: { type: "never" } }, null), "repeat", "problem: no first day");

if (process.env.REPEAT_JS) {
  const mod = await import(path.resolve(process.env.REPEAT_JS));
  const R = mod.default ?? mod;
  let seed = 20261102;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const plus = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  let same = 0;
  for (let i = 0; i < 300; i++) {
    const start = plus("2026-11-01", rnd(800));
    const rule = rnd(2) === 0
      ? { freq: "weekly", interval: 1 + rnd(4), days: [...new Set(Array.from({ length: 1 + rnd(7) }, () => rnd(7)))] }
      : R.monthlyChoices(start)[rnd(R.monthlyChoices(start).length)];
    const k = rnd(3);
    const ends = k === 0 ? { type: "never" } : k === 1 ? { type: "on", date: plus(start, rnd(366)) } : { type: "after", count: 2 + rnd(51) };
    const repeat = { rule, ends };
    assert.deepEqual(await days(repeat, start), R.seriesDays(repeat, start), JSON.stringify({ start, repeat }));
    // And a bent one, for the refusals: a field off by a little.
    const bent = JSON.parse(JSON.stringify(repeat));
    const b = rnd(6);
    if (b === 0) bent.rule.interval = rnd(7) - 1;
    else if (b === 1 && bent.rule.days) bent.rule.days.push(rnd(9));
    else if (b === 2 && bent.rule.freq === "monthly") bent.rule[bent.rule.by === "date" ? "day" : "nth"] += rnd(3) - 1;
    else if (b === 3) bent.ends = { type: "after", count: rnd(60) };
    else if (b === 4) bent.ends = { type: "on", date: plus(start, rnd(400) - 20) };
    for (const r of [repeat, bent]) assert.equal(await problem(r, start), R.repeatProblem(r, start), JSON.stringify({ start, r }));
    same++;
  }
  eq(same, 300, "repeat.ts and the database agree on 300 random series (their days, and refusals of bent ones)");
}

/* ---------------- people, turfs and helpers (made up) ---------------- */
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(6), NEHA = U(5);
await q(`insert into public.users (id, name, phone, profile_image_url) values
  ('${HOST}', 'Asha Rao', '+919000000001', 'https://lh3.example/asha'), ('${RAVI}', 'Ravi Kumar', '+919000000002', null),
  ('${PRIYA}', 'Priya Sharma', '+919000000003', null), ('${KIRAN}', 'Kiran Patil', '+919000000004', null), ('${OMAR}', 'Omar Shaikh', '+919000000006', null), ('${NEHA}', 'Neha Joshi', '+919000000005', null)`);
await q(`insert into public.turfs (id, name, slug, city, area, is_active, sports) values
  ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'),
  ('${T(3)}', 'Closed Turf', 'closed-turf', 'pune', 'Pashan', false, '["Football"]')`);
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const plusDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const create = (user, game, repeat, key = KEY) => rpc("game_series_create", [key, user, JSON.stringify(game), JSON.stringify(repeat)]);
const stop = (user, id, cancel = false, key = KEY) => rpc("game_series_stop", [key, user, id, cancel]);
const mine = (user, key = KEY) => rpc("game_series_mine", [key, user]);
const fill = async (id, at = null) => (await one(`select private.game_series_fill($1, coalesce($2::timestamptz, now())) n`, [id, at])).n;
const gamesOf = (id) => q(`select g.*, g.date::text d from public.games g where g.series_id = $1 order by g.date`, [id]);
const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, start_time: "19:00", end_time: "20:00",
  price_per_player: 150, description: "Bring a dark tee.", turf_booked: true, host_phone: "+919800000001" };
const weekly = (days, ends = { type: "never" }, interval = 1) => ({ rule: { freq: "weekly", interval, days }, ends });

/* ---------------- the server key ---------------- */
const SOME = "cccccccc-cccc-4ccc-8ccc-000000000001";
const START = ist(1);
const W = dowOf(START);
for (const [fn, args] of [["game_series_create", [HOST, JSON.stringify({ ...GAME, date: START }), JSON.stringify(weekly([W]))]], ["game_series_stop", [HOST, SOME, false]], ["game_series_mine", [HOST]]]) {
  eq((await rpc(fn, ["wrong", ...args])).r, "unavailable", `${fn}: without the server key, unavailable`);
  eq((await rpc(fn, [null, ...args])).r, "unavailable", `${fn}: a null key too`);
}
eq((await asRole("anon", () => create(HOST, { ...GAME, date: START }, weekly([W]), "guess"))).r, "unavailable", "a browser naming a user id, without the key, makes nothing");
eq((await one(`select count(*)::int n from private.game_series`)).n, 0, "and no series is written");

/* ---------------- create: a weekly series on two days ---------------- */
const TT = [W, (W + 2) % 7];
const s1 = await create(HOST, { ...GAME, date: START }, weekly(TT));
eq([s1.r, s1.made], ["ok", 8], "the host starts a weekly series on two days: 8 games go up at once (4 weeks, at most 8)");
const S1 = s1.series.id;
eq(s1.series.rule, { freq: "weekly", interval: 1, days: [...TT].sort((a, b) => a - b) }, "the rule as the maths reads it (days in order)");
eq(s1.series.ends, { type: "never" }, "and its end");
ok(!("host_phone" in s1.series) && !("host_id" in s1.series), "the series answer has no number and no account id");
let g1 = await gamesOf(S1);
eq(g1.map((g) => g.d), [0, 2, 7, 9, 14, 16, 21, 23].map((n) => plusDays(START, n)), "on the rule's days from the first, soonest first");
eq(s1.games.map((g) => g.id), g1.map((g) => g.id), "the answer lists the games made");
ok(g1.every((g) => g.creator_id === HOST && g.status === "open" && g.current_players === 1 && g.title === "Football Game" && g.host_name === "Asha Rao"
  && g.host_profile_image_url === "https://lh3.example/asha" && g.host_phone === "+919800000001" && Number(g.price_per_player) === 150 && g.description === "Bring a dark tee."),
  "each made as game_create makes a game: open, 1 player, the host's name and photo from the account");
eq(g1.map((g) => g.turf_booked), [true, false, false, false, false, false, false, false], "the host's \"turf booked\" is on the first game only: they book each date themselves");
eq((await q(`select count(*)::int n from public.game_participants p join public.games g on g.id = p.game_id where g.series_id = $1 and p.user_id = $2`, [S1, HOST]))[0].n, 8, "the host is each game's first player");
ok(g1.every((g) => g.start_time === "19:00:00" && g.end_time === "20:00:00"), "at the series' time");

/* ---------------- never a day twice ---------------- */
eq(await fill(S1), 0, "topping up again at once makes nothing");
eq(await q(`select private.game_series_tick() n`), [{ n: 0 }], "nor does the daily job");
const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString();
eq(await fill(S1, inAWeek), 2, "a week on, the two days that came within 4 weeks go up");
eq((await gamesOf(S1)).map((g) => g.d).slice(-2), [plusDays(START, 28), plusDays(START, 30)], "the next two of the rule");
eq(await fill(S1, inAWeek), 0, "run again, nothing more");
// The host moves the first game to another day: its old day is still made.
const moved = await rpc("game_update", [KEY, HOST, g1[0].id, JSON.stringify({ date: plusDays(START, 1) }), null]);
eq(moved.r, "ok", "(the host moves the first game a day on)");
eq(await fill(S1, inAWeek), 0, "its old day is not made again");
eq((await one(`select count(*)::int n from private.game_series_dates where series_id = $1`, [S1])).n, 10, "ten days made, each once");
eq((await one(`select count(*)::int n from (select date from public.games where series_id = $1 group by date having count(*) > 1) x`, [S1])).n, 0, "no day has two games");
const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString();
eq(await fill(S1, inTwoWeeks), 2, "two weeks on, two more: 8 not yet played at most");
eq(await fill(S1, inTwoWeeks), 0, "and again none twice");
const wayOn = new Date(Date.now() + 60 * 86400000).toISOString();

/* ---------------- a player joins one game ---------------- */
const G2 = (await gamesOf(S1))[1].id;
const ask = await rpc("game_request_send", [KEY, RAVI, G2, "Keeper"]);
eq(ask.r, "ok", "a player asks to join one game of the series, as any game");
eq((await rpc("game_request_answer", [KEY, HOST, ask.request.id, true])).current_players, 2, "the host accepts: that game has 2");
eq((await q(`select g.date::text d from public.game_participants p join public.games g on g.id = p.game_id where p.user_id = $1`, [RAVI])).map((r) => r.d), [plusDays(START, 2)],
  "the player is in that game only");
const G3 = (await gamesOf(S1))[2].id;
eq((await rpc("game_request_send", [KEY, PRIYA, G3, null])).r, "ok", "(another waits on the next game)");

/* ---------------- monthly on the first Sunday ---------------- */
let fs1 = ist(1);
while (!(dowOf(fs1) === 0 && Number(fs1.slice(8)) <= 7)) fs1 = plusDays(fs1, 1);
const s2 = await create(HOST, { ...GAME, date: fs1, turf_booked: false, start_time: "07:00", end_time: "08:30" },
  { rule: { freq: "monthly", by: "weekday", nth: 1, weekday: 0 }, ends: { type: "after", count: 3 } });
eq([s2.r, s2.made, s2.games.map((g) => g.date)], ["ok", 1, [fs1]], "a monthly series on the first Sunday: its next game goes up, however far");
const S2 = s2.series.id;
const after = (d) => `${plusDays(d, 1)}T00:30:00+05:30`;
eq(await fill(S2, after(fs1)), 1, "the day after it, the next first Sunday goes up");
const secondFirst = (await gamesOf(S2))[1].d;
ok(dowOf(secondFirst) === 0 && Number(secondFirst.slice(8)) <= 7 && secondFirst > plusDays(fs1, 27) && secondFirst <= plusDays(fs1, 35), "a first Sunday 4 or 5 weeks on");
eq(await fill(S2, after(secondFirst)), 1, "and then the third");
eq(await fill(S2, after((await gamesOf(S2))[2].d)), 0, "after 3 games, nothing more");
eq(await one(`select active, ended from private.game_series where id = $1`, [S2]), { active: false, ended: "done" }, "and the series ends itself ('done'): it no longer counts as running");

/* ---------------- monthly on the 31st: the last day in shorter months ---------------- */
let d31 = ist(1);
while (Number(d31.slice(8)) !== 31) d31 = plusDays(d31, 1);
const s3 = await create(OMAR, { ...GAME, date: d31 }, { rule: { freq: "monthly", by: "date", day: 31 }, ends: { type: "after", count: 4 } });
eq(s3.made, 1, "a series on the 31st");
let last31 = d31;
for (let i = 0; i < 3; i++) {
  await fill(s3.series.id, after(last31));
  last31 = (await gamesOf(s3.series.id)).at(-1).d;
}
const monthEnds = (await gamesOf(s3.series.id)).map((g) => g.d);
ok(monthEnds.every((d) => plusDays(d, 1).slice(8) === "01"), `each on its month's last day: ${monthEnds.join(", ")}`);
eq(monthEnds.length, 4, "four of them");

/* ---------------- a game the host cancels holds no place ---------------- */
const MEERA = U(7);
await q(`insert into public.users (id, name) values ('${MEERA}', 'Meera Iyer')`);
const m15 = ist(3);
const sm = await create(MEERA, { ...GAME, date: m15 }, { rule: { freq: "monthly", by: "date", day: Number(m15.slice(8)) }, ends: { type: "never" } });
eq([sm.r, sm.made, sm.games.map((g) => g.date)], ["ok", 1, [m15]], "(a monthly series on the date: its first game up)");
eq((await rpc("game_cancel", [KEY, MEERA, sm.games[0].id])).r, "ok", "(the host cancels that game)");
const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString();
eq(await fill(sm.series.id, inTwoDays), 1, "two days on, the next month's game goes up: the cancelled one is no next game");
const smGames = await gamesOf(sm.series.id);
eq(smGames.map((g) => [g.d, g.status]), [[m15, "cancelled"], [smGames[1].d, "open"]], "the cancelled day stays cancelled, the next month's is open");
ok(smGames[1].d > plusDays(m15, 27) && smGames[1].d <= plusDays(m15, 31), "a month on");
eq(await fill(sm.series.id, inTwoDays), 0, "and the cancelled day is never made again");
const smMine = (await mine(MEERA)).series.find((s) => s.id === sm.series.id);
eq([smMine.upcoming, smMine.next.date], [1, smGames[1].d], "the host's list has the next one");
const sd = await create(MEERA, { ...GAME, date: START }, weekly([0, 1, 2, 3, 4, 5, 6]));
eq(sd.made, 8, "(a daily series: 8 up)");
for (const g of sd.games.slice(2, 4)) await rpc("game_cancel", [KEY, MEERA, g.id]);
eq(await fill(sd.series.id), 2, "the host cancels two of them: two more go up, still 8 to play");
eq((await gamesOf(sd.series.id)).filter((g) => g.status === "open").length, 8, "(8 open)");

/* ---------------- India's clock ---------------- */
const D = ist(40);
const daily = { freq: "weekly", interval: 1, days: [0, 1, 2, 3, 4, 5, 6] };
const raw = async (start, time, host = NEHA) => (await one(`insert into private.game_series (host_id, turf_id, sport, skill_level, max_players, start_time, end_time, price_per_player, rule, starts_on)
  values ($1, $2, 'Football', 'all', 10, $3, '20:00', 0, $4, $5) returning id`, [host, T(1), time, JSON.stringify(daily), start])).id;
const tz1 = await raw(D, "19:00");
eq(await fill(tz1, `${D}T19:30:00+05:30`), 8, "(a daily series, topped up at 7:30 PM in India on its first day)");
eq((await gamesOf(tz1))[0].d, plusDays(D, 1), "its first day's 7 PM game had started in India (2 PM in UTC), so it starts the next day");
const tz2 = await raw(D, "19:00");
await fill(tz2, `${D}T18:59:00+05:30`);
eq((await gamesOf(tz2))[0].d, D, "at 6:59 PM in India it is still ahead");
const tz3 = await raw(D, "06:00");
await fill(tz3, `${plusDays(D, -1)}T23:45:00Z`);
eq((await gamesOf(tz3))[0].d, D, "a quarter past 5 AM in India is already its day (still the day before in UTC), and 6 AM is ahead");
eq((await gamesOf(tz3)).at(-1).d, plusDays(D, 7), "8 games: today in India and the 7 after");

/* ---------------- what create refuses ---------------- */
const bads = [
  [{ ...GAME, date: START, creator_id: RAVI }, weekly([W]), "bad", "creator_id", "naming the host"],
  [{ ...GAME, date: START, status: "full" }, weekly([W]), "bad", "status", "naming the status"],
  [{ ...GAME, date: START, max_players: 51 }, weekly([W]), "bad", "max_players", "51 players"],
  [{ ...GAME, date: ist(-1) }, weekly([W]), "bad", "date", "a first day in the past"],
  [{ ...GAME, date: ist(400) }, weekly([W]), "bad", "date", "a first day over a year ahead"],
  [{ ...GAME, date: ist(0), start_time: "00:00", end_time: "01:00" }, weekly([dowOf(ist(0))]), "bad", "start_time", "a first game that has started"],
  [{ ...GAME, date: START }, weekly([W], { type: "after", count: 1 }), "bad", "ends", "one game"],
  [{ ...GAME, date: START }, weekly([]), "bad", "days", "no weekday"],
  [{ ...GAME, date: START }, weekly([W], { type: "never" }, 5), "bad", "interval", "every 5 weeks"],
  [{ ...GAME, date: START }, { rule: { freq: "monthly", by: "date", day: 40 }, ends: { type: "never" } }, "bad", "month", "a date the first day is not"],
  [{ ...GAME, date: START }, { ...weekly([W]), host_id: OMAR }, "bad", "repeat", "naming the host in the repeat"],
  [{ ...GAME, date: START, turf_id: T(3) }, weekly([W]), "venue", undefined, "a turf that is not listed"],
];
for (const [g, r, want, field, what] of bads) {
  const a = await create(HOST, g, r);
  eq([a.r, a.field], [want, field], `create refuses ${what}`);
}
eq((await create(U(99), { ...GAME, date: START }, weekly([W]))).r, "bad", "an account that does not exist starts nothing");
const fine = await create(HOST, { ...GAME, date: ist(0), start_time: "00:00", end_time: "01:00" }, weekly([(dowOf(ist(0)) + 1) % 7]));
eq(fine.r, "ok", "the first day today at midnight is fine when its weekday is not on the rule (the first game is tomorrow)");
eq(fine.games[0].date, ist(1), "(tomorrow)");

/* ---------------- the limits ---------------- */
// Asha runs S1 and that one (S2 is done): a third, then a fourth is one too many.
const s4 = await create(HOST, { ...GAME, date: START }, weekly([W]));
eq(s4.r, "ok", "a third series running");
eq((await create(HOST, { ...GAME, date: START }, weekly([W]))).r, "many", "a fourth is refused: 3 at once");
eq((await stop(HOST, s4.series.id)).r, "ok", "(she stops one)");
const s5 = await create(HOST, { ...GAME, date: START }, weekly([W]));
eq(s5.r, "ok", "and can start another: it counts series running");
await stop(HOST, s5.series.id);
eq((await create(HOST, { ...GAME, date: START }, weekly([W]))).r, "limit", "but not a sixth in a day, stopped or not");
await q(`update private.game_series set created_at = created_at - interval '25 hours' where host_id = $1`, [HOST]);
const s6 = await create(HOST, { ...GAME, date: START }, weekly([W]));
eq(s6.r, "ok", "a day on she can");
await stop(HOST, s6.series.id);
// Series games have their own daily limit: 30 across a host's series, whatever game_create says.
const daysAll = [0, 1, 2, 3, 4, 5, 6];
const om = [];
for (let i = 0; i < 2; i++) om.push(await create(OMAR, { ...GAME, date: START }, weekly(daysAll)));
eq(om.map((s) => s.made), [8, 8], "two daily series: 8 games each (with the 31st's four, 20 today)");
await stop(OMAR, s3.series.id, true);
eq((await stop(OMAR, om[0].series.id, true)).cancelled, 8, "(Omar stops one, cancelling its 8)");
const om3 = await create(OMAR, { ...GAME, date: START }, weekly(daysAll));
eq(om3.made, 8, "a new one puts up 8 (28 today)");
await stop(OMAR, om3.series.id, true);
const om4 = await create(OMAR, { ...GAME, date: START }, weekly(daysAll));
eq([om4.r, om4.made], ["ok", 2], "the next puts up only 2: 30 series games a day, cancelled ones counted");
eq(await fill(om4.series.id), 0, "and no more today");
eq(await fill(om4.series.id, new Date(Date.now() + 26 * 3600000).toISOString()), 6, "a day on, the rest of its 8");
await q(`update private.game_series set created_at = created_at - interval '25 hours' where host_id = $1`, [OMAR]);
const runningOmar = (await one(`select count(*)::int n from private.game_series where host_id = $1`, [OMAR])).n;
eq((await create(OMAR, { ...GAME, date: START }, weekly([W]))).r, "limit", "with today's 30 series games used up, a new repeat is refused (it could put up no first game)");
eq((await one(`select count(*)::int n from private.game_series where host_id = $1`, [OMAR])).n, runningOmar, "and none is saved");
const single = { ...GAME, date: START };
let singles = 0;
for (let i = 0; i < 11; i++) if ((await rpc("game_create", [KEY, OMAR, JSON.stringify(single)])).r === "ok") singles++;
eq(singles, 10, "and 36 series games never stop a single game: game_create's 10 a day counts single games only");
eq((await rpc("game_create", [KEY, OMAR, JSON.stringify(single)])).r, "limit", "the eleventh single game is refused, as before");

/* ---------------- the turf, the job ---------------- */
await q(`update public.turfs set is_active = false where id = $1`, [T(1)]);
const quiet = await raw(ist(3), "19:00", RAVI);
eq(await fill(quiet), 0, "a turf that is no longer listed: nothing goes up");
eq((await one(`select active from private.game_series where id = $1`, [quiet])).active, true, "and the series waits");
await q(`update public.turfs set is_active = true where id = $1`, [T(1)]);
const broken = await raw(ist(3), "19:00", PRIYA);
await q(`update private.game_series set rule = '{"freq": "weekly", "interval": "x", "days": [1]}' where id = $1`, [broken]);
const ticked = (await one(`select private.game_series_tick() n`)).n;
ok(ticked >= 8, `the daily job tops every series up (${ticked} games), the broken one skipped`);
eq((await gamesOf(quiet)).length, 8, "the waiting one goes up once its turf is listed again");
eq((await gamesOf(broken)).length, 0, "(nothing for the broken one)");

/* ---------------- stop ---------------- */
eq((await stop(RAVI, S1, true)).r, "not_host", "a player cannot stop the series");
eq((await stop(OMAR, S1)).r, "not_host", "nor another host");
eq((await stop(HOST, SOME)).r, "gone", "a series that is not there");
eq((await rpc("game_series_stop", [KEY, HOST, null, false])).r, "bad", "no id");
eq((await one(`select active from private.game_series where id = $1`, [S1])).active, true, "and S1 still runs");
// One of its games has been played: it is never cancelled.
const played = (await gamesOf(S1))[3].id;
await q(`update public.games set date = (now() at time zone 'Asia/Kolkata')::date - 1 where id = $1`, [played]);
await q(`delete from public.notifications`);
const st = await stop(HOST, S1, true);
eq([st.r, st.series.active, st.series.ended], ["ok", false, "stopped"], "the host stops it");
const left = await gamesOf(S1);
eq(st.cancelled, left.filter((g) => g.status === "cancelled").length, "its games not yet started are cancelled");
eq(left.filter((g) => g.status !== "cancelled").map((g) => g.id), [played], "all but the one played");
eq((await q(`select user_id from public.notifications where type = 'game_cancelled' order by user_id`)).map((n) => n.user_id), [RAVI, PRIYA].sort(),
  "the player in one and the one waiting on another are told, as game_cancel tells them; never the host");
ok((await q(`select message from public.notifications where type = 'game_cancelled'`)).every((n) => /^Asha cancelled Football on \w{3} \d{1,2} \w{3}$/.test(n.message)), "in game_cancel's words, with the day");
eq(await fill(S1, wayOn), 0, "a stopped series makes nothing");
eq((await stop(HOST, S1, true)), { r: "ok", series: st.series, cancelled: 0 }, "stopping again is fine");
// Stop and keep the games.
const keep = await create(PRIYA, { ...GAME, date: START }, weekly([W]));
const kept = await stop(PRIYA, keep.series.id, false);
eq([kept.r, kept.cancelled, kept.series.active], ["ok", 0, false], "the host stops a series and keeps its games");
eq((await gamesOf(keep.series.id)).map((g) => g.status), Array(4).fill("open"), "they stay open (a weekly game: 4 in 4 weeks): players join each as before");
eq(await fill(keep.series.id), 0, "and no more are made");
eq((await stop(PRIYA, keep.series.id, true)).cancelled, 4, "later, the host can still cancel what is left");

/* ---------------- the host's list, the public read ---------------- */
const list = await mine(HOST);
eq(list.r, "ok", "the host's list");
eq(list.series.map((s) => s.id), (await q(`select id from private.game_series where host_id = $1 order by created_at desc`, [HOST])).map((r) => r.id), "every one of theirs, newest first");
const two = list.series.find((s) => s.id === S2);
eq([two.active, two.ended, two.upcoming, two.unstarted, two.next.date], [false, "done", 3, 3, fs1], "each with its games to play, those not started, and the next");
ok(list.series.every((s) => !("host_phone" in s) && !("host_id" in s)), "no number, no account id");
eq((await mine(KIRAN)).series, [], "a player who hosts none has none");
// A game in progress is still to play, but no longer one a stop calls off.
const sp = await create(MEERA, { ...GAME, date: START }, weekly([0, 1, 2, 3, 4, 5, 6], { type: "after", count: 3 }));
eq(sp.made, 3, "(a series of 3)");
await q(`update public.games set date = (now() at time zone 'Asia/Kolkata')::date, start_time = '00:00', end_time = '23:59' where id = $1`, [sp.games[0].id]);
const spMine = (await mine(MEERA)).series.find((s) => s.id === sp.series.id);
eq([spMine.upcoming, spMine.unstarted], [3, 2], "with its first game in progress: 3 still to play, 2 not started");
eq((await stop(MEERA, sp.series.id, true)).cancelled, spMine.unstarted, "stopping and cancelling calls off those 2: the list's count is the stop's");
const pub = await asRole("anon", () => one(`select public.game_series_public($1::uuid[]) r`, [[S1, S2, SOME]]));
eq(pub.r.map((s) => s.id).sort(), [S1, S2].sort(), "anyone reads what a game page shows of its series");
eq(Object.keys(pub.r[0]).sort(), ["active", "end_time", "ends", "id", "rule", "start_time", "starts_on"], "the rule, the time and the end only");
eq((await asRole("anon", () => one(`select public.game_series_public(null) r`))).r, [], "no ids, none");
eq((await asRole("anon", () => q(`select series_id from public.games where series_id = $1 limit 1`, [S2])))[0].series_id, S2, "the games, and their link, read as before");
await refused(asRole("anon", () => q(`update public.games set series_id = null`)), /permission denied/, "the browser still cannot write a game");

/* ---------------- grants ---------------- */
for (const fn of ["game_series_create", "game_series_stop", "game_series_mine", "game_series_public", "game_create"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [fn]);
  eq([r.a, r.b, r.p, r.prosecdef, String(r.proconfig).includes("search_path=")], [true, true, false, true, true], `${fn}: anon and authenticated may call it, PUBLIC not; definer, empty search_path`);
}
for (const fn of ["game_series_month_days", "game_series_week_one", "game_series_matches", "game_series_days", "game_series_problem", "game_series_last", "game_series_ends", "game_series_json", "game_series_fill", "game_series_tick"]) {
  const r = await one(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) a, bool_or(has_function_privilege('authenticated', p.oid, 'execute')) b, bool_and(proconfig::text like '%search_path=%') s
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq([r.a, r.b, r.s], [false, false, true], `private.${fn}: closed to the API roles, empty search_path`);
}
for (const t of ["game_series", "game_series_dates"]) {
  eq((await one(`select has_table_privilege('anon', 'private.${t}', 'select') a, has_table_privilege('authenticated', 'private.${t}', 'insert') b`)), { a: false, b: false }, `private.${t}: closed to the API roles`);
}
await refused(asRole("anon", () => q(`select private.game_series_fill('${S1}')`)), /permission denied/, "anon cannot top a series up itself");

console.log(`game_series: ${passed} checks passed`);
