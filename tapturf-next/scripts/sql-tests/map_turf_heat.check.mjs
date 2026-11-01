// Builds turf_daily_views as 20261019_mytapturf.sql creates it (its own
// statements, read from that file) beside a stand-in turfs table, then
// applies 20261101_map_turf_heat.sql (twice) to an in-memory Postgres
// (PGlite) and checks both functions.
// map_turf_heat: only active turfs with a map point and 3 or more views over
// the last 30 India days count; levels run 1 to 5 by rank (the least viewed
// 1, the most 5, ties share one); the answer says turf_id and level and
// nothing else (no count).
// map_turf_trending: the estimate of the last 24 hours (today's views plus
// yesterday's times the share of it still in the window, India time), 3 or
// more and above the turf's own daily average over the 7 days before
// yesterday; ranked by it, ties sharing a rank, top 10; no rows at all under
// 5 trending turfs; only active turfs with a map point; turf_id and rank,
// no count.
// Both: anon may call them while the views table stays closed to anon;
// security definer with an empty search_path; nothing else is touched.
// Then 20261102_map_trending_window.sql (twice), applied after it, and
// map_turf_trending_auto: the window by the site's views (every active
// turf with a map point), 24 hours at an estimate of 2,000 or more, else 7
// days at 5,000 or more in them, else 30 days, India's days and hours, at
// each edge; in 24 hours map_turf_trending's own answer; in 7 or 30 days 3
// views or more in the window, no rising rule; ranked, ties sharing, top
// 10, no turfs under 5; {window, turfs: [{turf_id, rank}]} and no count
// anywhere; anon may call it, security definer. The file's own text is run
// at chosen moments by swapping its one now() for a clock the check sets,
// and once as it is, on the real clock. Then broken copies of it (a wrong
// threshold, UTC days, a count let out, security invoker, ...) each fail
// the same checks.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/map_turf_heat.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: map_turf_heat.check.mjs <supabase/migrations>");
const FILE = `${M}/20261101_map_turf_heat.sql`;
const FILE2 = `${M}/20261102_map_trending_window.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// ── The file itself ────────────────────────────────────────
const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive, nothing rewritten");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?(table|view)\b/i, "no table or view");
eq((sql.match(/create or replace function/gi) ?? []).length, 2, "two functions");
eq([...sql.matchAll(/create or replace function public\.(\w+)\(\)/gi)].map((m) => m[1]), ["map_turf_heat", "map_turf_trending"], "map_turf_heat and map_turf_trending");
passed += 3;

// ── What it reads, as production has it ────────────────────
// turf_daily_views: the table, its row security and its revoke, exactly as 20261019_mytapturf.sql writes them.
const mytapturf = fs.readFileSync(`${M}/20261019_mytapturf.sql`, "utf8");
const views = mytapturf.match(/create table if not exists public\.turf_daily_views[\s\S]*?\);\s*alter table public\.turf_daily_views enable row level security;\s*revoke all on public\.turf_daily_views from anon, authenticated;/);
assert.ok(views, "turf_daily_views as 20261019_mytapturf.sql creates it");
const BASE = `
create role anon; create role authenticated;
grant usage on schema public to anon, authenticated;
create table public.turfs (id uuid primary key, name text, is_active boolean default true, lat double precision, lng double precision);
grant select on public.turfs to anon, authenticated;
${views[0]}
`;
await db.exec(BASE);

const before = await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname`);
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('map_turf_heat', 'map_turf_trending') order by proname`);
eq(after, before, "no other function added or changed");
for (const fn of ["map_turf_heat", "map_turf_trending"]) {
  const [{ n: overloads }] = await q(`select count(*)::int as n from pg_proc where proname = $1`, [fn]);
  eq(overloads, 1, `${fn}: no overload after running it twice`);
}

// ── Fixture ────────────────────────────────────────────────
// Turf T<n> is 00000000-0000-4000-8000-0000000000<nn>. Views land on India's
// days: today (d0) back to 29 days ago (d29) count, 30 days ago does not.
const T = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const turf = (n, { active = true, lat = 18.5 + n / 100, lng = 73.8 + n / 100 } = {}) =>
  q(`insert into public.turfs (id, name, is_active, lat, lng) values ($1, $2, $3, $4, $5)`, [T(n), `Turf ${n}`, active, lat, lng]);
const view = (n, ago, count) =>
  q(`insert into public.turf_daily_views (turf_id, day, views) values ($1, (now() at time zone 'Asia/Kolkata')::date - $2::int, $3)`, [T(n), ago, count]);

// Eleven turfs that qualify, T1 to T11, with 3, 4, ... 13 views.
for (let i = 0; i < 11; i++) {
  await turf(i + 1);
  await view(i + 1, i % 3, 3 + i);
}
// T12: 13 views spread over the window's both ends, plus 500 the day before it starts (not counted). Ties T11.
await turf(12);
await view(12, 0, 6);
await view(12, 29, 7);
await view(12, 30, 500);
// Left out: 2 views (T13); inactive (T14); no point (T15, T16); a 0,0 point (T17); views only before the window
// (T18, and T22 exactly 30 days ago, the day before it starts); no views at all (T19).
await turf(13); await view(13, 0, 2);
await turf(14, { active: false }); await view(14, 0, 900);
await turf(15, { lat: null }); await view(15, 0, 900);
await turf(16, { lng: null }); await view(16, 0, 900);
await turf(17, { lat: 0, lng: 0 }); await view(17, 0, 900);
await turf(18); await view(18, 31, 900); await view(18, 45, 900);
await turf(22); await view(22, 30, 900);
await turf(19);
// A turf only 0,0 in one coordinate is a point: T20 at lat 0 (the equator, off Sri Lanka) with 3 views. Its 3 views tie T1's.
await turf(20, { lat: 0, lng: 80 }); await view(20, 1, 3);
// Views of a turf id no longer in turfs are no turf (T21).
await view(21, 0, 900);

// ── The answer ─────────────────────────────────────────────
const outCols = (await q(`select parameter_name, data_type from information_schema.parameters where specific_name ~ '^map_turf_heat_[0-9]+$' and parameter_mode = 'OUT' order by ordinal_position`));
eq(outCols.map((c) => [c.parameter_name, c.data_type]), [["turf_id", "uuid"], ["level", "smallint"]], "turf_id and level, nothing else: no count");

const rows = await q(`select turf_id, level from public.map_turf_heat()`);
const levels = Object.fromEntries(rows.map((r) => [Number(r.turf_id.slice(-12)), r.level]));
// 13 turfs: T1..T12 and T20. By views: T1 and T20 (3), T2 (4), ... T11 and T12 (13).
// percent_rank over 13: T1, T20 rank 1 -> 0; T2 rank 3 -> 2/12; ... T11, T12 rank 12 -> 11/12.
const expected = {};
const byViews = [[1, 3], [20, 3], ...Array.from({ length: 10 }, (_, i) => [i + 2, 4 + i]), [12, 13]];
for (const [n, v] of byViews) {
  const rank = 1 + byViews.filter(([, w]) => w < v).length;
  expected[n] = Math.min(5, 1 + Math.floor(((rank - 1) / (byViews.length - 1)) * 5));
}
eq(levels, expected, "each qualifying turf's level by rank");
eq(Object.keys(levels).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20], "only active turfs with a point and 3 or more views in the window");
eq(levels[1], 1, "the least viewed is 1");
eq(levels[11], 5, "the most viewed is 5");
eq(levels[12], levels[11], "the same views share a level (T12's 13 counts only its days in the window)");
eq(levels[20], levels[1], "and at the bottom too");
ok(rows.every((r) => r.level >= 1 && r.level <= 5), "levels run 1 to 5");
eq(new Set(Object.values(levels)), new Set([1, 2, 3, 4, 5]), "every level is used");
ok(rows.every((r, i) => i === 0 || rows[i - 1].level >= r.level), "most popular first");
ok(!JSON.stringify(rows).match(/"(views|n|count|total)"/), "no count in the answer");

// No views anywhere yet (or none with 3): no rows, not an error.
await db.exec(`create table public._keep as select * from public.turf_daily_views; update public.turf_daily_views set views = 1;`);
eq((await q(`select * from public.map_turf_heat()`)).length, 0, "nobody with 3 views: no rows");
await db.exec(`update public.turf_daily_views v set views = k.views from public._keep k where k.turf_id = v.turf_id and k.day = v.day;`);
eq((await q(`select count(*)::int as n from public.map_turf_heat()`))[0].n, 13, "back as it was");

// ── Who may call them ──────────────────────────────────────
for (const fn of ["map_turf_heat", "map_turf_trending"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ ('^' || $1 || '_[0-9]+$') and privilege_type = 'EXECUTE'`, [fn]);
  ok(grants.some((g) => g.grantee === "anon"), `${fn}: anon may call it`);
  ok(grants.some((g) => g.grantee === "authenticated"), `${fn}: so may a signed-in visitor`);
  ok(!grants.some((g) => g.grantee === "PUBLIC"), `${fn}: PUBLIC may not`);
  const def = (await q(`select prosecdef, proconfig, provolatile from pg_proc where oid = $1::regprocedure`, [`public.${fn}()`]))[0];
  ok(def.prosecdef === true, `${fn}: security definer: it reads the closed views table for the caller`);
  ok(String(def.proconfig).includes('search_path=""'), `${fn}: with an empty search_path`);
  eq(def.provolatile, "s", `${fn}: stable`);
}
for (const role of ["anon", "authenticated"]) {
  for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, 'public.turf_daily_views', $2) as p`, [role, p]))[0].p, `${role} still cannot ${p} the views table`);
}

// As anon itself: the levels, and still no way into the counts.
await db.exec(`set role anon`);
eq((await q(`select count(*)::int as n from public.map_turf_heat()`))[0].n, 13, "anon gets the levels");
await assert.rejects(q(`select * from public.turf_daily_views`), /permission denied/, "anon cannot read the views");
passed++;
await db.exec(`reset role`);

// ═══ map_turf_trending ═════════════════════════════════════
// A fresh database per case, both files applied in order, as production will have them.
const sql2 = fs.readFileSync(FILE2, "utf8");
async function fresh() {
  const d = new PGlite();
  await d.exec(BASE);
  await d.exec(sql);
  await d.exec(sql2);
  const dq = async (s, p) => (await d.query(s, p)).rows;
  return {
    d,
    q: dq,
    turf: (n, { active = true, lat = 17.4 + n / 100, lng = 78.4 + n / 100 } = {}) =>
      dq(`insert into public.turfs (id, name, is_active, lat, lng) values ($1, $2, $3, $4, $5)`, [T(n), `Turf ${n}`, active, lat, lng]),
    // `counts`: views on India's today (index 0), yesterday (1), and so on back.
    views: async (n, counts) => {
      for (const [ago, c] of counts.entries()) {
        if (c) await dq(`insert into public.turf_daily_views (turf_id, day, views) values ($1, (now() at time zone 'Asia/Kolkata')::date - $2::int, $3)`, [T(n), ago, c]);
      }
    },
    // The function's rows, and the share of yesterday inside the window at the same moment (one transaction: now() is fixed).
    run: () =>
      d.transaction(async (tx) => {
        const [{ share }] = (await tx.query(`select (1 - extract(epoch from (k.at - k.at::date)) / 86400)::float8 as share from (select now() at time zone 'Asia/Kolkata' as at) k`)).rows;
        const rows = (await tx.query(`select turf_id, rank from public.map_turf_trending()`)).rows;
        return { share, rows, ranks: Object.fromEntries(rows.map((r) => [Number(r.turf_id.slice(-12)), r.rank])) };
      }),
  };
}
/** The rules again, in JS (lib/map/trending.ts has them with unit tests): the estimate, the bar, rank (ties share), top 10, none under 5. */
function expectRanks(fixture, share) {
  const est = fixture.map(({ n, counts }) => {
    const [today = 0, yesterday = 0, ...older] = counts;
    const base = older.slice(0, 7).reduce((a, b) => a + (b ?? 0), 0) / 7;
    return { n, e: today + yesterday * share, base };
  });
  const hot = est.filter((x) => x.e >= 3 && x.e > x.base);
  if (hot.length < 5) return {};
  const out = {};
  for (const x of hot) {
    const rank = 1 + hot.filter((y) => y.e > x.e).length;
    if (rank <= 10) out[x.n] = rank;
  }
  return out;
}

// The share of yesterday, as the function reckons it, is India's: 1 at India midnight (18:30 UTC), falling to 0 by the next.
{
  const t = await fresh();
  const { share, rows } = await t.run();
  const ms = Date.now() + 5.5 * 3600_000;
  const js = 1 - (((ms % 86400_000) + 86400_000) % 86400_000) / 86400_000;
  ok(Math.abs(share - js) < 0.001 || Math.abs(share - js) > 0.999, `India's share of yesterday: SQL ${share.toFixed(5)}, JS ${js.toFixed(5)}`);
  eq(rows, [], "no views at all: no rows, not an error");
  const cols = await t.q(`select parameter_name, data_type from information_schema.parameters where specific_name ~ '^map_turf_trending_[0-9]+$' and parameter_mode = 'OUT' order by ordinal_position`);
  eq(cols.map((c) => [c.parameter_name, c.data_type]), [["turf_id", "uuid"], ["rank", "smallint"]], "turf_id and rank, nothing else: no count");
  await t.d.close();
}

