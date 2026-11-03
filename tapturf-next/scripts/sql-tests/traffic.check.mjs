// Applies 20261104_traffic.sql (twice) to an in-memory Postgres (PGlite) with
// stand-ins for what it reads (Supabase's roles, the account key check, the
// owner check), and checks the traffic counts: only with the account key;
// only the app's kinds and sources (the same lists as lib/traffic/traffic.ts);
// only a page's path, never the admin's or the API's; a visit only from
// outside the site; another site's host (or another app's package, marked as
// an app) only for a visit from one, and only a clean name; the day is
// India's; two at once all count; the pages and sites a day are capped, the
// rest under '(other)'; the admin read answers only the site owner, with
// today, yesterday, the 7 full days against the 7 before, 30 days, every one
// of the 30 full days and today in the series, and for today, 7 and 30 days:
// by source, by kind, the top pages and sites; nobody reads the tables
// directly; nothing in the tables or the answer names a person. Never
// touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/traffic.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261104_traffic.sql`;
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (cond, what) => { assert.ok(cond, what); passed++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); passed++; };

// The parts of production the file reads: roles, the account key, the owner check.
await db.exec(`
create role anon; create role authenticated;
create schema private;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'server-key');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
create table public.users (id uuid primary key, name character varying, email text, phone text);
`);

const sql = fs.readFileSync(FILE, "utf8");
assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b/i, "nothing destructive, nothing altered");
assert.doesNotMatch(sql.replace(/update private\.traffic_(pages|referrers) as [pr]\b/g, ""), /\bupdate\s+(public|private)\./i, "only its own counts are updated");
assert.doesNotMatch(sql, /[—–]/, "no em or en dashes");
assert.doesNotMatch(sql, /cron\.schedule/i, "no job is added");
assert.doesNotMatch(sql, /public\.users|\.(email|phone)\b|\buser_id\b/i, "no person anywhere: never reads users, a phone, an email or an account");
assert.doesNotMatch(sql, /\binet\b|\b(ip|network|agent)_?\w*\s+(text|inet|bytea)\b/i, "no network address or agent column");
passed += 6;

// The kinds and sources are the app's (lib/traffic/traffic.ts), in the table's check and in traffic_add.
const ts = fs.readFileSync(path.join(M, "../../lib/traffic/traffic.ts"), "utf8");
const list = (name) => [...new RegExp(`export const ${name} = \\[([^\\]]+)\\]`).exec(ts)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const KINDS = list("TRAFFIC_KINDS");
const SOURCES = list("TRAFFIC_SOURCES");
ok(KINDS.length === 19 && SOURCES.length === 12 && SOURCES.includes("app"), "the app's lists read");
const inList = (xs) => `(${xs.map((x) => `'${x}'`).join(", ")})`;
eq(sql.split(`kind in ${inList(KINDS)}`).length - 1, 1, "the table checks the app's kinds");
eq(sql.split(`p_kind not in ${inList(KINDS)}`).length - 1, 1, "traffic_add takes the app's kinds");
eq(sql.split(`source in ${inList(SOURCES)}`).length - 1, 1, "the table checks the app's sources");
eq(sql.split(`p_source not in ${inList(SOURCES)}`).length - 1, 1, "traffic_add takes the app's sources");

const before = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) order by proname`);
await db.exec(sql);
await db.exec(sql); // safe to run again
const after = await q(`select proname, md5(prosrc) as h from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and proname not in ('traffic_add', 'admin_traffic') order by proname`);
eq(after, before, "every function from before is as it was");

const add = async (o = {}, key = "server-key") => {
  const a = { kind: "home", path: "/", source: "direct", host: null, visit: false, signed: false, ...o };
  return (await q(`select public.traffic_add($1, $2, $3, $4, $5, $6, $7) as r`, [key, a.kind, a.path, a.source, a.host, a.visit, a.signed]))[0].r;
};
const today = (await q(`select (now() at time zone 'Asia/Kolkata')::date::text as d`))[0].d;
const days = async (d = today) => (await q(`select kind, source, views::int, visits::int, signed_views::int from private.traffic_days where day = $1::date order by kind, source`, [d]));
const pages = async (d = today) => (await q(`select path, kind, views::int, visits::int from private.traffic_pages where day = $1::date order by path`, [d]));
const sites = async (d = today) => (await q(`select host, visits::int from private.traffic_referrers where day = $1::date order by host`, [d]));

// The key, the kind, the source and the path come first.
eq(await add({}, "wrong"), { r: "unavailable" }, "a wrong key counts nothing");
eq(await add({}, null), { r: "unavailable" }, "no key counts nothing");
eq(await add({ kind: "page" }), { r: "bad" }, "only the app's kinds");
eq(await add({ kind: "HOME" }), { r: "bad" }, "the kind as sent, no guessing");
eq(await add({ kind: null }), { r: "bad" }, "no kind");
eq(await add({ source: "tiktok" }), { r: "bad" }, "only the app's sources");
eq(await add({ source: null }), { r: "bad" }, "no source");
for (const p of [null, "", "turf/x", "/turf/x?utm_source=google", "/turf/x#reviews", "/turf x", "/a\\b", "/a\nb", "/admin", "/admin/tools", "/api/traffic", "/" + "a".repeat(120)]) {
  eq(await add({ path: p }), { r: "bad" }, `not a page's path: ${JSON.stringify(p)?.slice(0, 40)}`);
}
eq(await days(), [], "a refused call leaves no row");
eq(await pages(), [], "and no page");

