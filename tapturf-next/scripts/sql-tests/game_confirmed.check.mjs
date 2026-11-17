// Applies 20261117_game_confirmed.sql (twice) to an in-memory Postgres (PGlite)
// built by games_lockdown.db.mjs, with both games lockdown files, the repeats,
// the other venue, web push and email files applied first (as production is),
// private.game_start_at as 20261101_played_with.sql has it, public.usernames as
// 20261021_accounts_usernames.sql makes it (the columns read here), and stand-ins
// for pg_cron, pg_net, private.email_proven and the site owner's keys, next to a
// second database without the file. Checks: the file (additive, no destructive
// words, refuses without the files it needs and changes nothing then; every
// replaced function is the repo's latest body, whose md5 the header names, with
// only the listed lines changed); a game with nobody confirmed is made, joined,
// edited, repeated and emailed about exactly as before (the same answers and rows
// as the database without the file); every case in lib/games/confirmed.cases.json
// is taken or refused as lib/games/confirmed.ts takes it; create with names and a
// count (stored collapsed, counted, refused when they don't fit); the edit up and
// down (max players never under everyone in, confirmed people never over it, an
// edit of something else leaves them alone); the recount after an accept; full
// with confirmed people (a request refused, an accept refused, the request left
// waiting); repeats (the names and the count on the series and on every game,
// now and at the daily top-up; an edit changes one game; tags on the first game
// only); tags (who can be tagged, one notification and no email, hidden from the
// public row and the API roles, the host's and the player's reads, yes makes a
// player with the count unchanged, no frees the spot and can't be tagged again,
// untag, a tag told 3 times at most, a tag ends when the game starts or is off, an
// account that is gone, 20 a game and 50 a host a day); an email's players; grants;
// the job. Never touches a real database. Made-up people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_confirmed.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const NAME = "20261117_game_confirmed.sql";
const FILE = `${M}/${NAME}`;
const CASES = JSON.parse(fs.readFileSync(path.join(M, "../../lib/games/confirmed.cases.json"), "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

/* ---------------- the file itself ---------------- */
const sql = fs.readFileSync(FILE, "utf8");
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate (not even inside a word)");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/[\u200b-\u200f\u00a0\ufeff]/.test(sql), "no invisible characters (the joiners in the name rule are written as escapes)");
ok(/^set local lock_timeout = '5s';$/m.test(sql), "waits 5 s at most for a lock");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications|users|turfs|usernames)\b/i.test(sql), "changes no grant on a public table");
ok(!/(alter|create)\s+policy/i.test(sql), "makes or changes no policy");
eq([...new Set([...sql.matchAll(/alter\s+table\s+([\w.]+)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`))].sort(),
  ["private.game_series add", "private.game_tags enable", "public.games add"], "alters only by adding columns and a check (and RLS on its own table)");
ok(!/(insert\s+into|update)\s+public\.(users|turfs|usernames)\b/i.test(sql), "writes no user, turf or username row");
ok([...sql.matchAll(/^create or replace function [\w.]+\([^]*?\n(?:as )?\$\$/gm)].every((m) => /set search_path = ''/.test(m[0])), "every function has an empty search_path");

// A function's body as Postgres keeps it (prosrc): the text between its dollar quotes.
const bodyOf = (text, name) => {
  const i = text.lastIndexOf(`create or replace function ${name}(`);
  if (i < 0) return null;
  const tag = /\$(\w*)\$/.exec(text.slice(i));
  const a = i + tag.index + tag[0].length;
  return text.slice(a, text.indexOf(tag[0], a));
};
const EARLIER = fs.readdirSync(M).filter((f) => f.endsWith(".sql") && f < NAME).sort().map((f) => [f, fs.readFileSync(`${M}/${f}`, "utf8")]);
const latest = (name) => {
  let last = null;
  for (const [f, t] of EARLIER) if (t.includes(`create or replace function ${name}(`)) last = { file: f, body: bodyOf(t, name) };
  return last;
};
// Each replaced function: production's md5 (read 17 Nov 2026) is the repo's latest body, the header names it, and
// the new body keeps every line of it, in order, but the ones listed (changed for the count or the new keys).
const REPLACED = {
  "public.game_create": { md5: "0d171541ee3f6e0f3e00ef4d96b88cc1", file: "20261103_game_other_venue.sql", gone: 4 },
  "public.game_series_create": { md5: "301b3fb7602a06eeaa32b36818edcc26", file: "20261103_game_other_venue.sql", gone: 3 },
  "private.game_series_fill": { md5: "0c55f721079a3c4833b29618df91b28d", file: "20261103_game_other_venue.sql", gone: 3 },
  "public.game_update": { md5: "e3b0876c0d8c2a5e0f7082cbe1c54181", file: "20261110_email.sql", gone: 4 },
  "public.game_request_send": { md5: "c144dc895b036bfcb3821311c5a421c5", file: "20261030_games_lockdown.sql", gone: 1 },
  "public.game_request_answer": { md5: "82b2b5b6d25023eced978503eddb2c75", file: "20261030_games_lockdown.sql", gone: 2 },
  "private.email_job": { md5: "de42a2d469d8d5044b24520afbbe3f1e", file: "20261110_email.sql", gone: 1 },
};
for (const [fn, want] of Object.entries(REPLACED)) {
  const old = latest(fn);
  eq([old.file, md5(old.body)], [want.file, want.md5], `${fn}: production's body is the one in ${want.file}`);
  ok(new RegExp(`${want.file.replace(".", "\\.")}\\s+${want.md5}`).test(sql), `${fn}: the header names it`);
  const o = old.body.split("\n");
  const n = bodyOf(sql, fn).split("\n");
  let i = 0;
  const gone = [];
  for (const line of o) {
    const at = n.indexOf(line, i);
    if (at < 0) gone.push(line);
    else i = at + 1;
  }
  eq(gone.length, want.gone, `${fn}: keeps every line of production's body in order but ${want.gone} (${gone.map((l) => l.trim().slice(0, 50)).join(" | ")})`);
  ok(gone.every((l) => /game_field_problem|current_players|count\(\*\) into v_players|max_players|venue_maps_url|too_few|returning \* into/.test(l)), `${fn}: the changed lines are the check, the count and the insert's columns`);
}
eq(md5(latest("private.game_field_problem").body), "d0fb172c6cb8f1dc0fa284171262d30c", "private.game_field_problem as production runs it");
ok(bodyOf(sql, "private.game_field_problem") === null, "and the file leaves it alone");
for (const [fn, m] of Object.entries({
  "private.account_key_ok": "ca605fa89a97497134b690e753dc5c0e", "private.game_notify": "b105f7aee319ed9725f42b85c5d4735c",
  "private.game_over": "b7ffb3e6915e6bc9743db2027a7fb7ee", "private.game_start_at": "870fe04f498b656d8c9435099fd8bfb9",
  "private.game_venue_text": "8cf8615fc5c81008d16598b9a3c3363a", "private.game_venue_digits": "fe2139a669ff6dd5e1728d2900329649",
  "private.game_venue_problem": "3cd2b11a746c1156c80896cfe57684de", "private.game_series_no_turf": "f0758069b2a4b5e4bca85c2d0beb66d6",
  "private.game_clock_text": "9ea2bb3fc277795aa74f5237b2d93af4", "private.game_sport_text": "28192bf7b394432826d0a19a3a6c4d08",
  "private.email_venue_name": "8ba7980f0d509060ce6ed6f89c789a94", "private.email_kind_of": "420acfb9547a4f449fa128b457176f41",
})) {
  ok(md5(latest(fn).body) === m && new RegExp(`${fn.replace(".", "\\.")}\\s+${m}`).test(sql), `the header names ${fn} with the md5 of its latest body in the repo`);
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
create function private.phone_proven(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select false $$;`;
const fnFrom = (text, name) => {
  const m = [...text.matchAll(new RegExp(`create or replace function ${name.replace(/\./g, "\\.")}\\([^]*?\\n\\$\\$;`, "g"))].at(-1);
  assert.ok(m, `${name} is in the file`);
  return m[0];
};
const read = (f) => fs.readFileSync(`${M}/${f}`, "utf8");
const MYTT = read("20261019_mytapturf.sql");
// The site owner's keys as 20261019_mytapturf.sql has them (read, never written here); nobody here is the site owner.
const OWNER = `${fnFrom(MYTT, "public._phone10")}
${fnFrom(MYTT, "public._is_admin_key")}
create or replace function public._caller_key(p_token text) returns text language sql stable as $$ select null::text $$;`;
const START_AT = fnFrom(read("20261101_played_with.sql"), "private.game_start_at");
// public.usernames as 20261021_accounts_usernames.sql makes it (the columns this file reads), closed to the API roles.
const USERNAMES = `create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true, created_at timestamptz not null default now());
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;`;
const BEFORE = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql", "20261110_email.sql"].map(read);

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(5), MEERA = U(6), NEHA = U(7), HOST2 = U(8);
const PEOPLE = [[HOST, "Asha Rao", "asha"], [RAVI, "Ravi Kumar", "ravi_k"], [PRIYA, "Priya Sharma", "priya23"], [KIRAN, "Kiran Patil", "kiran"],
  [OMAR, "Omar Shaikh", "omar_s"], [MEERA, "Meera Iyer", null], [NEHA, "Neha Joshi", "neha_j"], [HOST2, "Vikram Rao", "vikram"]];
// 60 more players with usernames, for the limits.
const CROWD = Array.from({ length: 60 }, (_, i) => [U(100 + i), `Player ${i + 1}`, `crowd_${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`]);

async function setUp(withFile) {
  const db = await makeDb(PGlite);
  await db.exec(CRON + NET + PROVEN + START_AT + OWNER + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
  for (const f of BEFORE) await db.exec(f);
  await db.exec(USERNAMES);
  await db.exec(`update private.email_settings set value = 'on' where name = 'mode'`);
  for (const [id, name, u] of [...PEOPLE, ...CROWD]) {
    await db.query(`insert into public.users (id, name, phone, email, profile_image_url, created_at) values ($1, $2, null, $3, $4, now() - interval '30 days')`,
      [id, name, `${id.slice(-6)}.standin@example.com`, id === RAVI ? "https://lh3.example/ravi" : null]);
    if (u) await db.query(`insert into public.usernames (user_id, username) values ($1, $2)`, [id, u]);
  }
  await db.exec(`insert into private.test_proven select id from public.users;
    insert into public.turfs (id, name, slug, city, area, is_active, sports) values
    ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'), ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', true, '["Football"]');`);
  if (withFile) {
    // A game from before the file: it must pass the new check and keep its count.
    await db.query(`select public.game_create($1, $2, $3)`, [KEY, HOST2, JSON.stringify({ ...GAME, date: ist(1) })]);
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}
const helpers = (db) => {
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
  const asRole = async (role, fn) => {
    await q(`set role ${role}`);
    try { return await fn(); } finally { await q("reset role"); }
  };
  // (The daily limits: this host's earlier test games, repeats and tags are made older.)
  const fresh = async (host) => {
    await q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1 and created_at > now() - interval '1 day'`, [host]);
    await q(`update private.game_series set created_at = created_at - interval '2 days', active = false where host_id = $1 and created_at > now() - interval '1 day'`, [host]);
  };
  const create = async (host, o = {}) => {
    await fresh(host);
    return rpc("game_create", [KEY, host, JSON.stringify({ ...GAME, ...o })]);
  };
  const game = (id) => one(`select max_players, current_players, status, confirmed_names, confirmed_extra, confirmed_tagged from public.games where id = $1`, [id]);
  return { q, one, rpc, asRole, create, fresh, game };
};
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150 };

{
  const bare = await makeDb(PGlite);
  await bare.exec(CRON + NET + PROVEN + START_AT + OWNER);
  for (const f of BEFORE.slice(0, 5)) await bare.exec(f);
  await bare.exec(USERNAMES);
  await assert.rejects(bare.exec(sql), /game confirmed: apply .* 20261110_email\.sql first/, "without the email file it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name like 'confirmed%'`)).rows[0].n, 0, "and changes nothing");
  await bare.close();
}

const OLD = await setUp(false);
const NEW = await setUp(true);
passed++; // applied twice
const O = helpers(OLD), N = helpers(NEW);

/* ---------------- what the file made ---------------- */
eq(await N.q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'games' and column_name like 'confirmed%' order by 1`), [
  { column_name: "confirmed_extra", data_type: "smallint", is_nullable: "NO", column_default: "0" },
  { column_name: "confirmed_names", data_type: "ARRAY", is_nullable: "NO", column_default: "'{}'::text[]" },
  { column_name: "confirmed_tagged", data_type: "smallint", is_nullable: "NO", column_default: "0" }], "three columns on games, none null, starting empty");
eq((await N.q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'game_series' and column_name like 'confirmed%' order by 1`)).map((r) => r.column_name),
  ["confirmed_extra", "confirmed_names"], "two on the series");
eq(await N.one(`select current_players, confirmed_names, confirmed_extra, confirmed_tagged from public.games where creator_id = $1`, [HOST2]),
  { current_players: 1, confirmed_names: [], confirmed_extra: 0, confirmed_tagged: 0 }, "a game from before the file: nobody confirmed, its count as it was");
eq(await N.q(`select name, schedule, command from cron.jobs where name = 'game-tags-expire'`),
  [{ name: "game-tags-expire", schedule: "*/10 * * * *", command: "select private.game_tags_expire()" }], "the job: every 10 minutes");
for (const bad of [`confirmed_extra = 31`, `confirmed_extra = -1`, `confirmed_tagged = 21`, `confirmed_names = array_fill('A'::text, array[21])`, `confirmed_names = array[array['A'], array['B']]`]) {
  await assert.rejects(N.q(`update public.games set ${bad} where creator_id = $1`, [HOST2]), /games_confirmed_fields/, `the table's own check refuses ${bad}`);
  passed++;
}

/* ---------------- nobody confirmed: exactly as before ---------------- */
// The same steps on both databases; ids and times aside, the same answers and the same rows.
const scrub = (x) => JSON.parse(JSON.stringify(x, (k, v) => (["id", "created_at", "updated_at", "responded_at", "series_id", "game_id", "confirmed_names", "confirmed_extra", "confirmed_tagged"].includes(k) ? undefined : v)));
async function asBefore(H) {
  const out = [];
  const g = await H.create(HOST, { max_players: 4 });
  out.push(g);
  const id = g.game.id;
  const r1 = await H.rpc("game_request_send", [KEY, RAVI, id, "Keeper"]);
  const r2 = await H.rpc("game_request_send", [KEY, PRIYA, id, null]);
  const r3 = await H.rpc("game_request_send", [KEY, KIRAN, id, null]);
  const r4 = await H.rpc("game_request_send", [KEY, OMAR, id, null]);
  out.push(r1.r, r2.r, r3.r, r4.r);
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r1.request.id, true]));
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r2.request.id, true]));
  out.push(await H.rpc("game_update", [KEY, HOST, id, JSON.stringify({ max_players: 2 }), null]));
  out.push(await H.rpc("game_update", [KEY, HOST, id, JSON.stringify({ description: "Bibs on", price_per_player: 100 }), null]));
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r3.request.id, true]));
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r4.request.id, true]));
  out.push(await H.rpc("game_request_send", [KEY, MEERA, id, null]));
  out.push(await H.rpc("game_update", [KEY, HOST, id, JSON.stringify({ start_time: "18:00", max_players: 5 }), null]));
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r4.request.id, false]));
  out.push(await H.rpc("game_create", [KEY, HOST, JSON.stringify({ ...GAME, max_players: 1 })]));
  out.push(await H.rpc("game_create", [KEY, HOST, JSON.stringify("x")]));
  out.push(await H.rpc("game_update", [KEY, HOST, id, JSON.stringify([1]), null]));
  await H.fresh(HOST);
  const s = await H.rpc("game_series_create", [KEY, HOST, JSON.stringify({ ...GAME, date: ist(3) }), JSON.stringify({ rule: { freq: "weekly", interval: 1, days: [new Date(`${ist(3)}T00:00:00Z`).getUTCDay()] }, ends: { type: "after", count: 3 } })]);
  out.push({ r: s.r, made: s.made, games: s.games });
  out.push(await H.q(`select sport, max_players, current_players, status, date, start_time, price_per_player, description, host_name
    from public.games where creator_id = $1 order by date, start_time, max_players`, [HOST]));
  out.push(await H.q(`select n.type, n.title, n.message, u.name from public.notifications n join public.users u on u.id = n.user_id order by n.created_at, n.type, u.name`));
  out.push(await H.q(`select o.kind, o.status, u.name, (private.email_job(o) -> 'game' ->> 'players') players, private.email_job(o) ->> 'skip' skip
    from private.email_outbox o join public.users u on u.id = o.user_id order by o.created_at, o.kind, u.name`));
  return scrub(out);
}
const [was, is] = [await asBefore(O), await asBefore(N)];
eq(is, was, "with nobody confirmed, a game is made, asked into, answered, edited, refused as full, repeated and emailed about exactly as before");
ok(was[6].current_players === 3 && was[7].r === "too_few" && was[7].players === 3 && was[9].current_players === 4 && was[10].r === "full" && was[11].r === "full" && was[12].r === "ok", "(the steps did what they say: accepted, too few, full twice)");