// The main case: ten turfs that trend (at most: T6 and T8 need enough of yesterday inside the window), and every way not to.
{
  const t = await fresh();
  const fixture = [
    // Today only: the estimate is today's views, whatever the hour.
    { n: 1, counts: [50] },
    { n: 3, counts: [6] },
    { n: 4, counts: [6] }, // ties T3: they share a rank
    { n: 5, counts: [3] }, // exactly 3 is enough
    // Yesterday counts by the share of it still in the window.
    { n: 6, counts: [0, 40] },
    { n: 7, counts: [4, 8] },
    { n: 8, counts: [2, 20] },
    // Rising: a busy week before is the bar. 10 today against 3 a day: trends.
    { n: 9, counts: [10, 0, 3, 3, 3, 3, 3, 3, 3] },
    // Always busy: 6 today, as on each of the 7 days before yesterday. Not rising, at any hour.
    { n: 10, counts: [6, 0, 6, 6, 6, 6, 6, 6, 6] },
    // 900 views 9 days ago are before the 7 days before yesterday: no bar, so 4 today trends.
    { n: 11, counts: [4, 0, 0, 0, 0, 0, 0, 0, 0, 900] },
    // 2 today, nothing before: under 3.
    { n: 12, counts: [2] },
    // Views only 2 days ago or more: no estimate.
    { n: 13, counts: [0, 0, 50] },
  ];
  for (const f of fixture) {
    await t.turf(f.n);
    await t.views(f.n, f.counts);
  }
  // Busy turfs that never count: inactive, no point, a 0,0 point; and views of a turf id no longer in turfs.
  await t.turf(20, { active: false }); await t.views(20, [99]);
  await t.turf(21, { lat: null }); await t.views(21, [99]);
  await t.turf(22, { lng: null }); await t.views(22, [99]);
  await t.turf(23, { lat: 0, lng: 0 }); await t.views(23, [99]);
  await t.views(24, [99]);
  // A turf on the equator (lat 0 only) is a point.
  await t.turf(25, { lat: 0, lng: 80 }); await t.views(25, [7]);
  fixture.push({ n: 25, counts: [7] });

  const { share, rows, ranks } = await t.run();
  eq(ranks, expectRanks(fixture, share), `each trending turf's rank at a share of ${share.toFixed(3)}`);
  eq(ranks[1], 1, "the most viewed is 1");
  eq(ranks[3], ranks[4], "the same estimate shares a rank");
  ok(ranks[5] != null, "exactly 3 is enough");
  ok(ranks[9] != null, "rising: 10 against 3 a day trends");
  ok(ranks[10] == null, "always busy: 6 against 6 a day does not");
  ok(ranks[11] != null, "views 9 days ago set no bar");
  for (const n of [12, 13, 20, 21, 22, 23, 24]) ok(ranks[n] == null, `T${n} never trends`);
  ok(ranks[25] != null, "a point on the equator is a point");
  eq(ranks[6] != null, 40 * share >= 3, "yesterday's 40 views count by the share still in the window");
  ok(ranks[7] > ranks[9] || 4 + 8 * share >= 10, "yesterday's 8 views count only in part: T7's 4 + 8 x share stays under T9's 10");
  ok(rows.every((r, i) => i === 0 || rows[i - 1].rank <= r.rank), "most viewed first");
  ok(rows.every((r) => r.rank >= 1 && r.rank <= 10), "ranks run 1 to 10");
  ok(!JSON.stringify(rows).match(/"(views|est|base|n|count|total)"/), "no count in the answer");

  // As anon: the ranks, and still no way into the counts.
  await t.d.exec(`set role anon`);
  eq((await t.q(`select count(*)::int as n from public.map_turf_trending()`))[0].n, rows.length, "anon gets the ranks");
  await assert.rejects(t.q(`select * from public.turf_daily_views`), /permission denied/, "anon cannot read the views");
  passed++;
  await t.d.exec(`reset role`);
  await t.d.close();
}