// Views and visits.
eq(await add({ kind: "turf", path: "/turf/kick-off-arena", source: "google", visit: true }), { r: "ok" }, "a visit from Google, landing on a turf page");
eq(await add({ kind: "city", path: "/pune", source: "google" }), { r: "ok" }, "then a page inside the site: a view from that Google arrival");
eq(await add({ kind: "turf", path: "/turf/kick-off-arena", source: "internal", visit: true }), { r: "ok" }, "an internal view asking to be a visit");
eq(await add({ kind: "turf", path: "/turf/kick-off-arena", source: "whatsapp", visit: true, signed: true }), { r: "ok" }, "a signed-in visit from WhatsApp");
eq(await add({ kind: "other", path: "(not found)", source: "direct", visit: true }), { r: "ok" }, "a page that doesn't exist, typed in");
eq(await add({ kind: "home", path: "/", source: "direct", visit: null, signed: null }), { r: "ok" }, "visit and signed null are no");
eq(await days(), [
  { kind: "city", source: "google", views: 1, visits: 0, signed_views: 0 },
  { kind: "home", source: "direct", views: 1, visits: 0, signed_views: 0 },
  { kind: "other", source: "direct", views: 1, visits: 1, signed_views: 0 },
  { kind: "turf", source: "google", views: 1, visits: 1, signed_views: 0 },
  { kind: "turf", source: "internal", views: 1, visits: 0, signed_views: 0 },
  { kind: "turf", source: "whatsapp", views: 1, visits: 1, signed_views: 1 },
], "per kind and source: an internal view is never a visit");
eq(await pages(), [
  { path: "(not found)", kind: "other", views: 1, visits: 1 },
  { path: "/", kind: "home", views: 1, visits: 0 },
  { path: "/pune", kind: "city", views: 1, visits: 0 },
  { path: "/turf/kick-off-arena", kind: "turf", views: 3, visits: 2 },
], "per page: views and the visits that landed on it");
eq(await sites(), [], "no other site yet");

// Other sites: the host name for a visit from one, and only then.
eq(await add({ kind: "blog", path: "/blog/best-turfs", source: "other_site", host: "Reddit.com", visit: true }), { r: "ok" }, "a visit from another site");
eq(await add({ kind: "blog", path: "/blog/best-turfs", source: "other_site", host: "reddit.com", visit: false }), { r: "ok" }, "a view in that load (not a visit): no host");
eq(await add({ kind: "home", source: "google", host: "reddit.com", visit: true }), { r: "ok" }, "a host with another source: not kept");
for (const h of ["10.0.0.1", "localhost", "a b.com", "https://x.com/path", "x".repeat(101) + ".com", "-bad.com"]) {
  eq(await add({ kind: "home", source: "other_site", host: h, visit: true }), { r: "ok" }, `a host that isn't a clean name still counts the visit, without it: ${h.slice(0, 30)}`);
}
eq(await sites(), [{ host: "reddit.com", visits: 1 }], "only the clean host of a visit, lowercased");
eq((await days()).find((d) => d.kind === "home" && d.source === "other_site"), { kind: "home", source: "other_site", views: 6, visits: 6, signed_views: 0 }, "those visits counted all the same");