/* ---------------- the rules: lib/games/confirmed.cases.json ---------------- */
ok(CASES.names.length >= 45 && CASES.fields.length >= 25, "the shared cases are there");
for (const c of CASES.names) {
  const got = typeof c.value === "string" ? (await N.one(`select private.game_confirmed_name_ok($1) v`, [c.value])).v : false;
  eq(got === true, c.ok, `a name, ${c.what}: ${c.ok ? "taken" : "refused"}`);
}
for (const c of CASES.fields) {
  const got = (await N.one(`select private.game_confirmed_problem($1::jsonb, true) v`, [JSON.stringify({ [c.key]: c.value })])).v;
  eq(got, c.ok ? null : c.key, `${c.key}, ${c.what}: ${c.ok ? "taken" : "refused"}`);
}
eq((await N.one(`select private.game_confirmed_problem('{"confirmed_untag": []}'::jsonb, false) v`)).v, "confirmed_untag", "confirmed_untag is an edit's key only");
eq((await N.one(`select private.game_confirmed_problem('[1]'::jsonb, true) v`)).v, null, "(a body that is no object is game_field_problem's to refuse)");

/* ---------------- create ---------------- */
let g = await N.create(HOST, { confirmed_names: ["  Rahul ", "Amit   Bhai", "राहुल"], confirmed_extra: 2 });
eq([g.r, g.game.current_players, g.game.confirmed_names, g.game.confirmed_extra, g.game.confirmed_tagged, g.game.status],
  ["ok", 6, ["Rahul", "Amit Bhai", "राहुल"], 2, 0, "open"], "a game with 3 names and 2 more starts at 6 of 10, the names collapsed, in the host's order");
