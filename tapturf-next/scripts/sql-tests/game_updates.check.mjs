// Applies 20261118_game_updates.sql (twice) to an in-memory Postgres (PGlite)
// built as game_confirmed.check.mjs builds it, with 20261117_game_confirmed.sql
// and 20261118_game_tags_shown.sql applied first, next to a second database
// without the file. Checks: the file (additive, no destructive words, no
// backslash, refuses without the files it needs, replaces no function); the two
// columns and their checks; a game from before the file (no updates, an empty
// log, its note as it was); creating, editing, joining and calling off answer as
// before, the new keys aside; updates (who may post, the text's limits, 20 a
// game, 10 posts a game a day even when some are taken back, over or off: closed;
// who is told: players, requests waiting or accepted and waiting tags, never the
// host or a declined request; one line of 80 characters; no email; taking one
// back); activity (people confirmed at create, a new day or time, a move, spots,
// turf booked, more confirmed, filled up, called off; nothing when nothing
// changed; nobody named; the newest 50; the shape check); grants. Never touches a
// real database. Made-up people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_updates.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const NAME = "20261118_game_updates.sql";
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const read = (f) => fs.readFileSync(`${M}/${f}`, "utf8");

/* ---------------- the file itself ---------------- */
const sql = read(NAME);
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate (not even inside a word)");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/[\u200b-\u200f\u00a0\ufeff]/.test(sql), "no invisible characters");
ok(!sql.includes("\\"), "no backslash anywhere: nothing for a client to mangle");
ok(/^set local lock_timeout = '5s';$/m.test(sql), "waits 5 s at most for a lock");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications|users|turfs|usernames)\b/i.test(sql), "changes no grant on a public table");
ok(!/(alter|create)\s+policy/i.test(sql), "makes or changes no policy");
eq([...new Set([...sql.matchAll(/alter\s+table\s+([\w.]+)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`))].sort(), ["private.game_update_posts enable", "public.games add"], "alters only by adding columns and checks (and RLS on its own table)");
ok(!/(insert\s+into|update)\s+public\.(users|turfs|usernames|game_participants|game_requests)\b/i.test(sql), "writes no user, turf, username, lineup or request row");
ok([...sql.matchAll(/^create or replace function [\w.]+\([^]*?\n(?:as )?\$\$/gm)].every((m) => /set search_path = ''/.test(m[0])), "every function has an empty search_path");
const EARLIER = fs.readdirSync(M).filter((f) => f.endsWith(".sql") && f < NAME).sort().map(read).join("\n");
const made = [...sql.matchAll(/^create or replace function ([\w.]+)\(/gm)].map((m) => m[1]);
eq(made, ["private.game_update_max", "private.game_update_day_max", "private.game_update_chars", "public.game_update_post", "public.game_update_remove", "private.game_activity_venue", "private.game_activity_note"], "seven functions");
ok(made.every((f) => !EARLIER.includes(`create or replace function ${f}(`)), "all new: no function of an earlier file is replaced");
eq([...sql.matchAll(/create or replace trigger (\w+)\s+before insert or update on public\.games/g)].map((m) => m[1]), ["games_activity_note"], "one trigger, on public.games");

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
const MYTT = read("20261019_mytapturf.sql");
const OWNER = `${fnFrom(MYTT, "public._phone10")}
${fnFrom(MYTT, "public._is_admin_key")}
create or replace function public._caller_key(p_token text) returns text language sql stable as $$ select null::text $$;`;
const PW = read("20261101_played_with.sql");
const PLAYED = `${fnFrom(PW, "private.game_start_at")}
${fnFrom(PW, "private.game_over_at")}`;
const USERNAMES = `create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true, created_at timestamptz not null default now());
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;`;
const BEFORE = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql", "20261110_email.sql"].map(read);

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(5), MEERA = U(6), NEHA = U(7), HOST2 = U(8);
const PEOPLE = [[HOST, "Asha Rao", "asha"], [RAVI, "Ravi Kumar", "ravi_k"], [PRIYA, "Priya Sharma", "priya23"], [KIRAN, "Kiran Patil", "kiran"],
  [OMAR, "Omar Shaikh", "omar_s"], [MEERA, "Meera Iyer", "meera_i"], [NEHA, "Neha Joshi", "neha_j"], [HOST2, "Vikram Rao", "vikram"]];
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150 };

async function setUp(withFile, upTo = BEFORE.length) {
  const db = await makeDb(PGlite);
  await db.exec(CRON + NET + PROVEN + PLAYED + OWNER + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
  for (const f of BEFORE.slice(0, upTo)) await db.exec(f);
  await db.exec(USERNAMES);
  if (upTo < BEFORE.length) return db;
  for (const [id, name, u] of PEOPLE) {
    await db.query(`insert into public.users (id, name, phone, email, created_at) values ($1, $2, null, $3, now() - interval '30 days')`, [id, name, `${id.slice(-6)}.standin@example.com`]);
    await db.query(`insert into public.usernames (user_id, username) values ($1, $2)`, [id, u]);
  }
  await db.exec(`insert into private.test_proven select id from public.users;
    insert into public.turfs (id, name, slug, city, area, is_active, sports) values
    ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'), ('${T(2)}', '  Dribble Den ', 'dribble-den', 'pune', 'Aundh', true, '["Football"]');`);
  await db.exec(read("20261117_game_confirmed.sql"));
  await db.exec(read("20261118_game_tags_shown.sql"));
  // A game from before the file, with a note and two friends.
  db.before = (await db.query(`select public.game_create($1, $2, $3) r`, [KEY, HOST2, JSON.stringify({ ...GAME, description: "Bring a dark tee.", confirmed_names: ["Rahul"], confirmed_extra: 1 })])).rows[0].r.game.id;
  if (withFile) {
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
  const create = async (host, o = {}) => {
    await q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1 and created_at > now() - interval '1 day'`, [host]);
    return rpc("game_create", [KEY, host, JSON.stringify({ ...GAME, ...o })]);
  };
  const edit = (host, id, changes) => rpc("game_update", [KEY, host, id, JSON.stringify(changes), null]);
  const post = (who, id, text) => rpc("game_update_post", [KEY, who, id, text]);
  const log = async (id) => (await one(`select activity from public.games where id = $1`, [id])).activity;
  const kinds = async (id) => (await log(id)).map((e) => e.k);
  const ask = (who, id) => rpc("game_request_send", [KEY, who, id, null]);
  return { q, one, rpc, asRole, create, edit, post, log, kinds, ask };
};

{
  const bare = await setUp(false, 5);
  await assert.rejects(bare.exec(sql), /game updates: apply .* 20261117_game_confirmed\.sql first/, "without the files it is built on it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from information_schema.columns where table_name = 'games' and column_name in ('updates', 'activity')`)).rows[0].n, 0, "and changes nothing");
  await bare.close();
}

const OLD = await setUp(false);
const NEW = await setUp(true);
passed++; // applied twice
const O = helpers(OLD), N = helpers(NEW);
const day = (d) => new Date(`${ist(d)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/* ---------------- what the file made ---------------- */
eq(await N.q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'games' and column_name in ('updates', 'activity') order by 1`), [
  { column_name: "activity", data_type: "jsonb", is_nullable: "NO", column_default: "'[]'::jsonb" },
  { column_name: "updates", data_type: "jsonb", is_nullable: "NO", column_default: "'[]'::jsonb" },
], "two columns on public.games");
eq(await N.one(`select description, updates, activity, current_players, confirmed_names from public.games where id = $1`, [NEW.before]),
  { description: "Bring a dark tee.", updates: [], activity: [], current_players: 3, confirmed_names: ["Rahul"] }, "a game from before the file: its note as it was, no updates, an empty log (nothing is made up)");
for (const [col, bad, why] of [["updates", `'{}'`, "not a list"], ["updates", `(select jsonb_agg(jsonb_build_object('id', i)) from generate_series(1, 21) i)`, "21 entries"],
  ["activity", `'"x"'`, "not a list"], ["activity", `(select jsonb_agg(jsonb_build_object('k', 'spots', 'i', i)) from generate_series(1, 51) i)`, "51 entries"]]) {
  await assert.rejects(N.q(`update public.games set ${col} = ${bad} where id = $1`, [NEW.before]), /games_(updates|activity)_shape/, `${col}: ${why} is refused`);
  passed++;
}
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(N.asRole(role, () => N.q(`select * from private.game_update_posts`)), /permission denied/, `${role} cannot read the posts log`);
  await assert.rejects(N.asRole(role, () => N.q(`update public.games set updates = '[]' where id = $1`, [NEW.before])), /permission denied/, `${role} cannot write a game's updates`);
  passed += 2;
}

/* ---------------- as before, the new keys aside ---------------- */
const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (["id", "created_at", "updated_at", "updates", "activity", "responded_at"].includes(k) ? undefined : v)));
async function asBefore(H) {
  const out = [];
  const g = await H.create(HOST, { description: "  Bring bibs  " });
  out.push(g);
  out.push(await H.edit(HOST, g.game.id, { description: "Bring bibs and water", price_per_player: 200 }));
  out.push(await H.edit(RAVI, g.game.id, { price_per_player: 1 }));
  const r = await H.ask(RAVI, g.game.id);
  out.push(r.r);
  out.push(await H.rpc("game_request_answer", [KEY, HOST, r.request.id, true]));
  out.push(await H.rpc("game_cancel", [KEY, HOST, g.game.id]));
  out.push(await H.q(`select type, title, message from public.notifications where metadata ->> 'gameId' = $1 order by created_at, type`, [g.game.id]));
  return strip(out);
}
eq(await asBefore(N), await asBefore(O), "create, edit (the note too), a refused edit, join, accept and call off answer and tell as before");