// Another app (an Android app's referrer that is no known source): its package, marked as an app.
eq(await add({ kind: "city", path: "/pune", source: "app", host: "Com.Google.Android.Gm", visit: true }), { r: "ok" }, "a visit from another app");
eq(await add({ kind: "city", path: "/pune", source: "app", host: "com.google.android.gm", visit: false }), { r: "ok" }, "a view in that load: no package");
eq(await add({ kind: "city", path: "/pune", source: "app", host: "com.example.my_app", visit: true }), { r: "ok" }, "a package that isn't a clean name: the visit, without it");
eq((await q(`select host, visits::int, app from private.traffic_referrers where day = $1::date order by host`, [today])), [
  { host: "com.google.android.gm", visits: 1, app: true },
  { host: "reddit.com", visits: 1, app: false },
], "the app's package, lowercased and marked as an app; a website is not");
eq((await days()).find((d) => d.kind === "city" && d.source === "app"), { kind: "city", source: "app", views: 3, visits: 2, signed_views: 0 }, "the app's visits and views by source");

// Two at once all count.
await Promise.all([
  add({ kind: "map", path: "/map", source: "instagram", visit: true }),
  add({ kind: "map", path: "/map", source: "instagram", visit: true, signed: true }),
  add({ kind: "map", path: "/map", source: "instagram" }),
  add({ kind: "blog", path: "/blog/best-turfs", source: "other_site", host: "reddit.com", visit: true }),
  add({ kind: "blog", path: "/blog/new-post", source: "other_site", host: "news.ycombinator.com", visit: true }),
]);
eq((await days()).find((d) => d.kind === "map"), { kind: "map", source: "instagram", views: 3, visits: 2, signed_views: 1 }, "calls at the same time all count");
eq((await pages()).find((p) => p.path === "/map"), { path: "/map", kind: "map", views: 3, visits: 2 }, "and the page");
eq(await sites(), [{ host: "com.google.android.gm", visits: 1 }, { host: "news.ycombinator.com", visits: 1 }, { host: "reddit.com", visits: 2 }], "and the sites");

// The caps: about 3000 pages and 300 sites a day; a new one past that is '(other)', one already there still counts as itself.
await q(`insert into private.traffic_pages (day, path, kind, views, visits) select $1::date, '/turf/t' || g, 'turf', 1, 0 from generate_series(1, 3000 - (select count(*)::int from private.traffic_pages where day = $1::date)) g`, [today]);
eq((await q(`select count(*)::int as n from private.traffic_pages where day = $1::date`, [today]))[0].n, 3000, "the day has its fill of pages");
eq(await add({ kind: "turf", path: "/turf/one-more", source: "google", visit: true }), { r: "ok" }, "a new page past the cap");
eq(await add({ kind: "game", path: "/game/abc", source: "direct" }), { r: "ok" }, "and another");
eq(await add({ kind: "map", path: "/map", source: "direct" }), { r: "ok" }, "a page already there");
const capped = await pages();
eq(capped.find((p) => p.path === "(other)"), { path: "(other)", kind: "other", views: 2, visits: 1 }, "new pages past the cap count under (other)");
ok(!capped.some((p) => p.path === "/turf/one-more" || p.path === "/game/abc"), "and are not kept by their path");
eq(capped.find((p) => p.path === "/map")?.views, 4, "a page already in the day still counts as itself");
eq(capped.length, 3001, "the day's pages: 3000 and (other)");
eq((await days()).find((d) => d.kind === "game"), { kind: "game", source: "direct", views: 1, visits: 0, signed_views: 0 }, "the day's counts by kind still have it");
await q(`insert into private.traffic_referrers (day, host, visits) select $1::date, 'site' || g || '.example', 1 from generate_series(1, 300 - (select count(*)::int from private.traffic_referrers where day = $1::date)) g`, [today]);
eq(await add({ kind: "home", source: "other_site", host: "one-more.example", visit: true }), { r: "ok" }, "a new site past the cap");
eq(await add({ kind: "home", source: "other_site", host: "reddit.com", visit: true }), { r: "ok" }, "a site already there");
const s2 = await sites();
eq(s2.find((s) => s.host === "(other)"), { host: "(other)", visits: 1 }, "a new site past the cap counts under (other)");
eq(s2.find((s) => s.host === "reddit.com"), { host: "reddit.com", visits: 3 }, "a site already in the day still counts as itself");
ok(!s2.some((s) => s.host === "one-more.example"), "and the new one is not kept by name");
eq(await add({ kind: "home", source: "app", host: "org.telegram.messenger", visit: true }), { r: "ok" }, "a new app past the cap");
eq(await q(`select host, visits::int, app from private.traffic_referrers where day = $1::date and host in ('(other)', 'org.telegram.messenger')`, [today]), [{ host: "(other)", visits: 2, app: false }], "counts under (other) too, which is no one app");