const G1 = g.game.id;
eq((await N.one(`select count(*)::int n from public.game_participants where game_id = $1`, [G1])).n, 1, "the host is its only player row: a name is not an account");
eq((await N.one(`select count(*)::int n from public.notifications where metadata ->> 'gameId' = $1`, [G1])).n, 0, "and nobody is told anything");
eq((await N.create(HOST, { max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1 })).game.current_players, 4, "the host, 2 names and 1 more fill a game of 4");
eq(await N.create(HOST, { max_players: 4, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2 }), { r: "bad", field: "confirmed" }, "one more than fits: refused");
eq(await N.create(HOST, { max_players: 4, confirmed_extra: 2, confirmed_tags: ["ravi_k", "priya23"] }), { r: "bad", field: "confirmed" }, "tags count for the fit too");
eq(await N.create(HOST, { confirmed_names: ["Rahul 98220"] }), { r: "bad", field: "confirmed_names" }, "a digit in a name: refused");
eq(await N.create(HOST, { confirmed_extra: 31, max_players: 50 }), { r: "bad", field: "confirmed_extra" }, "31 more: refused");
eq(await N.create(HOST, { confirmed_untag: [] }), { r: "bad", field: "confirmed_untag" }, "nothing to untag on a new game");
eq(await N.create(HOST, { confirmed_other: 1 }), { r: "bad", field: "confirmed_other" }, "any other key is still refused");
eq((await N.create(HOST, { confirmed_names: [], confirmed_extra: 0, confirmed_tags: [] })).game.current_players, 1, "none of each is a game as before");

