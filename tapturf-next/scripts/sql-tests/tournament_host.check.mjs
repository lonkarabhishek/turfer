// Applies 20261123_tournament_host.sql (twice) to an in-memory Postgres
// (PGlite) on top of the real live tournaments (20261102_live_tournaments.sql,
// with 20261021_live_matches.sql before it as its own check has it), the real
// public.usernames table, the real key checks and the real player badges
// (20261121_player_badges.sql), all read from the repo's migrations, with
// stand-ins only for what those read (Supabase's roles, the key table,
// pg_cron, public.users, the site owner check and the verified tick's rule),
// and checks: the file's rules (additive, none of the destructive keywords
// even inside a word or a comment, no backslash anywhere, search_path '', its
// header's md5s are the repo's latest bodies, nothing replaced, no table); the
// grants and settings are tournament_get's; a wrong key is refused; no account,
// a profile that is not public, no username, no name, a tournament taken down,
// an unknown code and a code that is not one all answer null; a public
// organiser answers exactly the six fields and nothing else (no account id, no
// number, no email); the switch is asked on every call; reading writes
// nothing; tournament_get is as it was and still says nothing about the
// organiser. And the file's second read, public.live_tournament (the
// tournament a live scorecard is a match of): the same gate and grants; an
// unknown code, a link no fixture has, a fixture taken out and a tournament
// taken down all answer null; a real one answers exactly its eleven fields
// (the match's place as the page words it, the teams' names, the next match)
// and nothing about the organiser's account. Never touches a real database.
// Made-up people.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/tournament_host.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: tournament_host.check.mjs <supabase/migrations>");
const NAME = "20261123_tournament_host.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /drop|delete|truncate/i, "none of the destructive keywords, not in a comment, not inside a word");
assert.ok(!NEW.includes(String.fromCharCode(92)), "no backslash anywhere in the file (a client mangled escapes once)");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.doesNotMatch(code, /\b(update|insert\s+into)\b/i, "writes nothing anywhere");
assert.doesNotMatch(code, /\b(create|alter)\s+(table|index|unique|policy|trigger|schema|type|view)\b|cron\.schedule/i, "no table, index, policy, trigger or job");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.(tournament_host|live_tournament)\()/i, "the grants are on its own functions");
const bodyOf = (fn) => {
  const from = NEW.indexOf("as $$", NEW.indexOf(`create or replace function public.${fn}`)) + 5;
  return NEW.slice(from, NEW.indexOf("$$;", from));
};
const BODY = bodyOf("tournament_host");
const BODY2 = bodyOf("live_tournament");
assert.match(BODY2, /^declare\n  f private\.tournament_fixtures;\n  t private\.tournaments;\nbegin\n  if not private\.live_key_ok\(p_key\) then\n    return jsonb_build_object\('r', 'unavailable'\);\n  end if;/m, "the scorecard's read checks the key before anything is read, the same way");
assert.doesNotMatch(BODY2, /user_id|usernames|public\.users|player_badges|secret|ip_hash|\bemail\b|\bphone\b/i, "and its body reads nothing about who organises it");
assert.match(BODY, /private\.live_key_ok\(p_key\)/, "the function's body was found");
assert.doesNotMatch(BODY, /\bemail\b|\bphone\b|'id'|user_id'|\bt\.user_id\s*[,)]/i, "its body answers no address, number or account id");
assert.match(BODY, /^begin\n  if not private\.live_key_ok\(p_key\) then\n    return jsonb_build_object\('r', 'unavailable'\);\n  end if;/m, "the key is checked before anything is read, and refused as tournament_get refuses it");
assert.doesNotMatch(code, /function\s+public\.tournament_get\b/i, "public.tournament_get is not made again");
passed += 13;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.tournament_host", "public.live_tournament"], "exactly two functions");
eq((code.match(/security definer/g) ?? []).length, 2, "each security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 2, "each with an empty search_path");
eq((code.match(/\bstable\b/g) ?? []).length, 2, "each stable");
for (const fn of ["tournament_host", "live_tournament"]) {
  eq((code.match(new RegExp(`revoke all on function public\\.${fn}\\(text, text\\) from public, anon, authenticated;`, "g")) ?? []).length, 1, `${fn}: revoked from public, anon and authenticated before its grant`);
  eq((code.match(new RegExp(`grant execute on function public\\.${fn}\\(text, text\\) to anon, authenticated;`, "g")) ?? []).length, 1, `${fn}: granted as tournament_get is`);
}
for (const w of ["Replaced: none.", "public.tournament_get and the live scorecard's own reads\n-- are not touched", "Never who organises it", "No table", "The app works before this file", "production was not read for this file", "The switch is asked", "Never the account's id, its number or its email", "Never in a title, a description, an og tag or JSON-LD", "Safe to run"])
  ok(NEW.includes(w), `the header says: ${w}`);

// The header's md5s: each the md5 of that function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
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
const CALLED = ["private.live_key_ok", "private.user_verified"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the two functions it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
eq([...calls].sort(), CALLED, "it calls exactly those two");
const reads = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(?:from|join)\s+((?:public|private)\.\w+)/g)].map((m) => m[1]))].sort();
eq(reads(BODY), ["private.player_badges", "private.tournaments", "public.usernames", "public.users"], "the organiser's read: exactly the four tables its header names");
eq(reads(BODY2), ["private.tournament_fixtures", "private.tournament_teams", "private.tournaments"], "the scorecard's read: the tournament's own three tables, and no table about people");
for (const fn of MADE) eq(repoDef(fn), null, `${fn} is new: no earlier file has it`);
for (const file of FILES.filter((f) => f < NAME)) ok(!/tournament_host|live_tournament\b/.test(fs.readFileSync(`${M}/${file}`, "utf8")), `${file} knows nothing of either`);