// The share pinned down, whatever the hour: T1, 10,000 views yesterday and none today, ranks between T2 and T3, with
// today's views just over and just under 10,000 x India's share now; T4, 7,000 yesterday, trends against a week before
// that averaged just under its estimate (counting yesterday in that week would put the bar over it).
{
  const t = await fresh();
  const { share } = await t.run();
  const at = Math.round(10_000 * share);
  if (at < 20) console.log("note: within two minutes of India midnight, the share probe is skipped");
  else {
    const week = Math.floor(7000 * share) - 1;
    const fixture = [
      { n: 1, counts: [0, 10_000] },
      { n: 2, counts: [at + 3] },
      { n: 3, counts: [at - 3] },
      { n: 4, counts: [0, 7000, ...Array(7).fill(week)] },
      { n: 5, counts: [3] },
    ];
    for (const f of fixture) {
      await t.turf(f.n);
      await t.views(f.n, f.counts);
    }
    const run = await t.run();
    eq(run.ranks, expectRanks(fixture, run.share), "as the rules say");
    eq([run.ranks[2], run.ranks[1], run.ranks[3]], [1, 2, 3], `yesterday's 10,000 count as ${(10_000 * run.share).toFixed(1)}: India's share of yesterday still in the window`);
    ok(run.ranks[4] != null, "the bar is the 7 days before yesterday, yesterday not among them");
  }
  await t.d.close();
}