/* ---------------- the edit: up and down ---------------- */
const upd = (id, c, host = HOST) => N.rpc("game_update", [KEY, host, id, JSON.stringify(c), null]);
g = await upd(G1, { confirmed_names: ["Rahul", "Amit Bhai", "राहुल", "Sunny"], confirmed_extra: 3 });
eq([g.r, g.game.current_players, g.game.confirmed_names.length, g.game.confirmed_extra], ["ok", 8, 4, 3], "up: a name and one more make 8 of 10");
g = await upd(G1, { confirmed_names: ["Rahul"], confirmed_extra: 0 });
eq([g.r, g.game.current_players, g.game.confirmed_names, g.game.confirmed_extra], ["ok", 2, ["Rahul"], 0], "down: one name left makes 2 of 10");
g = await upd(G1, { description: "Bring bibs" });
eq([g.game.current_players, g.game.confirmed_names, g.game.confirmed_extra], [2, ["Rahul"], 0], "an edit of something else leaves the confirmed people alone");
g = await upd(G1, { confirmed_extra: 5 });
eq([g.game.current_players, g.game.confirmed_names, g.game.confirmed_extra], [7, ["Rahul"], 5], "the count alone: the names stay");
eq(await upd(G1, { confirmed_extra: 9 }), { r: "bad", field: "confirmed" }, "more confirmed people than spots: refused");
eq(await N.game(G1), { max_players: 10, current_players: 7, status: "open", confirmed_names: ["Rahul"], confirmed_extra: 5, confirmed_tagged: 0 }, "and nothing changed");
eq(await upd(G1, { max_players: 6 }), { r: "too_few", players: 7 }, "max players under everyone in (the host, a name, 5 more): too few, with the number");
eq((await upd(G1, { max_players: 7 })).game.max_players, 7, "max players down to exactly everyone in is fine");
eq(await upd(G1, { max_players: 9, confirmed_extra: 8 }), { r: "too_few", players: 10 }, "max players and the count in one save must fit together");
g = await upd(G1, { max_players: 12, confirmed_extra: 8 });
eq([g.game.max_players, g.game.current_players], [12, 10], "raised together: 10 of 12");
eq(await upd(G1, { confirmed_names: ["Rahul", "www.rahul"] }), { r: "bad", field: "confirmed_names" }, "a link for a name: refused");
eq(await upd(G1, { confirmed_extra: 1 }, RAVI), { r: "not_host" }, "only the host");