// ── The database before it: the real files, with stand-ins for what they read. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ACC = fs.readFileSync(`${M}/20261021_accounts_usernames.sql`, "utf8");
const USERNAMES = /create table if not exists public\.usernames \([^;]*\);\nalter table public\.usernames enable row level security;\nrevoke all on public\.usernames from public, anon, authenticated;/.exec(ACC)?.[0];
ok(USERNAMES?.includes("taggable boolean not null default true"), "the real public.usernames, from the repo");
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
-- The tick's rule (20261027_verified_tick.sql) reads a dozen tables this check has no use for: a stand-in with its
-- name, arguments and settings, answering from a list. The header's md5 is checked against the real body above.
create table private.test_ticks (user_id uuid primary key);
create function private.user_verified(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from private.test_ticks t where t.user_id = p_user_id) $$;
`;
await db.exec(BASE);
await db.exec(USERNAMES);
await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
await db.exec(repoDef("private.account_key_ok").sql);
await db.exec(repoDef("private.live_key_ok").sql);
// The live scorecard's own keyed read, with the grants the repo gives it: what live_tournament's are compared with.
await db.exec(repoDef("public.live_match_get_k").sql);
const KEYED_GRANTS = /revoke all on function public\.live_match_get_k\(text, text\) from public;\ngrant execute on function public\.live_match_get_k\(text, text\) to anon, authenticated;/.exec(ACC)?.[0];
ok(!!KEYED_GRANTS, "the keyed live read's grants, from the repo");
await db.exec(KEYED_GRANTS);
eq(md5((await one(`select prosrc from pg_proc where proname = 'live_key_ok'`)).prosrc), HEADER[0].md5, "the key check loaded here is the body the header names");
await db.exec(`
insert into private.app_secrets (name, value) values ('account', 'account-key') on conflict (name) do update set value = excluded.value;
insert into private.app_secrets (name, value) values ('live_write', 'live-key') on conflict (name) do update set value = excluded.value;
`);
const LIVE = "live-key";
const ACCOUNT = "account-key";

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(`begin; ${NEW}; commit;`), /tournament_host needs/, "without the earlier files it refuses");
  await bare.exec("rollback");
  eq((await bare.query(`select to_regprocedure('public.tournament_host(text, text)') as f, to_regprocedure('public.live_tournament(text, text)') as g`)).rows[0], { f: null, g: null }, "and leaves nothing behind");
  await bare.close();
}
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /tournament_host needs/, "before live tournaments and the badges it refuses too");
await db.exec("rollback");
passed++;

await db.exec(fs.readFileSync(`${M}/20261102_live_tournaments.sql`, "utf8"));
await db.exec(`begin; ${fs.readFileSync(`${M}/20261121_player_badges.sql`, "utf8")}; commit;`);

const fns = () => q(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, p.prosecdef, p.proconfig, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('tournament_host', 'live_tournament') order by 1`);
const columns = () => q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
const indexes = () => q(`select schemaname, tablename, indexname from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`);
const before = { fns: await fns(), columns: await columns(), indexes: await indexes() };
eq(md5((await one(`select prosrc from pg_proc where proname = 'tournament_get'`)).prosrc), md5(repoDef("public.tournament_get").body), "tournament_get is the repo's body before the file");
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture: made-up people and their tournaments. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// 1 Asha: public profile, a medal, the tick, a photo.  2 Ravi: public profile, nothing else.
// 3 Priya: a username, the switch off.                  4 Kiran: an account, no username.
// 5 Meera: public profile, a badge row that says none.  6: no such account.
// 7: a public username, no name.
const PEOPLE = [[1, "Asha Rao", "+919800000001", "asha@example.test", "https://lh3.googleusercontent.com/a/asha"], [2, "Ravi Kumar", "+919800000002", "ravi@example.test", null], [3, "Priya Nair", "+919800000003", null, null], [4, "Kiran Shah", "+919800000004", null, null], [5, "Meera Iyer", "+919800000005", null, null], [7, "  ", "+919800000007", null, null]];
for (const [n, name, phone, email, photo] of PEOPLE) await q(`insert into public.users (id, name, phone, email, profile_image_url) values ($1, $2, $3, $4, $5)`, [U(n), name, phone, email, photo]);
for (const [n, u, t] of [[1, "asha", true], [2, "ravi_k", true], [3, "priya23", false], [5, "meera_i", true], [7, "noname_7", true]]) await q(`insert into public.usernames (user_id, username, taggable) values ($1, $2, $3)`, [U(n), u, t]);
await q(`insert into private.test_ticks values ($1)`, [U(1)]);
eq((await one(`select public.player_badge_set($1, $2, 'games-25', 7) as r`, [ACCOUNT, U(1)])).r, { r: "ok", changed: true }, "Asha's badge: Turf Veteran, 7 medals");
eq((await one(`select public.player_badge_set($1, $2, 'first-game', 1) as r`, [ACCOUNT, U(5)])).r, { r: "ok", changed: true }, "Meera had a medal");
eq((await one(`select public.player_badge_set($1, $2, null, 0) as r`, [ACCOUNT, U(5)])).r, { r: "ok", changed: true }, "and has none now: her row says none");
eq((await one(`select public.player_badge_set($1, $2, 'hosted-5', 4) as r`, [ACCOUNT, U(3)])).r, { r: "ok", changed: true }, "Priya (switch off) has a medal too");

