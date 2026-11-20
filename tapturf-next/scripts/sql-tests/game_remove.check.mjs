// Applies 20261122_game_remove.sql (twice, then a third time) to an in-memory
// Postgres (PGlite) built as game_updates.check.mjs builds it (games_lockdown.db.mjs,
// both games lockdown files, repeats, the other venue, web push, emails, usernames,
// played-with, 20261117_game_confirmed.sql, 20261118_game_tags_shown.sql and
// 20261118_game_updates.sql), next to a second database without the file. Checks:
// the file (additive, no destructive words, no backslash, replaces no function,
// the header's md5s, one policy narrowed and nothing else of a policy or a grant);
// the guards (refuses without the files it needs; a missing, changed or second
// read policy stops it with nothing changed; a second run leaves its own policy
// alone); who may (the server key, the host); an upcoming game with players is
// called off as game_cancel does it (the same people told the same words, the
// same emails queued), its tagged players are told once in the app with no email,
// and it is hidden: anon and authenticated no longer read the row, its lineup
// says ids only, the cache is marked, every job and count leaves it alone;
// an already called-off game is hidden and nobody is told; a game played with
// others is refused and stays as it was; a solo played game is hidden and leaves
// its host's played games, a review's "played here" and "Did you play?"; it is
// idempotent; a repeat never puts the hidden date up again; a hidden game cannot
// be opened again by a write; grants. Never touches a real database. Made-up
// people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_remove.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const NAME = "20261122_game_remove.sql";
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const read = (f) => fs.readFileSync(`${M}/${f}`, "utf8");
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