/* ---------------- recount after an accept; full ---------------- */
await upd(G1, { max_players: 12, confirmed_extra: 7 }); // 1 + 1 + 7 = 9 of 12
const ask = async (who, id) => (await N.rpc("game_request_send", [KEY, who, id, null]));
const rRavi = await ask(RAVI, G1), rPriya = await ask(PRIYA, G1), rKiran = await ask(KIRAN, G1), rOmar = await ask(OMAR, G1);
eq([rRavi.r, rPriya.r, rKiran.r, rOmar.r], ["ok", "ok", "ok", "ok"], "four ask to join at 9 of 12");
let a = await N.rpc("game_request_answer", [KEY, HOST, rRavi.request.id, true]);
eq([a.r, a.current_players, (await N.game(G1)).current_players], ["ok", 10, 10], "an accept recounts with the confirmed people: 10 of 12");
await N.rpc("game_request_answer", [KEY, HOST, rPriya.request.id, true]);
a = await N.rpc("game_request_answer", [KEY, HOST, rKiran.request.id, true]);
eq([a.current_players, (await N.game(G1)).current_players], [12, 12], "two more: 12 of 12");
eq(await N.rpc("game_request_answer", [KEY, HOST, rOmar.request.id, true]), { r: "full" }, "the next accept is refused as full, as a full game always was");
eq((await N.one(`select status from public.game_requests where id = $1`, [rOmar.request.id])).status, "pending", "and the request is left waiting");
eq((await ask(MEERA, G1)).r, "full", "a new request is refused as full");
eq(await upd(G1, { confirmed_extra: 8 }), { r: "bad", field: "confirmed" }, "the host can't confirm one more into a full game");
g = await upd(G1, { confirmed_extra: 6 });
eq(g.game.current_players, 11, "one fewer without a name: 11 of 12, the joined players all still in");
eq((await N.one(`select count(*)::int n from public.game_participants where game_id = $1`, [G1])).n, 4, "(the host and the three accepted)");
eq((await N.rpc("game_request_answer", [KEY, HOST, rOmar.request.id, true])).current_players, 12, "now the waiting request can be accepted");
// Confirmed people alone fill a game: nobody can ask.
g = await N.create(HOST, { max_players: 5, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2 });
eq([g.game.current_players, (await ask(RAVI, g.game.id)).r], [5, "full"], "a game its host's friends fill is full to everyone else");
// Asked first, filled by the host afterwards: the accept is refused.
g = await N.create(HOST, { max_players: 4 });
const late = await ask(RAVI, g.game.id);
await upd(g.game.id, { confirmed_extra: 3 });
eq(await N.rpc("game_request_answer", [KEY, HOST, late.request.id, true]), { r: "full" }, "a request sent before the host filled the game can't be accepted");
eq((await N.rpc("game_request_answer", [KEY, HOST, late.request.id, false])).r, "ok", "(it can still be declined)");

/* ---------------- an email's players ---------------- */
eq((await N.one(`select private.email_job(o) -> 'game' ->> 'players' p from private.email_outbox o
  where o.kind = 'request_accepted' and o.user_id = $1 and o.refs ->> 'game_id' = $2`, [OMAR, G1])).p, "12", "an email about the game counts everyone in, as the page does");
ok(!JSON.stringify(await N.q(`select private.email_job(o) j from private.email_outbox o where o.refs ->> 'game_id' = $1`, [G1])).includes("Rahul"), "and never carries a confirmed name");

/* ---------------- repeats ---------------- */
await N.fresh(HOST);
const dow = new Date(`${ist(3)}T00:00:00Z`).getUTCDay();
const REPEAT = { rule: { freq: "weekly", interval: 1, days: [dow] }, ends: { type: "never" } };
let s = await N.rpc("game_series_create", [KEY, HOST, JSON.stringify({ ...GAME, date: ist(3), confirmed_names: ["Rahul", " Amit "], confirmed_extra: 2, confirmed_tags: ["ravi_k"] }), JSON.stringify(REPEAT)]);
eq([s.r, s.made], ["ok", 4], "a repeat with 2 names, 2 more and a tag: its first 4 games go up");
const SID = s.series.id;
eq(await N.one(`select confirmed_names, confirmed_extra from private.game_series where id = $1`, [SID]), { confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2 }, "the series keeps the names and the count");
eq(await N.q(`select current_players, confirmed_names, confirmed_extra, confirmed_tagged from public.games where series_id = $1 order by date`, [SID]), [
  { current_players: 6, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2, confirmed_tagged: 1 },
  ...Array(3).fill({ current_players: 5, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2, confirmed_tagged: 0 })], "every game has them and starts counted; the tag is on the first game only");