const SECRET = (n) => String(n).padStart(2, "0").repeat(32);
const settings = { format: "league", legs: 1, matches: 0, playoffs: "none", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const DATA = { name: "Sunday Box League", settings, teams: ["Titans", "Strikers", "Royals", "Kings"].map((name) => ({ name, short: null })), fixtures: [{ id: 1, stage: "league", slot: null, round: 1, seq: 0, home: 1, away: 2, day: null, time: null, result: null }] };
const C = (n) => `t${String(n).padStart(11, "0")}`;
const create = async (n, net) => (await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(n), SECRET(n), JSON.stringify(DATA), String(net).padStart(32, "0")])).r.r;
const attach = async (n, user) => (await one(`select public.tournament_attach($1, $2, $3, $4) as r`, [ACCOUNT, C(n), SECRET(n), user])).r.r;
// 1 Asha's, 2 Ravi's, 3 Priya's, 4 Kiran's, 5 nobody's (the organiser never signed in), 6 Meera's, 7 the nameless account's, 8 Asha's second.
for (let n = 1; n <= 8; n++) eq(await create(n, n), "ok", `tournament ${n} made`);
for (const [n, u] of [[1, 1], [2, 2], [3, 3], [4, 4], [6, 5], [7, 7], [8, 1]]) eq(await attach(n, U(u)), "ok", `tournament ${n} kept with account ${u}`);
eq((await one(`select user_id from private.tournaments where code = $1`, [C(5)])).user_id, null, "tournament 5 has no account");
const host = async (n, key = LIVE) => (await one(`select public.tournament_host($1, $2) as r`, [key, typeof n === "number" ? C(n) : n])).r;
const get = async (n) => (await one(`select public.tournament_get($1, $2) as r`, [LIVE, C(n)])).r;