/* ---------------- updates ---------------- */
let g = await N.create(HOST, { description: "Turf will be booked once players confirm", confirmed_tags: ["meera_i"] });
const G1 = g.game.id;
eq([g.game.updates, g.game.description], [[], "Turf will be booked once players confirm"], "a new game has its note and no updates");
const r1 = await N.ask(RAVI, G1), r2 = await N.ask(PRIYA, G1), r3 = await N.ask(KIRAN, G1);
await N.rpc("game_request_answer", [KEY, HOST, r1.request.id, true]);
await N.rpc("game_request_answer", [KEY, HOST, r3.request.id, false]);
ok(r2.r === "ok", "(Ravi is in, Priya's request waits, Kiran was declined, Meera is tagged)");
eq(await N.rpc("game_update_post", ["wrong", HOST, G1, "x"]), { r: "unavailable" }, "posting needs the server key");
eq(await N.post(RAVI, G1, "Hello"), { r: "not_host" }, "only the host posts");
eq(await N.post(HOST, U(999), "Hello"), { r: "gone" }, "on a game that is there");
for (const [t, why] of [["", "empty"], ["   \n ", "only spaces"], ["x".repeat(301), "301 characters"], [null, "nothing"]]) {
  eq(await N.post(HOST, G1, t), { r: "bad", field: "text" }, `an update that is ${why} is refused`);
}
const outbox = (await N.one(`select count(*)::int n from private.email_outbox`)).n;
await N.q(`update public.notifications set created_at = created_at - interval '1 minute'`);
let a = await N.post(HOST, G1, "  Turf booked, please bring bottles  ");
eq([a.r, a.update.text, a.updates.length, a.notified, typeof a.update.id, Math.abs(Date.parse(a.update.at) - Date.now()) < 60_000], ["ok", "Turf booked, please bring bottles", 1, 3, "string", true],
  "the host posts: kept trimmed, with an id and the time, and 3 people are told");