// Top 10: twelve turfs trend on today's views alone (13 down to 3, with 7 twice); ranks past 10 stay out.
{
  const t = await fresh();
  const fixture = [13, 12, 11, 10, 9, 8, 7, 7, 6, 5, 4, 3].map((c, i) => ({ n: i + 1, counts: [c] }));
  for (const f of fixture) {
    await t.turf(f.n);
    await t.views(f.n, f.counts);
  }
  const { ranks } = await t.run();
  eq(ranks, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 7, 9: 9, 10: 10 }, "the top 10 by the estimate, the tie at 7 sharing a rank");
  eq(ranks, expectRanks(fixture, 0), "as the rules say");
  // A tie across 10: T10 down to 4 views, the same as T11: both rank 10, so 11 rows; T12, with 3, is 12th.
  await t.q(`update public.turf_daily_views set views = 4 where turf_id = $1`, [T(10)]);
  const tie = await t.run();
  eq([tie.ranks[10], tie.ranks[11], tie.ranks[12]], [10, 10, undefined], "a tie at 10 comes in whole, the 12th stays out");
  eq(tie.rows.length, 11, "11 rows");
  await t.d.close();
}

// Too few to call anything trending: 4 turfs trend, no rows; a fifth, and all five come back.
{
  const t = await fresh();
  for (const [n, c] of [[1, 9], [2, 8], [3, 7], [4, 6], [5, 2]]) {
    await t.turf(n);
    await t.views(n, [c]);
  }
  eq((await t.run()).rows, [], "4 trending turfs: no rows at all");
  await t.q(`update public.turf_daily_views set views = 3 where turf_id = $1`, [T(5)]);
  eq((await t.run()).ranks, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, "5 trending turfs: all of them");
  await t.d.close();
}

// ═══ map_turf_trending_auto (20261102_map_trending_window.sql) ═══
// ── The file itself ────────────────────────────────────────
assert.doesNotMatch(sql2, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "window file: nothing destructive, nothing rewritten");
assert.doesNotMatch(sql2, /[—–]/, "window file: no em or en dashes");
assert.doesNotMatch(sql2, /create\s+(or\s+replace\s+)?(table|view)\b/i, "window file: no table or view");
eq([...sql2.matchAll(/create or replace function public\.(\w+)\(\)/gi)].map((m) => m[1]), ["map_turf_trending_auto"], "window file: one function, map_turf_trending_auto; map_turf_trending is left as it is");
// Its one clock is now(): the checks below swap it for one they set, so nothing else may tell the time.
eq((sql2.match(/\bnow\(\)/g) ?? []).length, 1, "window file: one now()");
assert.doesNotMatch(sql2, /current_date|current_timestamp|localtime|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday/i, "window file: no other clock");
for (const [name, value] of [["day_total", 2000], ["week_total", 5000], ["min_views", 3], ["min_turfs", 5], ["top", 10]])
  ok(new RegExp(`\\b${value} as ${name}\\b`).test(sql2), `window file: the threshold ${name} is ${value}, by name`);
