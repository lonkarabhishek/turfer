// Applies 20261121_player_badges.sql (twice) to an in-memory Postgres
// (PGlite) with a stand-in public.users, the real public.usernames table
// and the real private.account_key_ok read from the repo's migrations (so
// no key is written here), and checks: the file's rules (additive, none of
// the destructive keywords even inside a word or a comment, no backslash
// anywhere, search_path '', its header's md5 is the repo's latest body, no
// earlier function replaced, no existing table altered, no foreign key);
// the grants (the table for nobody, the write for the server's key client
// alone, the read for anon and authenticated); a badge kept only with the
// server key, only for an account that exists, only in the shapes the app
// sends; that the same values again write nothing; that "no medal" keeps
// the row and makes none; that the read answers only for people whose
// profile is public, the moment it is asked, at most 60 ids, once each;
// that anon can call the read and can't read the table; and that reading
// writes nothing. Never touches a real database. Made-up people.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/player_badges.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: player_badges.check.mjs <supabase/migrations>");
const NAME = "20261121_player_badges.sql";
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
assert.doesNotMatch(code, /\b(update|insert\s+into)\s+public\.\w+/i, "writes no public table");
assert.doesNotMatch(code, /\balter\s+table\s+(?!private\.player_badges enable row level security)/i, "alters no existing table (only turns row level security on for its own)");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(table\s+)?public\.(?!player_badge_set|player_badges_for)|\bpolicy\b|\btrigger\b|cron\.schedule/i, "no grant or policy on a public table, no trigger, no job");
assert.doesNotMatch(code, /\bemail\b|\bphone\b|profile_image_url|\bname\b/i, "reads and keeps no address, number, photo or name");
assert.doesNotMatch(code, /references\s/i, "no foreign key: nothing here locks public.users");
passed += 9;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq([...MADE].sort(), ["public.player_badge_set", "public.player_badges_for"], "exactly these two functions");
eq([...code.matchAll(/create table if not exists (\w+\.\w+)/gi)].map((m) => m[1]), ["private.player_badges"], "one table, private");
eq((code.match(/\bcreate\s+(unique\s+)?index\b/gi) ?? []).length, 0, "no index beyond the primary key");
eq((code.match(/security definer/g) ?? []).length, 2, "each function is security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 2, "each with an empty search_path");
eq((code.match(/revoke all on function public\.\w+\([^)]*\) from public, anon, authenticated;/g) ?? []).length, 2, "each revoked from public, anon and authenticated before its grant");
for (const w of ["Replaced: none.", "No existing table is altered.", "The app works before this file", "no foreign key to public.users", "clear its row by hand", "production was not read again for this file", "Never in a title, a description, JSON-LD, a share image, an email or a", "asked on every read"])
  ok(NEW.includes(w), `the header says: ${w}`);

// The header's md5: the md5 of the function's latest body in the repo's migrations (file name order), as md5(prosrc) gives it.
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
const CALLED = ["private.account_key_ok"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the one function it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
ok(new RegExp(`private\\.account_key_ok\\s+${HEADER[0].md5}\\b`).test(fs.readFileSync(`${M}/20261118_slot_asks.sql`, "utf8")), "the same md5 20261118_slot_asks.sql read from production on 18 Nov");
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f) && f !== "private.player_badges"));
eq([...calls].sort(), CALLED, "it calls exactly that function");
// Nothing any earlier file made is made again here.
for (const fn of MADE) eq(repoDef(fn), null, `${fn} is new: no earlier file has it`);
for (const file of FILES.filter((f) => f !== NAME)) ok(!/player_badge/.test(fs.readFileSync(`${M}/${file}`, "utf8")), `${file} knows nothing of it`);
// The medal ids the app sends today all fit the table's own check, and the catalog's size fits the count.
const MEDAL_IDS = [...fs.readFileSync(new URL("../../lib/profile/medals.ts", import.meta.url), "utf8").matchAll(/\{ id: "([^"]+)", name: "/g)].map((m) => m[1]);
ok(MEDAL_IDS.length >= 16 && MEDAL_IDS.length <= 99, `the app's ${MEDAL_IDS.length} medals fit the count`);
for (const id of MEDAL_IDS) ok(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id) && id.length <= 32, `the app's medal id ${id} is one the table takes`);