// ── 1. Grants and settings: tournament_get's. ──
const priv = async (fn) => Object.fromEntries(await Promise.all(["anon", "authenticated", "public"].map(async (role) => [role, (await one(`select has_function_privilege($1, 'public.${fn}(text, text)', 'execute') as p`, [role])).p])));
for (const fn of ["tournament_host", "live_tournament"]) {
  eq(await priv(fn), await priv("tournament_get"), `${fn}: who may call it is exactly who may call tournament_get`);
  eq(await priv(fn), await priv("live_match_get_k"), `${fn}: and who may call the live scorecard's keyed read`);
  eq(await priv(fn), { anon: true, authenticated: true, public: false }, `${fn}: anon and authenticated (the key is the gate), never public's default`);
}
const shape = async (fn) => one(`select prosecdef, proconfig, provolatile, prorettype::regtype::text as returns, pg_get_function_identity_arguments(oid) as args from pg_proc where proname = $1`, [fn]);
eq(await shape("tournament_host"), await shape("tournament_get"), "security definer, search_path empty, stable, the same arguments and return type as tournament_get");
eq({ ...(await shape("live_tournament")), args: "" }, { ...(await shape("tournament_get")), args: "" }, "the scorecard's read: the same settings and return type");
eq((await shape("live_tournament")).args, "p_key text, p_live_code text", "its arguments");
eq((await shape("tournament_host")).proconfig, ['search_path=""'], "search_path is empty");
eq((await shape("tournament_host")).provolatile, "s", "stable");

// ── 2. A wrong key is refused, whatever the tournament. ──
for (const k of [null, "", "wrong", ACCOUNT, LIVE + "x", LIVE.slice(1), "LIVE-KEY"]) {
  eq(await host(1, k), { r: "unavailable" }, `refused without the live write key (${k === null ? "null" : `"${k}"`}), though the organiser is public`);
  eq(await host(5, k), { r: "unavailable" }, "and for a tournament with no account, the same answer");
}
eq(await host("t99999999999", "wrong"), { r: "unavailable" }, "and for a code that is no tournament: a wrong key learns nothing");

// ── 3. A public organiser: exactly these fields, nothing else. ──
const ASHA = { u: "asha", name: "Asha Rao", photo: "https://lh3.googleusercontent.com/a/asha", verified: true, m: "games-25", n: 7 };
const RAVI = { u: "ravi_k", name: "Ravi Kumar", photo: null, verified: false, m: null, n: 0 };
eq(await host(1), ASHA, "Asha: username, name, photo, the tick, her best medal and how many");
eq(await host(8), ASHA, "her other tournament says the same");
eq(await host(2), RAVI, "Ravi: no photo, no tick, no medal");
eq(await host(6), { u: "meera_i", name: "Meera Iyer", photo: null, verified: false, m: null, n: 0 }, "Meera: a badge row that says none is no medal");
for (const n of [1, 2, 6, 8]) {
  const h = await host(n);
  eq(Object.keys(h).sort().join(), "m,n,name,photo,u,verified", `tournament ${n}: six keys and no other`);
  const text = JSON.stringify(h);
  ok(!/0000-4000-8000|9800000|example[.]test|@/.test(text), `tournament ${n}: no account id, no number, no email`);
}

// ── 4. Everyone else: null, and nothing to tell the cases apart. ──
eq(await host(5), null, "the organiser never signed in: null");
eq(await host(3), null, "Priya's switch is off: null, though she has a username and a medal");
eq(await host(4), null, "Kiran has no username: null");
eq(await host(7), null, "an account with a public username and no name: null");
eq(await host("t99999999999"), null, "an unknown code: null");
for (const bad of [null, "", "BAD", "t0000000000", "t000000000011", "T00000000001", "t0000000000!", "' or 1=1 --"]) eq(await host(bad), null, `a code that is not one (${bad === null ? "null" : `"${bad}"`}): null`);
// An account that is gone: no user row, no username row.
await db.exec(`update private.tournaments set user_id = '${U(6)}' where code = '${C(4)}'`);
eq(await host(4), null, "kept with an account that no longer exists: null");
await db.exec(`update private.tournaments set user_id = '${U(4)}' where code = '${C(4)}'`);