eq(s.games.map((x) => x.current_players), [6, 5, 5, 5], "(and the answer says the same)");
eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and user_id = $1`, [RAVI])).n, 1, "the tagged player is told once, not once a game");
const first = s.games[0].id;
await upd(first, { confirmed_names: [], confirmed_extra: 0 });
eq((await N.q(`select current_players from public.games where series_id = $1 order by date`, [SID])).map((r) => r.current_players), [2, 5, 5, 5], "an edit changes that one game");
// The daily top-up, 8 days on: the next game copies the series' people.
await N.q(`select private.game_series_fill($1, now() + interval '8 days', false)`, [SID]);
eq(await N.q(`select current_players, confirmed_names, confirmed_extra, confirmed_tagged from public.games where series_id = $1 order by date desc limit 1`, [SID]),
  [{ current_players: 5, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 2, confirmed_tagged: 0 }], "the daily top-up's game has them too, and no tag");
eq((await N.q(`select 1 from public.games where series_id = $1`, [SID])).length, 5, "(5 games now)");
eq(await N.rpc("game_series_create", [KEY, HOST, JSON.stringify({ ...GAME, date: ist(3), max_players: 3, confirmed_extra: 3 }), JSON.stringify(REPEAT)]), { r: "bad", field: "confirmed" }, "a repeat whose people don't fit: refused");
eq((await N.one(`select count(*)::int n from private.game_series where host_id = $1 and active`, [HOST])).n, 1, "and no series is made");

/* ---------------- tags ---------------- */
await N.q(`update public.usernames set taggable = false where user_id = $1`, [OMAR]);
g = await N.create(HOST, { max_players: 10, confirmed_names: ["Rahul"], confirmed_tags: ["ravi_k", "priya23", "RAVI_K".toLowerCase(), "omar_s", "asha", "nobody_here"] });
const G2 = g.game.id;
eq([g.r, g.game.current_players, g.game.confirmed_tagged, g.game.confirmed_names], ["ok", 4, 2, ["Rahul"]],
  "tags at create: two players tagged (a username twice is once; the host, a player who turned tagging off and a username nobody has are skipped), 4 of 10");
const told = await N.q(`select u.name, n.type, n.title, n.message, n.metadata ->> 'gameId' game, n.is_read from public.notifications n join public.users u on u.id = n.user_id
  where n.type = 'game_tagged' and n.metadata ->> 'gameId' = $1 order by u.name`, [G2]);
const day = new Date(`${ist(2)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
eq(told, ["Priya Sharma", "Ravi Kumar"].map((name) => ({ name, type: "game_tagged", title: "Are you in?",
  message: `Asha added you as confirmed for Football, ${day}, 7 PM at Kings Turf.`, game: G2, is_read: false })), "each is told once, in the app, with the game");
eq((await N.one(`select count(*)::int n from private.email_outbox o where o.refs ->> 'game_id' = $1`, [G2])).n, 0, "no email is queued for a tag");
eq((await N.one(`select private.email_kind_of('game_tagged') k`)).k, null, "(the type maps to no email)");
// Hidden: the public row has a number, nothing else; the table is closed.
const pub = JSON.stringify(await N.asRole("anon", () => N.q(`select * from public.games where id = $1`, [G2])));
ok(!/Ravi|Priya|ravi_k|priya23/.test(pub) && /"confirmed_tagged":2/.test(pub), "the public row says 2 are tagged, never who");
eq((await N.asRole("anon", () => N.q(`select user_id from public.game_participants where game_id = $1`, [G2]))).map((r) => r.user_id), [HOST], "the lineup anyone reads has the host alone");
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(N.asRole(role, () => N.q(`select * from private.game_tags`)), /permission denied/, `${role} cannot read the tags`);
  await assert.rejects(N.asRole(role, () => N.q(`select private.game_tags_add($1, $2, array['kiran'])`, [G2, HOST])), /permission denied/, `${role} cannot tag`);
  await assert.rejects(N.asRole(role, () => N.q(`select private.game_in($1)`, [G2])), /permission denied/, `${role} cannot run the helpers`);
  passed += 3;
}
eq(await N.rpc("game_tags_for", ["wrong", HOST, G2]), { r: "unavailable" }, "the read needs the server key");
eq(await N.rpc("game_tag_answer", ["wrong", RAVI, G2, true]), { r: "unavailable" }, "and so does the answer");
let tags = await N.rpc("game_tags_for", [KEY, HOST, G2]);
eq([tags.host, tags.tags.map((t) => [t.name, t.u, t.photo])], [true, [["Priya Sharma", "priya23", null], ["Ravi Kumar", "ravi_k", "https://lh3.example/ravi"]]], "the host reads who is waiting");
eq(await N.rpc("game_tags_for", [KEY, RAVI, G2]), { r: "ok", host: false, mine: "pending" }, "a tagged player reads only that they are");
eq(await N.rpc("game_tags_for", [KEY, KIRAN, G2]), { r: "ok", host: false, mine: null }, "anyone else reads nothing");
eq((await N.rpc("game_tag_answer", [KEY, KIRAN, G2, true])).r, "gone", "someone not tagged can't answer");
eq((await ask(RAVI, G2)).r, "ok", "(a tagged player may also ask to join the usual way)");
{
  // Tagged, and the host accepts their own request before they answer: one player, counted once.
  const g5 = (await N.create(HOST, { max_players: 6, confirmed_extra: 1, confirmed_tags: ["neha_j"] })).game.id;
  const r5 = await ask(NEHA, g5);
  eq(await N.rpc("game_request_answer", [KEY, HOST, r5.request.id, true]), { r: "ok", status: "accepted", current_players: 3 }, "a tagged player the host accepts is counted once: the host, 1 more and her");
  eq(await N.game(g5), { max_players: 6, current_players: 3, status: "open", confirmed_names: [], confirmed_extra: 1, confirmed_tagged: 0 }, "and the public row no longer counts her tag");
  eq([(await N.rpc("game_tags_for", [KEY, HOST, g5])).tags, (await N.rpc("game_tags_for", [KEY, NEHA, g5])).mine], [[], null], "nor do the reads");
  await N.q(`update private.game_tags set status = 'untagged' where game_id = $1`, [g5]);
}