// ── The database before it. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const ACC = fs.readFileSync(`${M}/20261021_accounts_usernames.sql`, "utf8");
const USERNAMES = /create table if not exists public\.usernames \([^;]*\);\nalter table public\.usernames enable row level security;\nrevoke all on public\.usernames from public, anon, authenticated;/.exec(ACC)?.[0];
ok(USERNAMES?.includes("taggable boolean not null default true"), "the real public.usernames, from the repo");
await db.exec(`
create role anon; create role authenticated;
create schema private;
grant usage on schema public to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', 'K' || repeat('7', 63));
create table public.users (id uuid primary key, name text);
${USERNAMES}
`);
await db.exec(repoDef("private.account_key_ok").sql);
const KEY = "K" + "7".repeat(63);

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private;`);
  await assert.rejects(bare.exec(NEW), /player_badges needs/, "without the earlier file it refuses");
  eq((await bare.query(`select to_regclass('private.player_badges') as t`)).rows[0].t, null, "and leaves nothing behind");
  await bare.close();
}

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') order by 1, 2`);
const columnsBefore = await q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// 1 Asha: public profile. 2 Ravi: public profile. 3 Priya: a username, tagging off. 4 Kiran: no username at all.
// 5 Meera: public profile, never a medal. 6: no such account. 7 Neha: public profile.
for (const [n, name] of [[1, "Asha"], [2, "Ravi"], [3, "Priya"], [4, "Kiran"], [5, "Meera"], [7, "Neha"]]) await q(`insert into public.users (id, name) values ($1, $2)`, [U(n), name]);
for (const [n, u, t] of [[1, "asha", true], [2, "ravi_k", true], [3, "priya23", false], [5, "meera_i", true], [7, "neha_j", true]]) await q(`insert into public.usernames (user_id, username, taggable) values ($1, $2, $3)`, [U(n), u, t]);
const usersBefore = await q(`select * from public.users order by id`);
const namesBefore = async () => q(`select user_id, username, taggable, updated_at from public.usernames order by user_id`);
const set = async (key, id, medal, medals) => (await one(`select public.player_badge_set($1, $2, $3, $4) as r`, [key, id, medal, medals])).r;
const read = async (ids) => (await one(`select public.player_badges_for($1::uuid[]) as r`, [ids])).r;
const rows = () => q(`select user_id, medal, medals from private.player_badges order by user_id`);
const row = (n) => one(`select medal, medals, updated_at from private.player_badges where user_id = $1`, [U(n)]);
const count = async () => (await one(`select count(*)::int as n from private.player_badges`)).n;
const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};

// ── 1. Grants. ──
const SIG = { set: "player_badge_set(text, uuid, text, integer)", read: "player_badges_for(uuid[])" };
for (const role of ["anon", "authenticated"]) {
  ok(!(await one(`select has_table_privilege($1, 'private.player_badges', 'select,insert,update') as p`, [role])).p, `${role} can't touch the table`);
  ok((await one(`select has_function_privilege($1, 'public.${SIG.read}', 'execute') as p`, [role])).p, `${role} may call the read`);
}
ok((await one(`select has_function_privilege('anon', 'public.${SIG.set}', 'execute') as p`)).p, "anon (the server's key client) may call the write; the key is the gate");
ok(!(await one(`select has_function_privilege('authenticated', 'public.${SIG.set}', 'execute') as p`)).p, "a signed-in browser may not call the write");
for (const f of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${f}', 'execute') as p`)).p, `public's default execute on ${f} is revoked`);
ok((await one(`select relrowsecurity as r from pg_class where oid = 'private.player_badges'::regclass`)).r, "the table has row level security on");
eq((await one(`select count(*)::int as n from pg_policies where schemaname = 'private' and tablename = 'player_badges'`)).n, 0, "and no policy: nobody reads it but the two functions");
ok(!(await one(`select has_schema_privilege('anon', 'private', 'usage') as p`)).p, "anon has no use of the private schema");
eq((await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'player_badges' order by ordinal_position`)).map((r) => r.column_name),
  ["user_id", "medal", "medals", "updated_at"], "the table's columns: an account, its best medal, how many, and when that changed");
eq((await one(`select count(*)::int as n from pg_constraint where conrelid = 'private.player_badges'::regclass and contype = 'f'`)).n, 0, "no foreign key");
eq((await q(`select proname, prosecdef, proconfig, provolatile from pg_proc where proname in ('player_badge_set', 'player_badges_for') order by 1`)).map((r) => [r.proname, r.prosecdef, r.proconfig, r.provolatile]),
  [["player_badge_set", true, ['search_path=""'], "v"], ["player_badges_for", true, ['search_path=""'], "s"]], "security definer, search_path empty; the read is stable");