passed += 3;

// Applied after 20261101_map_turf_heat.sql (twice): one new function, nothing else added or changed.
{
  const procs = async () => (await q(`select proname, md5(prosrc) as src, proacl::text as acl from pg_proc where pronamespace = 'public'::regnamespace and proname <> 'map_turf_trending_auto' order by proname`));
  const was = await procs();
  await db.exec(sql2);
  await db.exec(sql2);
  eq(await procs(), was, "window file: no other function added or changed (map_turf_heat and map_turf_trending as they were, grants too)");
  eq((await q(`select count(*)::int as n from pg_proc where proname = 'map_turf_trending_auto'`))[0].n, 1, "map_turf_trending_auto: no overload after running it twice");
}

/** India's date (YYYY-MM-DD) at an instant. */
const indiaDate = (iso) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);
/** India's share of yesterday still in the last 24 hours at an instant. */
const indiaShare = (iso) => 1 - (((Date.parse(iso) + 5.5 * 3600_000) % 86400_000) + 86400_000) % 86400_000 / 86400_000;
/** The file with its clock swapped for public._test_now(), which reads the moment a case sets. */
const clocked = (text) => text.replaceAll("now()", "public._test_now()");
const CLOCK = `create function public._test_now() returns timestamptz language sql stable as $$ select current_setting('test.now')::timestamptz $$;`;

/**
 * The rules again, in JS (lib/map/trending.ts rankTrending has them with unit tests). `fixture`: { n, counts (index:
 * India days ago), active, lat, lng, turf: false for views of a turf id not in turfs }. Only active turfs with a map
 * point count, for the site's totals as for the ranks.
 */
function expectAuto(fixture, share) {
  const rows = fixture
    .filter((f) => f.turf !== false && f.active !== false && f.lat !== null && f.lng !== null && !(f.lat === 0 && f.lng === 0))
    .map(({ n, counts }) => {
      const sum = (a, b) => counts.slice(a, b).reduce((x, y) => x + (y ?? 0), 0);
      return { n, h24: (counts[0] ?? 0) + (counts[1] ?? 0) * share, base: sum(2, 9) / 7, d7: sum(0, 7), d30: sum(0, 30) };
    });
  const day = rows.reduce((a, r) => a + r.h24, 0);
  const week = rows.reduce((a, r) => a + r.d7, 0);
  const window = day >= 2000 ? "24h" : week >= 5000 ? "7d" : "30d";
  const val = (r) => (window === "24h" ? r.h24 : window === "7d" ? r.d7 : r.d30);
  const hot = rows.filter((r) => (window === "24h" ? r.h24 >= 3 && r.h24 > r.base : val(r) >= 3));
  const ranks = {};
  if (hot.length >= 5) {
    for (const r of hot) {
      const k = 1 + hot.filter((y) => val(y) > val(r)).length;
      if (k <= 10) ranks[r.n] = k;
    }
  }
  return { window, ranks };
}

/** Fixture rows as one insert each for turfs and views; `day0`: SQL for India's today. */
async function load(d, fixture, day0, params = []) {
  const turfs = fixture.filter((f) => f.turf !== false).map((f) => ({
    id: T(f.n), active: f.active !== false, lat: "lat" in f ? f.lat : 17.4 + f.n / 100, lng: "lng" in f ? f.lng : 78.4 + f.n / 100,
  }));
  const views = fixture.flatMap((f) => f.counts.flatMap((c, ago) => (c ? [{ t: T(f.n), a: ago, c }] : [])));
  await d.query(`insert into public.turfs (id, name, is_active, lat, lng) select x.id::uuid, 'Turf', x.active, x.lat, x.lng from jsonb_to_recordset($1::jsonb) as x(id text, active boolean, lat float8, lng float8)`, [JSON.stringify(turfs)]);
  await d.query(`insert into public.turf_daily_views (turf_id, day, views) select x.t::uuid, ${day0} - x.a, x.c from jsonb_to_recordset($1::jsonb) as x(t text, a int, c int)`, [JSON.stringify(views), ...params]);
}

/** The answer's shape, and no count in it: {window, turfs: [{turf_id, rank}]}, ranks 1 to 10, no other number anywhere. */
function shapeOf(a) {
  const problems = [];
  if (!a || typeof a !== "object" || Array.isArray(a)) return ["not an object"];
  if (JSON.stringify(Object.keys(a).sort()) !== '["turfs","window"]') problems.push(`keys ${Object.keys(a)}`);
  if (!["24h", "7d", "30d"].includes(a.window)) problems.push(`window ${a.window}`);
  if (!Array.isArray(a.turfs)) return [...problems, "turfs not a list"];
  for (const t of a.turfs) {
    if (JSON.stringify(Object.keys(t ?? {}).sort()) !== '["rank","turf_id"]') problems.push(`turf keys ${Object.keys(t ?? {})}`);
    if (!Number.isInteger(t?.rank) || t.rank < 1 || t.rank > 10) problems.push(`rank ${t?.rank}`);
    if (!/^[0-9a-f-]{36}$/.test(t?.turf_id)) problems.push(`turf_id ${t?.turf_id}`);
  }
  const numbers = JSON.stringify(a).match(/(?<!-)\b\d+(\.\d+)?\b(?![-\w])/g) ?? [];
  const ranks = a.turfs.map((t) => String(t?.rank));
  if (numbers.length !== ranks.length) problems.push(`numbers other than ranks: ${numbers.join(",")}`);
  return problems;
}