// ── 5. The switch is asked on every call. ──
await db.exec(`update public.usernames set taggable = false where user_id = '${U(1)}'`);
eq(await host(1), null, "Asha turns the switch off: the very next call names nobody");
eq(await host(8), null, "on her other tournament too");
eq(await host(2), RAVI, "Ravi's is untouched");
await db.exec(`update public.usernames set taggable = true where user_id = '${U(1)}'`);
eq(await host(1), ASHA, "back on: named again at once");
await db.exec(`update public.usernames set taggable = true where user_id = '${U(3)}'`);
eq(await host(3), { u: "priya23", name: "Priya Nair", photo: null, verified: false, m: "hosted-5", n: 4 }, "Priya turns hers on: named, with the medal she already had");
await db.exec(`update public.usernames set taggable = false where user_id = '${U(3)}'`);
eq(await host(3), null, "and off again");
// What it answers is read, never kept: a new username, name, photo, tick and medal each show on the next call.
await db.exec(`update public.usernames set username = 'asha_rao' where user_id = '${U(1)}'`);
eq((await host(1)).u, "asha_rao", "a changed username is read");
await db.exec(`update public.usernames set username = 'asha' where user_id = '${U(1)}'`);
await db.exec(`update public.users set name = 'Asha R', profile_image_url = null where id = '${U(1)}'`);
eq(await host(1), { ...ASHA, name: "Asha R", photo: null }, "a changed name and a removed photo are read");
await db.exec(`update public.users set name = 'Asha Rao', profile_image_url = 'https://lh3.googleusercontent.com/a/asha' where id = '${U(1)}'`);
await q(`insert into private.test_ticks values ($1)`, [U(2)]);
eq((await host(2)).verified, true, "a tick earned shows");
await db.exec(`update private.test_ticks set user_id = '${U(99)}' where user_id = '${U(2)}'`);
eq((await host(2)).verified, false, "and one lost is gone");
eq((await one(`select public.player_badge_set($1, $2, 'games-50', 9) as r`, [ACCOUNT, U(1)])).r, { r: "ok", changed: true }, "a better medal for Asha");
eq(await host(1), { ...ASHA, m: "games-50", n: 9 }, "is on the next call");
eq((await one(`select public.player_badge_set($1, $2, 'games-25', 7) as r`, [ACCOUNT, U(1)])).r, { r: "ok", changed: true }, "put back");

// ── 6. A tournament taken down names nobody. ──
eq(await host(8), ASHA, "tournament 8 is on and names Asha");
eq((await one(`select public.tournament_update($1, $2, $3, 'remove', '{}'::jsonb) as r`, [LIVE, C(8), SECRET(8)])).r.r, "ok", "the organiser takes it down");
eq((await get(8)).status, "removed", "tournament_get says it was taken down");
eq(await host(8), null, "and the host read answers null");
eq(await host(1), ASHA, "her other tournament still names her");
// Another device of the account changes nothing about who is named; an account that never kept it can't become its organiser.
eq((await one(`select public.tournament_device_add($1, $2, $3, $4) as r`, [ACCOUNT, C(1), U(1), SECRET(31)])).r.r, "ok", "Asha adds another phone");
eq(await host(1), ASHA, "still Asha");
eq((await one(`select public.tournament_attach($1, $2, $3, $4) as r`, [ACCOUNT, C(1), SECRET(1), U(2)])).r.r, "other", "Ravi can't take it over");
eq(await host(1), ASHA, "still Asha");

// ── 7. As the server's client (anon with the key), and as a browser without it. ──
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  try {
    eq((await db.query(`select public.tournament_host($1, $2) as r`, [LIVE, C(1)])).rows[0].r, ASHA, `${role} with the live write key gets the organiser`);
    eq((await db.query(`select public.tournament_host($1, $2) as r`, ["guess", C(1)])).rows[0].r, { r: "unavailable" }, `${role} with a guessed key gets nothing`);
    eq((await db.query(`select public.tournament_host($1, $2) as r`, [LIVE, C(3)])).rows[0].r, null, `${role}: nothing for a profile that is not public`);
    for (const t of ["private.tournaments", "private.player_badges", "public.usernames"]) {
      await assert.rejects(db.query(`select * from ${t}`), /permission denied/, `${role} can't read ${t}: the read tells only what it returns`);
      passed++;
    }
  } finally {
    await db.exec("reset role");
  }
}