// ── 2. A badge in: only with the server key, only for an account, only a badge. ──
for (const k of [null, "", "wrong", KEY + "x", KEY.slice(1)]) eq(await set(k, U(1), "games-25", 7), { r: "unavailable" }, `refused without the server key (${k === null ? "null" : `"${k.slice(0, 5)}"`})`);
eq(await set(KEY, U(6), "games-25", 7), { r: "not_found" }, "an account that doesn't exist");
const BAD = [
  [null, "games-25", 7, "no account"],
  [U(1), "games-25", 0, "a medal with a count of 0"], [U(1), null, 3, "a count with no medal"], [U(1), "games-25", null, "no count"],
  [U(1), "games-25", -1, "a count under 0"], [U(1), "games-25", 100, "a count over 99"],
  [U(1), "", 1, "an empty medal id"], [U(1), "Games-25", 1, "a capital"], [U(1), "games 25", 1, "a space"], [U(1), "games_25", 1, "an underscore"],
  [U(1), "-games", 1, "a leading hyphen"], [U(1), "games-", 1, "a trailing hyphen"], [U(1), "games--25", 1, "two hyphens"], [U(1), "25-games", 1, "a leading digit"],
  [U(1), "<svg>", 1, "markup"], [U(1), "9800000001", 1, "a number"], [U(1), "asha rao", 1, "a name"], [U(1), "a".repeat(33), 1, "over 32 characters"],
];
for (const [id, medal, n, w] of BAD) eq(await set(KEY, id, medal, n), { r: "bad" }, `refused: ${w}`);
eq(await count(), 0, "nothing stored by a refusal");
eq(await read([U(1), U(2), U(3), U(4), U(5)]), [], "nobody has a badge yet: an empty list, never null");

eq(await set(KEY, U(1), "games-25", 7), { r: "ok", changed: true }, "Asha: Turf Veteran, 7 medals");
eq(await rows(), [{ user_id: U(1), medal: "games-25", medals: 7 }], "one row");
// The same again writes nothing.
await db.exec(`update private.player_badges set updated_at = now() - interval '3 days'`);
const t0 = (await row(1)).updated_at;
eq(await set(KEY, U(1), "games-25", 7), { r: "ok", changed: false }, "the same medal and count again: no change");
eq((await row(1)).updated_at, t0, "and nothing was written: updated_at is as it was");
const x0 = (await one(`select xmin::text as x from private.player_badges where user_id = $1`, [U(1)])).x;
for (let i = 0; i < 5; i++) await set(KEY, U(1), "games-25", 7);
eq((await one(`select xmin::text as x from private.player_badges where user_id = $1`, [U(1)])).x, x0, "five more of the same: the row was never rewritten");
// A new count, then a better medal: each one write.
eq(await set(KEY, U(1), "games-25", 8), { r: "ok", changed: true }, "an eighth medal: the count changes");
ok(Date.parse((await row(1)).updated_at) - Date.parse(t0) > 86_400_000, "and updated_at moves");
eq(await set(KEY, U(1), "games-50", 9), { r: "ok", changed: true }, "a better medal");
eq(await rows(), [{ user_id: U(1), medal: "games-50", medals: 9 }], "still one row for her");
eq(await set(KEY, U(1), "a".repeat(32), 99), { r: "ok", changed: true }, "the longest id and the biggest count the table takes");
eq(await set(KEY, U(1), "games-50", 9), { r: "ok", changed: true }, "and back");
// The others.
eq(await set(KEY, U(2), "first-game", 1), { r: "ok", changed: true }, "Ravi: one medal");
eq(await set(KEY, U(3), "hosted-5", 4), { r: "ok", changed: true }, "Priya (tagging off): kept, for when she turns it on");
eq(await set(KEY, U(4), "streak-12", 6), { r: "ok", changed: true }, "Kiran (no username): kept too");
eq(await set(KEY, U(7), "reviews-10", 3), { r: "ok", changed: true }, "Neha");
// No medal: no row for someone who never had one; a row that has one is set to none and kept.
eq(await set(KEY, U(5), null, 0), { r: "ok", changed: false }, "Meera has no medal: nothing is kept about her");
eq(await count(), 5, "no row was made");
eq(await set(KEY, U(7), null, 0), { r: "ok", changed: true }, "Neha's medals are gone (a review was taken down)");
eq(await one(`select medal, medals from private.player_badges where user_id = $1`, [U(7)]), { medal: null, medals: 0 }, "her row says none, and is still there");
eq(await count(), 5, "five rows still");
eq(await set(KEY, U(7), null, 0), { r: "ok", changed: false }, "none again: no change");
// The table itself refuses what the function refuses.
for (const [sql, w] of [
  [`insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', 'Games-25', 1)`, "a capital"],
  [`insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', 'games-25', 0)`, "a medal with a count of 0"],
  [`insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', null, 2)`, "a count with no medal"],
  [`insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', 'games-25', 100)`, "a count over 99"],
  [`insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', '${"a".repeat(33)}', 1)`, "an id over 32 characters"],
]) {
  await assert.rejects(db.query(sql), /check constraint/, `the table refuses ${w}`);
  passed++;
}