eq(await N.q(`select u.name, n.type, n.title, n.message, n.metadata, n.is_read from public.notifications n join public.users u on u.id = n.user_id
  where n.type = 'game_update_posted' order by u.name`), ["Meera Iyer", "Priya Sharma", "Ravi Kumar"].map((name) => ({ name, type: "game_update_posted", title: `Update: Football, ${day(2)}`,
  message: "Asha: Turf booked, please bring bottles", metadata: { gameId: G1, updateId: a.update.id }, is_read: false })),
  "a player, a request that waits and a tagged player still to answer are told once, in the app; never the host or a declined request");
eq((await N.one(`select count(*)::int n from private.email_outbox`)).n, outbox, "no email");
eq((await N.one(`select private.email_kind_of('game_update_posted') k`)).k, null, "(the type maps to no email)");
eq(await N.asRole("anon", () => N.one(`select updates, description from public.games where id = $1`, [G1])), { updates: [a.update], description: "Turf will be booked once players confirm" },
  "anyone reads the updates with the game; the first note is as it was");
const long = `Line one\nline two\t${"y".repeat(100)}`;
const b = await N.post(HOST, G1, long);
eq([b.update.text, (await N.one(`select message from public.notifications where type = 'game_update_posted' and metadata ->> 'updateId' = $1 limit 1`, [b.update.id])).message],
  [long, `Asha: Line one line two ${"y".repeat(59)}...`], "the update keeps its lines; the notification is one line of 80 characters");
