// Applies 20261128_turf_events.sql (twice) and 20261128_turf_events_notice.sql
// (twice) to an in-memory Postgres (PGlite) on top of the real live
// tournaments (20261102_live_tournaments.sql, with 20261021_live_matches.sql
// before it) and the real key checks, all read from the repo's migrations,
// with stand-ins only for what those read or what is older than the repo's
// files (Supabase's roles, the key table, pg_cron, public.users, public.turfs,
// public.notifications, the site owner check), and checks: each file's rules
// (additive, none of the destructive keywords even inside a word or a
// comment, no backslash anywhere, search_path '', the header's md5 is the
// repo's latest body, nothing replaced, no table, no index); the grants and
// settings are tournament_get's; a wrong key is refused; a tournament counts
// only when it is on, its venue is a listed turf and it is not stale (the 14
// India days edge, or a match being scored right now); a live fixture shows
// while its scorecard is live and updated in the last 2 hours and not after,
// never one taken out, never one with a result; played, total and next are
// the tournament page's own; 3 tournaments a turf and 200 turfs at most;
// nothing about who organises it is answered; reading writes nothing. And
// the notice: one row per signed-in organiser whose tournament shows, naming
// the one changed last, twice is still one, no account no row.
// Never touches a real database. Made-up people and turfs.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_events.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: turf_events.check.mjs <supabase/migrations>");
const NAME = "20261128_turf_events.sql";
const NOTICE_NAME = "20261128_turf_events_notice.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
const NOTICE = fs.readFileSync(`${M}/${NOTICE_NAME}`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");
const noComments = (s) => s.replace(/^\s*--.*$/gm, "");

// ── 0. The two files. ──
const code = noComments(NEW);
for (const [what, text] of [[NAME, NEW], [NOTICE_NAME, NOTICE]]) {
  ok(!/drop|delete|truncate/i.test(text), `${what}: none of the destructive keywords, not in a comment, not inside a word`);
  ok(!text.includes(String.fromCharCode(92)), `${what}: no backslash anywhere in the file`);
  ok(!/[—–]/.test(text), `${what}: no em or en dashes`);
  ok(/^set local lock_timeout = '5s';\n/.test(text), `${what}: starts with the lock timeout`);
  ok(/\ndo \$\$\nbegin\n  if to_regproc/.test(text) && text.indexOf("\ndo $$") < text.search(/\n(create|insert)\b/), `${what}: a guard block comes before anything else`);
  ok(!/\b(create|alter)\s+(table|index|unique|policy|trigger|schema|type|view)\b|cron\.schedule/i.test(noComments(text)), `${what}: no table, index, policy, trigger or job`);
}
ok(!/\b(update|insert\s+into)\b/i.test(code), "the read's file writes nothing anywhere");
ok(!/\bgrant\b[^;]*\bon\s+(?!function public\.turf_events_now\()/i.test(code), "its grants are on its own function");
const from = NEW.indexOf("as $$", NEW.indexOf("create or replace function public.turf_events_now")) + 5;
const BODY = NEW.slice(from, NEW.indexOf("$$;", from));
ok(/^\ndeclare\n  v_today date := \(now\(\) at time zone 'Asia\/Kolkata'\)::date;\nbegin\n  if not private\.live_key_ok\(p_key\) then\n    return jsonb_build_object\('r', 'unavailable'\);\n  end if;/.test(BODY), "the key is checked before anything is read, and refused as tournament_get refuses it");
ok(!/user_id|usernames|public\.users|player_badges|secret|ip_hash|\bemail\b|\bphone\b|\bwrites\b|\brev\b/i.test(BODY), "its body reads nothing about who organises it: no account, no secret, no network hash");
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.turf_events_now"], "exactly one function");
eq((code.match(/security definer/g) ?? []).length, 1, "security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 1, "with an empty search_path");
eq((code.match(/\bstable\b/g) ?? []).length, 1, "stable");
eq((code.match(/revoke all on function public\.turf_events_now\(text\) from public, anon, authenticated;/g) ?? []).length, 1, "revoked from public, anon and authenticated before its grant");
eq((code.match(/grant execute on function public\.turf_events_now\(text\) to anon, authenticated;/g) ?? []).length, 1, "granted as tournament_get is");
for (const w of ["if a\n-- tournament is setup or a live match is setup on turf show that please\n-- on the turf page", "Replaced: none.", "Never who organises it", "No table is altered", "No index is added", "create index if not exists tournaments_venue_on_idx", "The app works before this file", "production\n-- was not read for this file", "Safe to run again", "Nothing here matches a venue by its typed text", "Never in a title, a description, an og tag or JSON-LD", "At most 3 tournaments a turf", "at most 200\n--     turfs"])
  ok(NEW.includes(w), `the header says: ${w.replace(/\n-- */g, " ")}`);

// The header's md5: the md5 of that function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
const HEADER = [...NEW.matchAll(/^--\s+(public|private)\.(\w+)\s+([0-9a-f]{32})\b(?:\s+(\S+\.sql))?/gm)].map((m) => ({ fn: `${m[1]}.${m[2]}`, md5: m[3], file: m[4] ?? null }));
const FILES = fs.readdirSync(M).filter((f) => f.endsWith(".sql")).sort();
const repoDef = (fn) => {
  const [s, f] = fn.split(".");
  let last = null;
  for (const file of FILES) {
    if (file === NAME) continue;
    const txt = fs.readFileSync(`${M}/${file}`, "utf8");
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${s}\\.${f}\\s*\\(`, "gi");
    for (let m; (m = re.exec(txt)); ) {
      const rest = txt.slice(m.index);
      const d = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
      if (!d) continue;
      const start = d.index + d[0].length;
      const end = rest.indexOf(d[1], start);
      last = { body: rest.slice(start, end), sql: rest.slice(0, end + d[1].length) + ";", file };
    }
  }
  return last;
};
const CALLED = ["private.live_key_ok"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the one function it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
eq([...calls].sort(), CALLED, "it calls exactly that one");
const reads = (sql) => [...new Set([...noComments(sql).matchAll(/\b(?:from|join)\s+((?:public|private)\.\w+)/g)].map((m) => m[1]))].sort();
eq(reads(BODY), ["private.tournament_fixtures", "private.tournament_teams", "private.tournaments", "public.live_matches", "public.turfs"], "it reads exactly the five tables its header names, and no table about people");
eq(repoDef("public.turf_events_now"), null, "the function is new: no earlier file has it");
for (const file of FILES.filter((f) => f < NAME)) ok(!/turf_events/.test(fs.readFileSync(`${M}/${file}`, "utf8")), `${file} knows nothing of it`);
// The notice: one insert into public.notifications, guarded by its own type, and nothing else.
const ncode = noComments(NOTICE);
eq((ncode.match(/\binsert\s+into\s+(\S+)/gi) ?? []).map((x) => x.toLowerCase()), ["insert into public.notifications"], "the notice: one insert, into public.notifications");
ok(!/\bupdate\b|create or replace|\bgrant\b|\brevoke\b/i.test(ncode), "it changes no row, function or grant");
ok(/where not exists \(select 1 from public\.notifications q\s+where q\.user_id = x\.user_id and q\.type = 'tournament_on_turf_page'\)/.test(ncode), "and adds nothing where its own notice is already there");
eq((NOTICE.match(/'tournament_on_turf_page'/g) ?? []).length, 2, "its type is said twice: the row and the check for it");
ok(!/email_|private\.email/.test(ncode), "it queues no email");

// ── The database before it: the real files, with stand-ins for what they read. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const BASE = `
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create schema cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
create table public.users (id uuid primary key, name character varying, email text, phone text, profile_image_url text);
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select false $$;
-- Older than the repo's migrations: the columns the read and the notice use, and the notifications table as the other checks have it.
create table public.notifications (id uuid not null default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb, is_read boolean default false, created_at timestamptz default now());
`;
await db.exec(BASE);
await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
await db.exec(repoDef("private.account_key_ok").sql);
await db.exec(repoDef("private.live_key_ok").sql);
eq(md5((await one(`select prosrc from pg_proc where proname = 'live_key_ok'`)).prosrc), HEADER[0].md5, "the key check loaded here is the body the header names");
await db.exec(`
insert into private.app_secrets (name, value) values ('account', 'account-key') on conflict (name) do update set value = excluded.value;
insert into private.app_secrets (name, value) values ('live_write', 'live-key') on conflict (name) do update set value = excluded.value;
`);
const LIVE = "live-key";
const ACCOUNT = "account-key";

// Refuses to run without what it needs, changing nothing.
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /turf_events needs/, "before the tournaments and the turfs it refuses");
await db.exec("rollback");
await db.exec(fs.readFileSync(`${M}/20261102_live_tournaments.sql`, "utf8"));
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /turf_events needs/, "with the tournaments but no turfs table it still refuses");
await db.exec("rollback");
eq((await one(`select to_regprocedure('public.turf_events_now(text)') as f`)).f, null, "and leaves nothing behind");
await assert.rejects(db.exec(`begin; ${NOTICE}; commit;`), /turf_events_notice needs/, "the notice refuses before the read is there");
await db.exec("rollback");
eq((await one(`select count(*)::int as n from public.notifications`)).n, 0, "and writes nothing");
passed += 3;
await db.exec(`create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, is_active boolean default true)`);

const fns = () => q(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, p.prosecdef, p.proconfig, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname <> 'turf_events_now' order by 1`);
const columns = () => q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
const indexes = () => q(`select schemaname, tablename, indexname from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`);
const before = { fns: await fns(), columns: await columns(), indexes: await indexes() };
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture: made-up turfs, people and tournaments. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const KINGS = T(1), GREEN = T(2), CLOSED = T(3), BUSY = T(4), NOTURF = T(99);
for (const [id, name, slug, active] of [[KINGS, "Kings Turf Arena", "kings-turf-arena", true], [GREEN, "Greenfield Sports Hub", "greenfield-sports-hub", true], [CLOSED, "Closed Box Arena", "closed-box-arena", false], [BUSY, "Busy Turf", null, true]])
  await q(`insert into public.turfs (id, name, slug, city, is_active) values ($1, $2, $3, 'pune', $4)`, [id, name, slug, active]);
// 1 Asha and 2 Ravi have accounts; 3 has an account and only a stale tournament; nobody else signed in.
for (const [n, name, phone, email] of [[1, "Asha Rao", "+919800000001", "asha@example.test"], [2, "Ravi Kumar", "+919800000002", "ravi@example.test"], [3, "Kiran Shah", "+919800000003", null]])
  await q(`insert into public.users (id, name, phone, email) values ($1, $2, $3, $4)`, [U(n), name, phone, email]);

const SECRET = (n) => String(n).padStart(2, "0").repeat(32);
const venueOf = (id, name) => (id ? { id, slug: null, name, area: "Baner, Pune" } : null);
const settings = (venue, o = {}) => ({ format: "league", legs: 1, matches: 0, playoffs: "none", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue, starts: null, ends: null, ...o });
const TEAMS = ["Titans", "Strikers", "Royals", "Kings"].map((name) => ({ name, short: null }));
const PAIRS = [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]];
const league = (name, venue, o = {}) => ({
  name,
  settings: settings(venue, { playoffs: "final", ...o }),
  teams: TEAMS,
  fixtures: [...PAIRS.map(([home, away], i) => ({ id: i + 1, stage: "league", slot: null, round: Math.floor(i / 2) + 1, seq: i, home, away, day: i === 3 ? "2026-11-28" : null, time: i === 3 ? "19:30" : null, result: null })),
    { id: 7, stage: "final", slot: "f", round: 9, seq: 6, home: null, away: null, day: null, time: null, result: null }],
});
const series = (name, venue, o = {}) => ({ name, settings: settings(venue, { format: "bilateral", matches: 3, ...o }), teams: TEAMS.slice(0, 2), fixtures: [1, 2, 3].map((id) => ({ id, stage: "league", slot: null, round: 1, seq: id - 1, home: 1, away: 2, day: null, time: null, result: null })) });
const C = (n) => `t${String(n).padStart(11, "0")}`;
const L = (n) => `l${String(n).padStart(11, "0")}`;
let net = 0;
const create = async (n, data) => (await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(n), SECRET(n), JSON.stringify(data), String(++net).padStart(32, "0")])).r.r;
const attach = async (n, user) => (await one(`select public.tournament_attach($1, $2, $3, $4) as r`, [ACCOUNT, C(n), SECRET(n), user])).r.r;
const change = async (n, op, d = {}) => (await one(`select public.tournament_update($1, $2, $3, $4, $5::jsonb) as r`, [LIVE, C(n), SECRET(n), op, JSON.stringify(d)])).r.r;
const now = async (key = LIVE) => (await one(`select public.turf_events_now($1) as r`, [key])).r;
const at = async (turf) => (await now()).find((x) => x.turf === turf)?.tournaments ?? null;
const codesAt = async (turf) => ((await at(turf)) ?? []).map((x) => x.code);
// A live scorecard as the scorer's writes leave it, and its last update moved back in time.
const scorecard = (n, status = "live") => q(`insert into public.live_matches (code, secret_hash, match, rev, status) values ($1, sha256('s'::bytea), '{"v": 1}'::jsonb, 3, $2)`, [L(n), status]);
const idle = (n, minutes) => db.exec(`update public.live_matches set updated_at = now() - interval '${minutes} minutes' where code = '${L(n)}'`);
// A tournament last changed at the very start of the India day `days` ago, or `seconds` before that.
const changed = (n, days, seconds = 0) => db.exec(`update private.tournaments set updated_at = (((now() at time zone 'Asia/Kolkata')::date - ${days})::timestamp at time zone 'Asia/Kolkata') - interval '${seconds} seconds' where code = '${C(n)}'`);
const INN = (runs) => ({ runs, wickets: 4, balls: 36, allOut: false });
const HAND = { a: INN(63), b: INN(54), result: "auto", battedFirst: "a" };

eq(await now(), [], "nothing made yet: an empty list, not null");
// 1 Asha's league at Kings.          2 a league with no venue.          3 a league at a turf that is not listed.
// 4 a league whose venue is no turf. 5 Ravi's series at Greenfield.     6 nobody's league at Greenfield (never signed in).
// 7 Kiran's league at Greenfield, gone quiet. 8 Asha's second, a series at Greenfield.
eq(await create(1, league("Sunday Box League", venueOf(KINGS, "Kings Turf Arena"))), "ok", "1: a league with a final at Kings");
eq(await create(2, league("No Venue Cup", null)), "ok", "2: no venue");
eq(await create(3, league("Closed Arena Cup", venueOf(CLOSED, "Closed Box Arena"))), "ok", "3: at a turf that is not listed");
eq(await create(4, league("Made Up Venue Cup", venueOf(NOTURF, "Kings Turf Arena"))), "ok", "4: a venue id that is no turf, with a real turf's name typed");
eq(await create(5, series("Titans v Strikers", venueOf(GREEN, "Greenfield Sports Hub"))), "ok", "5: a three-match series at Greenfield");
eq(await create(6, league("Walk-in League", venueOf(GREEN, "Greenfield Sports Hub"), { legs: 2, playoffs: "semis" })), "ok", "6: a double round robin with semi-finals at Greenfield, nobody signed in");
eq(await create(7, league("Old League", venueOf(GREEN, "Greenfield Sports Hub"))), "ok", "7: another at Greenfield");
eq(await create(8, series("Asha's Series", venueOf(GREEN, "Greenfield Sports Hub"), { starts: "2026-12-05", ends: "2026-12-06" })), "ok", "8: a series at Greenfield with dates of its own");
for (const [n, u] of [[1, 1], [5, 2], [7, 3], [8, 1]]) eq(await attach(n, U(u)), "ok", `tournament ${n} kept with account ${u}`);

// ── 1. Grants and settings: tournament_get's. ──
const priv = async (fn, args) => Object.fromEntries(await Promise.all(["anon", "authenticated", "public"].map(async (role) => [role, (await one(`select has_function_privilege($1, 'public.${fn}(${args})', 'execute') as p`, [role])).p])));
eq(await priv("turf_events_now", "text"), await priv("tournament_get", "text, text"), "who may call it is exactly who may call tournament_get");
eq(await priv("turf_events_now", "text"), { anon: true, authenticated: true, public: false }, "anon and authenticated (the key is the gate), never public's default");
const shape = async (fn) => one(`select prosecdef, proconfig, provolatile, prorettype::regtype::text as returns from pg_proc where proname = $1`, [fn]);
eq(await shape("turf_events_now"), await shape("tournament_get"), "security definer, search_path empty, stable and jsonb, as tournament_get");
eq((await one(`select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'turf_events_now'`)).args, "p_key text", "its one argument");
eq((await shape("turf_events_now")).proconfig, ['search_path=""'], "search_path is empty");

// ── 2. A wrong key is refused. ──
for (const k of [null, "", "wrong", ACCOUNT, LIVE + "x", LIVE.slice(1), "LIVE-KEY"]) eq(await now(k), { r: "unavailable" }, `refused without the live write key (${k === null ? "null" : `"${k}"`})`);

// ── 3. Which tournaments count, and exactly what is answered. ──
const NEXT1 = { stage: "league", slot: null, n: 1, home: "Titans", away: "Strikers", day: null, time: null };
const today = (await one(`select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d`)).d;
const ONE = { code: C(1), name: "Sunday Box League", format: "league", legs: 1, matches: 0, playoffs: "final", started: today, starts: null, played: 0, total: 7, live: [], next: NEXT1 };
eq(await at(KINGS), [ONE], "Kings: its one tournament, with the format's three settings, India's start date, 0 of 7 played, nothing live and the first match next");
eq(Object.keys((await at(KINGS))[0]).sort().join(), "code,format,legs,live,matches,name,next,played,playoffs,started,starts,total", "twelve keys and no other");
eq(Object.keys((await at(KINGS))[0].next).sort().join(), "away,day,home,n,slot,stage,time", "the next match: seven keys and no other");
eq(Object.keys((await now())[0]).sort().join(), "tournaments,turf", "a turf's entry: its id and its tournaments");
eq((await now()).map((x) => x.turf).sort(), [KINGS, GREEN].sort(), "only the two listed turfs with something on: not the one with no venue, the turf not listed, or the made-up id");
eq((await codesAt(GREEN)).length, 3, "Greenfield has four: only three are answered");
eq(await at(CLOSED), null, "a turf that is not listed has nothing");
eq(await at(NOTURF), null, "a venue id that is no turf is nowhere, whatever name was typed with it");
await db.exec(`update public.turfs set is_active = true where id = '${CLOSED}'`);
eq(await codesAt(CLOSED), [C(3)], "listed again, its tournament shows");
await db.exec(`update public.turfs set is_active = false where id = '${CLOSED}'`);
// The format's settings and the dates, as the tournament has them.
await changed(7, 20);
const g = Object.fromEntries((await at(GREEN)).map((x) => [x.code, x]));
eq([g[C(5)].format, g[C(5)].matches, g[C(5)].total], ["bilateral", 3, 3], "the series: bilateral, 3 matches");
eq([g[C(6)].legs, g[C(6)].playoffs], [2, "semis"], "the double round robin with semi-finals");
eq([g[C(8)].starts, g[C(8)].started], ["2026-12-05", today], "the organiser's own start date beside the day it was put on TapTurf");
// The India date of the start: 11:30 pm in India on the 16th is the 16th, though it is still the 16th at 6 pm UTC and the 17th an hour later.
await db.exec(`update private.tournaments set created_at = '2026-11-16T18:00:00Z' where code = '${C(1)}'`);
eq((await at(KINGS))[0].started, "2026-11-16", "23:30 India time on 16 Nov is 16 Nov");
await db.exec(`update private.tournaments set created_at = '2026-11-16T18:30:00Z' where code = '${C(1)}'`);
eq((await at(KINGS))[0].started, "2026-11-17", "midnight India time is the 17th");
await db.exec(`update private.tournaments set created_at = '2026-11-16T10:00:00Z' where code = '${C(1)}'`);

// ── 4. Stale: 14 of India's days, to the day. ──
await changed(1, 14);
eq(await codesAt(KINGS), [C(1)], "changed at the very start of the India day 14 days ago: still shown");
await changed(1, 14, 1);
eq(await at(KINGS), null, "one second earlier is 15 days ago: gone, and so is the turf");
await changed(1, 0);
eq(await codesAt(KINGS), [C(1)], "changed today: back");
ok(!(await codesAt(GREEN)).includes(C(7)), "the league that went quiet 20 days ago is not at Greenfield");

// ── 5. A match being scored right now. ──
await scorecard(1);
eq(await change(1, "live_link", { id: 3, live_code: L(1) }), "ok", "match 3 is scored live on a link");
eq((await at(KINGS))[0].live, [{ code: L(1), home: "Titans", away: "Royals" }], "live: the scorecard's code and the two sides as the tournament names them");
eq((await at(KINGS))[0].next, NEXT1, "next is still the first match without a result or a scorecard");
await idle(1, 119);
eq((await at(KINGS))[0].live.length, 1, "updated 1 hour 59 minutes ago: still live");
await idle(1, 121);
eq((await at(KINGS))[0].live, [], "no update for 2 hours: not live, as the follower page has it");
await idle(1, 0);
await db.exec(`update public.live_matches set status = 'done' where code = '${L(1)}'`);
eq((await at(KINGS))[0].live, [], "a finished scorecard is not live");
await db.exec(`update public.live_matches set status = 'stopped' where code = '${L(1)}'`);
eq((await at(KINGS))[0].live, [], "nor one turned off");
await db.exec(`update public.live_matches set status = 'live' where code = '${L(1)}'`);
eq((await at(KINGS))[0].live.length, 1, "live again");
// A stale tournament with a match on now is shown; when the match goes quiet it is gone again.
await changed(1, 40);
eq(await codesAt(KINGS), [C(1)], "not changed for 40 days, but a match is being scored: shown");
await idle(1, 121);
eq(await at(KINGS), null, "the match gone quiet for 2 hours: stale again");
await idle(1, 0);
await changed(1, 0);
// A result typed by hand ends "live now" for that fixture, whatever its scorecard says.
eq(await change(1, "result", { id: 3, result: HAND }), "ok", "the organiser types match 3's result");
eq([(await at(KINGS))[0].live, (await at(KINGS))[0].played], [[], 1], "it is played, not live");
eq(await change(1, "result", { id: 3, result: null }), "ok", "the result is cleared");
eq((await at(KINGS))[0].live.length, 1, "live again");
// A result kept from the scorecard: played, and a link kept for the next match names that match.
const KEPT = JSON.stringify({ a: { ...INN(70), name: "Titans" }, b: { ...INN(60), name: "Royals" }, outcome: "a", battedFirst: "a", text: "Titans won by 10 runs" });
await db.exec(`update private.tournament_fixtures set live_result = '${KEPT}'::jsonb, live_rev = 3 where code = '${C(1)}' and id = 3`);
eq([(await at(KINGS))[0].live, (await at(KINGS))[0].played], [[], 1], "match 3 finished on its scorecard: played, and not live though the link is");
eq(await change(1, "live_link", { id: 5, live_code: L(1) }), "ok", "the same link is used for match 5 next");
eq((await at(KINGS))[0].live, [{ code: L(1), home: "Titans", away: "Kings" }], "live now is match 5, once");
// A fixture taken out: never live, never counted, never next.
await scorecard(2);
eq(await change(1, "live_link", { id: 2, live_code: L(2) }), "ok", "match 2 is scored on another link");
eq((await at(KINGS))[0].live, [{ code: L(2), home: "Royals", away: "Kings" }, { code: L(1), home: "Titans", away: "Kings" }], "two live, in the organiser's order");
eq(await change(1, "fixture_remove", { id: 2 }), "ok", "match 2 is taken out");
eq((await at(KINGS))[0].live, [{ code: L(1), home: "Titans", away: "Kings" }], "a fixture taken out is not live");
eq([(await at(KINGS))[0].played, (await at(KINGS))[0].total], [1, 6], "and not counted: 1 of 6");
eq(await change(1, "fixture_remove", { id: 1 }), "ok", "match 1 is taken out too");
eq((await at(KINGS))[0].next, { stage: "league", slot: null, n: 2, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" }, "next skips it: the old match 4, now Match 2, with its day and time");
// Three live at most.
for (const [id, n] of [[4, 3], [6, 4], [7, 5]]) {
  await scorecard(n);
  eq(await change(1, "live_link", id === 7 ? { id, live_code: L(n), home: 1, away: 2 } : { id, live_code: L(n) }), "ok", `fixture ${id} is scored live`);
}
eq((await at(KINGS))[0].live.map((x) => x.code), [L(3), L(1), L(4)], "four being scored: the first three in the organiser's order");
eq((await at(KINGS))[0].next, null, "every match played or on a scorecard: no next");
for (const n of [3, 4, 5]) await db.exec(`update public.live_matches set status = 'done' where code = '${L(n)}'`);
// Renames are read, not kept.
eq(await change(1, "team", { id: 1, name: "Baner Titans", short: null }), "ok", "a team renamed");
eq(await change(1, "settings", { name: "Sunday Box League 2", settings: league("x", venueOf(KINGS, "Kings Turf Arena")).settings }), "ok", "the tournament renamed");
eq([(await at(KINGS))[0].name, (await at(KINGS))[0].live[0].home], ["Sunday Box League 2", "Baner Titans"], "both show on the next call");
// The venue changed or taken off under Manage: it leaves that turf at once.
eq(await change(1, "settings", { name: "Sunday Box League 2", settings: league("x", venueOf(BUSY, "Busy Turf")).settings }), "ok", "the organiser picks another turf");
eq([await at(KINGS), await codesAt(BUSY)], [null, [C(1)]], "gone from Kings, on at the other turf");
eq(await change(1, "settings", { name: "Sunday Box League 2", settings: league("x", null).settings }), "ok", "the organiser takes the venue off");
eq([await at(KINGS), await at(BUSY)], [null, null], "on at no turf, though a match is being scored");
eq(await change(1, "settings", { name: "Sunday Box League", settings: league("x", venueOf(KINGS, "Kings Turf Arena")).settings }), "ok", "and puts Kings back");
eq(await codesAt(KINGS), [C(1)], "back at Kings");

// ── 6. A tournament taken down is nowhere. ──
eq(await change(6, "remove"), "ok", "the walk-in league is taken down");
ok(!(await codesAt(GREEN)).includes(C(6)), "it is not at Greenfield any more");
eq((await codesAt(GREEN)).sort(), [C(5), C(8)].sort(), "the two that are on and not stale are");

// ── 7. Nothing about who organises it. ──
const all = JSON.stringify(await now());
ok(!/0000-4000-8000|9800000|example[.]test|@|Asha Rao|Ravi|Kiran/.test(all), "no account id, no name of a person, no number, no email");
ok(!/user|secret|hash|rev|writes|"id"|slug|area/.test(all), "no account, secret, hash, rev or write count, and nothing of the venue but the turf's id");
ok(!all.includes(SECRET(1)) && !all.includes(createHash("sha256").update(SECRET(1)).digest("hex")), "neither the organiser's secret nor its hash");
ok(!all.includes(C(6)) && !all.includes(C(2)) && !all.includes(C(3)) && !all.includes(C(4)) && !all.includes(C(7)), "and nothing of a tournament that is off, has no listed turf or went quiet");

// ── 8. As the server's client (anon with the key), and as a browser without it. ──
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  try {
    eq((await db.query(`select public.turf_events_now($1) as r`, [LIVE])).rows[0].r.length, 2, `${role} with the live write key gets the list`);
    eq((await db.query(`select public.turf_events_now($1) as r`, ["guess"])).rows[0].r, { r: "unavailable" }, `${role} with a guessed key gets nothing`);
    for (const t of ["private.tournaments", "private.tournament_fixtures", "private.tournament_teams", "public.live_matches"]) {
      await assert.rejects(db.query(`select * from ${t}`), /permission denied/, `${role} can't read ${t}: the read tells only what it returns`);
      passed++;
    }
  } finally {
    await db.exec("reset role");
  }
}

// ── 9. The notice: one row per signed-in organiser whose tournament shows. ──
const notices = () => q(`select user_id, type, title, message, metadata, is_read from public.notifications order by user_id`);
// Asha: 1 at Kings (changed just now) and 8 at Greenfield. Ravi: 5 at Greenfield. Kiran: only 7, gone quiet. 6 was nobody's and is off.
await db.exec(`begin; ${NOTICE}; commit;`);
const SAYS = (t, turf) => `${t} now shows on ${turf}'s page on TapTurf, because you picked that turf as its venue. To take it off, change the venue under Manage.`;
eq(await notices(), [
  { user_id: U(1), type: "tournament_on_turf_page", title: "Your tournament now shows on the turf's page", message: SAYS("Sunday Box League", "Kings Turf Arena"), metadata: { code: C(1) }, is_read: false },
  { user_id: U(2), type: "tournament_on_turf_page", title: "Your tournament now shows on the turf's page", message: SAYS("Titans v Strikers", "Greenfield Sports Hub"), metadata: { code: C(5) }, is_read: false },
], "one each for Asha (her tournament changed last, though she has two showing) and Ravi; none for Kiran, whose only one went quiet; none for a tournament with no account");
for (const n of await notices()) ok(n.title.length <= 120 && n.message.length <= 400 && !/[—–]/.test(n.title + n.message), "within the notification's lengths, and no dash");
await db.exec(`begin; ${NOTICE}; commit;`);
eq((await notices()).length, 2, "run again: still two");
// Later, a tournament of Kiran's shows: run again, he is told once, and the others not again.
await changed(7, 0);
await db.exec(`update public.notifications set is_read = true where user_id = '${U(1)}'`);
await db.exec(`begin; ${NOTICE}; commit;`);
eq((await notices()).map((n) => [n.user_id, n.metadata.code, n.is_read]), [[U(1), C(1), true], [U(2), C(5), false], [U(3), C(7), false]], "Kiran gets his; Asha's read one is not sent again");
// Who is never told: a tournament off, with no venue, at a turf not listed, or kept with an account that is gone.
await db.exec(`delete from public.notifications`);
await db.exec(`update private.tournaments set user_id = '${U(2)}' where code in ('${C(2)}', '${C(3)}', '${C(4)}', '${C(6)}')`);
await db.exec(`update private.tournaments set user_id = '${U(77)}' where code = '${C(5)}'`);
await db.exec(`begin; ${NOTICE}; commit;`);
eq((await notices()).map((n) => [n.user_id, n.metadata.code]), [[U(1), C(1)], [U(3), C(7)]], "Ravi now has only a tournament with no venue, one at a turf not listed, one at a made-up turf and one taken down: no row; an account that does not exist gets none");
await db.exec(`update private.tournaments set user_id = null where code in ('${C(2)}', '${C(3)}', '${C(4)}', '${C(6)}')`);
await db.exec(`update private.tournaments set user_id = '${U(2)}' where code = '${C(5)}'`);
// A stale tournament with a match on now is told too (it shows).
await db.exec(`delete from public.notifications where user_id = '${U(1)}'`);
await changed(1, 40);
await changed(8, 40);
await db.exec(`begin; ${NOTICE}; commit;`);
eq((await notices()).filter((n) => n.user_id === U(1)).map((n) => n.metadata.code), [C(1)], "Asha's quiet league with a match being scored still shows, so she is told of it (not of her quiet series)");
await changed(1, 0);
await changed(8, 0);

// ── 10. Three a turf and 200 turfs, a match on now first. ──
// Rows put straight into the table (the create limits stop at 100 an hour): copies of the series, each at its own turf.
await db.exec(`
insert into public.turfs (id, name, is_active)
select ('22222222-2222-4222-8222-' || lpad(n::text, 12, '0'))::uuid, 'Cap Turf ' || n, true from generate_series(1, 205) n;
insert into private.tournaments (code, secret_hashes, name, format, settings, created_at, updated_at)
select 'c' || lpad(n::text, 11, '0'), t.secret_hashes, 'Cap Series ' || n, t.format,
       jsonb_set(t.settings, '{venue,id}', to_jsonb('22222222-2222-4222-8222-' || lpad(n::text, 12, '0'))),
       now() - interval '3 hours', now() - interval '3 hours' - n * interval '1 minute'
  from private.tournaments t cross join generate_series(1, 205) n where t.code = '${C(5)}';
`);
const capped = await now();
eq(capped.length, 200, "207 turfs have something on: 200 are answered");
eq(capped[0].turf, KINGS, "the turf with a match being scored comes first");
const CAP = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
eq(capped.slice(1, 4).map((x) => x.turf), [GREEN, CAP(1), CAP(2)], "then the turfs changed last, newest first");
eq([capped.some((x) => x.turf === CAP(198)), capped.some((x) => x.turf === CAP(199)), capped.some((x) => x.turf === CAP(205))], [true, false, false], "the seven changed longest ago are the ones left out");
ok(capped.every((x) => x.tournaments.length >= 1 && x.tournaments.length <= 3), "every turf answered has one to three tournaments");
ok(JSON.stringify(capped).length < 120_000, "200 turfs is still a small answer");
// Four more at the busy turf: three are answered, the one with a match on first, then the ones changed last.
for (const n of [31, 32, 33, 34]) eq(await create(n, league(`Busy League ${n}`, venueOf(BUSY, "Busy Turf"))), "ok", `tournament ${n} at the busy turf`);
for (const [n, mins] of [[31, 50], [32, 10], [33, 30], [34, 20]]) await db.exec(`update private.tournaments set updated_at = now() - interval '${mins} minutes' where code = '${C(n)}'`);
eq(await codesAt(BUSY), [C(32), C(34), C(33)], "three at most, the one changed last first");
await scorecard(9);
eq(await change(31, "live_link", { id: 1, live_code: L(9) }), "ok", "the oldest of them has a match scored live");
await db.exec(`update private.tournaments set updated_at = now() - interval '50 minutes' where code = '${C(31)}'`);
eq(await codesAt(BUSY), [C(31), C(32), C(34)], "the one with a match on now comes first, and the oldest quiet one gives way");
eq((await now()).slice(0, 2).map((x) => x.turf).sort(), [KINGS, BUSY].sort(), "both turfs with a match on now lead the list");

// ── 11. Reading writes nothing; safe to run again; nothing from before changed. ──
const state = async () => ({
  t: await q(`select code, rev, writes, status, user_id, updated_at, xmin::text as x from private.tournaments order by code`),
  f: await q(`select code, id, status, seq, home, away, live_code, live_rev, updated_at, xmin::text as x from private.tournament_fixtures order by code, id`),
  m: await q(`select code, id, name, xmin::text as x from private.tournament_teams order by code, id`),
  l: await q(`select code, rev, writes, status, updated_at, xmin::text as x from public.live_matches order by code`),
  s: await q(`select id, name, is_active, xmin::text as x from public.turfs order by id`),
  v: await q(`select * from private.tournament_views order by code`),
  n: await q(`select id, user_id, type, is_read, xmin::text as x from public.notifications order by id`),
});
const s1 = await state();
const a1 = await now();
for (let i = 0; i < 5; i++) await now();
await now("wrong"); await now(null);
eq(await state(), s1, "a read changes no row of any table: no rev, no updated_at, no view, no notice");
await db.exec(`begin; ${NEW}; commit;`);
eq(await state(), s1, "run again: nothing changes");
eq(await now(), a1, "and it answers the same");
eq((await one(`select count(*)::int as n from pg_proc where proname = 'turf_events_now'`)).n, 1, "no overload after running it twice");
eq(await priv("turf_events_now", "text"), await priv("tournament_get", "text, text"), "the grants are still tournament_get's");
eq(await fns(), before.fns, "every function from before is as it was (tournament_get among them)");
eq(await columns(), before.columns, "every table has the columns it had, and there is no new table");
eq(await indexes(), before.indexes, "no index was added");

console.log(`turf_events: ${passed} checks passed`);