// ── 3. The read: only people whose profile is public, the moment it is asked. ──
const ALL = [U(1), U(2), U(3), U(4), U(5), U(6), U(7)];
const first = await read(ALL);
eq(first, [{ id: U(1), m: "games-50", n: 9, u: "asha" }, { id: U(2), m: "first-game", n: 1, u: "ravi_k" }],
  "Asha and Ravi: a medal and a public profile. Not Priya (tagging off), Kiran (no username), Meera (no medal), Neha (none now), or an id that is no account");
ok(first.every((b) => Object.keys(b).sort().join() === "id,m,n,u"), "an id, a medal id, a count and a username: nothing else");
eq(await read([U(3)]), [], "tagging off: no badge, though the row is kept");
eq(await read([U(4)]), [], "no username: no badge");
eq(await read([U(7)]), [], "no medal now: no badge");
eq(await read([U(6)]), [], "an id that is no account says nothing");
// Untaggable hidden at once; back at once.
await db.exec(`update public.usernames set taggable = false where user_id = '${U(1)}'`);
eq(await read(ALL), [{ id: U(2), m: "first-game", n: 1, u: "ravi_k" }], "Asha turns tagging off: her badge is gone on the very next read");
eq((await rows()).find((r) => r.user_id === U(1)), { user_id: U(1), medal: "games-50", medals: 9 }, "her row is kept as it was");
await db.exec(`update public.usernames set taggable = true where user_id = '${U(1)}'; update public.usernames set taggable = true where user_id = '${U(3)}'`);
eq(await read(ALL), [{ id: U(1), m: "games-50", n: 9, u: "asha" }, { id: U(2), m: "first-game", n: 1, u: "ravi_k" }, { id: U(3), m: "hosted-5", n: 4, u: "priya23" }], "back on, and Priya on: both show at once");
await db.exec(`update public.usernames set taggable = false where user_id = '${U(3)}'`);
// A new username is the one sent.
await db.exec(`update public.usernames set username = 'asha_rao' where user_id = '${U(1)}'`);
eq((await read([U(1)]))[0].u, "asha_rao", "a changed username is read, not kept");
await db.exec(`update public.usernames set username = 'asha' where user_id = '${U(1)}'`);
// Shapes of the ask.
eq(await read([]), [], "no ids: an empty list");
eq(await read(null), [], "null: an empty list");
eq(await read([null, U(2), null]), [{ id: U(2), m: "first-game", n: 1, u: "ravi_k" }], "nulls among the ids are skipped");
eq(await read([U(2), U(2), U(2), U(1), U(2)]), [{ id: U(1), m: "games-50", n: 9, u: "asha" }, { id: U(2), m: "first-game", n: 1, u: "ravi_k" }], "an id asked five times is answered once; sorted by id");
// The cap: the first 60 ids, counted as elements.
const filler = (n) => Array.from({ length: n }, (_, i) => U(1000 + i));
eq(await read([...filler(59), U(1), U(2)]), [{ id: U(1), m: "games-50", n: 9, u: "asha" }], "the 60th id is read, the 61st is not");
eq(await read([...filler(60), U(1), U(2)]), [], "ids past the first 60 are not read");
eq(await read([U(2), ...filler(500), U(1)]), [{ id: U(2), m: "first-game", n: 1, u: "ravi_k" }], "however long the list");
eq((await one(`select public.player_badges_for(array[array[$1::uuid, $2::uuid], array[$2::uuid, $1::uuid]]) as r`, [U(1), U(2)])).r.length, 2, "a many-dimensional array is read as its elements");
{
  // 61 real badge holders asked in one go: 60 answers.
  await db.exec(`insert into public.users (id, name) select ('00000000-0000-4000-8000-' || lpad((2000 + i)::text, 12, '0'))::uuid, 'P' || i from generate_series(1, 61) i`);
  await db.exec(`insert into public.usernames (user_id, username) select ('00000000-0000-4000-8000-' || lpad((2000 + i)::text, 12, '0'))::uuid, 'player_' || i from generate_series(1, 61) i`);
  for (let i = 1; i <= 61; i++) await set(KEY, U(2000 + i), "first-game", 1);
  const many = await read(Array.from({ length: 61 }, (_, i) => U(2001 + i)));
  eq(many.length, 60, "61 badge holders asked about: 60 answered");
  ok(!many.some((b) => b.id === U(2061)), "the 61st is the one left out");
}