eq((await N.kinds(G1)).filter((k) => k !== "confirmed"), [], "an update is no entry of the stored log (the page reads it from the updates)");
// Taking one back.
eq(await N.rpc("game_update_remove", ["wrong", HOST, G1, a.update.id]), { r: "unavailable" }, "taking back needs the server key");
eq(await N.rpc("game_update_remove", [KEY, RAVI, G1, a.update.id]), { r: "not_host" }, "only the host takes one back");
eq(await N.rpc("game_update_remove", [KEY, HOST, G1, U(77)]), { r: "gone" }, "an update that isn't there");
eq(await N.rpc("game_update_remove", [KEY, HOST, G1, a.update.id]), { r: "ok", updates: [b.update] }, "it is gone from the list; the other stays as it was");
eq((await N.one(`select updates from public.games where id = $1`, [G1])).updates, [b.update], "(on the row too)");
// 10 posts a game a day, counting the ones taken back.
for (let i = 3; i <= 10; i++) {
  const x = await N.post(HOST, G1, `Update ${i}`);
  if (i % 2) await N.rpc("game_update_remove", [KEY, HOST, G1, x.update.id]);
}
eq([(await N.post(HOST, G1, "One more")).r, (await N.one(`select jsonb_array_length(updates) n from public.games where id = $1`, [G1])).n], ["limit", 5], "10 posts on a game in a day, though only 5 are left on it");
await N.q(`update private.game_update_posts set posted_at = posted_at - interval '25 hours'`);
eq((await N.post(HOST, G1, "A day later")).r, "ok", "a day later the host can post again");
// 20 on a game.
await N.q(`update public.games set updates = (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'at', now(), 'text', 'u' || i)) from generate_series(1, 20) i) where id = $1`, [G1]);
eq((await N.post(HOST, G1, "The 21st")).r, "most", "20 updates a game");
// Over, or off.
g = await N.create(HOST, {});
await N.q(`update public.games set date = $2 where id = $1`, [g.game.id, ist(-1)]);
eq((await N.post(HOST, g.game.id, "After the game")).r, "closed", "nothing is posted once the game is over");
await N.q(`update public.games set date = $2, status = 'cancelled' where id = $1`, [g.game.id, ist(2)]);
eq((await N.post(HOST, g.game.id, "After calling it off")).r, "closed", "or called off");