// ── 8. tournament_get is as it was, and still says nothing about the organiser. ──
const g = await get(1);
eq(Object.keys(g).sort().join(), "code,created_at,fixtures,name,rev,settings,status,teams,updated_at", "tournament_get's keys are the ones it had");
ok(!/asha|Asha|0000-4000-8000/.test(JSON.stringify(g)), "and nothing in it names the organiser or their account");

// ── 8b. The tournament a live scorecard is a match of. ──
// A league of four with a final, in the organiser's order: 6 league matches (ids 1 to 6), the final (id 7).
const L = (n) => `l${String(n).padStart(11, "0")}`;
const PAIRS = [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]];
const LEAGUE = {
  name: "Koregaon Park Premier League",
  settings: { ...settings, playoffs: "final" },
  teams: DATA.teams,
  fixtures: [...PAIRS.map(([home, away], i) => ({ id: i + 1, stage: "league", slot: null, round: Math.floor(i / 2) + 1, seq: i, home, away, day: i === 3 ? "2026-11-28" : null, time: i === 3 ? "19:30" : null, result: null })),
    { id: 7, stage: "final", slot: "f", round: 9, seq: 6, home: null, away: null, day: null, time: null, result: null }],
};
eq((await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(20), SECRET(20), JSON.stringify(LEAGUE), "9".padStart(32, "0")])).r.r, "ok", "a league with a final");
eq(await attach(20, U(1)), "ok", "kept with Asha's account");
const change = async (n, op, d = {}) => (await one(`select public.tournament_update($1, $2, $3, $4, $5::jsonb) as r`, [LIVE, C(n), SECRET(n), op, JSON.stringify(d)])).r.r;
const banner = async (live, key = LIVE) => (await one(`select public.live_tournament($1, $2) as r`, [key, live])).r;
const INN = (runs) => ({ runs, wickets: 4, balls: 36, allOut: false });
const HAND = { a: INN(63), b: INN(54), result: "auto", battedFirst: "a" };
eq(await banner(L(1)), null, "a link no fixture has: null");
eq(await change(20, "live_link", { id: 3, live_code: L(1) }), "ok", "match 3 is scored live on a link");
const NEXT1 = { stage: "league", slot: null, n: 1, home: "Titans", away: "Strikers", day: null, time: null };
const B0 = { code: C(20), name: "Koregaon Park Premier League", format: "league", fixture: 3, stage: "league", slot: null, n: 3, of: 6, home: "Titans", away: "Royals", next: NEXT1 };
eq(await banner(L(1)), B0, "the scorecard's tournament: its code, name and format, League match 3 of 6, the teams by their tournament names, and the next match without a result or a scorecard");
eq(Object.keys(await banner(L(1))).sort().join(), "away,code,fixture,format,home,name,next,of,n,slot,stage".split(",").sort().join(), "eleven keys and no other");
eq(Object.keys((await banner(L(1))).next).sort().join(), "away,day,home,n,slot,stage,time", "the next match: seven keys and no other");
ok(!/asha|Asha|0000-4000-8000|9800000|example[.]test|user|secret|hash/.test(JSON.stringify(await banner(L(1)))), "nothing about the organiser: no account id, name, number, email, secret or hash");
// The key.
for (const k of [null, "", "wrong", ACCOUNT, LIVE + "x"]) eq(await banner(L(1), k), { r: "unavailable" }, `refused without the live write key (${k === null ? "null" : `"${k}"`})`);
eq(await banner(L(9), "wrong"), { r: "unavailable" }, "and the same for a link no fixture has: a wrong key learns nothing");
// Codes that are not codes.
for (const bad of [null, "", "BAD", "l0000000001", "l000000000011", "L00000000001", "' or 1=1 --"]) eq(await banner(bad), null, `a code that is not one (${bad === null ? "null" : `"${bad}"`}): null`);
// Results move "next" on; a match with a scorecard of its own is not "next" either.
eq(await change(20, "result", { id: 1, result: HAND }), "ok", "match 1 gets a hand result");
eq((await banner(L(1))).next, { stage: "league", slot: null, n: 2, home: "Royals", away: "Kings", day: null, time: null }, "next is match 2 now");
eq(await change(20, "live_link", { id: 2, live_code: L(2) }), "ok", "match 2 is scored on another link");
eq((await banner(L(1))).next, { stage: "league", slot: null, n: 4, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" }, "next is match 4, with its day and time");
eq((await banner(L(2))).next, { stage: "league", slot: null, n: 4, home: "Strikers", away: "Kings", day: "2026-11-28", time: "19:30" }, "the other scorecard says the same next match");
eq([(await banner(L(2))).n, (await banner(L(2))).home, (await banner(L(2))).away], [2, "Royals", "Kings"], "and is match 2");
// The organiser's order decides the number: moved to the front, match 3 is Match 1.
eq(await change(20, "fixture_order", { ids: [3, 1, 2, 4, 5, 6, 7] }), "ok", "the organiser moves it to the front");
eq([(await banner(L(1))).n, (await banner(L(1))).of], [1, 6], "it is Match 1 of 6 now, as the page numbers it");
eq(await change(20, "fixture_order", { ids: [1, 2, 3, 4, 5, 6, 7] }), "ok", "and back");
// A match taken out renumbers the rest, and is never "next".
eq(await change(20, "fixture_remove", { id: 4 }), "ok", "match 4 is taken out");
eq([(await banner(L(1))).n, (await banner(L(1))).of], [3, 5], "five league matches now");
eq((await banner(L(1))).next, { stage: "league", slot: null, n: 4, home: "Titans", away: "Kings", day: null, time: null }, "next is the old match 5, now Match 4");
// A renamed team and a renamed tournament are read, not kept.
eq(await change(20, "team", { id: 1, name: "Baner Titans", short: null }), "ok", "a team renamed");
eq(await change(20, "settings", { name: "KP Premier League", settings: LEAGUE.settings }), "ok", "the tournament renamed");
eq([(await banner(L(1))).name, (await banner(L(1))).home], ["KP Premier League", "Baner Titans"], "both show on the next call");
// The final: no number, its places not filled yet.
eq(await change(20, "live_link", { id: 7, live_code: L(3), home: 1, away: 2 }), "ok", "the final is scored live, its teams pinned");
eq(await banner(L(3)), { code: C(20), name: "KP Premier League", format: "league", fixture: 7, stage: "final", slot: "f", n: null, of: 5, home: "Baner Titans", away: "Strikers", next: { stage: "league", slot: null, n: 4, home: "Baner Titans", away: "Kings", day: null, time: null } }, "the final: stage and slot, no number");
eq(await change(20, "live_unlink", { id: 7 }), "ok", "unlinked");
eq(await banner(L(3)), null, "an unlinked scorecard belongs to no tournament");
// One link kept for the next match is on two fixtures: the one still without a result is the match on now.
eq(await change(20, "live_link", { id: 5, live_code: L(1) }), "ok", "the same link is used for match 5 next");
await db.exec(`update private.tournament_fixtures set live_result = '${JSON.stringify({ a: { ...INN(70), name: "Baner Titans" }, b: { ...INN(60), name: "Royals" }, outcome: "a", battedFirst: "a", text: "Baner Titans won by 10 runs" })}'::jsonb, live_rev = 3 where code = '${C(20)}' and id = 3`);
eq([(await banner(L(1))).fixture, (await banner(L(1))).n], [5, 4], "the link says the match without a result (match 5, now Match 4)");
eq((await banner(L(1))).next, { stage: "league", slot: null, n: 5, home: "Strikers", away: "Royals", day: null, time: null }, "and next after it is the last league match, never itself");
eq(await change(20, "live_unlink", { id: 5 }), "ok", "unlinked again");
eq([(await banner(L(1))).fixture, (await banner(L(1))).n], [3, 3], "back to match 3, whose result is kept");
// A fixture taken out: its scorecard belongs to no tournament.
eq(await change(20, "fixture_remove", { id: 2 }), "ok", "match 2 (on link 2) is taken out");
eq(await banner(L(2)), null, "a scorecard whose fixture was taken out: null");
eq((await banner(L(1))).n, 2, "and the numbering follows");
// Every match played or on a scorecard: no next.
for (const id of [5, 6]) eq(await change(20, "result", { id, result: HAND }), "ok", `match ${id} gets a result`);
eq((await banner(L(1))).next, { stage: "final", slot: "f", n: null, home: "Baner Titans", away: "Strikers", day: null, time: null }, "the league done: next is the final");
eq(await change(20, "result", { id: 7, result: HAND }), "ok", "the final gets a result");
eq((await banner(L(1))).next, null, "nothing left: next is null");
// A series: its format is said.
const SERIES = { name: "Titans v Strikers", settings: { ...settings, format: "bilateral", matches: 3 }, teams: DATA.teams.slice(0, 2), fixtures: [1, 2, 3].map((id) => ({ id, stage: "league", slot: null, round: 1, seq: id - 1, home: 1, away: 2, day: null, time: null, result: null })) };
eq((await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(21), SECRET(21), JSON.stringify(SERIES), "8".padStart(32, "0")])).r.r, "ok", "a three-match series, nobody signed in");
eq(await change(21, "live_link", { id: 2, live_code: L(4) }), "ok", "its second match is scored live");
eq(await banner(L(4)), { code: C(21), name: "Titans v Strikers", format: "bilateral", fixture: 2, stage: "league", slot: null, n: 2, of: 3, home: "Titans", away: "Strikers", next: { stage: "league", slot: null, n: 1, home: "Titans", away: "Strikers", day: null, time: null } }, "Match 2 of 3 of a series");
// As the server's client, and as a browser without the key.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  try {
    eq((await db.query(`select public.live_tournament($1, $2) as r`, [LIVE, L(4)])).rows[0].r.code, C(21), `${role} with the live write key gets the banner`);
    eq((await db.query(`select public.live_tournament($1, $2) as r`, ["guess", L(4)])).rows[0].r, { r: "unavailable" }, `${role} with a guessed key gets nothing`);
    for (const tb of ["private.tournament_fixtures", "private.tournament_teams"]) {
      await assert.rejects(db.query(`select * from ${tb}`), /permission denied/, `${role} can't read ${tb}`);
      passed++;
    }
  } finally {
    await db.exec("reset role");
  }
}
// A tournament taken down: its scorecards belong to no tournament.
eq((await banner(L(4))).code, C(21), "the series is on");
eq(await change(21, "remove"), "ok", "the series is taken down");
eq(await banner(L(4)), null, "a scorecard of a tournament taken down: null");
eq((await banner(L(1))).code, C(20), "the other tournament's scorecard is untouched");
const B1 = await banner(L(1));