// The day is India's: a row is today's there.
const [{ d: rowDay }] = await q(`select max(day)::text as d from private.traffic_days`);
eq(rowDay, today, "counted on India's day");

// Nobody but the server: no table grants, no direct reads.
for (const role of ["anon", "authenticated"]) {
  for (const tbl of ["private.traffic_days", "private.traffic_pages", "private.traffic_referrers"]) {
    for (const p of ["select", "insert", "update"]) ok(!(await q(`select has_table_privilege($1, $2, $3) as p`, [role, tbl, p]))[0].p, `${role} cannot ${p} ${tbl}`);
  }
}
for (const fn of ["traffic_add(text,text,text,text,text,boolean,boolean)", "admin_traffic(text,integer)"]) {
  const grants = await q(`select grantee from information_schema.routine_privileges where specific_name ~ $1 and privilege_type = 'EXECUTE'`, [`^${fn.split("(")[0]}_[0-9]+$`]);
  ok(grants.some((g) => g.grantee === "anon") && grants.some((g) => g.grantee === "authenticated") && !grants.some((g) => g.grantee === "PUBLIC"), `${fn}: anon and authenticated may call it (the check is inside), PUBLIC not`);
  const def = (await q(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
  ok(def.prosecdef === true && String(def.proconfig).includes('search_path=""'), `${fn}: security definer with an empty search_path`);
}
for (const name of ["traffic_add", "admin_traffic"]) eq((await q(`select count(*)::int as n from pg_proc where proname = $1`, [name]))[0].n, 1, `${name}: no overload after running it twice`);
const cols = (await q(`select table_name, column_name from information_schema.columns where table_schema = 'private' and table_name like 'traffic_%' order by table_name, ordinal_position`)).map((c) => `${c.table_name}.${c.column_name}`);
eq(cols, [
  "traffic_days.day", "traffic_days.kind", "traffic_days.source", "traffic_days.views", "traffic_days.visits", "traffic_days.signed_views", "traffic_days.updated_at",
  "traffic_pages.day", "traffic_pages.path", "traffic_pages.kind", "traffic_pages.views", "traffic_pages.visits",
  "traffic_referrers.day", "traffic_referrers.host", "traffic_referrers.visits", "traffic_referrers.app",
], "the tables hold counts per day, page and site, and nothing about a visitor");
// As anon, through the function only (the key still gates it).
await db.exec(`set role anon`);
eq((await q(`select public.traffic_add('server-key', 'tools', '/tools/cricket-toss', 'youtube', null, true, false) as r`))[0].r, { r: "ok" }, "anon may call it with the key");
eq((await q(`select public.traffic_add('nope', 'tools', '/tools/cricket-toss', 'youtube', null, true, false) as r`))[0].r, { r: "unavailable" }, "and not without it");
await assert.rejects(q(`select * from private.traffic_days`), /permission denied/);
await assert.rejects(q(`select * from private.traffic_pages`), /permission denied/);
await assert.rejects(q(`select * from private.traffic_referrers`), /permission denied/);
await assert.rejects(q(`select public.admin_traffic(null)`), /not allowed/);
passed += 4;
await db.exec(`reset role`);

// Earlier days, as the app would have left them, for the windows and the series.
const ago = async (n) => (await q(`select ($1::date - $2::int)::text as d`, [today, n]))[0].d;
for (const [n, kind, source, views, visits, signed] of [
  [1, "home", "google", 40, 20, 4], [1, "turf", "whatsapp", 10, 8, 1], [1, "turf", "internal", 30, 0, 3],
  [7, "city", "google", 100, 50, 10], [7, "blog", "other_site", 7, 7, 0],
  [8, "home", "google", 60, 30, 6], [14, "tools", "direct", 15, 10, 0], [15, "home", "google", 999, 999, 0],
  [30, "game", "x", 9, 9, 9], [31, "home", "ai", 500, 500, 0], [89, "map", "direct", 3, 3, 0],
]) {
  await q(`insert into private.traffic_days (day, kind, source, views, visits, signed_views) values ($1::date, $2, $3, $4, $5, $6)`, [await ago(n), kind, source, views, visits, signed]);
}
for (const [n, p, kind, views, visits] of [[1, "/turf/kick-off-arena", "turf", 18, 8], [1, "/", "home", 40, 20], [2, "/turf/kick-off-arena", "turf", 2, 0], [7, "/pune", "city", 100, 50], [7, "/blog/best-turfs", "blog", 7, 7], [8, "/hyderabad", "city", 60, 30]]) {
  await q(`insert into private.traffic_pages (day, path, kind, views, visits) values ($1::date, $2, $3, $4, $5)`, [await ago(n), p, kind, views, visits]);
}
for (const [n, host, visits] of [[1, "reddit.com", 2], [7, "reddit.com", 3], [7, "quora.com", 4], [8, "old.example", 50]]) {
  await q(`insert into private.traffic_referrers (day, host, visits) values ($1::date, $2, $3)`, [await ago(n), host, visits]);
}
// A day in the future (a clock that went wrong) never counts in a window.
await q(`insert into private.traffic_days (day, kind, source, views) values ($1::date + 1, 'home', 'direct', 5000)`, [today]);

// The admin read: the site owner only.
await db.exec(`set test.owner = 'no'`);
await assert.rejects(q(`select public.admin_traffic(null)`), /not allowed/);
await assert.rejects(q(`select public.admin_traffic('t', 30)`), /not allowed/);
passed += 2;
await db.exec(`set test.owner = 'yes'`);
const read = async (d) => (await q(d === undefined ? `select public.admin_traffic('t') as u` : `select public.admin_traffic('t', $1) as u`, d === undefined ? [] : [d]))[0].u;
const u = await read();
const n = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
eq(u.today, today, "today is India's day");
eq(u.since, await ago(89), "the first day counted");
const todayRows = await days();
const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
eq(n(u.totals.today), { views: sum(todayRows, "views"), visits: sum(todayRows, "visits"), signed_views: sum(todayRows, "signed_views") }, "today: every view counted today");
eq(n(u.totals.yesterday), { views: 80, visits: 28, signed_views: 8 }, "yesterday");
eq(n(u.totals.d7), { views: 187, visits: 85, signed_views: 18 }, "the last 7 full days: yesterday back to day 7, not today");
eq(n(u.totals.prev7), { views: 75, visits: 40, signed_views: 6 }, "the 7 before them: days 8 to 14, not day 15");
eq(n(u.totals.d30), { views: 1270, visits: 1133, signed_views: 33 }, "the last 30 full days: days 1 to 30, not today, day 31 or the future");
eq(u.daily.length, 31, "every one of the 30 full days, and today");
eq(u.daily[0].day, await ago(30), "oldest first: day 30, the 30 days' first");
eq(u.daily[30].day, today, "today last");
eq(n({ v: u.daily[29].views, s: u.daily[29].visits, g: u.daily[29].signed_views }), { v: 80, s: 28, g: 8 }, "yesterday's numbers, every kind and source added up");
eq(Number(u.daily[30].views), sum(todayRows, "views"), "today's so far");
const full30 = u.daily.slice(0, 30);
eq(n({ views: sum(full30.map(n), "views"), visits: sum(full30.map(n), "visits"), signed_views: sum(full30.map(n), "signed_views") }), n(u.totals.d30), "the series' 30 full days add up to the 30 days' totals (the chart and the 30 days tab are the same days)");
eq(u.daily.filter((d) => Number(d.views) === 0).length, 24, "a day with none is a 0 (days 1, 7, 8, 14, 15, 30 and today have views)");
eq((await read(90)).daily.length, 91, "up to 90 full days and today");
eq((await read(1000)).daily.length, 91, "never more");
eq((await read(1)).daily.length, 8, "at least 7 and today");
eq((await read(null)).daily.length, 31, "30 and today by default");
eq(u.by_source.d7.map((x) => [x.source, Number(x.visits), Number(x.views)]), [["google", 70, 140], ["whatsapp", 8, 10], ["other_site", 7, 7], ["internal", 0, 30]], "7 days by source, most visits first; internal has views only");
eq(u.by_source.d30.map((x) => x.source), ["google", "direct", "x", "whatsapp", "other_site", "internal"], "30 days by source");
eq(u.by_source.today.find((x) => x.source === "instagram"), { source: "instagram", visits: 2, views: 3 }, "today by source");
eq(u.by_kind.d7.map((x) => [x.kind, Number(x.views), Number(x.visits)]), [["city", 100, 50], ["home", 40, 20], ["turf", 40, 8], ["blog", 7, 7]], "7 days by kind, most views first");
ok(u.by_kind.today.some((x) => x.kind === "map" && Number(x.views) >= 4), "today by kind");
eq(u.pages.d7.rows.map((p) => [p.path, p.kind, Number(p.views), Number(p.visits)]), [["/pune", "city", 100, 50], ["/", "home", 40, 20], ["/turf/kick-off-arena", "turf", 20, 8], ["/blog/best-turfs", "blog", 7, 7]], "the 7 days' top pages: every day of a page added up, not day 8 or today");
eq(u.pages.d7.total, 4, "how many pages had a view");
eq(u.sites.d7.rows.map((s) => [s.host, Number(s.visits), s.app]), [["reddit.com", 5, false], ["quora.com", 4, false]], "the 7 days' other sites by visits, not day 8 or today");
eq(u.sites.d7.total, 2, "how many sites");
eq(u.pages.d30.rows.map((p) => [p.path, Number(p.views)]), [["/pune", 100], ["/hyderabad", 60], ["/", 40], ["/turf/kick-off-arena", 20], ["/blog/best-turfs", 7]], "the 30 days' top pages: day 8 in, today out");
eq([u.pages.d30.total, u.sites.d30.total], [5, 3], "with how many");
eq(u.sites.d30.rows.map((s) => [s.host, Number(s.visits)]), [["old.example", 50], ["reddit.com", 5], ["quora.com", 4]], "the 30 days' other sites");
// Today's: what counting's first day shows (the 7 days are still empty then).
const todayPaths = (await q(`select count(distinct path)::int as n, max(views)::int as top from private.traffic_pages where day = $1::date`, [today]))[0];
eq([u.pages.today.rows.length, u.pages.today.total, Number(u.pages.today.rows[0].views)], [30, todayPaths.n, todayPaths.top], "today's top pages: 30 of the day's, most viewed first, with how many");
ok(u.pages.today.rows.every((p, i, a) => i === 0 || Number(a[i - 1].views) >= Number(p.views)), "today's pages in order");
eq(u.sites.today.rows.find((s) => s.host === "com.google.android.gm"), { host: "com.google.android.gm", visits: 1, app: true }, "today's other sites and apps, an app marked as one");
eq(u.sites.today.total, (await q(`select count(*)::int as n from private.traffic_referrers where day = $1::date`, [today]))[0].n, "with how many");
eq(Object.keys(u).sort(), ["by_kind", "by_source", "daily", "pages", "since", "sites", "today", "totals"], "the answer's parts, and only those");
for (const part of ["pages", "sites", "by_source", "by_kind"]) eq(Object.keys(u[part]).sort(), ["d30", "d7", "today"], `${part}: today, 7 and 30 days`);
// Top 30 pages and 20 sites at most.
for (let i = 0; i < 40; i++) {
  await q(`insert into private.traffic_pages (day, path, kind, views, visits) values ($1::date, $2, 'turf', $3, 0)`, [await ago(3), `/turf/p${i}`, 1 + i]);
  await q(`insert into private.traffic_referrers (day, host, visits) values ($1::date, $2, $3)`, [await ago(3), `s${i}.example`, 1 + i]);
}
const many = await read();
eq(many.pages.d7.rows.length, 30, "30 pages at most");
eq(many.pages.d7.total, 44, "with how many in all");
eq(many.sites.d7.rows.length, 20, "20 sites at most");
eq(many.sites.d7.total, 42, "with how many in all");
ok(Number(many.pages.d7.rows[0].views) >= Number(many.pages.d7.rows[29].views), "most viewed first");
eq([many.pages.d30.rows.length, many.sites.d30.rows.length], [30, 20], "the 30 days too");
ok(!/@|\+91/.test(JSON.stringify(many)), "no email or phone anywhere in the answer");

// Before anything was counted: zeros, empty lists, no since.
const fresh = new PGlite();
await fresh.exec(`create role anon; create role authenticated; create schema private;
create function private.account_key_ok(p_key text) returns boolean language sql stable as $$ select p_key = 'server-key' $$;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select true $$;`);
await fresh.exec(sql);
const e = (await fresh.query(`select public.admin_traffic(null) as u`)).rows[0].u;
const none = { rows: [], total: 0 };
eq([e.since, e.pages, e.sites, n(e.totals.d7), e.daily.length, e.by_source.d7, e.by_kind.today], [null, { today: none, d7: none, d30: none }, { today: none, d7: none, d30: none }, { views: 0, visits: 0, signed_views: 0 }, 31, [], []], "an empty database answers zeros");

console.log(`traffic: ${passed} checks passed`);