/**
 * Every check of map_turf_trending_auto, against `text` (the file, or a broken copy of it): its grants and how it runs,
 * then each case at a moment the check sets (India time). Throws an AssertionError at the first that fails; returns
 * how many passed.
 */
async function checkAuto(text) {
  let n = 0;
  const aok = (cond, what) => { assert.ok(cond, `auto: ${what}`); n++; };
  const aeq = (a, b, what) => { assert.deepEqual(a, b, `auto: ${what}`); n++; };
  const d = new PGlite();
  try {
    await d.exec(BASE);
    await d.exec(CLOCK);
    await d.exec(clocked(sql));
    await d.exec(clocked(text));
    const dq = async (s, p) => (await d.query(s, p)).rows;

    // ── Who may call it, how it runs ──
    const grants = await dq(`select grantee from information_schema.routine_privileges where specific_name ~ '^map_turf_trending_auto_[0-9]+$' and privilege_type = 'EXECUTE'`);
    aok(grants.some((g) => g.grantee === "anon"), "anon may call it");
    aok(grants.some((g) => g.grantee === "authenticated"), "so may a signed-in visitor");
    aok(!grants.some((g) => g.grantee === "PUBLIC"), "PUBLIC may not");
    const def = (await dq(`select prosecdef, proconfig, provolatile, prorettype::regtype::text as returns from pg_proc where oid = 'public.map_turf_trending_auto()'::regprocedure`))[0];
    aok(def.prosecdef === true, "security definer: it reads the closed views table for the caller");
    aok(String(def.proconfig).includes('search_path=""'), "with an empty search_path");
    aeq([def.provolatile, def.returns], ["s", "jsonb"], "stable, and returns jsonb");

    /** The answer at India time `iso` with `fixture` loaded, map_turf_trending's rows beside it; all rolled back after. */
    const at = async (iso, fixture, role) => {
      await d.exec("begin");
      try {
        await d.query(`select set_config('test.now', $1, true)`, [iso]);
        await load(d, fixture, `$2::date`, [indiaDate(iso)]);
        if (role) await d.exec(`set local role ${role}`);
        const [{ a }] = await dq(`select public.map_turf_trending_auto() as a`);
        const day = role ? [] : await dq(`select turf_id, rank from public.map_turf_trending()`);
        const problems = shapeOf(a);
        aeq(problems, [], `the answer is {window, turfs: [{turf_id, rank}]}, no count (${iso})`);
        return { a, day, ranks: Object.fromEntries(a.turfs.map((t) => [Number(t.turf_id.slice(-12)), t.rank])) };
      } finally {
        await d.exec("rollback");
      }
    };
    const expect = (iso, fixture) => expectAuto(fixture, indiaShare(iso));

    // ── No views at all: 30 days, no turfs, not an error ──
    aeq((await at("2026-11-01T16:05:00+05:30", [])).a, { window: "30d", turfs: [] }, "no views: 30 days, no turfs");

    // ── A quiet site (1 Nov): 30 days; 3 or more in them, no rising rule; only active turfs with a point, in the totals too ──
    const quiet = [
      { n: 1, counts: [50] },
      { n: 2, counts: [6, 0, 6, 6, 6, 6, 6, 6, 6] }, // 48, always busy: in, no rising rule in 30 days
      { n: 3, counts: [...Array(10).fill(0), 20] }, // 20, ten days ago
      { n: 4, counts: [...Array(29).fill(0), 20] }, // 20 on the window's first day: ties T3
      { n: 5, counts: [...Array(29).fill(0), 3] }, // exactly 3
      { n: 6, counts: [...Array(29).fill(0), 2, 900] }, // 2 in the window; 900 the day before it starts
      { n: 7, counts: [1, 1] }, // 2
      { n: 8, active: false, counts: [5000, 5000] }, // never counts, not even in the site's totals
      { n: 9, lat: null, counts: [5000, 5000] },
      { n: 10, lat: 0, lng: 0, counts: [5000, 5000] },
      { n: 11, turf: false, counts: [5000, 5000] }, // a turf id no longer in turfs
      { n: 12, lat: 0, lng: 80, counts: [4] }, // the equator is a point
    ];
    {
      const iso = "2026-11-01T16:05:00+05:30";
      const r = await at(iso, quiet);
      aeq(r.a.window, "30d", "a quiet site: 30 days (the 5,000s of turfs off the map count nowhere)");
      aeq(r.ranks, { 1: 1, 2: 2, 3: 3, 4: 3, 12: 5, 5: 6 }, "30 days: 3 or more in them, ranked, ties shared, always busy in");
      aeq(r.ranks, expect(iso, quiet).ranks, "30 days: as the rules say");
      aeq(r.a.turfs.map((t) => t.rank), [1, 2, 3, 3, 5, 6], "most viewed first");
    }

    // ── 7 days at exactly 5,000 in them (24 hours far short), 4,999 is 30 days ──
    const week = (top) => [
      { n: 1, counts: [0, 0, 0, 0, 0, 0, top] }, // 6 days ago: in 7 days, not in 24 hours
      { n: 2, counts: [0, 0, 0, 0, 0, 0, 0, 900] }, // 7 days ago: 30 days only
      { n: 3, counts: [0, 0, 0, 5] },
      { n: 4, counts: [0, 0, 0, 5] },
      { n: 5, counts: [0, 0, 0, 0, 0, 5] },
      { n: 6, counts: [5] },
      { n: 7, active: false, counts: [0, 0, 0, 0, 0, 0, 900] }, // would lift 4,999 over, if it counted
    ];
    {
      const iso = "2026-11-01T09:00:00+05:30";
      const r = await at(iso, week(4980));
      aeq(r.a.window, "7d", "exactly 5,000 in 7 days: 7 days");
      aeq(r.ranks, { 1: 1, 3: 2, 4: 2, 5: 2, 6: 2 }, "7 days: today and the 6 days before; 7 days ago is out");
      aeq(r.ranks, expect(iso, week(4980)).ranks, "7 days: as the rules say");
      const s = await at(iso, week(4979));
      aeq(s.a.window, "30d", "4,999 in 7 days: 30 days");
      aeq([s.ranks[1], s.ranks[2]], [1, 2], "where the 900 of 7 days ago count");
    }

    // ── India's days: at 00:30 in India (19:00 UTC the day before) today is India's new day ──
    {
      const iso = "2026-11-01T00:30:00+05:30";
      const five = [1, 2, 3, 4, 5].map((n) => ({ n, counts: [500] }));
      const r = await at(iso, five);
      aeq(r.a.window, "24h", "India's day: 2,500 on India's today, half an hour into it: 24 hours");
      aeq(r.ranks, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, "all five, tied");
      // 2,040 on India's yesterday: 1,997.5 of them still inside half an hour on (UTC's day would call them today's, all inside).
      const y = await at(iso, five.map((f) => ({ ...f, counts: [0, 408] })));
      aeq(y.a.window, "30d", "India's day: 2,040 yesterday, half an hour after India's midnight, are under 2,000 in 24 hours: 30 days");
    }

    // ── 24 hours at exactly 2,000 (India's estimate: yesterday by the share still inside), one second later 7 days ──
    // F: always busy (K a day, 2K yesterday: an estimate of K at noon, never above its average): it lifts the site, never trends.
    const day = (K) => [
      { n: 1, counts: [50] },
      { n: 2, counts: [10, 0, 3, 3, 3, 3, 3, 3, 3] }, // rising
      { n: 3, counts: [6, 0, 6, 6, 6, 6, 6, 6, 6] }, // always busy: out in 24 hours
      { n: 4, counts: [8] },
      { n: 5, counts: [8] },
      { n: 6, counts: [3] },
      { n: 7, counts: [2] }, // under 3
      { n: 8, counts: [0, 6] }, // 3 at noon, by half of yesterday
      { n: 9, counts: [0, 2 * K, K, K, K, K, K, K, K] },
      { n: 10, active: false, counts: [900] },
    ];
    {
      const noon = "2026-11-01T12:00:00+05:30";
      const r = await at(noon, day(1910));
      aeq(r.a.window, "24h", "an estimate of exactly 2,000 in 24 hours at India noon: 24 hours");
      aeq(r.ranks, { 1: 1, 2: 2, 4: 3, 5: 3, 6: 5, 8: 5 }, "24 hours: 3 or more and rising, ranked, ties shared");
      aeq(r.a.turfs, r.day.map((x) => ({ turf_id: x.turf_id, rank: x.rank })), "24 hours: map_turf_trending's own answer");
      aeq(r.ranks, expect(noon, day(1910)).ranks, "24 hours: as the rules say");
      const later = "2026-11-01T12:00:01+05:30";
      const s = await at(later, day(1910));
      aeq(s.a.window, "7d", "a second later the estimate is under 2,000: 7 days (13,000 or so in them)");
      aok(s.ranks[3] != null && s.ranks[9] === 1, "in 7 days always busy counts, no rising rule");
      aeq(s.ranks, expect(later, day(1910)).ranks, "7 days: as the rules say");
      aeq((await at(noon, day(1909))).a.window, "7d", "1,999 at noon: 7 days");
      // India's noon is 06:30 UTC; at 12:00 UTC (17:30 in India) only a quarter or so of yesterday is inside.
      aeq((await at("2026-11-01T06:30:00Z", day(1910))).a.window, "24h", "06:30 UTC is India's noon");
      aeq((await at("2026-11-01T12:00:00Z", day(1910))).a.window, "7d", "12:00 UTC is 17:30 in India: under 2,000");
    }

    // ── Too few to call anything trending: 4 qualify, no turfs (the window still said); a fifth, all five ──
    {
      const iso = "2026-11-01T16:05:00+05:30";
      const four = [1, 2, 3, 4].map((n) => ({ n, counts: [9 - n] }));
      aeq((await at(iso, [...four, { n: 5, counts: [2] }])).a, { window: "30d", turfs: [] }, "4 qualifying: no turfs");
      aeq((await at(iso, [...four, { n: 5, counts: [3] }])).ranks, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, "5 qualifying: all of them");
    }

    // ── Top 10, a tie at 10 comes in whole ──
    {
      const iso = "2026-11-01T16:05:00+05:30";
      const twelve = [13, 12, 11, 10, 9, 8, 7, 7, 6, 5, 4, 3].map((c, i) => ({ n: i + 1, counts: [c] }));
      aeq((await at(iso, twelve)).ranks, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 7, 9: 9, 10: 10 }, "the top 10, the tie at 7 sharing");
      twelve[9] = { n: 10, counts: [4] };
      const tie = await at(iso, twelve);
      aeq([tie.ranks[10], tie.ranks[11], tie.ranks[12], tie.a.turfs.length], [10, 10, undefined, 11], "a tie at 10 comes in whole, the 12th stays out");
    }

    // ── As anon: the answer, and still no way into the counts ──
    {
      const r = await at("2026-11-01T16:05:00+05:30", quiet, "anon");
      aeq(r.a.window, "30d", "anon gets the answer");
      aeq(Object.keys(r.ranks).length, 6, "the same turfs");
    }
  } finally {
    await d.close();
  }
  return n;
}