// Yes: a player like any other, the count as it was.
a = await N.rpc("game_tag_answer", [KEY, RAVI, G2, true]);
eq(a, { r: "ok", status: "yes", current_players: 4 }, "yes: still 4 of 10, the tag held the spot");
eq(await N.game(G2), { max_players: 10, current_players: 4, status: "open", confirmed_names: ["Rahul"], confirmed_extra: 0, confirmed_tagged: 1 }, "one tag is still waiting");
eq((await N.q(`select user_id from public.game_participants where game_id = $1 order by joined_at, user_id`, [G2])).map((r) => r.user_id).sort(), [HOST, RAVI].sort(), "they are in the lineup now");
eq((await N.one(`select status from public.game_requests where game_id = $1 and user_id = $2`, [G2, RAVI])).status, "accepted", "their waiting request is marked accepted");
eq(await N.q(`select type, title, message from public.notifications where user_id = $1 and metadata ->> 'gameId' = $2 and type like 'game_tag%'`, [HOST, G2]),
  [{ type: "game_tag_yes", title: "Confirmed", message: `Ravi is in for your Football game on ${day}.` }], "the host is told");
eq((await N.rpc("game_tag_answer", [KEY, RAVI, G2, false])).r, "gone", "an answer is given once");
// No: the spot is free, and they can't be tagged on this game again.
a = await N.rpc("game_tag_answer", [KEY, PRIYA, G2, false]);
eq([a, (await N.game(G2)).confirmed_tagged], [{ r: "ok", status: "no", current_players: 3 }, 0], "not me: 3 of 10, the spot is free again");
eq((await N.one(`select message from public.notifications where user_id = $1 and type = 'game_tag_no'`, [HOST])).message, `Priya can't make your Football game on ${day}.`, "the host is told");
g = await upd(G2, { confirmed_tags: ["priya23", "ravi_k", "kiran"] });
eq([g.game.current_players, g.game.confirmed_tagged], [4, 1], "tagging again skips the one who said no and the one who is in; a new player is tagged");
eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and user_id = $1`, [PRIYA])).n, 1, "she was told once only");
// Untag, and how often one player can be told.
tags = await N.rpc("game_tags_for", [KEY, HOST, G2]);
eq(tags.tags.map((t) => t.name), ["Kiran Patil"], "the host's list has the new tag");
const KTAG = tags.tags[0].id;
g = await upd(G2, { confirmed_untag: [KTAG] });
eq([g.game.current_players, g.game.confirmed_tagged, (await N.rpc("game_tags_for", [KEY, KIRAN, G2])).mine], [3, 0, null], "untag: the spot is free and the player is no longer asked");
eq((await N.rpc("game_tag_answer", [KEY, KIRAN, G2, true])).r, "gone", "an untagged player's yes does nothing");
eq((await N.one(`select count(*)::int n from public.game_participants where game_id = $1 and user_id = $2`, [G2, KIRAN])).n, 0, "(they are not in)");
for (const n of [2, 3]) {
  await upd(G2, { confirmed_tags: ["kiran"] });
  await upd(G2, { confirmed_untag: [KTAG] });
  eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and user_id = $1`, [KIRAN])).n, n, `tagged again: told ${n} times`);
}
g = await upd(G2, { confirmed_tags: ["kiran"] });
eq([g.game.confirmed_tagged, (await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and user_id = $1`, [KIRAN])).n], [0, 3], "a fourth tag of the same player on the same game is skipped: told 3 times at most");
// The same save can untag one and tag another; the fit is checked first.
await upd(G2, { confirmed_tags: ["neha_j"] });
const NTAG = (await N.rpc("game_tags_for", [KEY, HOST, G2])).tags[0].id;
await upd(G2, { max_players: 4 }); // the host, Ravi, Rahul and Neha's tag
eq(await upd(G2, { confirmed_tags: ["vikram"] }), { r: "bad", field: "confirmed" }, "a tag that doesn't fit: refused");
eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and user_id = $1`, [HOST2])).n, 0, "and nobody was told");
g = await upd(G2, { confirmed_tags: ["vikram"], confirmed_untag: [NTAG] });
eq([g.r, g.game.current_players, (await N.rpc("game_tags_for", [KEY, HOST, G2])).tags.map((t) => t.name)], ["ok", 4, ["Vikram Rao"]], "one out, one in, in one save");
eq(await upd(G2, { max_players: 3 }), { r: "too_few", players: 4 }, "max players can't go under a waiting tag's spot");
eq((await ask(MEERA, G2)).r, "full", "a waiting tag makes the game full to others");
eq(await upd(G2, { confirmed_untag: [KTAG] }, RAVI), { r: "not_host" }, "a player can't untag");

// An account that is gone: its tag is skipped by the reads and the count.
await upd(G2, { max_players: 10, confirmed_tags: ["neha_j"] });
eq((await N.game(G2)).confirmed_tagged, 2, "(two waiting: Vikram and Neha, tagged again after the untag)");
await N.q(`delete from public.usernames where user_id = $1`, [HOST2]);
await N.q(`update private.game_tags set user_id = $2 where user_id = $1`, [HOST2, U(999)]);
eq([(await N.rpc("game_tags_for", [KEY, HOST, G2])).tags.map((t) => t.name), (await N.one(`select private.game_in($1) n`, [G2])).n], [["Neha Joshi"], 4], "a tag whose account is gone is not listed and not counted");

