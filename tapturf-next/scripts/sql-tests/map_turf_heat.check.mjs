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
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/map_turf_heat.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: map_turf_heat.check.mjs <supabase/migrations>");
const FILE = `${M}/20261101_map_turf_heat.sql`;
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
// A fresh database per case, the file applied as above.
async function fresh() {
  const d = new PGlite();
  await d.exec(BASE);
  await d.exec(sql);
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

console.log(`map_turf_heat and map_turf_trending: ${passed} checks passed`);