/* ---------------- activity ---------------- */
const shape = (log) => log.map(({ at, ...e }) => { assert.ok(Math.abs(Date.parse(at) - Date.now()) < 120_000, "each entry has its time"); return e; });
g = await N.create(HOST, {});
const G2 = g.game.id;
eq(g.game.activity, [], "a plain new game has an empty log (posted is read from created_at)");
g = await N.create(HOST, { max_players: 12, confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1, confirmed_tags: ["neha_j", "omar_s"] });
const G3 = g.game.id;
eq(shape(await N.log(G3)), [{ k: "confirmed", n: 3 }, { k: "confirmed", n: 2 }], "people confirmed with the game: a number for the names and people without one, another for the tags; nobody named");
ok(!/Rahul|Amit|Neha|Omar|neha_j|omar_s/.test(JSON.stringify(await N.log(G3))), "(no typed name, no tagged player)");
// The host's edits.
eq((await N.edit(HOST, G2, { price_per_player: 180, skill_level: "beginner" })).r, "ok", "(an edit of the price and level)");
eq(await N.log(G2), [], "leaves no entry");
await N.edit(HOST, G2, { date: ist(3), start_time: "20:00", end_time: "21:00" });
await N.edit(HOST, G2, { turf_id: T(2) });
await N.edit(HOST, G2, { max_players: 12 });
await N.edit(HOST, G2, { turf_booked: true });
await N.edit(HOST, G2, { turf_booked: false });
await N.edit(HOST, G2, { confirmed_names: ["Rahul"], confirmed_extra: 2 });
await N.edit(HOST, G2, { confirmed_names: [], confirmed_extra: 2 });
await N.edit(HOST, G2, { venue_name: "Sunday League Ground", venue_address: "Near the lake, Pashan", venue_city: "pune" });
eq(shape(await N.log(G2)), [
  { k: "time", fd: ist(2), fs: "19:00", fe: "20:00", td: ist(3), ts: "20:00", te: "21:00" },
  { k: "venue", from: "Kings Turf", to: "Dribble Den" },
  { k: "spots", from: 10, to: 12 },
  { k: "booked" },
  { k: "confirmed", n: 3 },
  { k: "venue", from: "Dribble Den", to: "Sunday League Ground" },
], "a new day or time, a move (by the venues' names), spots, turf booked, more confirmed; taking the booking or a friend back leaves nothing");
// A tag, then its player takes themselves off: the count went up, nobody is named, and leaving leaves no entry.
await N.edit(HOST, G2, { confirmed_tags: ["kiran"] });
await N.rpc("game_tag_answer", [KEY, KIRAN, G2, false]);
eq(shape(await N.log(G2)).slice(6), [{ k: "confirmed", n: 1 }], "a tagged player is one more confirmed, by number; taking themselves off leaves no entry");
// Filled up, by an accept.
g = await N.create(HOST2, { max_players: 2 });
const rq = await N.ask(RAVI, g.game.id);
await N.rpc("game_request_answer", [KEY, HOST2, rq.request.id, true]);
eq(shape(await N.log(g.game.id)), [{ k: "full" }], "the accept that takes the last spot notes that the game filled up (the join itself is read from the lineup)");
ok(!/Ravi/.test(JSON.stringify(await N.log(g.game.id))), "(nobody is named in the stored log)");
{
  // Once a game has started, reaching its max notes nothing (a tagged player confirming afterwards fills nothing).
  const late = (await N.create(HOST2, { max_players: 2 })).game.id;
  await N.q(`update public.games set date = $2 where id = $1`, [late, ist(-1)]);
  await N.q(`update public.games set current_players = 2 where id = $1`, [late]);
  eq(await N.kinds(late), ["time"], "a game that fills after its start notes nothing for that (only the day the test moved it to)");
}
// Called off.
await N.rpc("game_cancel", [KEY, HOST2, g.game.id]);
eq(shape(await N.log(g.game.id)).slice(1), [{ k: "cancelled" }], "calling it off is noted");
await N.q(`select public.close_past_games()`);
await N.q(`update public.games set updated_at = now() where id = $1`, [G2]);
eq((await N.log(G2)).length, 7, "a write that changes nothing of these notes nothing");
// The newest 50.
for (let i = 0; i < 27; i++) await N.q(`update public.games set max_players = $2 where id = $1`, [G2, 13 + (i % 2)]);
for (let i = 0; i < 27; i++) await N.q(`update public.games set max_players = $2 where id = $1`, [G2, 20 + i]);
const full = await N.log(G2);
eq([full.length, full.at(-1).to, full[0].k, full[0].to], [50, 46, "spots", full[0].to], "the log keeps its newest 50");
ok(full.every((e, i) => i === 0 || Date.parse(e.at) >= Date.parse(full[i - 1].at)), "oldest first");
ok(JSON.stringify(full).length < 24000, "and stays small");
// Writing the log itself is left alone (and anon cannot).
await N.q(`update public.games set activity = '[]', max_players = 30 where id = $1`, [G2]);
eq(await N.log(G2), [], "a write of the log itself is taken as it is");
eq(await N.asRole("anon", () => N.one(`select activity from public.games where id = $1`, [G3])), { activity: await N.log(G3) }, "anyone reads a game's log with the game");

/* ---------------- grants ---------------- */
const fns = await N.q(`select n.nspname || '.' || p.proname f, p.proconfig::text cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname like 'game_update\\_%' or p.proname like 'game_activity%' order by 1`);
ok(fns.length === 7 && fns.every((f) => /search_path=\\?"\\?"/.test(f.cfg)), `the file's ${fns.length} functions, each with an empty search_path`);
eq(fns.filter((f) => f.anon_x || f.auth_x).map((f) => f.f), ["public.game_update_post", "public.game_update_remove"], "only the two public ones can be called by the API roles (they check the server key)");
const md5s = (H) => H.q(`select n.nspname || '.' || p.proname f, md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.proname not like 'game_update\\_%' and p.proname not like 'game_activity%' order by 1, 2`);
eq(await md5s(N), await md5s(O), "every other function is the body it was");
eq(await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`),
  await O.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), "no table grant on public changed");
eq(await N.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
  await O.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`), "no policy changed");

await OLD.close();
await NEW.close();
console.log(`game_updates.check: ${passed} checks passed`);
