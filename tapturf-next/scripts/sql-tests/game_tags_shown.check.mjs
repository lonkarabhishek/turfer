// Applies 20261118_game_tags_shown.sql (twice) to an in-memory Postgres (PGlite)
// built as game_confirmed.check.mjs builds it (games_lockdown.db.mjs, both games
// lockdown files, repeats, the other venue, web push, emails, usernames) with
// 20261117_game_confirmed.sql applied first (production on 17 Nov) and the
// played-with functions of 20261101_played_with.sql, next to a second database
// without the file. Checks: the file (additive, no destructive words, no
// backslash, refuses without the files it needs; every replaced function is the
// repo's latest body, whose md5 the header names); a tag made before the file
// stays hidden and ends at kickoff, as its player was told; a tag made after it
// is named to anyone at once (name, photo, username), with the new words and no
// email; "Remove me" takes them off and frees the spot, and that host can't tag
// them again; "I'm in" makes a player with the count unchanged; tagging turned
// off: counted, not named, and the games pages are marked stale; kickoff: still
// listed, still counted, not a player, nothing in played games; called off: the
// tags end; the limits (20 a game, 50 a host a day, 3 tells); the count is
// private.game_in everywhere; afterwards: which games are asked about (over,
// not called off, 90 days, never answered, not a player), yes (a player, counted
// on the game's own date, in played-with both ways, no WhatsApp number through
// it), no, a tag that ended at kickoff, an account that is gone; the one
// notification a day; grants; the job. Never touches a real database. Made-up
// people only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/game_tags_shown.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const NAME = "20261118_game_tags_shown.sql";
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
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
eq([...new Set([...sql.matchAll(/alter\s+table\s+([\w.]+)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`))], ["private.game_tags add"], "alters only its own table, by adding columns");
ok(!/(insert\s+into|update)\s+public\.(users|turfs|usernames|games)\b/i.test(sql), "writes no user, turf, username or game row itself (the count is private.game_recount's)");
ok([...sql.matchAll(/^create or replace function [\w.]+\([^]*?\n(?:as )?\$\$/gm)].every((m) => /set search_path = ''/.test(m[0])), "every function has an empty search_path");
eq([...sql.matchAll(/create or replace trigger (\w+)\s+after update of taggable on public\.usernames/g)].map((m) => m[1]), ["usernames_game_tags_setting"], "one trigger, on a change of taggable only");

const bodyOf = (text, name) => {
  const i = text.lastIndexOf(`create or replace function ${name}(`);
  if (i < 0) return null;
  const tag = /\$(\w*)\$/.exec(text.slice(i));
  const a = i + tag.index + tag[0].length;
  return text.slice(a, text.indexOf(tag[0], a));
};
const EARLIER = fs.readdirSync(M).filter((f) => f.endsWith(".sql") && f < NAME).sort().map((f) => [f, read(f)]);
const latest = (name) => {
  let last = null;
  for (const [f, t] of EARLIER) if (t.includes(`create or replace function ${name}(`)) last = { file: f, body: bodyOf(t, name) };
  return last;
};
// Production's md5 (read 17 Nov 2026) is the repo's latest body, and the header names it.
const REPLACED = {
  "private.game_tags_add": "783ef15db30813307677e3298ff68f60",
  "private.game_tags_expire": "3dc5d52882b02f0776a96b6e95d779df",
  "public.game_tags_for": "62447aa3096426fb89f279d145d6c707",
};
for (const [fn, want] of Object.entries(REPLACED)) {
  const old = latest(fn);
  eq([old.file, md5(old.body)], ["20261117_game_confirmed.sql", want], `${fn}: production's body is the one in 20261117_game_confirmed.sql`);
  ok(new RegExp(`${fn.replace(".", "\\.")}\\([^)]*\\)\\s+${want}`).test(sql), `${fn}: the header names it`);
  ok(bodyOf(sql, fn) !== null && bodyOf(sql, fn) !== old.body, `${fn}: replaced here`);
}
{
  // game_tags_add keeps every line of production's body in order but the words, the insert and the update.
  const o = latest("private.game_tags_add").body.split("\n");
  const n = bodyOf(sql, "private.game_tags_add").split("\n");
  let i = 0;
  const gone = [];
  for (const line of o) {
    const at = n.indexOf(line, i);
    if (at < 0) gone.push(line.trim());
    else i = at + 1;
  }
  eq(gone.length, 6, `game_tags_add: all of production's lines but 6 (${gone.map((l) => l.slice(0, 40)).join(" | ")})`);
  ok(gone.every((l) => /added you as confirmed|You''re|email_venue_name|answered_at = null|insert into private\.game_tags|game_notify|'tagId'/.test(l)), "and those are the words, the shown mark and the notification");
}
for (const [fn, m] of Object.entries({
  "public.game_tag_answer": "9c17e201ad73c901133ed7f059363ef1", "private.game_recount": "da217ad54c4ceec24efc86b881f77d1b",
  "private.game_tags_pending": "13855de1470bf4939e44cbeb7a78f929", "private.game_in": "f4d6131b18e05fc0086cfc5763e0dbf7",
  "private.game_tag_max": "8213c84da99ee70b785946aef7eb4ae4", "private.game_tag_day_max": "c4f2b1ed38362a8f5357586412928e51",
  "private.game_tag_tell_max": "ac79f45d9f23ad49c79bc6771e476da0",
  "private.account_key_ok": "ca605fa89a97497134b690e753dc5c0e", "private.game_notify": "b105f7aee319ed9725f42b85c5d4735c",
  "private.game_start_at": "870fe04f498b656d8c9435099fd8bfb9", "private.game_over_at": "ea17283fa5f62bebd1e6921b269f452c",
  "private.game_clock_text": "9ea2bb3fc277795aa74f5237b2d93af4", "private.game_sport_text": "28192bf7b394432826d0a19a3a6c4d08",
  "private.email_venue_name": "8ba7980f0d509060ce6ed6f89c789a94", "private.mark_dirty": "37bd49deeb876dea1d0ba207a8969ce0",
})) {
  ok(md5(latest(fn).body) === m && new RegExp(`${fn.replace(".", "\\.")}\\s+${m}`).test(sql), `the header names ${fn} with the md5 of its latest body in the repo`);
  ok(bodyOf(sql, fn) === null, `and the file leaves ${fn} alone`);
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
// Played-with as 20261101_played_with.sql has it (its two tables, and the functions Passport's server reads).
const PLAYED = `create table private.whatsapp_shares (user_id uuid primary key references public.users(id), share boolean not null default false, updated_at timestamptz not null default now());
create table private.game_start_moves (game_id uuid primary key, moved_at timestamptz not null default now());
${fnFrom(PW, "private.game_over_at")}
${fnFrom(PW, "private.played_game_ids")}
${fnFrom(PW, "private.whatsapp_mates")}
${fnFrom(PW, "public.played_with_extras")}`;
const USERNAMES = `create table public.usernames (user_id uuid primary key references public.users(id), username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  taggable boolean not null default true, created_at timestamptz not null default now());
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;`;
const BEFORE = ["20261030_games_lockdown.sql", "20261030_games_lockdown_step2.sql", "20261102_game_series.sql", "20261103_game_other_venue.sql", "20261102_web_push.sql", "20261110_email.sql"].map(read);
const CONFIRMED = read("20261117_game_confirmed.sql");

const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), OMAR = U(5), MEERA = U(6), NEHA = U(7), HOST2 = U(8), GONE = U(9);
const PEOPLE = [[HOST, "Asha Rao", "asha"], [RAVI, "Ravi Kumar", "ravi_k"], [PRIYA, "Priya Sharma", "priya23"], [KIRAN, "Kiran Patil", "kiran"],
  [OMAR, "Omar Shaikh", "omar_s"], [MEERA, "Meera Iyer", "meera_i"], [NEHA, "Neha Joshi", "neha_j"], [HOST2, "Vikram Rao", "vikram"]];
const CROWD = Array.from({ length: 60 }, (_, i) => [U(100 + i), `Player ${i + 1}`, `crowd_${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`]);
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 10, date: ist(2), start_time: "19:00", end_time: "20:00", price_per_player: 150 };

async function setUp(withFile) {
  const db = await makeDb(PGlite);
  await db.exec(CRON + NET + PROVEN + START_AT + OWNER + `\ninsert into private.app_secrets values ('revalidate', 'reval-secret');`);
  for (const f of BEFORE) await db.exec(f);
  await db.exec(USERNAMES);
  await db.exec(PLAYED);
  for (const [id, name, u] of [...PEOPLE, ...CROWD]) {
    await db.query(`insert into public.users (id, name, phone, email, profile_image_url, created_at) values ($1, $2, $3, $4, $5, now() - interval '30 days')`,
      [id, name, id === PRIYA ? "+919800000003" : null, `${id.slice(-6)}.standin@example.com`, id === RAVI ? "https://lh3.example/ravi" : null]);
    if (u) await db.query(`insert into public.usernames (user_id, username) values ($1, $2)`, [id, u]);
  }
  await db.exec(`insert into private.test_proven select id from public.users;
    insert into public.turfs (id, name, slug, city, area, is_active, sports) values
    ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'), ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', true, '["Football"]');`);
  await db.exec(CONFIRMED);
  // A tag from before the file (production had 7 on one game on 17 Nov): told "only if you say yes".
  const made = (await db.query(`select public.game_create($1, $2, $3) r`, [KEY, HOST2, JSON.stringify({ ...GAME, confirmed_tags: ["meera_i", "neha_j"] })])).rows[0].r;
  db.legacy = made.game.id;
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
  const fresh = async (host) => {
    await q(`update public.games set created_at = created_at - interval '2 days' where creator_id = $1 and created_at > now() - interval '1 day'`, [host]);
    await q(`update private.game_tags set notified_at = notified_at - interval '2 days' where host_id = $1`, [host]);
  };
  const create = async (host, o = {}) => {
    await fresh(host);
    return rpc("game_create", [KEY, host, JSON.stringify({ ...GAME, ...o })]);
  };
  const game = (id) => one(`select max_players, current_players, status, confirmed_tagged from public.games where id = $1`, [id]);
  const shown = async (id) => (await rpc("game_tags_shown", [KEY, id])).tags;
  const tagStatus = async (id, user) => (await one(`select status, shown from private.game_tags where game_id = $1 and user_id = $2`, [id, user]));
  const expire = () => one(`select private.game_tags_expire() n`);
  // The game is moved in time (a test's clock): d days from today, at h o'clock for an hour.
  const move = (id, d, h = "19:00", e = "20:00") => q(`update public.games set date = $2, start_time = $3, end_time = $4 where id = $1`, [id, ist(d), h, e]);
  // The host tags from the edit sheet: private.game_tags_add, then the recount (as game_update does it).
  const tag = async (id, host, names) => {
    const n = (await one(`select private.game_tags_add($1, $2, $3) n`, [id, host, names])).n;
    await q(`select private.game_recount($1)`, [id]);
    return n;
  };
  return { q, one, rpc, asRole, create, fresh, game, shown, tagStatus, expire, move, tag };
};

{
  const bare = await makeDb(PGlite);
  await bare.exec(CRON + NET + PROVEN + START_AT + OWNER);
  for (const f of BEFORE) await bare.exec(f);
  await bare.exec(USERNAMES);
  await bare.exec(PLAYED);
  await assert.rejects(bare.exec(sql), /game tags shown: apply .* 20261117_game_confirmed\.sql first/, "without the confirmed file it refuses");
  passed++;
  eq((await bare.query(`select count(*)::int n from pg_proc where proname in ('game_tags_shown', 'game_tag_played', 'game_tags_played')`)).rows[0].n, 0, "and changes nothing");
  await bare.close();
}

const OLD = await setUp(false);
const NEW = await setUp(true);
passed++; // applied twice
const O = helpers(OLD), N = helpers(NEW);
const LEGACY = NEW.legacy;
const day = (d) => new Date(`${ist(d)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/* ---------------- what the file made ---------------- */
eq(await N.q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
  where table_schema = 'private' and table_name = 'game_tags' and column_name in ('shown', 'asked_at') order by 1`), [
  { column_name: "asked_at", data_type: "timestamp with time zone", is_nullable: "YES", column_default: null },
  { column_name: "shown", data_type: "boolean", is_nullable: "NO", column_default: "false" },
], "two columns on private.game_tags");
eq(await N.q(`select name, schedule, command from cron.jobs order by name`), await O.q(`select name, schedule, command from cron.jobs order by name`), "no new job: the 10 minute one runs the new body");

/* ---------------- a tag from before the file keeps its promise ---------------- */
eq(await N.shown(LEGACY), [], "a tag made before the file is named to nobody");
eq((await N.game(LEGACY)).confirmed_tagged, 2, "(the row still counts both)");
let tags = await N.rpc("game_tags_for", [KEY, HOST2, LEGACY]);
eq(tags.tags.map((t) => [t.name, t.shown]), [["Meera Iyer", false], ["Neha Joshi", false]], "the host reads who, and that the page doesn't name them");
eq(await N.rpc("game_tags_for", [KEY, MEERA, LEGACY]), { r: "ok", host: false, mine: "pending", shown: false }, "the player reads that hers is not a shown one (the old words and buttons)");
eq(await O.rpc("game_tags_for", [KEY, MEERA, OLD.legacy]), { r: "ok", host: false, mine: "pending" }, "(before the file the read has no such key)");
eq(await N.rpc("game_tags_for", [KEY, KIRAN, LEGACY]), { r: "ok", host: false, mine: null }, "anyone else reads nothing, as before");
await N.move(LEGACY, -1);
await N.expire();
eq([(await N.tagStatus(LEGACY, MEERA)).status, (await N.game(LEGACY)).confirmed_tagged, (await N.game(LEGACY)).current_players], ["expired", 0, 1], "and it ends when its game starts, as it was told");

/* ---------------- a tag from now on: shown at once ---------------- */
await N.q(`update public.usernames set taggable = false where user_id = $1`, [OMAR]);
let g = await N.create(HOST, { max_players: 10, confirmed_names: ["Rahul"], confirmed_tags: ["ravi_k", "priya23", "omar_s", "asha", "nobody_here"] });
const G1 = g.game.id;
eq([g.r, g.game.current_players, g.game.confirmed_tagged], ["ok", 4, 2], "two players tagged (the host, a player with tagging off and a username nobody has are skipped), 4 of 10");
const TAGS = Object.fromEntries((await N.q(`select user_id, id from private.game_tags where game_id = $1`, [G1])).map((r) => [r.user_id, r.id]));
eq(await N.shown(G1), [
  { id: TAGS[PRIYA], uid: PRIYA, name: "Priya Sharma", photo: null, u: "priya23" },
  { id: TAGS[RAVI], uid: RAVI, name: "Ravi Kumar", photo: "https://lh3.example/ravi", u: "ravi_k" },
], "anyone is shown them at once: name, photo and public username (the first tagged first; tagged together, by name)");
eq(await N.rpc("game_tags_shown", ["wrong", G1]), { r: "unavailable" }, "the read needs the server key");
eq(await N.rpc("game_tags_shown", [KEY, null]), { r: "bad" }, "and a game");
eq(await N.shown(U(999)), [], "a game that isn't there names nobody");
const pub = JSON.stringify(await N.asRole("anon", () => N.q(`select * from public.games where id = $1`, [G1])));
ok(!/Ravi|Priya|ravi_k|priya23/.test(pub) && /"confirmed_tagged":2/.test(pub), "the public row still has a number only (list rows carry no tagged name)");
for (const role of ["anon", "authenticated"]) {
  await assert.rejects(N.asRole(role, () => N.q(`select * from private.game_tags`)), /permission denied/, `${role} cannot read the tags`);
  await assert.rejects(N.asRole(role, () => N.q(`select private.game_tags_ask()`)), /permission denied/, `${role} cannot run the helpers`);
  passed += 2;
}
const told = await N.q(`select u.name, n.type, n.title, n.message, n.metadata from public.notifications n join public.users u on u.id = n.user_id
  where n.type = 'game_tagged' and n.metadata ->> 'gameId' = $1 order by u.name`, [G1]);
eq(told, [["Priya Sharma", PRIYA], ["Ravi Kumar", RAVI]].map(([name, id]) => ({ name, type: "game_tagged", title: "You're on the list",
  message: `Asha added you to Football, ${day(2)}, 7 PM at Kings Turf. You're on the list.`, metadata: { gameId: G1, tagId: TAGS[id], shown: true } })), "each is told once, in the app, that they are on the list");
eq((await N.one(`select count(*)::int n from private.email_outbox o where o.refs ->> 'game_id' = $1`, [G1])).n, 0, "no email is queued for a tag");
tags = await N.rpc("game_tags_for", [KEY, HOST, G1]);
eq(tags.tags.map((t) => [t.name, t.u, t.shown]), [["Priya Sharma", "priya23", true], ["Ravi Kumar", "ravi_k", true]], "the host reads who is waiting, each shown");
eq(await N.rpc("game_tags_for", [KEY, RAVI, G1]), { r: "ok", host: false, mine: "pending", shown: true }, "a tagged player reads that theirs is shown");
eq(await N.q(`select user_id from public.game_participants where game_id = $1`, [G1]), [{ user_id: HOST }], "a tag is not a player: the lineup has the host alone");

/* ---------------- Remove me ---------------- */
let a = await N.rpc("game_tag_answer", [KEY, PRIYA, G1, false]);
eq(a, { r: "ok", status: "no", current_players: 3 }, "Remove me: the spot is free at once (3 of 10)");
eq((await N.shown(G1)).map((t) => t.name), ["Ravi Kumar"], "and she is gone from the page's names");
eq(await N.game(G1), { max_players: 10, current_players: 3, status: "open", confirmed_tagged: 1 }, "one tag still waits");
eq(await N.q(`select private.game_tags_add($1, $2, array['priya23']) n`, [G1, HOST]), [{ n: 0 }], "that host can't tag her on that game again");
eq(await N.rpc("game_tags_for", [KEY, PRIYA, G1]), { r: "ok", host: false, mine: null }, "her own read says nothing waits");
eq((await N.rpc("game_tag_answer", [KEY, PRIYA, G1, false])).r, "gone", "a second Remove me finds nothing");

/* ---------------- I'm in ---------------- */
a = await N.rpc("game_tag_answer", [KEY, RAVI, G1, true]);
eq(a, { r: "ok", status: "yes", current_players: 3 }, "I'm in: still 3 of 10, the tag held the spot");
eq([(await N.shown(G1)).length, (await N.game(G1)).confirmed_tagged], [0, 0], "no tag waits: he is an ordinary player now");
eq((await N.q(`select user_id from public.game_participants where game_id = $1`, [G1])).map((r) => r.user_id).sort(), [HOST, RAVI].sort(), "in the lineup");
eq((await N.rpc("game_tag_answer", [KEY, RAVI, G1, false])).r, "gone", "and there is no taking himself off after that (nobody leaves a game today)");

/* ---------------- tagging turned off later ---------------- */
g = await N.create(HOST, { max_players: 10, confirmed_tags: ["kiran", "neha_j"] });
const G2 = g.game.id;
eq((await N.shown(G2)).map((t) => t.name), ["Kiran Patil", "Neha Joshi"], "(two tagged, both named)");
await N.q(`truncate private.test_dirty`);
await N.q(`update public.usernames set taggable = false where user_id = $1`, [KIRAN]);
eq((await N.shown(G2)).map((t) => t.name), ["Neha Joshi"], "a player who turns tagging off is no longer named");
eq(await N.game(G2), { max_players: 10, current_players: 3, status: "open", confirmed_tagged: 2 }, "but still counted: the page says +1 more");
eq((await N.rpc("game_tags_for", [KEY, HOST, G2])).tags.map((t) => [t.name, t.u, t.shown]), [["Kiran Patil", null, false], ["Neha Joshi", "neha_j", true]], "the host reads that he is not named");
eq(await N.q(`select key, urgent from private.test_dirty`), [{ key: "games", urgent: false }], "the games pages are marked stale by that change");
await N.q(`truncate private.test_dirty`);
await N.q(`update public.usernames set taggable = false where user_id = $1`, [HOST2]);
await N.q(`update public.usernames set created_at = now() where user_id = $1`, [KIRAN]);
eq(await N.q(`select key from private.test_dirty`), [], "someone with no shown tag, or another column: nothing is marked");
await N.q(`update public.usernames set taggable = true where user_id = $1`, [KIRAN]);
eq([(await N.shown(G2)).length, (await N.q(`select key from private.test_dirty`)).length], [2, 1], "turned on again: named again, marked again");
eq((await N.rpc("game_tag_answer", [KEY, KIRAN, G2, false])).status, "no", "(he can take himself off whatever the setting)");

/* ---------------- kickoff ---------------- */
await N.move(G2, 0, "00:00", "23:59");
eq((await N.expire()).n, 0, "at kickoff nothing ends");
eq([(await N.tagStatus(G2, NEHA)), (await N.shown(G2)).map((t) => t.name), (await N.game(G2)).current_players, (await N.game(G2)).confirmed_tagged],
  [{ status: "pending", shown: true }, ["Neha Joshi"], 2, 1], "an unanswered tag stays on the lineup, still counted");
eq(await N.q(`select user_id from public.game_participants where game_id = $1`, [G2]), [{ user_id: HOST }], "and is still not a player");
eq((await N.rpc("game_tag_answer", [KEY, NEHA, G2, false])).r, "closed", "Remove me is for before the start");
eq((await N.rpc("game_tag_answer", [KEY, NEHA, G2, true])).r, "closed", "and so is I'm in");
eq(await N.q(`select private.game_tags_add($1, $2, array['meera_i']) n`, [G2, HOST]), [{ n: 0 }], "nobody is tagged once it has started");

/* ---------------- called off ---------------- */
g = await N.create(HOST, { max_players: 8, confirmed_tags: ["meera_i"] });
const G3 = g.game.id;
eq((await N.rpc("game_cancel", [KEY, HOST, G3])).r, "ok", "(the host calls a game off)");
eq(await N.shown(G3), [], "a called-off game names nobody, at once");
eq((await N.expire()).n, 1, "the job ends its tags");
eq([(await N.tagStatus(G3, MEERA)).status, (await N.game(G3)).confirmed_tagged], ["expired", 0], "ended, not counted");

/* ---------------- limits ---------------- */
g = await N.create(HOST, { max_players: 30 });
const G4 = g.game.id;
eq(await N.tag(G4, HOST, CROWD.slice(0, 25).map((c) => c[2])), 20, "20 waiting tags a game");
eq([(await N.shown(G4)).length, (await N.game(G4)).confirmed_tagged], [20, 20], "all 20 named");
g = await N.create(HOST, { max_players: 30 });
await N.q(`update private.game_tags set notified_at = now() where host_id = $1 and game_id = $2`, [HOST, G4]);
eq(await N.tag(g.game.id, HOST, CROWD.slice(25, 60).map((c) => c[2])), 20, "(20 more on another game)");
const G5 = (await N.rpc("game_create", [KEY, HOST, JSON.stringify({ ...GAME, max_players: 30, date: ist(3) })])).game.id;
eq(await N.tag(G5, HOST, CROWD.slice(0, 20).map((c) => c[2])), 10, "50 tag notifications a host a day");
{
  const g6 = (await N.create(HOST2, { max_players: 6 })).game.id;
  const tell = () => N.tag(g6, HOST2, ["ravi_k"]);
  const untag = () => N.q(`select private.game_tags_untag($1, array(select id from private.game_tags where game_id = $1))`, [g6]);
  eq([await tell(), (await untag(), await tell()), (await untag(), await tell()), (await untag(), await tell())], [1, 1, 1, 0], "one player is told about one game 3 times at most");
  await N.q(`select private.game_recount($1)`, [g6]);
  eq((await N.shown(g6)).length, 0, "(untagged: not named)");
}

/* ---------------- the count is the page's ---------------- */
ok((await N.q(`select g.id from public.games g where g.current_players <> private.game_in(g.id)`)).length === 0, "every game's count is its players, names, people without one and waiting tags");
ok((await N.q(`select g.id from public.games g where g.confirmed_tagged <> private.game_tags_pending(g.id)`)).length === 0, "and its tagged number is the tags that wait");

/* ---------------- afterwards: did you play? ---------------- */
const played = async (who) => (await N.rpc("game_tags_played", [KEY, who])).games;
const playedIds = async (who) => (await N.q(`select private.played_game_ids($1) id`, [who])).map((r) => r.id);
eq((await played(NEHA)).map((x) => x.game_id), [LEGACY], "a game that is not over yet is not asked about (her tag from before the file, on a game that is over, is)");
eq((await N.rpc("game_tag_played", [KEY, NEHA, G2, true])).r, "closed", "nor can it be answered");
await N.move(G2, -3);
eq(await played(NEHA), [{ game_id: LEGACY, sport: "Football", date: ist(-1), start_time: "19:00", end_time: "20:00", venue: "Kings Turf", host: "Vikram" },
  { game_id: G2, sport: "Football", date: ist(-3), start_time: "19:00", end_time: "20:00", venue: "Kings Turf", host: "Asha" }], "over: she is asked, newest first, with the sport, venue, day and host");
eq(await played(KIRAN), [], "someone who took himself off is never asked");
eq(await played(RAVI), [], "nor someone who said I'm in (he is a player)");
eq(await N.rpc("game_tags_played", ["wrong", NEHA]), { r: "unavailable" }, "the read needs the server key");
eq(await N.rpc("game_tag_played", ["wrong", NEHA, G2, true]), { r: "unavailable" }, "and so does the answer");
eq((await N.rpc("game_tag_played", [KEY, KIRAN, G2, true])).r, "gone", "an answered tag can't be answered again");
eq((await N.rpc("game_tag_played", [KEY, OMAR, G2, true])).r, "gone", "nor by someone never tagged");
ok(!(await playedIds(NEHA)).includes(G2), "(until she answers, the game is in nothing of hers)");
const before = await N.game(G2);
const notes = (await N.one(`select count(*)::int n from public.notifications`)).n;
a = await N.rpc("game_tag_played", [KEY, NEHA, G2, true]);
eq(a, { r: "ok", status: "yes", current_players: before.current_players }, "Yes, I played: the count is as it was (the tag held the spot)");
eq([(await N.tagStatus(G2, NEHA)).status, (await N.game(G2)).confirmed_tagged], ["yes", 0], "the tag is a yes");
eq((await N.q(`select user_id from public.game_participants where game_id = $1`, [G2])).map((r) => r.user_id).sort(), [HOST, NEHA].sort(), "she is a player of that game");
ok((await playedIds(NEHA)).includes(G2) && (await playedIds(HOST)).includes(G2), "so it is a played game of hers (and the host's), by the game's own day and end");
ok((await N.one(`select joined_at > private.game_start_at(g.date, g.start_time) late from public.game_participants p join public.games g on g.id = p.game_id where p.game_id = $1 and p.user_id = $2`, [G2, NEHA])).late, "(her joined_at is when she confirmed; nothing reads it for the day)");
const extras = async (who) => (await N.rpc("played_with_extras", [KEY, who])).players;
ok((await extras(HOST)).some((p) => p.id === NEHA && p.u === "neha_j") && (await extras(NEHA)).some((p) => p.id === HOST && p.u === "asha"), "played-with, both ways");
await N.q(`insert into private.whatsapp_shares (user_id, share) values ($1, true)`, [PRIYA]);
eq((await N.one(`select count(*)::int n from public.notifications`)).n, notes, "the host is not told");
eq((await played(NEHA)).map((x) => x.game_id), [LEGACY], "and she is not asked about it again");
eq((await N.rpc("game_tag_played", [KEY, NEHA, G2, false])).r, "gone", "a second answer finds nothing");
{
  // No WhatsApp number through a game confirmed afterwards (joined after the start), as for a late accept.
  const g7 = (await N.create(HOST2, { max_players: 6, confirmed_tags: ["priya23", "kiran"] })).game.id;
  eq((await N.rpc("game_tag_answer", [KEY, PRIYA, g7, true])).status, "yes", "(Priya, who shares her number, says I'm in before the game)");
  await N.move(g7, -2);
  // (The test's clock: the game was made, and Priya was in, before it started.)
  await N.q(`update public.games set created_at = now() - interval '10 days' where id = $1`, [g7]);
  await N.q(`update public.game_participants set joined_at = now() - interval '5 days' where game_id = $1`, [g7]);
  eq((await N.rpc("game_tag_played", [KEY, KIRAN, g7, true])).status, "yes", "(Kiran confirms afterwards)");
  const k = (await extras(KIRAN)).find((p) => p.id === PRIYA);
  const h = (await extras(HOST2)).find((p) => p.id === PRIYA);
  eq([k?.wa ?? null, h?.wa], [null, "+919800000003"], "he sees her in played-with, without her number; the host, in it from the start, has it");
}
{
  // No, I didn't.
  const g8 = (await N.create(HOST2, { max_players: 6, confirmed_tags: ["kiran", "ravi_k"] })).game.id;
  await N.move(g8, -1);
  eq((await N.shown(g8)).length, 2, "(after the game both are still listed as added by the host)");
  a = await N.rpc("game_tag_played", [KEY, KIRAN, g8, false]);
  eq(a, { r: "ok", status: "no", current_players: 2 }, "No, I didn't: the tag ends and its spot with it");
  eq([(await N.shown(g8)).map((t) => t.name), (await N.tagStatus(g8, KIRAN)).status], [["Ravi Kumar"], "no"], "he is no longer listed");
  ok(!(await playedIds(KIRAN)).includes(g8), "and the game is in nothing of his");
  // Two games to answer: newest first.
  const g9 = (await N.create(HOST2, { max_players: 6, confirmed_tags: ["ravi_k"] })).game.id;
  await N.move(g9, -5);
  eq((await played(RAVI)).map((x) => x.game_id), [g8, g9], "several: newest first");
  // 90 days.
  await N.move(g9, -90);
  eq((await played(RAVI)).map((x) => x.game_id), [g8, g9], "a game 90 days ago is still asked about");
  await N.move(g9, -91);
  eq((await played(RAVI)).map((x) => x.game_id), [g8], "one 91 days ago is left alone");
  eq((await N.rpc("game_tag_played", [KEY, RAVI, g9, true])).r, "closed", "and can't be answered");
  eq((await N.tagStatus(g9, RAVI)).status, "pending", "(its tag is as it was)");
  // Called off: never asked.
  await N.move(g9, -4);
  await N.q(`update public.games set status = 'cancelled' where id = $1`, [g9]);
  eq((await played(RAVI)).map((x) => x.game_id), [g8], "a called-off game is never asked about");
  eq((await N.rpc("game_tag_played", [KEY, RAVI, g9, true])).r, "closed", "nor answered");
  // Completed by the hourly job: asked as any over game.
  await N.q(`update public.games set status = 'completed' where id = $1`, [g8]);
  eq((await played(RAVI)).map((x) => x.game_id), [g8], "a game the hourly job closed is asked about as any other");
}
{
  // A tag that ended at kickoff (made before the file): asked, and a yes adds its player back to the count.
  eq((await played(MEERA)).map((x) => x.game_id), [LEGACY], "a tag that ended at kickoff is asked about (never the called-off game's)");
  a = await N.rpc("game_tag_played", [KEY, MEERA, LEGACY, true]);
  eq(a, { r: "ok", status: "yes", current_players: 2 }, "yes: she is added back to the count");
  eq(await N.rpc("game_tag_played", [KEY, NEHA, LEGACY, false]), { r: "ok", status: "no", current_players: 2 }, "no: nothing changes but the tag");
  eq((await N.game(LEGACY)).current_players, 2, "(the count stays)");
}
{
  // An account that is gone.
  const g10 = (await N.create(HOST2, { max_players: 6 })).game.id;
  await N.q(`insert into private.game_tags (game_id, user_id, host_id, shown) values ($1, $2, $3, true)`, [g10, GONE, HOST2]);
  eq([(await N.shown(g10)).length, (await N.game(g10)).confirmed_tagged], [0, 0], "a tag whose account is gone is neither named nor counted");
  await N.move(g10, -1);
  eq((await N.rpc("game_tag_played", [KEY, GONE, g10, true])).r, "bad", "and can't be confirmed");
  eq((await N.q(`select 1 from public.game_participants where user_id = $1`, [GONE])).length, 0, "no lineup row is made for it");
}

/* ---------------- the one notification a day ---------------- */
{
  // The job's runs above already asked the two players of the game from before the file, once it was over.
  eq((await N.q(`select u.name from public.notifications n join public.users u on u.id = n.user_id where n.type = 'game_tag_played_ask' order by 1`)).map((r) => r.name),
    ["Meera Iyer", "Neha Joshi"], "the job asked the players of a game that had ended, once each");
  await N.q(`delete from public.notifications where type = 'game_tag_played_ask'`);
  await N.q(`update private.game_tags set asked_at = now() - interval '3 days' where asked_at is null and status in ('pending', 'expired')`);
  const h = (await N.create(HOST2, { max_players: 8, confirmed_tags: ["omar_s", "crowd_aa", "crowd_ab"] }));
  eq(h.game.confirmed_tagged, 2, "(Omar has tagging off: two tagged)");
  const g11 = h.game.id;
  const g12 = (await N.create(HOST2, { max_players: 8, confirmed_tags: ["crowd_aa"], sport: "Cricket" })).game.id;
  const asks = () => N.q(`select u.name, n.title, n.message, n.metadata from public.notifications n join public.users u on u.id = n.user_id where n.type = 'game_tag_played_ask' order by u.name, n.created_at`);
  await N.expire();
  eq(await asks(), [], "before the games are over nobody is asked");
  await N.move(g11, -2);
  await N.move(g12, -1);
  await N.q(`insert into private.game_tags (game_id, user_id, host_id, shown) values ($1, $2, $3, true)`, [g11, GONE, HOST2]);
  const outbox = (await N.one(`select count(*)::int n from private.email_outbox`)).n;
  eq((await N.one(`select private.game_tags_ask() n`)).n, 2, "two players have something to answer");
  eq(await asks(), [
    { name: "Player 1", title: "Did you play?", message: `Were you at Cricket on ${day(-1)}? Confirm it for your Passport.`, metadata: { tab: "passport" } },
    { name: "Player 2", title: "Did you play?", message: `Were you at Football on ${day(-2)}? Confirm it for your Passport.`, metadata: { tab: "passport" } },
  ], "each is told once, about their newest game, with no game in the metadata (an account that is gone is skipped)");
  eq((await N.one(`select count(*)::int n from private.email_outbox`)).n, outbox, "no email");
  eq((await N.one(`select private.email_kind_of('game_tag_played_ask') k`)).k, null, "(the type maps to no email)");
  await N.expire();
  eq((await asks()).length, 2, "the next run asks nobody again: both of Player 1's tags were marked asked");
  const g13 = (await N.create(HOST2, { max_players: 8, confirmed_tags: ["crowd_ab"] })).game.id;
  await N.move(g13, -1);
  await N.expire();
  eq((await asks()).length, 2, "a second game the same day: not a second notification");
  await N.q(`update private.game_tags set asked_at = asked_at - interval '25 hours' where asked_at is not null`);
  await N.expire();
  eq((await asks()).map((x) => x.name), ["Player 1", "Player 2", "Player 2"], "a day later it is asked about");
  const g14 = (await N.create(HOST2, { max_players: 8, confirmed_tags: ["crowd_ac"] })).game.id;
  await N.move(g14, -9);
  await N.expire();
  eq((await asks()).length, 3, "a game that ended more than 7 days ago sends nothing (the card still lists it)");
  eq((await played(CROWD[2][0])).map((x) => x.game_id), [g14], "(it does)");
}

/* ---------------- grants ---------------- */
const fns = await N.q(`select n.nspname || '.' || p.proname f, p.proconfig::text cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('game_tags_shown', 'game_tags_played', 'game_tag_played', 'game_tags_ask', 'game_tag_ask_days', 'game_tags_setting_changed') order by 1`);
ok(fns.length === 6 && fns.every((f) => /search_path=\\?"\\?"/.test(f.cfg)), "the file's 6 new functions, each with an empty search_path");
eq(fns.filter((f) => f.anon_x || f.auth_x).map((f) => f.f), ["public.game_tag_played", "public.game_tags_played", "public.game_tags_shown"], "only the three public ones can be called by the API roles (they check the server key)");
const grantsOf = async (H) => H.q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, p.prosecdef d, p.provolatile v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname, p.proname) in (('private','game_tags_add'),('private','game_tags_expire'),('public','game_tags_for'),('public','game_tag_answer')) order by 1`);
eq(await grantsOf(N), await grantsOf(O), "the replaced functions keep their grants, security and volatility");
eq(await N.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`),
  await O.q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`), "no table grant on public changed");
eq(await N.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
  await O.q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`), "no policy changed");
eq((await N.one(`select md5(p.prosrc) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'game_tag_answer'`)).m,
  "9c17e201ad73c901133ed7f059363ef1", "public.game_tag_answer is production's body, untouched");

await OLD.close();
await NEW.close();
console.log(`game_tags_shown.check: ${passed} checks passed`);