// A tag ends when the game starts, or is off.
eq((await N.one(`select private.game_tags_expire() n`)).n, 0, "the job leaves a game that hasn't started alone");
await N.q(`update public.games set date = (now() at time zone 'Asia/Kolkata')::date, start_time = ((now() at time zone 'Asia/Kolkata') - interval '5 minutes')::time, end_time = '23:59' where id = $1`, [G2]);
eq(await N.rpc("game_tag_answer", [KEY, NEHA, G2, true]), { r: "closed" }, "a yes after the game started is refused");
eq((await upd(G2, { confirmed_tags: ["crowd_aa"] })).game.confirmed_tagged, 1, "and nobody can be tagged on a game that has started");
ok((await N.one(`select private.game_tags_expire() n`)).n >= 1, "the job ends the tags of a game that started");
eq([(await N.game(G2)).confirmed_tagged, (await N.game(G2)).current_players, (await N.one(`select status from private.game_tags where game_id = $1 and user_id = $2`, [G2, NEHA])).status],
  [0, 3, "expired"], "the unanswered tag stops counting: 3 in (the host, Ravi and the name)");
eq((await N.rpc("game_tag_answer", [KEY, NEHA, G2, true])).r, "gone", "and can't be answered any more");
g = await N.create(HOST, { confirmed_tags: ["neha_j"] });
await N.rpc("game_cancel", [KEY, HOST, g.game.id]);
eq(await N.rpc("game_tag_answer", [KEY, NEHA, g.game.id, true]), { r: "closed" }, "a yes to a cancelled game is refused");
await N.q(`select private.game_tags_expire()`);
eq((await N.one(`select status from private.game_tags where game_id = $1`, [g.game.id])).status, "expired", "and the job ends its tag");

// Limits: 20 waiting tags a game, 50 notifications a host a day.
const crowd = CROWD.map((c) => c[2]);
await N.q(`update private.game_tags set notified_at = notified_at - interval '2 days'`);
g = await N.create(HOST2, { max_players: 50, confirmed_tags: crowd.slice(0, 20) });
const G3 = g.game.id;
eq([g.game.confirmed_tagged, g.game.current_players], [20, 21], "20 players tagged on one game");
eq(await N.rpc("game_update", [KEY, HOST2, G3, JSON.stringify({ confirmed_tags: crowd.slice(0, 21) }), null]), { r: "bad", field: "confirmed_tags" }, "21 usernames in one save: refused");
g = await N.rpc("game_update", [KEY, HOST2, G3, JSON.stringify({ confirmed_tags: crowd.slice(20, 25) }), null]);
eq([g.r, g.game.confirmed_tagged], ["ok", 20], "a 21st waiting tag on the game is skipped");
const G4 = (await N.create(HOST2, { max_players: 50, confirmed_tags: crowd.slice(20, 40) })).game.id;
g = await N.create(HOST2, { max_players: 50, confirmed_tags: crowd.slice(40, 60) });
eq([(await N.game(G4)).confirmed_tagged, g.game.confirmed_tagged, g.game.current_players], [20, 10, 11], "the host's 50th tag of the day is the last: the rest are skipped, and not counted");
eq((await N.one(`select count(*)::int n from public.notifications where type = 'game_tagged' and created_at > now() - interval '1 hour' and metadata ->> 'gameId' = any($1)`, [[G3, G4, g.game.id]])).n, 50, "50 notifications, no more");
eq((await N.create(HOST, { confirmed_tags: ["crowd_cc"] })).game.confirmed_tagged, 1, "another host's limit is their own");

/* ---------------- nothing else counts a confirmed person ---------------- */
eq((await N.one(`select count(*)::int n from public.game_participants p where not exists (select 1 from public.users u where u.id = p.user_id)`)).n, 0, "every lineup row is an account (what Passport, played-with, medals and reviews read)");
ok((await N.q(`select g.id from public.games g where g.current_players <> private.game_in(g.id) and g.id <> $1`, [G2])).length === 0, "every game's count is its players, names, people without one and waiting tags");
ok((await N.q(`select 1 from public.games where current_players > max_players`)).length === 0, "and none is over its max");

/* ---------------- grants ---------------- */
const fns = await N.q(`select n.nspname || '.' || p.proname f, p.prosecdef, p.proconfig::text cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname like 'game_confirmed%' or p.proname like 'game_tag%' or p.proname in ('game_in', 'game_recount') order by 1`);
ok(fns.length === 20 && fns.every((f) => /search_path=\\?"\\?"/.test(f.cfg)), `the file's ${fns.length} new functions, each with an empty search_path`);
eq(fns.filter((f) => f.anon_x || f.auth_x).map((f) => f.f), ["public.game_tag_answer", "public.game_tags_for"], "only the two public ones can be called by the API roles (they check the server key)");
const grantsOf = async (H) => H.q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, p.prosecdef d, p.provolatile v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname, p.proname) in (('public','game_create'),('public','game_update'),('public','game_request_send'),
  ('public','game_request_answer'),('public','game_series_create'),('private','game_series_fill'),('private','email_job')) order by 1`);
eq(await grantsOf(N), await grantsOf(O), "the replaced functions keep their grants, security and volatility");
eq(await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`),
  await O.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), "no table grant on public changed");
eq(await N.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
  await O.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`), "no policy changed");

await OLD.close();
await NEW.close();
console.log(`game_confirmed.check: ${passed} checks passed`);