// ── 4. As the browser: anon and a signed-in session can call the read; neither can read or write the table, or use the write without the key. ──
for (const role of ["anon", "authenticated"]) {
  eq((await as(role, `select public.player_badges_for($1::uuid[]) as r`, [[U(1), U(3)]]))[0].r, [{ id: U(1), m: "games-50", n: 9, u: "asha" }], `${role} gets the badge of a public profile, and nothing for a hidden one`);
  await assert.rejects(as(role, `select * from private.player_badges`), /permission denied/, `${role} can't read the table`);
  await assert.rejects(as(role, `insert into private.player_badges (user_id, medal, medals) values ('${U(5)}', 'games-50', 9)`), /permission denied/, `${role} can't write the table`);
  await assert.rejects(as(role, `update private.player_badges set medal = 'games-50', medals = 16`), /permission denied/, `${role} can't change the table`);
  await assert.rejects(as(role, `select * from public.usernames`), /permission denied/, `${role} can't read usernames either: the read tells only what it returns`);
  passed += 4;
}
eq((await as("anon", `select public.player_badge_set($1, $2, 'games-50', 16) as r`, ["guess", U(2)]))[0].r, { r: "unavailable" }, "anon with a guessed key changes nothing");
await assert.rejects(as("authenticated", `select public.player_badge_set($1, $2, 'games-50', 16) as r`, [KEY, U(2)]), /permission denied/, "a signed-in browser can't call the write even with a key");
passed++;
eq((await as("anon", `select public.player_badge_set($1, $2, 'games-10', 2) as r`, [KEY, U(2)]))[0].r, { r: "ok", changed: true }, "the server (anon key and the server key) can");
eq(await one(`select medal, medals from private.player_badges where user_id = $1`, [U(2)]), { medal: "games-10", medals: 2 }, "and Ravi's badge changed");
eq(await set(KEY, U(2), "first-game", 1), { r: "ok", changed: true }, "put back");

// ── 5. An account that is gone: its row is never read; cleared by hand. ──
await db.exec(`update public.usernames set taggable = false where user_id = '${U(2)}'`);
eq(await read([U(2)]), [], "an account with no public username is never answered for, whatever its row says");
await db.exec(`update public.usernames set taggable = true where user_id = '${U(2)}'`);

// ── 6. Reading writes nothing; safe to run again. ──
const c1 = await count();
const r1 = await rows();
const n1 = await namesBefore();
await read(ALL); await read(filler(100)); await read(null);
eq(await count(), c1, "reads change no row");
eq(await rows(), r1, "and no value");
await db.exec(`begin; ${NEW}; commit;`);
eq(await rows(), r1, "run again: the badges stay");
eq(await read(ALL), [{ id: U(1), m: "games-50", n: 9, u: "asha" }, { id: U(2), m: "first-game", n: 1, u: "ravi_k" }], "and read the same");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('player_badge_set', 'player_badges_for')`)).n, 2, "no overload after running it twice");
eq((await one(`select count(*)::int as n from pg_indexes where schemaname = 'private' and tablename = 'player_badges'`)).n, 1, "the primary key's index, once");
for (const role of ["anon", "authenticated"]) ok(!(await one(`select has_table_privilege($1, 'private.player_badges', 'select,insert,update') as p`, [role])).p, `${role} still can't touch the table`);
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname not in ('player_badge_set', 'player_badges_for') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq(await q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') and table_name <> 'player_badges' order by 1, 2, ordinal_position`), columnsBefore, "every table from before has the columns it had");
eq((await q(`select * from public.users order by id`)).filter((u) => !/^P[0-9]+$/.test(u.name)), usersBefore, "public.users is never written");
eq(await namesBefore(), n1, "public.usernames is never written by a read or by the file");

console.log(`player_badges: ${passed} checks passed`);