passed += await checkAuto(sql2);

// ── The file as it is, on the real clock (no swap): as the rules say, and in 24 hours map_turf_trending's answer ──
{
  const t = await fresh();
  const real = (fixture) =>
    t.d.transaction(async (tx) => {
      const [{ share }] = (await tx.query(`select (1 - extract(epoch from (k.at - k.at::date)) / 86400)::float8 as share from (select now() at time zone 'Asia/Kolkata' as at) k`)).rows;
      await load(tx, fixture, `(now() at time zone 'Asia/Kolkata')::date`);
      const [{ a }] = (await tx.query(`select public.map_turf_trending_auto() as a`)).rows;
      const day = (await tx.query(`select turf_id, rank from public.map_turf_trending()`)).rows;
      await tx.rollback();
      return { share, a, day, ranks: Object.fromEntries(a.turfs.map((x) => [Number(x.turf_id.slice(-12)), x.rank])) };
    });
  const quiet = [
    { n: 1, counts: [50] },
    { n: 2, counts: [6, 0, 6, 6, 6, 6, 6, 6, 6] },
    { n: 3, counts: [...Array(10).fill(0), 20] },
    { n: 4, counts: [...Array(29).fill(0), 3] },
    { n: 5, counts: [...Array(29).fill(0), 2, 900] },
    { n: 6, counts: [4] },
    { n: 7, active: false, counts: [9000] },
  ];
  const q30 = await real(quiet);
  eq(shapeOf(q30.a), [], "real clock: {window, turfs}, no count");
  eq([q30.a.window, q30.ranks], [expectAuto(quiet, q30.share).window, expectAuto(quiet, q30.share).ranks], "real clock, a quiet site: 30 days, as the rules say");
  eq(q30.a.window, "30d", "real clock: 30 days");
  // 2,000 on India's today alone, whatever the hour: 24 hours, and map_turf_trending's answer.
  const busy = [1, 2, 3, 4, 5].map((n) => ({ n, counts: [400 + n] })).concat([{ n: 6, counts: [5] }, { n: 7, counts: [6, 0, 6, 6, 6, 6, 6, 6, 6] }]);
  const d24 = await real(busy);
  eq(d24.a.window, "24h", "real clock: 2,000 or more today: 24 hours");
  eq(d24.a.turfs, d24.day.map((x) => ({ turf_id: x.turf_id, rank: x.rank })), "real clock: in 24 hours, map_turf_trending's answer");
  eq(d24.ranks, expectAuto(busy, d24.share).ranks, "real clock: as the rules say");
  await t.d.close();
}