// ── 9. Reading writes nothing; safe to run again; nothing from before changed. ──
const state = async () => ({
  t: await q(`select code, rev, writes, status, user_id, updated_at, xmin::text as x from private.tournaments order by code`),
  n: await q(`select user_id, username, taggable, updated_at, xmin::text as x from public.usernames order by user_id`),
  u: await q(`select id, name, profile_image_url, xmin::text as x from public.users order by id`),
  b: await q(`select user_id, medal, medals, updated_at, xmin::text as x from private.player_badges order by user_id`),
  v: await q(`select * from private.tournament_views order by code`),
  f: await q(`select code, id, status, seq, home, away, live_code, live_rev, updated_at, xmin::text as x from private.tournament_fixtures order by code, id`),
  m: await q(`select code, id, name, xmin::text as x from private.tournament_teams order by code, id`),
});
const s1 = await state();
for (let n = 1; n <= 8; n++) await host(n);
await host("t99999999999"); await host(null); await host(1, "wrong");
for (let n = 1; n <= 9; n++) await banner(L(n));
await banner(null); await banner(L(1), "wrong");
eq(await state(), s1, "a read changes no row of any table: no rev, no updated_at, no view");
await db.exec(`begin; ${NEW}; commit;`);
eq(await state(), s1, "run again: nothing changes");
eq(await host(1), ASHA, "and it answers the same");
eq(await host(5), null, "for nobody too");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('tournament_host', 'live_tournament')`)).n, 2, "no overload after running it twice");
eq(await priv("tournament_host"), await priv("tournament_get"), "the grants are still tournament_get's");
eq(await priv("live_tournament"), await priv("tournament_get"), "for both");
eq(await banner(L(1)), B1, "the scorecard's read answers the same");
eq(await banner(L(9)), null, "and null for a link no fixture has");
eq(await fns(), before.fns, "every function from before is as it was (tournament_get among them)");
eq(await columns(), before.columns, "every table has the columns it had, and there is no new table");
eq(await indexes(), before.indexes, "no index was added");

console.log(`tournament_host: ${passed} checks passed`);