/* ---------------- the file itself ---------------- */
const sql = read(NAME);
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate (not even inside a word)");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/[\u200b-\u200f\u00a0\ufeff]/.test(sql), "no invisible characters");
ok(!sql.includes("\\"), "no backslash anywhere: nothing for a client to mangle");
ok(/^set local lock_timeout = '5s';$/m.test(sql), "waits 5 s at most for a lock");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications|users|turfs|usernames)\b/i.test(sql), "changes no grant on a public table");
ok(!/create\s+policy/i.test(sql), "makes no policy");
eq([...sql.matchAll(/^\s*alter policy ("[^"]+") on ([\w.]+) using \(([^)]*)\);$/gm)].map((m) => m.slice(1)), [['"Anyone can read games"', "public.games", "removed_at is null"]],
  "narrows one policy: the read policy on public.games, to rows not hidden");
eq([...new Set([...sql.matchAll(/alter\s+table\s+([\w.]+)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`))], ["public.games add"], "alters public.games only by adding (two columns, one check)");
ok(!/create\s+(table|trigger|index)|cron\.schedule/i.test(sql), "no table, no trigger, no index, no job");
ok(!/(insert\s+into|update)\s+public\.(users|turfs|usernames|game_participants|game_requests)\b/i.test(sql), "writes no user, turf, username, lineup or request row");
ok([...sql.matchAll(/^create or replace function [\w.]+\([^]*?\n(?:as )?\$\$/gm)].every((m) => /set search_path = ''/.test(m[0]) && /security definer/.test(m[0])), "every function is security definer with an empty search_path");
const EARLIER = fs.readdirSync(M).filter((f) => f.endsWith(".sql") && f < NAME).sort().map((f) => [f, read(f)]);
const made = [...sql.matchAll(/^create or replace function ([\w.]+)\(/gm)].map((m) => m[1]);
eq(made, ["private.game_remove_plan", "public.game_remove_check", "public.game_remove"], "three functions");
ok(made.every((f) => EARLIER.every(([, t]) => !t.includes(`create or replace function ${f}(`))), "all new: no function of an earlier file is replaced");
eq([...sql.matchAll(/^grant ([^;]+);$/gm)].map((m) => m[1]), ["execute on function public.game_remove_check(text, uuid, uuid) to anon", "execute on function public.game_remove(text, uuid, uuid) to anon"],
  "EXECUTE on the two public functions goes to anon only (the key is the gate)");
eq((sql.match(/^revoke all on function public\.\w+\([^)]*\) from public, anon, authenticated;$/gm) ?? []).length, 2, "each revoked from public, anon and authenticated before its grant");
ok(/public\.game_cancel\(p_key, p_user_id, p_game_id\)/.test(sql) && (sql.match(/'Game cancelled'/g) ?? []).length === 1,
  "the game is called off by public.game_cancel itself, not by a copy of it (the one notice written here is the tagged players')");
const bodyOf = (text, name) => {
  const i = text.lastIndexOf(`create or replace function ${name}(`);
  if (i < 0) return null;
  const tag = /\$(\w*)\$/.exec(text.slice(i));
  const a = i + tag.index + tag[0].length;
  return text.slice(a, text.indexOf(tag[0], a));
};
const latest = (name) => {
  let last = null;
  for (const [f, t] of EARLIER) if (t.includes(`create or replace function ${name}(`)) last = { file: f, body: bodyOf(t, name) };
  return last;
};
for (const [fn, m, file] of [
  ["private.account_key_ok", "ca605fa89a97497134b690e753dc5c0e", "20261021_accounts_usernames.sql"],
  ["public.game_cancel", "549331bb333fd8223527b687c96d8a17", "20261030_games_lockdown.sql"],
  ["private.game_start_at", "870fe04f498b656d8c9435099fd8bfb9", "20261101_played_with.sql"],
  ["private.game_recount", "da217ad54c4ceec24efc86b881f77d1b", "20261117_game_confirmed.sql"],
]) {
  const l = latest(fn);
  eq([l.file, md5(l.body)], [file, m], `${fn}: its latest body in the repo is ${file}'s`);
  ok(new RegExp(`${fn.replace(".", "\\.")}\\s+${m}\\s+${file.replace(".", "\\.")}`).test(sql), `and the header names it with that md5`);
}

/* ---------------- the databases ---------------- */
const CRON = `create schema if not exists cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;`;
const NET = `create schema if not exists net;
create table net.posts (id bigserial primary key, url text, headers jsonb, body jsonb, timeout integer, at timestamptz default clock_timestamp());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ insert into net.posts (url, headers, body, timeout) values (url, headers, body, timeout_milliseconds) returning id $$;`;
const PROVEN = `create table private.test_proven (user_id uuid primary key);
create function private.email_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from private.test_proven t where t.user_id = p_user_id) $$;
create function private.phone_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select true $$;`;
const fnFrom = (text, name) => {
  const m = [...text.matchAll(new RegExp(`create or replace function ${name.replace(/\./g, "\\.")}\\([^]*?\\n\\$\\$;`, "g"))].at(-1);
  assert.ok(m, `${name} is in the file`);
  return m[0];
};
const MYTT = read("20261019_mytapturf.sql");
const OWNER = `${fnFrom(MYTT, "public._phone10")}
${fnFrom(MYTT, "public._is_admin_key")}
create or replace function public._caller_key(p_token text) returns text language sql stable as $$ select null::text $$;`;
const PW = read("20261101_played_with.sql");
const START_AT = fnFrom(PW, "private.game_start_at");
// Played-with as 20261101_played_with.sql has it, and the three reads a review's "played here" is worked out by
// (their latest bodies in the repo), over stand-ins for the two review tables they look at.
const PLAYED = `create table private.whatsapp_shares (user_id uuid primary key references public.users(id), share boolean not null default false, updated_at timestamptz not null default now());
create table private.game_start_moves (game_id uuid primary key, moved_at timestamptz not null default now());
create table private.review_saves (user_id uuid, turf_id uuid, action text, saved_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), user_id uuid, turf_id uuid, source text, created_at timestamptz default now());
${fnFrom(PW, "private.game_over_at")}
${fnFrom(PW, "private.played_game_ids")}
${fnFrom(PW, "private.whatsapp_mates")}
${fnFrom(PW, "public.played_with_extras")}
${fnFrom(read("20261102_reviews_trust.sql"), "private.review_played_here")}
${fnFrom(read("20261027_game_reports.sql"), "private.review_verified_via")}
${fnFrom(read("20261101_reviews_policy.sql"), "private.review_daily")}`;
for (const [fn, file] of [["private.review_played_here", "20261102_reviews_trust.sql"], ["private.review_verified_via", "20261027_game_reports.sql"], ["private.review_daily", "20261101_reviews_policy.sql"],
  ["private.played_game_ids", "20261101_played_with.sql"], ["private.whatsapp_mates", "20261101_played_with.sql"]]) {
  eq(latest(fn).file, file, `(${fn} is checked in its latest body, ${file}'s)`);
}
const USERNAMES = `create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true, created_at timestamptz not null default now());
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;`;
const BEFORE = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql", "20261110_email.sql"].map(read);
const LATER = ["20261117_game_confirmed.sql", "20261118_game_tags_shown.sql", "20261118_game_updates.sql"].map(read);

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(5), MEERA = U(6), NEHA = U(7), HOST2 = U(8), HOST3 = U(9);
const PEOPLE = [[HOST, "Asha Rao", "asha"], [RAVI, "Ravi Kumar", "ravi_k"], [PRIYA, "Priya Sharma", "priya23"], [KIRAN, "Kiran Patil", "kiran"],
  [OMAR, "Omar Shaikh", "omar_s"], [MEERA, "Meera Iyer", "meera_i"], [NEHA, "Neha Joshi", "neha_j"], [HOST2, "Vikram Rao", "vikram"], [HOST3, "Zoya Khan", "zoya"]];
const NAMES = Object.fromEntries(PEOPLE.map(([id, name]) => [id, name]));
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150 };

async function setUp(withFile, upTo = BEFORE.length) {
  const db = await makeDb(PGlite);
  await db.exec(CRON + NET + PROVEN + START_AT + OWNER + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
  for (const f of BEFORE.slice(0, upTo)) await db.exec(f);
  if (upTo < BEFORE.length) return db;
  await db.exec(USERNAMES);
  await db.exec(PLAYED);
  for (const [id, name, u] of PEOPLE) {
    await db.query(`insert into public.users (id, name, phone, email, created_at) values ($1, $2, null, $3, now() - interval '30 days')`, [id, name, `${id.slice(-6)}.standin@example.com`]);
    await db.query(`insert into public.usernames (user_id, username) values ($1, $2)`, [id, u]);
  }
  await db.exec(`insert into private.test_proven select id from public.users;
    update private.email_settings set value = 'on' where name = 'mode';
    insert into public.turfs (id, name, slug, city, area, is_active, sports) values
    ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'), ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', true, '["Football"]');`);
  for (const f of LATER) await db.exec(f);
  // A game from before the file.
  db.before = (await db.query(`select public.game_create($1, $2, $3) r`, [KEY, HOST3, JSON.stringify({ ...GAME, description: "Bring a dark tee." })])).rows[0].r.game.id;
  if (withFile) {
    // As on Supabase: a new function in public starts with EXECUTE for the API roles.
    await db.exec(`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role`);
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}
const helpers = (db) => {
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
  const asRole = async (role, fn, sub) => {
    await q(`select set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role }) : ""]);
    await q(`set role ${role}`);
    try { return await fn(); } finally { await q("reset role"); await q(`select set_config('request.jwt.claims', '', false)`); }
  };
  const fresh = async (host) => {
    await q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1 and created_at > now() - interval '1 day'`, [host]);
    await q(`update private.game_tags set notified_at = notified_at - interval '2 days' where host_id = $1`, [host]);
  };
  const create = async (host, o = {}) => {
    await fresh(host);
    return (await rpc("game_create", [KEY, host, JSON.stringify({ ...GAME, ...o })])).game.id;
  };
  const ask = (who, id) => rpc("game_request_send", [KEY, who, id, null]);
  const join = async (who, host, id) => rpc("game_request_answer", [KEY, host, (await ask(who, id)).request.id, true]);
  const row = (id) => one(`select status, removed_at is not null as hidden, removed_status, current_players, confirmed_tagged from public.games where id = $1`, [id]);
  const check = (who, id) => rpc("game_remove_check", [KEY, who, id]);
  const remove = (who, id) => rpc("game_remove", [KEY, who, id]);
  // The game is moved in time (a test's clock): d days from today.
  const move = (id, d, h = "19:00", e = "20:00") => q(`update public.games set date = $2, start_time = $3, end_time = $4 where id = $1`, [id, ist(d), h, e]);
  // Who was told what about a game, by name: the notices that carry its id, and the ones a hidden game's tagged players get.
  const told = async (id, since) => (await q(`select n.user_id, n.type, n.title, n.message, n.metadata from public.notifications n
    where (n.metadata ->> 'gameId' = $1 or n.metadata ? 'removed') and n.type = 'game_cancelled' and n.created_at >= $2 order by n.user_id`, [id, since]))
    .map((n) => ({ who: NAMES[n.user_id], type: n.type, title: n.title, message: n.message, link: n.metadata.gameId === id, removed: n.metadata.removed === true }));
  const mails = async (id) => (await q(`select o.user_id, o.kind from private.email_outbox o where o.refs ->> 'game_id' = $1 and o.kind = 'game_cancelled' order by o.user_id`, [id])).map((o) => NAMES[o.user_id]);
  return { q, one, rpc, asRole, create, ask, join, row, check, remove, move, told, mails };
};

/* ---------------- the guards ---------------- */
{
  const bare = await setUp(false, 5);
  await assert.rejects(bare.exec(sql), /game remove: apply 20261030_games_lockdown\.sql, 20261101_played_with\.sql and 20261117_game_confirmed\.sql first/, "without the files it is built on it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name like 'removed%'`)).rows[0].n, 0, "and changes nothing");
  await bare.close();
}
const untouched = async (db, why) => {
  eq((await db.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name like 'removed%'`)).rows[0].n, 0, `${why}: no column was added`);
  eq((await db.query(`select count(*)::int n from pg_proc where proname like 'game_remove%'`)).rows[0].n, 0, `${why}: no function was made`);
};
{
  const db = await setUp(false);
  await db.exec(`alter policy "Anyone can read games" on public.games using (status <> 'cancelled')`);
  await assert.rejects(db.exec(sql), /the policy "Anyone can read games" is not the plain true it was \(\(status <> 'cancelled'::text\)\)/, "a read policy that says something else stops the file");
  passed++;
  await untouched(db, "a changed policy");
  eq((await db.query(`select qual from pg_policies where tablename = 'games' and policyname = 'Anyone can read games'`)).rows[0].qual, "(status <> 'cancelled'::text)", "and that policy is as it was");
  await db.close();
}
{
  const db = await setUp(false);
  await db.exec(`alter policy "Anyone can read games" on public.games rename to "Everyone reads games"`);
  await assert.rejects(db.exec(sql), /public\.games has no read policy "Anyone can read games"/, "no such policy stops the file");
  passed++;
  await untouched(db, "a missing policy");
  await db.close();
}
{
  const db = await setUp(false);
  await db.exec(`create policy "Hosts read their games" on public.games for select using (creator_id = auth.uid())`);
  await assert.rejects(db.exec(sql), /the policy "Hosts read their games" on public\.games would still show a hidden game/, "another read policy that would still show a hidden game stops the file");
  passed++;
  await untouched(db, "a second read policy");
  await db.exec(`alter policy "Hosts read their games" on public.games using (false)`);
  await db.exec(sql);
  passed++; // one that lets nothing through is no problem (production's write policies are all false)
  await db.close();
}

const OLD = await setUp(false);
const NEW = await setUp(true);
passed++; // applied twice
const O = helpers(OLD), N = helpers(NEW);

/* ---------------- what the file made ---------------- */
eq(await N.q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'games' and column_name like 'removed%' order by 1`), [
  { column_name: "removed_at", data_type: "timestamp with time zone", is_nullable: "YES", column_default: null },
  { column_name: "removed_status", data_type: "text", is_nullable: "YES", column_default: null },
], "two nullable columns on public.games");
eq(await N.one(`select status, removed_at, removed_status, description from public.games where id = $1`, [NEW.before]), { status: "open", removed_at: null, removed_status: null, description: "Bring a dark tee." },
  "a game from before the file is as it was, and is on TapTurf");
const policies = (H) => H.q(`select tablename, policyname, cmd, qual, with_check, roles::text from pg_policies where schemaname = 'public' order by 1, 2`);
{
  const was = await policies(O), is = await policies(N);
  const changed = is.filter((p, i) => JSON.stringify(p) !== JSON.stringify(was[i]));
  eq([was.length, is.length, changed.map((p) => [p.tablename, p.policyname, p.cmd, p.qual])], [was.length, was.length, [["games", "Anyone can read games", "SELECT", "(removed_at IS NULL)"]]],
    "one policy changed, and only its condition: a hidden game is not read");
  eq(was.find((p) => p.policyname === "Anyone can read games").qual, "true", "(it was the plain true)");
}
eq(await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`),
  await O.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), "no table grant on public changed");
const md5s = (H) => H.q(`select n.nspname || '.' || p.proname f, md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.proname not like 'game_remove%' order by 1, 2`);
eq(await md5s(N), await md5s(O), "every other function is the body it was");
eq(await N.q(`select tgname from pg_trigger where tgrelid = 'public.games'::regclass and not tgisinternal order by 1`),
  await O.q(`select tgname from pg_trigger where tgrelid = 'public.games'::regclass and not tgisinternal order by 1`), "no trigger on public.games was added");
const fns = await N.q(`select n.nspname || '.' || p.proname f, p.proconfig::text cfg, p.prosecdef def,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x, has_function_privilege('public', p.oid, 'execute') pub_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'game_remove%' order by 1`);
eq(fns.map((f) => [f.f, f.def, /search_path=\\?"\\?"/.test(f.cfg), f.anon_x, f.auth_x, f.pub_x]), [
  ["private.game_remove_plan", true, true, false, false, false],
  ["public.game_remove", true, true, true, false, false],
  ["public.game_remove_check", true, true, true, false, false],
], "three functions, security definer, empty search_path; only anon may call the two public ones (they check the server key)");
await assert.rejects(N.asRole("authenticated", () => N.remove(HOST3, NEW.before), HOST3), /permission denied/, "a signed-in browser cannot call game_remove itself");
passed++;

/* ---------------- who may ---------------- */
eq(await N.rpc("game_remove", ["wrong", HOST3, NEW.before]), { r: "unavailable" }, "taking a game off needs the server key");
eq(await N.rpc("game_remove_check", ["wrong", HOST3, NEW.before]), { r: "unavailable" }, "so does asking what it would do");
eq(await N.rpc("game_remove", [null, HOST3, NEW.before]), { r: "unavailable" }, "no key at all");
eq([await N.remove(null, NEW.before), await N.remove(HOST3, null), await N.check(null, NEW.before)], [{ r: "bad" }, { r: "bad" }, { r: "bad" }], "nobody, or no game: bad");
eq([await N.remove(HOST3, U(999)), await N.check(HOST3, U(999))], [{ r: "gone" }, { r: "gone" }], "a game that isn't there: gone");
eq([await N.remove(RAVI, NEW.before), await N.check(RAVI, NEW.before)], [{ r: "not_host" }, { r: "not_host" }], "only the host");
eq(await N.row(NEW.before), { status: "open", hidden: false, removed_status: null, current_players: 1, confirmed_tagged: 0 }, "and nothing happened to it");

/* ---------------- an upcoming game with players ---------------- */
// Ravi is in, Priya's request waits, Kiran was declined, Meera is tagged (and named on the page),
// Neha is tagged and also asked to join, two friends are confirmed by name.
const stage = async (H, host) => {
  const id = await H.create(host, { confirmed_names: ["Rahul", "Amit"], confirmed_tags: ["meera_i", "neha_j"] });
  await H.join(RAVI, host, id);
  await H.ask(PRIYA, id);
  const k = await H.ask(KIRAN, id);
  await H.rpc("game_request_answer", [KEY, host, k.request.id, false]);
  await H.q(`insert into public.game_requests (game_id, user_id, status, requester_name) values ($1, $2, 'pending', 'Neha Joshi')`, [id, NEHA]);
  return id;
};
const G1 = await stage(N, HOST);
eq(await N.row(G1), { status: "open", hidden: false, removed_status: null, current_players: 6, confirmed_tagged: 2 }, "(the host, Ravi, two friends by name and two tagged players: 6 in)");
eq(await N.check(HOST, G1), { r: "ok", can: true, repeat: false, state: "upcoming", players: 1, requests: 2, tags: 1 },
  "the confirm step: 1 player, 2 waiting requests and 1 tagged player would be told; someone tagged who also asked is counted once");
eq(await N.row(G1), { status: "open", hidden: false, removed_status: null, current_players: 6, confirmed_tagged: 2 }, "asking changes nothing");
// The same game called off the way it is today, for comparison.
const TWIN = await stage(N, HOST2);
const t0 = (await N.one(`select clock_timestamp() t`)).t;
eq(await N.rpc("game_cancel", [KEY, HOST2, TWIN]), { r: "ok" }, "(a twin of it is called off with game_cancel)");
const twinTold = await N.told(TWIN, t0), twinMails = await N.mails(TWIN);
eq(twinTold.map((n) => n.who), ["Ravi Kumar", "Priya Sharma", "Neha Joshi"], "(game_cancel tells the player and the two waiting requests; not the host, the declined request or a tagged player)");
await N.q(`update public.notifications set metadata = metadata - 'removed' || '{"old": true}' where metadata ? 'removed'`);
await N.q(`truncate private.test_dirty`);
const t1 = (await N.one(`select clock_timestamp() t`)).t;
eq(await N.remove(HOST, G1), { r: "ok", removed: true, state: "upcoming", told: 4 }, "the host takes it off: 4 people are told");
const g1Told = await N.told(G1, t1);
const same = (list) => list.filter((n) => n.link).map((n) => ({ ...n, message: n.message.replace(/^(Asha|Vikram)/, "Host") }));
eq(same(g1Told), same(twinTold), "the player and the waiting requests get exactly what game_cancel sends: the same type, title, words and link, once each");
eq(g1Told.filter((n) => !n.link), [{ who: "Meera Iyer", type: "game_cancelled", title: "Game cancelled", message: `Asha cancelled Football on ${new Date(`${ist(2)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "")}`, link: false, removed: true }],
  "the tagged player still to answer is told too, once, in the same words, with no link (the page is gone)");
eq((await N.q(`select user_id from public.notifications where created_at >= $1 and user_id = any($2)`, [t1, [HOST, KIRAN]])).length, 0, "the host and the declined request are told nothing");
eq(await N.mails(G1), twinMails, "the same cancelled emails are queued as for a game called off today (the player and the waiting requests)");
ok(!(await N.mails(G1)).includes("Meera Iyer") && (await N.one(`select count(*)::int n from private.email_outbox where user_id = $1`, [MEERA])).n === 0, "and no email for the tagged player");
{
  const job = (await N.one(`select private.email_job(o) j from private.email_outbox o where o.refs ->> 'game_id' = $1 and o.user_id = $2 and o.kind = 'game_cancelled'`, [G1, RAVI])).j;
  eq([job.kind, job.game.status, job.to], ["game_cancelled", "cancelled", `${RAVI.slice(-6)}.standin@example.com`], "that email is still sent (the job reads the row as its owner)");
  const other = await N.q(`select k, private.email_job(jsonb_populate_record(o, jsonb_build_object('kind', k))) j from private.email_outbox o, unnest(array['reminder', 'request_accepted', 'join_request', 'game_changed']) k
    where o.refs ->> 'game_id' = $1 and o.user_id = $2 and o.kind = 'game_cancelled' order by 1`, [G1, RAVI]);
  eq(other.map((x) => x.j), Array(4).fill({ skip: "cancelled" }), "and any other email still queued for it (a reminder, an accept, a request, a change) is skipped as cancelled");
}
eq(await N.row(G1), { status: "cancelled", hidden: true, removed_status: "open", current_players: 4, confirmed_tagged: 0 }, "the row: called off, hidden, the status it had kept; its tags ended and the count followed");
eq(await N.q(`select distinct status from private.game_tags where game_id = $1`, [G1]), [{ status: "expired" }], "(both tags ended)");
eq((await N.q(`select distinct key from private.test_dirty order by 1`)).map((d) => d.key), ["games", "turf:kings-turf"], "the cache queue is marked as a cancel marks it: the games key and the turf's");
ok((await N.one(`select activity from public.games where id = $1`, [G1])).activity.some((e) => e.k === "cancelled"), "(the log notes it was called off, as for any cancel)");

// Nobody reads it any more.
for (const [role, sub] of [["anon", null], ["authenticated", RAVI], ["authenticated", HOST]]) {
  const who = sub === HOST ? "its own host, signed in" : role;
  eq(await N.asRole(role, () => N.q(`select id from public.games where id = $1`, [G1]), sub), [], `${who}: the row is not read by id`);
  eq((await N.asRole(role, () => N.q(`select id from public.games where creator_id = $1`, [HOST]), sub)).some((g) => g.id === G1), false, `${who}: nor in the host's games`);
  eq((await N.asRole(role, () => N.q(`select id from public.games where turf_id = $1 and status = 'cancelled'`, [T(1)]), sub)).some((g) => g.id === G1), false, `${who}: nor by turf and status`);
  eq((await N.asRole(role, () => N.one(`select count(*)::int n from public.games where removed_at is not null`), sub)).n, 0, `${who}: no hidden row at all`);
  await assert.rejects(N.asRole(role, () => N.q(`update public.games set removed_at = null, removed_status = null where id = $1`, [G1]), sub), /permission denied/, `${who}: and cannot write it back`);
  passed++;
}
eq((await N.asRole("anon", () => N.q(`select id from public.games where id = $1`, [TWIN]))).length, 1, "(a game that was only called off is still read)");
{
  const lineup = await N.asRole("anon", () => N.q(`select * from public.game_participants where game_id = $1`, [G1]));
  eq([lineup.length, [...new Set(lineup.flatMap((r) => Object.keys(r)))].sort()], [2, ["game_id", "id", "joined_at", "user_id"]], "its lineup rows are still there, as a cancel leaves them: ids and a time, nothing of the game");
  for (const t of ["public.game_requests", "public.notifications", "private.game_tags"]) {
    await assert.rejects(N.asRole("anon", () => N.q(`select * from ${t}`)), /permission denied/, `anon reads nothing from ${t}`);
    passed++;
  }
}
// Idempotent, and it tells others nothing.
const before2 = await N.one(`select removed_at, updated_at, (select count(*)::int from public.notifications) n from public.games where id = $1`, [G1]);
eq(await N.remove(HOST, G1), { r: "ok", removed: false }, "taking it off again answers ok");
eq(await N.one(`select removed_at, updated_at, (select count(*)::int from public.notifications) n from public.games where id = $1`, [G1]), before2, "and changes nothing: nobody is told twice");
eq([await N.check(HOST, G1), await N.check(RAVI, G1), await N.remove(RAVI, G1)], [{ r: "gone" }, { r: "gone" }, { r: "gone" }], "the confirm step says gone; to anyone else a hidden game is just gone");
// A hidden game cannot be opened again by a write that forgets it is hidden.
await assert.rejects(N.q(`update public.games set status = 'open' where id = $1`, [G1]), /games_removed_fields/, "a hidden game is always called off (the check on the row)");
await assert.rejects(N.q(`update public.games set removed_at = now() where id = $1`, [NEW.before]), /games_removed_fields/, "and a game is never hidden by half");
passed += 2;
// Every function that acts on a game leaves it alone.
eq(await N.ask(OMAR, G1), { r: "closed" }, "nobody can ask to join it");
eq(await N.rpc("game_tag_answer", [KEY, MEERA, G1, true]), { r: "gone" }, "a tagged player has nothing to answer");
eq((await N.rpc("game_tags_shown", [KEY, G1])).tags, [], "nobody is named on it");
eq(await N.rpc("game_tags_for", [KEY, MEERA, G1]), { r: "ok", host: false, mine: null }, "and their tag is not waiting");
eq((await N.rpc("game_update_post", [KEY, HOST, G1, "Still on?"])).r, "closed", "no update can be posted");
eq((await N.rpc("game_update", [KEY, HOST, G1, JSON.stringify({ price_per_player: 10 }), null])).r, "closed", "and it cannot be edited");
eq((await N.rpc("game_requests_incoming", [KEY, HOST])).requests.filter((r) => r.game_id === G1), [], "its waiting requests are not in the host's list to answer");
eq(await N.rpc("game_cancel", [KEY, HOST, G1]), { r: "ok" }, "calling it off again is the no-op it is for any called-off game");
{
  const pr = (await N.q(`select id from public.game_requests where game_id = $1 and user_id = $2`, [G1, PRIYA]))[0].id;
  const a = await N.rpc("game_request_answer", [KEY, HOST, pr, true]);
  eq([a.r, (await N.q(`select 1 from public.game_participants where game_id = $1 and user_id = $2`, [G1, PRIYA])).length], ["closed", 0], "a waiting request on it cannot be accepted");
}
eq((await N.one(`select private.game_tags_expire() n`)).n, 1, "(the tags job ends the twin's tags, the one game it has left to do)");
eq(await N.row(G1), { status: "cancelled", hidden: true, removed_status: "open", current_players: 4, confirmed_tagged: 0 }, "and leaves the hidden game as it is");
// Reminders and waiting-request emails: a hidden game for tomorrow next to one that is on.
{
  const hidden = await N.create(HOST, {}), shown = await N.create(HOST2, {});
  for (const id of [hidden, shown]) {
    await N.join(RAVI, id === hidden ? HOST : HOST2, id);
    await N.ask(PRIYA, id);
    await N.move(id, 1);
  }
  await N.remove(HOST, hidden);
  await N.q(`update public.game_participants set joined_at = now() - interval '3 days'`);
  await N.q(`update public.games set created_at = now() - interval '3 days'`);
  await N.q(`update public.game_requests set created_at = now() - interval '3 hours' where status = 'pending'`);
  const at = `${ist(0)}T18:30:00+05:30`;
  const r = (await N.one(`select private.email_clock($1::timestamptz) r`, [at])).r;
  const alerts = await N.q(`select game_id, kind, count(*)::int n from private.game_alerts where game_id = any($1) group by 1, 2 order by 1, 2`, [[hidden, shown]]);
  ok(r.r === "ok" && alerts.some((a) => a.game_id === shown && a.kind === "tomorrow" && a.n === 2), "(the reminder clock reminds the host and the player of the game that is on)");
  eq(alerts.filter((a) => a.game_id === hidden), [], "the clock sends no reminder and no waiting-request nudge for the hidden one");
}

/* ---------------- already called off ---------------- */
{
  const id = await stage(N, HOST);
  await N.rpc("game_cancel", [KEY, HOST, id]);
  const t = (await N.one(`select clock_timestamp() t`)).t;
  eq(await N.check(HOST, id), { r: "ok", can: true, repeat: false, state: "off", players: 1, requests: 2, tags: 1 }, "a game already called off: it can go, and its state says nobody is told again");
  eq(await N.remove(HOST, id), { r: "ok", removed: true, state: "off", told: 0 }, "it is hidden");
  eq((await N.one(`select count(*)::int n from public.notifications where created_at >= $1`, [t])).n, 0, "and nobody is told anything");
  eq(await N.row(id), { status: "cancelled", hidden: true, removed_status: "cancelled", current_players: 4, confirmed_tagged: 0 }, "the row remembers it was already off");
  eq(await N.asRole("anon", () => N.q(`select id from public.games where id = $1`, [id])), [], "anon no longer reads it");
}

/* ---------------- played with others: it stays ---------------- */
const fragment = (fn, re) => {
  const m = re.exec(latest(fn).body);
  assert.ok(m, `${fn} still reads games the way this check expects`);
  return m[1];
};
// What a turf's page and its owner's dashboard read of games (their latest bodies): only these statuses.
const PAGE_STATUSES = fragment("public.turf_page", /select \* from public\.games\s+where turf_id = t\.id\s+and status in \(([^)]*)\)\s+and date >= v_today/);
const DASH_STATUSES = fragment("public.owner_dashboard", /'upcoming', \(select count\(\*\) from public\.games where turf_id = p_turf_id and date >= today and status in \(([^)]*)\)\)/);
ok(!/cancelled/.test(PAGE_STATUSES) && !/cancelled/.test(DASH_STATUSES), "turf_page and owner_dashboard's upcoming count read no called-off game, so no hidden one");
const onTurfPage = async (id) => (await N.q(`select id from public.games where turf_id = $1 and status in (${PAGE_STATUSES}) and date >= (now() at time zone 'Asia/Kolkata')::date`, [T(1)])).some((g) => g.id === id);
const PLAYED_WITH = await N.create(HOST, {});
await N.join(RAVI, HOST, PLAYED_WITH);
await N.q(`update public.game_participants set joined_at = now() - interval '3 days' where game_id = $1`, [PLAYED_WITH]);
await N.q(`update public.games set created_at = now() - interval '3 days' where id = $1`, [PLAYED_WITH]);
await N.move(PLAYED_WITH, -1);
eq(await N.check(HOST, PLAYED_WITH), { r: "ok", can: false, repeat: false, state: "played", players: 1, requests: 0, tags: 0 }, "a game played with someone else: the confirm step says it can't go, and why");
eq(await N.remove(HOST, PLAYED_WITH), { r: "others", players: 1 }, "and taking it off is refused: 1 other player");
eq(await N.row(PLAYED_WITH), { status: "open", hidden: false, removed_status: null, current_players: 2, confirmed_tagged: 0 }, "the row is untouched");
eq((await N.asRole("anon", () => N.q(`select id from public.games where id = $1`, [PLAYED_WITH]))).length, 1, "and still read");
ok((await N.q(`select private.played_game_ids($1) id`, [RAVI])).some((r) => r.id === PLAYED_WITH), "it still counts for the other player");
await N.q(`select public.close_past_games()`);
eq([(await N.row(PLAYED_WITH)).status, await N.remove(HOST, PLAYED_WITH)], ["completed", { r: "others", players: 1 }], "the same once the job has marked it completed");
{
  // Started, not over yet.
  const live = await N.create(HOST, {});
  await N.join(PRIYA, HOST, live);
  await N.q(`update public.games set date = (now() at time zone 'Asia/Kolkata' - interval '20 minutes')::date, start_time = (now() at time zone 'Asia/Kolkata' - interval '20 minutes')::time, end_time = time '23:59:59' where id = $1`, [live]);
  eq([(await N.check(HOST, live)).state, await N.remove(HOST, live)], ["played", { r: "others", players: 1 }], "a game that has started with someone in it is refused too");
}

/* ---------------- a solo played game ---------------- */
const SOLO = await N.create(HOST2, { confirmed_names: ["Rahul"], confirmed_tags: ["omar_s"] });
await N.ask(KIRAN, SOLO); // a request nobody answered
await N.q(`update public.games set created_at = now() - interval '3 days' where id = $1`, [SOLO]);
await N.move(SOLO, -1);
await N.q(`select public.close_past_games()`);
const playedHere = async () => [
  (await N.q(`select private.played_game_ids($1) id`, [HOST2])).some((r) => r.id === SOLO),
  (await N.one(`select private.review_played_here($1, $2, now()) b`, [HOST2, T(1)])).b,
  (await N.one(`select private.review_verified_via($1, $2) v`, [HOST2, T(1)])).v,
  (await N.rpc("game_tags_played", [KEY, OMAR])).games.some((g) => g.game_id === SOLO),
];
eq([(await N.row(SOLO)).status, await playedHere()], ["completed", [true, true, "game", true]],
  "(before: it is one of the host's played games, their review at the turf says played here, and the tagged player is asked Did you play?)");
eq(await N.check(HOST2, SOLO), { r: "ok", can: true, repeat: false, state: "played", players: 0, requests: 1, tags: 1 }, "a game its host played alone can go");
const t2 = (await N.one(`select clock_timestamp() t`)).t;
await N.q(`truncate private.test_dirty`);
eq(await N.remove(HOST2, SOLO), { r: "ok", removed: true, state: "played", told: 0 }, "it is hidden");
eq((await N.one(`select count(*)::int n from public.notifications where created_at >= $1`, [t2])).n, 0, "nobody is told (it is over)");
eq(await N.row(SOLO), { status: "cancelled", hidden: true, removed_status: "completed", current_players: 2, confirmed_tagged: 0 }, "the row: hidden, called off, and it remembers it was completed");
eq(await playedHere(), [false, false, null, false], "it has left the host's played games, the review's played here, and the tagged player's Did you play?");
eq(await N.rpc("game_tag_played", [KEY, OMAR, SOLO, true]), { r: "closed" }, "the tagged player can no longer say they played it");
eq((await N.q(`select 1 from public.game_participants where game_id = $1 and user_id = $2`, [SOLO, OMAR])).length, 0, "(and is no player of it)");
eq((await N.q(`select distinct key from private.test_dirty order by 1`)).map((d) => d.key), ["games", "turf:kings-turf"], "the cache queue is marked");
for (const [role, sub] of [["anon", null], ["authenticated", HOST2]]) {
  eq(await N.asRole(role, () => N.q(`select id from public.games where id = $1`, [SOLO]), sub), [], `${role} no longer reads it (so it is gone from its host's Passport, which reads as they do)`);
}
{
  const n = (await N.one(`select count(*)::int n from public.notifications`)).n;
  await N.q(`select private.game_tags_expire()`);
  eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tag_played_ask'`)).n, 0, "the tags job asks nobody Did you play? about it");
  ok((await N.one(`select count(*)::int n from public.notifications`)).n === n, "(it sends nothing at all)");
}
{
  // A solo game that has started and is not over: hidden, and off the turf's page at once.
  const live = await N.create(HOST2, {});
  await N.q(`update public.games set date = (now() at time zone 'Asia/Kolkata' - interval '20 minutes')::date, start_time = (now() at time zone 'Asia/Kolkata' - interval '20 minutes')::time, end_time = time '23:59:59' where id = $1`, [live]);
  await N.q(`update public.games set created_at = now() - interval '3 days' where id = $1`, [live]);
  const daily = async () => (await N.one(`select private.review_daily($1, $2) d`, [HOST2, T(2)])).d.played;
  ok(await onTurfPage(live), "(a game going on right now is among the games its turf's page reads)");
  eq(await daily(), 1, "(and it is a game its host played today, for how many reports they may post)");
  eq(await N.remove(HOST2, live), { r: "ok", removed: true, state: "played", told: 0 }, "its host, alone in it, takes it off");
  eq([await onTurfPage(live), (await N.row(live)).removed_status], [false, "open"], "it leaves the turf's page read, and the row remembers it was open");
  eq(await daily(), 0, "it is no game played today any more");
  eq((await N.q(`select id from public.games where turf_id = $1 and date >= (now() at time zone 'Asia/Kolkata')::date and status in (${DASH_STATUSES})`, [T(1)])).some((g) => g.id === live), false, "and the owner's upcoming count");
}

/* ---------------- one game of a repeat ---------------- */
{
  await N.q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1`, [HOST3]);
  const weekday = new Date(`${ist(3)}T00:00:00Z`).getUTCDay();
  const s = await N.rpc("game_series_create", [KEY, HOST3, JSON.stringify({ ...GAME, date: ist(3) }), JSON.stringify({ rule: { freq: "weekly", interval: 1, days: [weekday] }, ends: { type: "never" } })]);
  eq([s.r, s.made], ["ok", 4], "(a weekly repeat: its first 4 games go up)");
  const SID = s.series.id, [first, second] = s.games;
  await N.join(RAVI, HOST3, first.id);
  const mine = async () => (await N.rpc("game_series_mine", [KEY, HOST3])).series.find((x) => x.id === SID);
  eq([(await mine()).upcoming, (await mine()).unstarted, (await mine()).next.id], [4, 4, first.id], "(the host's list counts 4 and names the first as next)");
  eq(await N.check(HOST3, first.id), { r: "ok", can: true, repeat: true, state: "upcoming", players: 1, requests: 0, tags: 0 }, "the confirm step knows it is one game of a repeat");
  eq(await N.remove(HOST3, first.id), { r: "ok", removed: true, state: "upcoming", told: 1 }, "the host takes that one game off; its player is told");
  const s2 = await mine();
  eq([s2.active, s2.ended, s2.upcoming, s2.unstarted, s2.next.id], [true, null, 3, 3, second.id], "the repeat goes on: 3 games left, the second is next");
  eq((await N.q(`select status, removed_at is not null hidden from public.games where series_id = $1 and id <> $2 order by date`, [SID, first.id])), Array(3).fill({ status: "open", hidden: false }), "its other games are untouched");
  const onDay = () => N.q(`select id, removed_at is not null hidden from public.games where series_id = $1 and date = $2`, [SID, first.date]);
  eq((await N.one(`select private.game_series_fill($1, now(), false) n`, [SID])).n, 0, "the fill makes nothing now (the next 3 are up)");
  eq(await onDay(), [{ id: first.id, hidden: true }], "and does not put the hidden date up again");
  await N.q(`select private.game_series_tick()`);
  const made = (await N.one(`select private.game_series_fill($1, now() + interval '8 days', false) n`, [SID])).n;
  eq([made > 0, await onDay()], [true, [{ id: first.id, hidden: true }]], "a week on the fill puts later games up, never that date");
  eq((await N.asRole("anon", () => N.q(`select id from public.games where series_id = $1 and date >= $2 order by date`, [SID, ist(0)]))).some((g) => g.id === first.id), false, "the repeat's games as its page reads them leave the hidden one out");
  eq((await N.rpc("game_series_stop", [KEY, HOST3, SID, true])).r, "ok", "the repeat's own stop still works, and skips the hidden game");
  eq(await N.row(first.id), { status: "cancelled", hidden: true, removed_status: "open", current_players: 2, confirmed_tagged: 0 }, "which is as it was");
}

/* ---------------- a third run ---------------- */
await NEW.exec(sql);
eq((await N.one(`select qual from pg_policies where tablename = 'games' and policyname = 'Anyone can read games'`)).qual, "(removed_at IS NULL)", "run again, the file leaves its own policy as it is");
eq(await N.row(G1), { status: "cancelled", hidden: true, removed_status: "open", current_players: 4, confirmed_tagged: 0 }, "and the rows as they are");
eq((await N.one(`select count(*)::int n from pg_constraint where conrelid = 'public.games'::regclass and conname = 'games_removed_fields'`)).n, 1, "one check, not two");

// Putting one back by hand, as the header says.
await N.q(`update public.games set status = removed_status, removed_at = null, removed_status = null, updated_at = now() where id = $1`, [SOLO]);
eq([(await N.row(SOLO)).status, (await N.asRole("anon", () => N.q(`select id from public.games where id = $1`, [SOLO]))).length, (await N.q(`select private.played_game_ids($1) id`, [HOST2])).some((r) => r.id === SOLO)],
  ["completed", 1, true], "a hidden game can be put back by hand: completed again, read again, played again");

await OLD.close();
await NEW.close();
console.log(`game_remove.check: ${passed} checks passed`);