// ── Broken copies: each one fails the checks above ──
const BROKEN = [
  ["a day_total of 2001", (s) => s.replace("2000 as day_total", "2001 as day_total"), /exactly 2,000/],
  ["a week_total of 5001", (s) => s.replace("5000 as week_total", "5001 as week_total"), /exactly 5,000/],
  ["UTC days", (s) => s.replace("at time zone 'Asia/Kolkata'", "at time zone 'UTC'"), /India|UTC|noon/],
  ["each turf's count let out", (s) => s.replace("select q.turf_id, rank()", "select q.turf_id, q.n, rank()").replace("'rank', r.rk::int)", "'rank', r.rk::int, 'views', r.n)"), /no count/],
  ["the site's total let out", (s) => s.replace("'window', p.win,", "'window', p.win, 'views', (select sum(v.d30) from v),"), /no count/],
  ["security invoker", (s) => s.replace("security definer", "security invoker"), /security definer/],
  ["PUBLIC left able to call it", (s) => s.replace("revoke all on function public.map_turf_trending_auto() from public;", ""), /PUBLIC/],
  ["8 days for 7", (s) => s.replace("d.day >= w.today - 6", "d.day >= w.today - 7"), /7 days/],
  ["the rising rule in 30 days", (s) => s.replace("else v.d30 >= c.min_views", "else v.d30 >= c.min_views and v.h24 > v.base"), /30 days/],
  ["no turfs under 5 dropped", (s) => s.replace("r.qualifying >= c.min_turfs", "r.qualifying >= 1"), /4 qualifying/],
];
for (const [what, edit, catches] of BROKEN) {
  const text = edit(sql2);
  assert.notEqual(text, sql2, `broken (${what}): the edit applies`);
  let failure = null;
  try {
    await checkAuto(text);
  } catch (e) {
    failure = e;
  }
  ok(failure instanceof assert.AssertionError, `broken (${what}): the checks fail${failure ? "" : ", but it passed"}${failure && !(failure instanceof assert.AssertionError) ? `, but by an error: ${failure.message}` : ""}`);
  ok(catches.test(failure.message), `broken (${what}): caught by the right check, not "${failure.message.split("\n")[0]}"`);
  console.log(`  broken: ${what}: ${failure.message.split("\n")[0]}`);
}

console.log(`map_turf_heat, map_turf_trending and map_turf_trending_auto: ${passed} checks passed`);
