// Applies 20261128_usernames_assigned.sql (twice) to an in-memory Postgres
// (PGlite) built from the repo's own migrations where it matters: the real
// public.usernames and public.username_history, the real username rules,
// check, pick and set, the real public readers of usernames (the profile
// page, player search, the verified names, the profile's owner, the medal
// badge, a tournament's organiser, "Managed by", a game's tagged players,
// live tags), the real "is this account empty" rule, and the real push and
// email triggers on public.notifications with pg_net replaced by a table
// that records what would be posted. Everything else is a small stand-in.
//
// It checks: the file's rules (none of the destructive keywords even inside
// a word or a comment, no backslash, additive, no earlier function made
// again, its header's md5s are the repo's latest bodies); the name rules
// against lib/account/assigned.cases.json (the same file the unit test
// runs); collisions, reserved words, never-reuse, names with no usable
// letters, and that nothing of a phone number or an email is used; the
// backfill (who is given one, who is not, two people with one name, run
// twice is once); that public.usernames is never written by it, so every
// public reader answers exactly as before for an account that was only
// given a name; keep; change (free of the 3 in 30 days limit); a new
// account; a name waiting for someone else is taken; and that no email is
// queued and no push is sent for the notice. Never touches a real
// database. Made-up people.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/usernames_assigned.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: usernames_assigned.check.mjs <supabase/migrations>");
const NAME = "20261128_usernames_assigned.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
const CASES = JSON.parse(fs.readFileSync(`${M}/../../lib/account/assigned.cases.json`, "utf8"));
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── 0. The file. ──
const code = NEW.replace(/^\s*--.*$/gm, "");
assert.doesNotMatch(NEW, /drop|delete|truncate/i, "none of the destructive keywords, not in a comment, not inside a word");
assert.ok(!NEW.includes(String.fromCharCode(92)), "no backslash anywhere in the file");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
assert.match(NEW, /^set local lock_timeout = '5s';\n/, "starts with the lock timeout");
assert.ok(code.indexOf("do $$") >= 0 && code.indexOf("do $$") < code.indexOf("create "), "the guard comes before anything is made");
assert.doesNotMatch(code, /\balter\s+table\s+(?!private\.username_assigned enable row level security)/i, "alters no existing table (only turns row level security on for its own)");
assert.doesNotMatch(code, /\b(insert\s+into|update)\s+public\.(?!notifications\b)\w+/i, "the only public table it writes is notifications");
assert.doesNotMatch(code, /(insert\s+into|update)\s+public\.usernames|(insert\s+into|update)\s+public\.username_history|(insert\s+into|update)\s+public\.users/i, "never public.usernames, its history or public.users");
assert.doesNotMatch(code, /\bpolicy\b|\btrigger\b|cron\.schedule|disable|session_replication_role/i, "no policy, no trigger made, altered or switched off, no job");
assert.doesNotMatch(code, /phone/i, "the code never reads a phone number");
assert.doesNotMatch(code, /references\s/i, "no foreign key: nothing here locks public.users");
passed += 11;
const MADE = [...code.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq([...MADE].sort(), ["private.username_assign", "private.username_from_name", "private.username_is_free", "public.username_check_all", "public.username_choose", "public.username_ensure"], "exactly these six functions");
eq([...code.matchAll(/create table if not exists (\w+\.\w+)/gi)].map((m) => m[1]), ["private.username_assigned"], "one table, private");
eq((code.match(/security definer/g) ?? []).length, 6, "each function is security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 6, "each with an empty search_path");
eq((code.match(/revoke all on function (public|private)\.\w+\([^)]*\) from public, anon, authenticated;/g) ?? []).length, 6, "each revoked from public, anon and authenticated");
eq([...code.matchAll(/grant execute on function (\w+\.\w+)\([^)]*\) to anon, authenticated;/g)].map((m) => m[1]).sort(), ["public.username_check_all", "public.username_choose", "public.username_ensure"], "only the three server functions are granted (the key is the gate)");
// The header, its comment lines joined so a phrase can cross a line end.
const HEAD = NEW.split("\n").filter((l) => l.startsWith("--")).map((l) => l.replace(/^--\s?/, "").trim()).join(" ").replace(/\s+/g, " ");
for (const w of [
  '"please make picking username easy. Like assign user name already, let them decide if they want to keep it. Also for people who dont have usernames, assign them one"',
  "nobody becomes findable, taggable or publicly visible because TapTurf gave them a username",
  "A given username is NOT a row of public.usernames.",
  "Replaced: none.",
  "production was not read for this file",
  "To undo by hand, removing no row.",
  "The app works before this file",
  "about 414 rows",
  "No email is queued.",
  "Safe to run again.",
  "public.users.phone is never read.",
  "clear its private.username_assigned row by hand",
]) ok(HEAD.includes(w), `the header says: ${w}`);

// The repo's migrations in the order they were applied: file name order, but 20261021_accounts_fixes.sql is the
// review of 20261021_accounts_usernames.sql and came after it.
const FILES = fs.readdirSync(M).filter((f) => f.endsWith(".sql")).sort();
{
  const a = FILES.indexOf("20261021_accounts_fixes.sql");
  const b = FILES.indexOf("20261021_accounts_usernames.sql");
  ok(a >= 0 && b === a + 1, "the two 21 Oct account files sit together");
  FILES.splice(a, 2, "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql");
  ok(/fixes from the review of 20261021_accounts_usernames\.sql/.test(fs.readFileSync(`${M}/20261021_accounts_fixes.sql`, "utf8")), "the fixes file says it came after");
}
const TEXT = new Map(FILES.map((f) => [f, fs.readFileSync(`${M}/${f}`, "utf8")]));
const repoDef = (fn) => {
  const [s, f] = fn.split(".");
  let last = null;
  for (const file of FILES) {
    if (file === NAME) continue;
    const txt = TEXT.get(file);
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
const HEADER = [...NEW.matchAll(/^--\s+(public|private)\.(\w+)\s+([0-9a-f]{32})\b(?:\s+(\S+\.sql))?/gm)].map((m) => ({ fn: `${m[1]}.${m[2]}`, md5: m[3], file: m[4] ?? null }));
const CALLED = ["private.account_key_ok", "private.username_problem", "public.username_check", "public.username_set"];
eq(HEADER.map((h) => h.fn).sort(), CALLED, "the header lists the four functions it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f) && f !== "private.username_assigned" && f !== "public.notifications" && f !== "private.push_sends"));
eq([...calls].sort(), CALLED, "it calls exactly those functions");
for (const fn of MADE) eq(repoDef(fn), null, `${fn} is new: no earlier file has it`);
for (const file of FILES.filter((f) => f !== NAME)) ok(!/username_assigned|username_ensure|username_choose|username_check_all|username_from_name|username_is_free/.test(TEXT.get(file)), `${file} knows nothing of the given names: no earlier or later function can read one`);

// Every function in the repo whose latest body reads public.usernames: the list this file was checked against.
// A new reader shows up here, so it gets looked at too.
const READERS = {
  // Public reads, each only where the row is taggable.
  "public.profile_get": "taggable", "public.players_search": "taggable", "public.usernames_verified": "taggable", "public.profile_owner": "taggable",
  "public.player_badges_for": "taggable", "public.tournament_host": "taggable", "public.turf_managers": "taggable", "public.game_tags_shown": "taggable",
  "public.game_tags_for": "taggable", "private.game_tags_add": "taggable", "public.live_tags_check": "taggable", "public.played_with_extras": "taggable",
  // The person's own profile, the owner's own home, the site owner's lists, and the username writes: any row.
  "private.profile_json": "own", "public.owner_home": "own", "private.account_is_empty": "any",
  "public.admin_live_links2": "admin", "public.admin_map_usage": "admin", "public.admin_owner_claims": "admin", "public.admin_people": "admin",
  "public.admin_tool_activity": "admin", "public.admin_tool_users": "admin", "public.admin_user_details": "admin",
  "public.username_check": "write", "public.username_pick": "write", "public.username_set": "write",
};
{
  const all = new Set();
  for (const file of FILES) {
    if (file === NAME) continue;
    for (const m of TEXT.get(file).matchAll(/create\s+(?:or\s+replace\s+)?function\s+(\w+)\.(\w+)\s*\(/gi)) all.add(`${m[1]}.${m[2]}`);
  }
  const found = [...all].filter((fn) => /public\.usernames\b/.test(repoDef(fn)?.body ?? "")).sort();
  eq(found, Object.keys(READERS).sort(), "the readers of public.usernames in the repo are the ones checked here");
  // The public ones each ask the switch (taggable). That alone would hide a private row; a given name is not even a row.
  for (const [fn, kind] of Object.entries(READERS)) if (kind === "taggable") ok(/[.]taggable\b/.test(repoDef(fn).body), `${fn} asks the switch`);
}

// ── The database before it. ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const table = (file, name) => {
  const txt = TEXT.get(file);
  const at = txt.indexOf(`create table if not exists ${name} (`);
  assert.ok(at >= 0, `${file} has ${name}`);
  return txt.slice(at, txt.indexOf("\n);", at) + 3);
};
const KEY = "K" + "7".repeat(63);
const LIVE = "L" + "5".repeat(63);
await db.exec(`
create role anon; create role authenticated;
create schema private; create schema auth; create schema net;
grant usage on schema public to anon, authenticated;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', '${KEY}'), ('live_write', '${LIVE}'), ('revalidate', 'R-secret');
create table public.users (id uuid primary key, name text, email text unique, phone text, role text default 'user', profile_image_url text, created_at timestamptz not null default now());
create table auth.users (id uuid primary key, email text);
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text not null, title text, message text, metadata jsonb, is_read boolean default false, created_at timestamptz not null default now());
${table("20261021_accounts_usernames.sql", "public.usernames")}
${table("20261021_accounts_usernames.sql", "public.username_history")}
${table("20261021_accounts_fixes.sql", "private.username_changes")}
${table("20261102_web_push.sql", "private.push_subscriptions")}
${table("20261102_web_push.sql", "private.push_sends")}
create unique index push_sends_notification_uidx on private.push_sends (notification_id) where notification_id is not null;
create table private.user_contact_emails (user_id uuid primary key, email text);
create table private.account_google_links (id bigint generated always as identity primary key, auth_uid uuid not null, user_id uuid not null, email text, ended_at timestamptz);
-- What the readers join.
create table private.player_badges (user_id uuid primary key, medal text, medals smallint not null default 0);
create table private.tournaments (code text primary key, user_id uuid, status text not null default 'on');
create table public.turfs (id uuid primary key, is_active boolean not null default true, owner_id uuid);
create table public.turf_owners (turf_id uuid, user_id uuid, user_key text, role text, status text, decided_at timestamptz, created_at timestamptz default now());
create table public.games (id uuid primary key, creator_id uuid, status text);
create table public.game_participants (game_id uuid, user_id uuid);
create table private.game_tags (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, host_id uuid, status text default 'pending', shown boolean default true, created_at timestamptz default now());
create table public.game_requests (user_id uuid);
create table public.reviews (user_id uuid);
create table public.review_votes (user_id uuid);
create table public.turf_suggestions (user_id uuid);
create table public.bookings (user_id uuid);
create table public.live_matches (code text primary key, match jsonb);
-- Small stand-ins for what those functions call and this file does not touch.
create function private.user_verified(p_user_id uuid) returns boolean language sql stable as $$ select false $$;
create function private.account_for_key(p_key text) returns uuid language sql stable as $$ select null::uuid $$;
create function public._phone10(p text) returns text language sql immutable as $$ select right(p, 10) $$;
create function private.profile_json(p_user_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'name', u.name, 'username', n.username, 'taggable', coalesce(n.taggable, true))
    from public.users u left join public.usernames n on n.user_id = u.id where u.id = p_user_id $$;
-- pg_net: what would be posted after commit.
create table net.posts (n bigint generated always as identity primary key, url text, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$
  insert into net.posts (url, body) values (url, body) returning n $$;
-- The email queue's two ways in, recording instead of queueing.
create table private.email_asks (n bigint generated always as identity primary key, user_id uuid, kind text);
create function private.email_queue(p_user_id uuid, p_kind text, p_dedupe text, p_refs jsonb, p_due timestamptz default now()) returns void language sql as $$
  insert into private.email_asks (user_id, kind) values (p_user_id, p_kind) $$;
create function private.email_join(p_user_id uuid, p_kind text, p_game uuid, p_key text, p_value jsonb, p_extra jsonb default '{}'::jsonb) returns boolean language sql as $$ select false $$;
`);
const REAL = [
  "private.account_key_ok", "private.live_key_ok", "private.username_problem", "public.username_check", "public.username_pick", "public.username_set",
  "public.profile_get", "public.players_search", "public.usernames_verified", "public.profile_owner", "public.player_badges_for", "public.tournament_host",
  "public.turf_managers", "public.game_tags_shown", "public.game_tags_for", "public.live_tags_check", "private.account_is_empty",
  "private.push_url", "private.push_targets_of", "public.push_targets", "private.push_on_notification",
  "private.email_kind_of", "private.email_uuid", "private.email_on_notification",
];
for (const fn of REAL) await db.exec(repoDef(fn).sql);
eq(repoDef("public.username_set").file, "20261021_accounts_fixes.sql", "the username write is the one from the fixes file (3 changes in 30 days, counted from a log)");
await db.exec(`
create trigger notifications_push after insert on public.notifications for each row execute function private.push_on_notification();
create trigger notifications_email after insert on public.notifications for each row execute function private.email_on_notification();
`);
ok(/create or replace trigger notifications_push\s+after insert on public\.notifications\s+for each row\s+execute function private\.push_on_notification\(\);/.test(TEXT.get("20261102_web_push.sql")), "the push trigger, as its file makes it");
ok(/create or replace trigger notifications_email\s+after insert on public\.notifications\s+for each row\s+execute function private\.email_on_notification\(\);/.test(TEXT.get("20261110_email.sql")), "the email trigger, as its file makes it");

// Refuses to run without what it needs, changing nothing.
{
  const bare = new PGlite();
  await bare.exec(`create role anon; create role authenticated; create schema private; create schema auth;`);
  await assert.rejects(bare.exec(NEW), /usernames_assigned needs/, "without the earlier files it refuses");
  eq((await bare.query(`select to_regclass('private.username_assigned') as t`)).rows[0].t, null, "and leaves nothing behind");
  await bare.close();
}

// ── Fixture (made-up people). ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (n) => `2026-0${1 + Math.floor(n / 28)}-${String(1 + (n % 28)).padStart(2, "0")}T10:00:00Z`;
// n, name, email, phone, username (already chosen), taggable
const PEOPLE = [
  [1, "Asha Rao", null, "+919800000001", "asha", true],            // a public profile
  [2, "Meera Kulkarni", null, "+919800000002", "meera_k", false],  // a username, tagging off
  [3, "Kabir Sethi", "kabir.sethi@example.com", null, "kabir", true], // a Google account with a public profile
  [4, "Asha Rao", null, "+919800000004", null, null],              // -> asha_rao (the oldest of three with one name)
  [5, "asha rao", "asha.r@example.com", null, null, null],         // -> asha_rao2
  [6, "ASHA  RAO", null, "+919800000006", null, null],             // -> asha_rao3
  [7, "Kabir", null, "+919800000007", null, null],                 // "kabir" is someone's username -> kabir2
  [8, "Zoya Khan", null, "+919800000008", null, null],             // "zoya_khan" is in the history (someone moved away from it) -> zoya_khan2
  [9, "आशुतोष पाटील", null, "+919800000009", null, null],            // -> turfer1
  [10, "தமிழ் செல்வன்", null, "+919800000010", null, null],           // -> turfer2
  [11, "9800000011", null, "+919800000011", null, null],           // the name is their number -> turfer3, nothing of the number
  [12, "nina.dsouza77", "nina.dsouza77@example.com", null, null, null], // a Google account whose name is its email's first part -> turfer4
  [13, "Padmini Iyer", null, "+919800000013", null, null],         // the rules refuse "admin" inside a name -> turfer5
  [14, "Rohan Verma 9800000014", null, "+919800000014", null, null], // -> rohan_verma, no digit
  [15, "Sudarshanprasad Venkataramanan", null, "+919800000015", null, null], // -> sudarshanprasad
  [16, "Ira Bose", "ira@example.com", null, null, null],           // a Google account that cannot be signed in to: left out
  [17, "Dev Malhotra", null, "+919800000017", null, null],         // -> dev_malhotra; has a phone with push on
  [18, "Tara Sen", null, "+919800000018", null, null],             // -> tara_sen; runs a turf, started a tournament, has a medal, is tagged in a game
  [19, "Omar", "omar.held@example.com", null, null, null],         // users.email is empty (held by another), the name came from the Google address -> see below
  [20, "Farhan Akhtar-Khan", null, "+919800000020", "farhan", true], // a public profile; the old name zoya_khan is theirs
];
for (const [n, name, email, phone] of PEOPLE) await q(`insert into public.users (id, name, email, phone, created_at) values ($1, $2, $3, $4, $5)`, [U(n), name, n === 19 ? null : email, phone, day(n)]);
for (const [n, , email] of PEOPLE) if (email) await q(`insert into auth.users (id, email) values ($1, $2)`, [U(n), email]);
// 19: made by Google sign-in with no name, so its name is the first part of its Google address, which another account holds.
await q(`update public.users set name = 'omar.held' where id = $1`, [U(19)]);
for (const [n, , , , u, t] of PEOPLE) if (u) await q(`insert into public.usernames (user_id, username, taggable) values ($1, $2, $3)`, [U(n), u, t]);
await q(`insert into public.username_history (username, user_id) values ('zoya_khan', $1)`, [U(20)]);
// 16's Google sign-in opens account 1 (added from its profile): nobody can sign in to 16.
await q(`insert into private.account_google_links (auth_uid, user_id, email) values ($1, $2, 'ira@example.com')`, [U(16), U(1)]);
// A typed contact email whose first part is the account's name: also never a source.
await q(`insert into public.users (id, name, phone, created_at) values ($1, 'gauri.k', '+919800000021', $2)`, [U(21), day(21)]);
await q(`insert into private.user_contact_emails (user_id, email) values ($1, 'gauri.k@example.com')`, [U(21)]);
// Push on: 17 (given a name by the backfill) and 1 (has a username; for the control).
const sub = (n, tag) => q(`insert into private.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [U(n), `https://push.example.com/${tag}/${"x".repeat(20)}`, "B".repeat(87), "a".repeat(22)]);
await sub(17, "dev"); await sub(1, "asha");
// 18 runs a turf, started a tournament, has a medal and is tagged in 1's game; so are 1 and 2 (the controls).
const TURF = U(900); const GAME = U(800);
await q(`insert into public.turfs (id) values ($1)`, [TURF]);
for (const n of [1, 2, 18]) await q(`insert into public.turf_owners (turf_id, user_id, role, status) values ($1, $2, 'owner', 'active')`, [TURF, U(n)]);
for (const [n, c] of [[1, "aaaaaaaaaaa1"], [2, "aaaaaaaaaaa2"], [18, "aaaaaaaaaa18"]]) await q(`insert into private.tournaments (code, user_id) values ($1, $2)`, [c, U(n)]);
for (const n of [1, 2, 18, 4]) await q(`insert into private.player_badges (user_id, medal, medals) values ($1, 'games-10', 3)`, [U(n)]);
await q(`insert into public.games (id, creator_id, status) values ($1, $2, 'open')`, [GAME, U(3)]);
for (const n of [1, 2, 18, 4]) await q(`insert into private.game_tags (game_id, user_id, host_id) values ($1, $2, $3)`, [GAME, U(n), U(3)]);
const GIVEN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 21];
const WANT = { 4: "asha_rao", 5: "asha_rao2", 6: "asha_rao3", 7: "kabir2", 8: "zoya_khan2", 9: "turfer1", 10: "turfer2", 11: "turfer3", 12: "turfer4", 13: "turfer5", 14: "rohan_verma", 15: "sudarshanprasad", 17: "dev_malhotra", 18: "tara_sen", 19: "turfer6", 21: "turfer7" };

// What every public reader answers, for every account and every name that will be given.
const ALL_IDS = PEOPLE.map((p) => U(p[0])).concat(U(21));
const NAMES_TO_ASK = [...new Set([...Object.values(WANT), "asha", "meera_k", "kabir", "farhan", "zoya_khan", "asha_rao4", "turfer", "turfer8"])];
const SEARCHES = ["asha", "as", "rao", "kabir", "turfer", "tara", "dev", "zoya", "ro", "sud", "ira", "omar", "gauri", "nina", "padmini", "@asha_rao", "tu"];
const r1 = async (sql, params) => (await one(`select ${sql} as r`, params)).r;
async function readers() {
  const out = {};
  for (const u of NAMES_TO_ASK) {
    out[`profile_get ${u}`] = await r1(`public.profile_get($1)`, [u]);
    out[`profile_owner ${u}`] = await r1(`public.profile_owner($1, $2)`, [KEY, u]);
  }
  for (const s of SEARCHES) out[`players_search ${s}`] = await r1(`public.players_search($1, $2)`, [KEY, s]);
  out.usernames_verified = await q(`select * from public.usernames_verified($1::text[])`, [NAMES_TO_ASK]);
  out.live_tags_check = await r1(`public.live_tags_check($1, $2::text[])`, [LIVE, NAMES_TO_ASK]);
  out.player_badges_for = await r1(`public.player_badges_for($1::uuid[])`, [ALL_IDS]);
  for (const c of ["aaaaaaaaaaa1", "aaaaaaaaaaa2", "aaaaaaaaaa18"]) out[`tournament_host ${c}`] = await r1(`public.tournament_host($1, $2)`, [LIVE, c]);
  out.turf_managers = await r1(`public.turf_managers($1)`, [TURF]);
  out.game_tags_shown = await r1(`public.game_tags_shown($1, $2)`, [KEY, GAME]);
  out.game_tags_for = await r1(`public.game_tags_for($1, $2, $3)`, [KEY, U(3), GAME]);
  for (const id of ALL_IDS) out[`account_is_empty ${id}`] = await r1(`private.account_is_empty($1)`, [id]);
  for (const u of NAMES_TO_ASK) out[`username_pick ${u}`] = await r1(`public.username_pick($1, $2::text[])`, [KEY, [u]]);
  return out;
}
const namesNow = () => q(`select user_id, username, taggable, changes, window_start, created_at, updated_at, xmin::text as x from public.usernames order by user_id`);
const historyNow = () => q(`select username, user_id, released_at, xmin::text as x from public.username_history order by username`);
const usersNow = () => q(`select *, xmin::text as x from public.users order by id`);
const waiting = async () => Object.fromEntries((await q(`select user_id, username from private.username_assigned where chosen_at is null order by user_id`)).map((r) => [Number(r.user_id.slice(-4)), r.username]));
const rowOf = (n) => one(`select username, source, chosen_how, chosen_at is not null as chosen from private.username_assigned where user_id = $1`, [U(n)]);

const readersBefore = await readers();
const namesBefore = await namesNow();
const historyBefore = await historyNow();
const usersBefore = await usersNow();
// The controls answer, so the readers above are really reading.
eq(readersBefore["profile_get asha"]?.u, "asha", "control: a public profile is found");
eq(readersBefore["profile_get meera_k"], null, "control: a username with tagging off has no public profile");
eq(readersBefore["profile_get zoya_khan"], { moved_to: "farhan" }, "control: an old name points to its owner's new one");
eq(readersBefore["players_search asha"].players.map((p) => p.u), ["asha"], "control: search finds the one public Asha, not the three without a username");
eq(readersBefore.player_badges_for.map((b) => b.u), ["asha"], "control: the medal badge only for the public profile (2 is hidden, 4 and 18 have no username)");
eq(readersBefore["tournament_host aaaaaaaaaaa1"]?.u, "asha", "control: a tournament's organiser with a public profile");
eq(readersBefore["tournament_host aaaaaaaaaa18"], null, "control: an organiser with no username is not named");
eq(readersBefore.turf_managers.managers.map((m) => m.u), ["asha"], "control: Managed by names the one public profile");
eq(readersBefore.game_tags_shown.tags.map((t) => t.u), ["asha"], "control: a game's tagged players are the public profile only");
eq(readersBefore[`account_is_empty ${U(4)}`], true, "control: an account that did nothing is empty");
eq(readersBefore[`account_is_empty ${U(1)}`], false, "control: one with a username is not");

const before = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private','net') order by 1, 2`);
const columnsBefore = await q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private', 'auth') order by 1, 2, ordinal_position`);
const triggersBefore = await q(`select tgrelid::regclass::text as t, tgname, tgenabled from pg_trigger where not tgisinternal order by 1, 2`);

// ── 1. The file, once. ──
await db.exec(`begin; ${NEW}; commit;`);

eq(await waiting(), WANT, "each account with no username was given one, made from its name");
eq((await q(`select distinct source from private.username_assigned`)).map((r) => r.source), ["backfill"], "all by the backfill");
eq(await rowOf(16), undefined, "the Google account that opens another account was left out");
for (const n of [1, 2, 3, 20]) eq(await rowOf(n), undefined, `account ${n} has a username: it was given nothing`);
eq((await one(`select count(*)::int as n from private.username_assigned`)).n, GIVEN.length, "one row each, no more");
// Two people with one name: the older account has the plain one.
eq([WANT[4], WANT[5], WANT[6]], ["asha_rao", "asha_rao2", "asha_rao3"], "three people named Asha Rao in one batch: three different names, oldest first");
eq((await one(`select count(distinct username)::int as n from private.username_assigned`)).n, GIVEN.length, "no two accounts were given one name");
// Never one that someone has or had.
const used = new Set([...(await q(`select username from public.usernames`)).map((r) => r.username), ...(await q(`select username from public.username_history`)).map((r) => r.username)]);
for (const [n, u] of Object.entries(WANT)) {
  ok(!used.has(u), `${u} is nobody's username, now or before`);
  ok(/^[a-z][a-z0-9_]{2,19}$/.test(u), `${u} has a username's form`);
  eq(await r1(`private.username_problem($1)`, [u]), null, `${u} passes the username rules`);
  // Nothing of the phone number or of an address: no run of 3 digits of the number, and not the address's first part.
  const p = PEOPLE.find((x) => x[0] === Number(n));
  const phone = (p?.[3] ?? "+919800000021").slice(3);
  for (let i = 0; i + 3 <= phone.length; i++) assert.ok(!u.includes(phone.slice(i, i + 3)), `${u} carries no part of the number`);
  passed++;
}
eq(WANT[12], "turfer4", "a Google account named after its email: nothing of the address is used");
eq(WANT[19], "turfer6", "the same when the address is only on the Google sign-in (auth.users), not on public.users");
eq(WANT[21], "turfer7", "and when the name is the first part of a typed contact email");
eq(WANT[11], "turfer3", "a name that is a phone number gives nothing of it");
eq(WANT[14], "rohan_verma", "a number typed after a name is left out");

// public.usernames, its history and public.users: not one row written, not one value changed.
eq(await namesNow(), namesBefore, "public.usernames is exactly as it was (same rows, same row versions)");
eq(await historyNow(), historyBefore, "public.username_history is exactly as it was");
eq(await usersNow(), usersBefore, "public.users is exactly as it was");
eq((await one(`select count(*)::int as n from private.username_changes`)).n, 0, "no username change was logged");
// So every public reader answers exactly as before, for every account and every given name.
const readersAfter = await readers();
for (const k of Object.keys(readersBefore)) eq(readersAfter[k], readersBefore[k], `the same answer as before: ${k}`);
for (const u of Object.values(WANT)) {
  eq(readersAfter[`profile_get ${u}`], null, `no public profile at /u/${u}`);
  eq(readersAfter[`profile_owner ${u}`], { r: "ok", id: null }, `${u} names no account to a profile read`);
}
// (username_pick is left out of this one: it is the server's own "is this name free" for a suggestion, behind the key, and shows nothing of anyone.)
ok(!JSON.stringify(Object.fromEntries(Object.entries(readersAfter).filter(([k]) => !k.startsWith("username_pick ")))).match(new RegExp(`"(${Object.values(WANT).join("|")})"`)), "no reader's answer carries a given name anywhere");
eq(readersAfter["players_search turfer"].players, [], "search finds nobody by a given name");
eq(readersAfter["players_search tara"].players, [], "nor by the name of someone who was only given one");
eq(readersAfter.player_badges_for.map((b) => b.id), [U(1)], "no medal badge for an account that was only given a name");
eq(readersAfter["tournament_host aaaaaaaaaa18"], null, "no name on their tournament");
eq(readersAfter.turf_managers, { managers: [{ u: "asha", v: false }], more: 0 }, "not in Managed by");
eq(readersAfter.game_tags_shown.tags.map((t) => t.u), ["asha"], "not in a game's tagged players");
eq(readersAfter.live_tags_check.tags.map((t) => t.u).sort(), ["asha", "farhan", "farhan", "kabir"].sort(), "live tags resolve only public profiles (the old name to its owner)");
for (const n of GIVEN) eq(readersAfter[`account_is_empty ${U(n)}`], readersBefore[`account_is_empty ${U(n)}`], `account ${n} is as empty as it was: adding Google over it still works`);
eq(readersAfter[`account_is_empty ${U(5)}`], true, "an account that was only given a name is still empty");

// The notice: one each, in the app only.
const notes = await q(`select user_id, type, title, message, metadata, is_read from public.notifications order by user_id`);
eq(notes.length, GIVEN.length, "one notification for each account given a name");
eq(notes.map((n) => Number(n.user_id.slice(-4))), GIVEN, "to exactly those accounts");
for (const n of notes) {
  const u = WANT[Number(n.user_id.slice(-4))];
  eq([n.type, n.title, n.message, n.is_read], [CASES.notice.type, CASES.notice.title, CASES.notice.message.replace("{username}", u), false], `the notice for @${u}, in the words of the cases file`);
  eq(n.metadata, { username: u }, "its metadata names no game");
}
// No email: the trigger ran and asked for none.
eq((await one(`select count(*)::int as n from private.email_asks`)).n, 0, "no email was queued");
eq(await r1(`private.email_kind_of($1)`, [CASES.notice.type]), null, "because the email trigger knows no such type");
// No push: every notice is claimed already, so the dispatch finds nothing to send.
const sends = await q(`select s.kind, s.targets, s.sent, s.gone, s.failed, s.reported_at is not null as reported, s.user_id = n.user_id as same from private.push_sends s join public.notifications n on n.id = s.notification_id`);
eq(sends.length, GIVEN.length, "one claim per notice");
ok(sends.every((s) => s.kind === "notification" && s.targets === 0 && s.sent === 0 && s.gone === 0 && s.failed === 0 && s.reported && s.same), "each says: 0 phones, 0 sent, done");
const posts = await q(`select url, body from net.posts order by n`);
eq(posts.length, 1, "the push trigger posted for the one account with push on (it posts for any notification; the file can't and doesn't switch it off)");
const devNote = (await one(`select id from public.notifications where user_id = $1`, [U(17)])).id;
eq(posts[0], { url: "https://www.tapturf.in/api/push/dispatch", body: { id: devNote } }, "that account's notice, to the app's dispatch route");
eq(await r1(`public.push_targets($1, $2)`, [KEY, devNote]), { r: "sent" }, "and the app's question for it is answered: already handled, nothing to send");
eq((await one(`select count(*)::int as n from private.push_sends where notification_id = $1`, [devNote])).n, 1, "asking made no second claim");
// Control: a notification of another kind to the same phone would be sent, and a game one asks for an email.
{
  await db.exec("begin");
  const other = (await one(`insert into public.notifications (user_id, type, title, message, metadata) values ($1, 'game_request_accepted', 'You are in', 'x', $2) returning id`, [U(17), { gameId: GAME, requestId: U(801) }])).id;
  const t = await r1(`public.push_targets($1, $2)`, [KEY, other]);
  eq([t.r, t.targets.length, t.notification.url], ["ok", 1, `/game/${GAME}`], "control: any other notification to that phone is offered for sending");
  eq((await q(`select kind from private.email_asks`)).map((r) => r.kind), ["request_accepted"], "control: and a game's notification asks for its email");
  await db.exec("rollback");
}

// ── 2. The file again: nothing new. ──
const tableNow = () => q(`select *, xmin::text as x from private.username_assigned order by user_id`);
const t1 = await tableNow();
const n1 = await q(`select id, user_id, message, created_at from public.notifications order by id`);
await db.exec(`begin; ${NEW}; commit;`);
eq(await tableNow(), t1, "run again: nobody is given a second name, no row is rewritten");
eq(await q(`select id, user_id, message, created_at from public.notifications order by id`), n1, "and nobody gets a second notice");
eq((await one(`select count(*)::int as n from net.posts`)).n, 1, "nothing more was posted");
eq((await one(`select count(*)::int as n from private.push_sends`)).n, GIVEN.length, "no second claim");
eq(await namesNow(), namesBefore, "public.usernames still untouched");
// A person who read their notice, or chose, is not told again; and one made later by sign-in is never told.
await q(`update public.notifications set is_read = true where user_id = $1`, [U(4)]);
await db.exec(`begin; ${NEW}; commit;`);
eq((await one(`select count(*)::int as n from public.notifications`)).n, GIVEN.length, "a read notice is not written again");

// ── 3. Grants and shape. ──
const SIG = { ensure: "username_ensure(text, uuid)", choose: "username_choose(text, uuid, text, boolean)", check: "username_check_all(text, uuid, text)" };
const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};
for (const role of ["anon", "authenticated"]) {
  ok(!(await one(`select has_table_privilege($1, 'private.username_assigned', 'select,insert,update') as p`, [role])).p, `${role} can't touch the table`);
  for (const f of Object.values(SIG)) ok((await one(`select has_function_privilege($1, 'public.${f}', 'execute') as p`, [role])).p, `${role} may call ${f}: the key is the gate`);
  for (const f of ["username_from_name(text, text[])", "username_is_free(text, uuid)", "username_assign(uuid, text)"]) ok(!(await one(`select has_function_privilege($1, 'private.${f}', 'execute') as p`, [role])).p, `${role} can't call private.${f}`);
  await assert.rejects(as(role, `select * from private.username_assigned`), /permission denied/, `${role} can't read the given names`);
  passed++;
}
for (const f of Object.values(SIG)) ok(!(await one(`select has_function_privilege('public', 'public.${f}', 'execute') as p`)).p, `public's default execute on ${f} is revoked`);
ok((await one(`select relrowsecurity as r from pg_class where oid = 'private.username_assigned'::regclass`)).r, "the table has row level security on");
eq((await one(`select count(*)::int as n from pg_policies where schemaname = 'private' and tablename = 'username_assigned'`)).n, 0, "and no policy");
eq((await one(`select count(*)::int as n from pg_constraint where conrelid = 'private.username_assigned'::regclass and contype = 'f'`)).n, 0, "no foreign key");
eq((await q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'username_assigned' order by ordinal_position`)).map((r) => r.column_name),
  ["user_id", "username", "source", "assigned_at", "chosen_at", "chosen_how"], "the table's columns");
eq((await q(`select proname, prosecdef, proconfig, provolatile from pg_proc where proname in ('username_ensure', 'username_choose', 'username_check_all', 'username_from_name', 'username_is_free', 'username_assign') order by 1`)).map((r) => [r.proname, r.prosecdef, r.proconfig?.[0], r.provolatile]),
  [["username_assign", true, 'search_path=""', "v"], ["username_check_all", true, 'search_path=""', "s"], ["username_choose", true, 'search_path=""', "v"], ["username_ensure", true, 'search_path=""', "v"], ["username_from_name", true, 'search_path=""', "i"], ["username_is_free", true, 'search_path=""', "s"]],
  "security definer, search_path empty; the name rule is immutable, the checks stable");
eq(await q(`select tgrelid::regclass::text as t, tgname, tgenabled from pg_trigger where not tgisinternal order by 1, 2`), triggersBefore, "no trigger was added, removed or switched off");

// ── 4. The name rules: lib/account/assigned.cases.json, the file the unit test runs. ──
ok(CASES.names.length >= 50, "the cases file has its cases");
const TAKEN_AS = ["usernames", "history", "waiting"];
let ci = 0;
for (const c of CASES.names) {
  await db.exec("begin");
  // Only this case's people: the fixture's names out of the way.
  await db.exec(`update private.username_assigned set chosen_at = now(), chosen_how = 'off' where chosen_at is null`);
  await db.exec(`update public.usernames set username = 'zz_' || right(replace(user_id::text, '-', ''), 12); update public.username_history set username = 'zy_' || username`);
  const id = U(5000 + ci);
  await q(`insert into public.users (id, name, email) values ($1, $2, $3)`, [id, c.name, c.emails?.[0] ?? null]);
  if (c.emails?.[1]) await q(`insert into auth.users (id, email) values ($1, $2)`, [id, c.emails[1]]);
  // Each taken name is held a different way in turn: someone's username, someone's old one, one waiting for someone.
  for (const [i, t] of (c.taken ?? []).entries()) {
    const other = U(6000 + ci * 10 + i);
    await q(`insert into public.users (id, name) values ($1, 'Someone Else')`, [other]);
    const how = TAKEN_AS[(ci + i) % 3];
    if (how === "usernames") await q(`insert into public.usernames (user_id, username, taggable) values ($1, $2, false)`, [other, t]);
    else if (how === "history") await q(`insert into public.username_history (username, user_id) values ($1, $2)`, [t, other]);
    else await q(`insert into private.username_assigned (user_id, username, source) values ($1, $2, 'signin')`, [other, t]);
  }
  const base = await r1(`private.username_from_name($1, $2::text[])`, [c.name, c.emails ?? null]);
  const given = await r1(`private.username_assign($1, 'signin')`, [id]);
  eq(given, c.want, `${c.what}: "${c.name}" is given ${c.want}`);
  ok(base === null ? /^turfer[0-9]+$/.test(given) : given === base || (given.startsWith(base) && /^[0-9]+$/.test(given.slice(base.length))), `${c.what}: it is the base, or the base and a number`);
  await db.exec("rollback");
  ci++;
}
// The rule is the same whoever asks: null, no emails, emails that are null.
eq(await r1(`private.username_from_name(null)`), null, "no name: nothing");
eq(await r1(`private.username_from_name('Asha Rao', array[null, 'x@example.com']::text[])`), "asha_rao", "a null address is skipped");
eq(await r1(`private.username_from_name(E'Asha' || chr(9) || 'Rao' || chr(10))`), "asha_rao", "a tab and a line end separate and are trimmed");
eq(await r1(`private.username_from_name('  First.Last ', array['  FIRST.LAST@Example.com ']::text[])`), null, "spaces and capitals around an address do not matter");
// Reserved words can never be given, whatever the name.
for (const name of ["Admin", "Support", "Tapturf", "My Tapturf", "Owner", "Moderator", "Help", "Null", "Sys Admin", "Root"]) eq(await r1(`private.username_from_name($1)`, [name]), null, `a reserved name gives nothing: ${name}`);

// ── 5. A new account: its name at its first signed-in request. ──
const ensure = (key, n) => r1(`public.username_ensure($1, $2)`, [key, n === null ? null : U(n)]);
const choose = (n, u = null, t = null, key = KEY) => r1(`public.username_choose($1, $2, $3, $4)`, [key, U(n), u, t]);
const checkAll = (n, u) => r1(`public.username_check_all($1, $2, $3)`, [KEY, U(n), u]);
for (const k of [null, "", "wrong", KEY + "x"]) eq(await ensure(k, 4), { r: "unavailable" }, `ensure: refused without the server key (${k === null ? "null" : `"${k.slice(0, 5)}"`})`);
eq(await ensure(KEY, null), { r: "bad" }, "ensure: no account");
eq(await ensure(KEY, 9999), { r: "bad" }, "ensure: an account that does not exist");
eq(await ensure(KEY, 1), { r: "ok", assigned: null }, "ensure: someone who chose a username is offered nothing");
eq(await ensure(KEY, 2), { r: "ok", assigned: null }, "ensure: nor someone who has one with tagging off");
eq(await rowOf(1), undefined, "and no row was made for them");
eq(await ensure(KEY, 4), { r: "ok", assigned: "asha_rao" }, "ensure: the name the backfill gave is still waiting");
await q(`insert into public.users (id, name, phone) values ($1, 'Asha Rao', '+919800000030')`, [U(30)]);
const notesBefore = (await one(`select count(*)::int as n from public.notifications`)).n;
eq(await ensure(KEY, 30), { r: "ok", assigned: "asha_rao4" }, "a new Asha Rao is given the next one at her first signed-in request");
eq(await rowOf(30), { username: "asha_rao4", source: "signin", chosen_how: null, chosen: false }, "kept waiting, marked as from sign-in");
const x30 = (await one(`select xmin::text as x from private.username_assigned where user_id = $1`, [U(30)])).x;
for (let i = 0; i < 4; i++) eq(await ensure(KEY, 30), { r: "ok", assigned: "asha_rao4" }, "asked again: the same name");
eq((await one(`select xmin::text as x from private.username_assigned where user_id = $1`, [U(30)])).x, x30, "and asking again writes nothing");
eq((await one(`select count(*)::int as n from public.notifications`)).n, notesBefore, "a new account gets no notice: its card says it");
eq(await namesNow(), namesBefore, "giving a name wrote nothing to public.usernames");
eq((await as("anon", `select public.username_ensure($1, $2) as r`, ["guess", U(30)]))[0].r, { r: "unavailable" }, "anon with a guessed key learns nothing");
eq(await r1(`public.profile_get('asha_rao4')`), null, "the new account's given name has no public profile");
eq(await r1(`private.account_is_empty($1)`, [U(30)]), true, "and the new account is still empty");
// The 16th Google account, if it is ever signed in to again (its link ended), gets one then.
await q(`update private.account_google_links set ended_at = now() where auth_uid = $1`, [U(16)]);
eq(await ensure(KEY, 16), { r: "ok", assigned: "ira_bose" }, "an account left out of the backfill is given one when it is next signed in to");

// ── 6. A name waiting for someone is theirs until they choose. ──
eq(await checkAll(3, "asha_rao"), { r: "taken" }, "check: another person's waiting name is taken");
eq(await checkAll(4, "asha_rao"), { r: "ok", username: "asha_rao" }, "check: her own waiting name is free for her");
eq(await checkAll(4, "Asha_Rao"), { r: "ok", username: "asha_rao" }, "check: as typed, lowered");
eq(await checkAll(4, "asha_rao2"), { r: "taken" }, "check: the second Asha's is not hers");
eq(await checkAll(4, "asha"), { r: "taken" }, "check: a real username is taken, as before");
eq(await checkAll(4, "zoya_khan"), { r: "taken" }, "check: an old name is taken, as before");
eq(await checkAll(4, "admin_asha"), { r: "reserved" }, "check: the rules as before");
eq(await checkAll(4, "a"), { r: "bad" }, "check: the form as before");
eq(await checkAll(4, "asha_plays"), { r: "ok", username: "asha_plays" }, "check: a free one");
eq(await r1(`public.username_check_all($1, $2, $3)`, ["wrong", U(4), "asha_plays"]), { r: "unavailable" }, "check: refused without the server key");
eq(await choose(3, "asha_rao2"), { r: "taken" }, "a person with a username can't change to a name waiting for someone");
eq(await choose(7, "asha_rao"), { r: "taken" }, "nor can someone who is still waiting themselves");
eq(await waiting().then((w) => [w[4], w[5], w[7]]), ["asha_rao", "asha_rao2", "kabir2"], "and nothing moved");
eq(await namesNow(), namesBefore, "a refusal writes nothing");

// ── 7. Keep it. ──
for (const k of [null, "wrong"]) eq(await choose(4, null, null, k), { r: "unavailable" }, "keep: refused without the server key");
eq(await r1(`public.username_choose($1, $2, null, null)`, [KEY, U(9999)]), { r: "bad" }, "keep: no such account");
const kept = await choose(4);
eq([kept.r, kept.username, kept.taggable], ["ok", "asha_rao", true], "Keep it: asha_rao is hers, and public, by her own tap");
eq(await one(`select username, taggable, changes, window_start from public.usernames where user_id = $1`, [U(4)]), { username: "asha_rao", taggable: true, changes: 0, window_start: null }, "a first username: no change counted");
eq((await one(`select count(*)::int as n from private.username_changes where user_id = $1`, [U(4)])).n, 0, "nothing in the change log");
eq((await one(`select count(*)::int as n from public.username_history where user_id = $1`, [U(4)])).n, 0, "nothing in the history");
eq(await rowOf(4), { username: "asha_rao", source: "backfill", chosen_how: "kept", chosen: true }, "her row is closed: kept");
eq(await ensure(KEY, 4), { r: "ok", assigned: null }, "nothing more is offered");
// Now, and only now, the public readers know her.
eq((await r1(`public.profile_get('asha_rao')`))?.name, "Asha Rao", "her profile page exists now");
eq((await r1(`public.players_search($1, 'asha_rao')`, [KEY])).players.map((p) => p.u), ["asha_rao"], "search finds her");
eq((await r1(`public.player_badges_for($1::uuid[])`, [[U(4)]])).map((b) => b.u), ["asha_rao"], "her medal badge shows");
eq((await r1(`public.game_tags_shown($1, $2)`, [KEY, GAME])).tags.map((t) => t.u).sort(), ["asha", "asha_rao"], "and her tag on the game");
eq(await r1(`public.profile_get('asha_rao2')`), null, "the second Asha, who did nothing, is still nowhere");
// Keeping again changes nothing; turning the switch off is today's switch.
const names4 = await namesNow();
eq((await choose(4)).username, "asha_rao", "a second tap on Keep it answers the same");
eq(await namesNow(), names4, "and writes nothing");
eq((await choose(4, null, false)).taggable, false, "the switch off, through the same function");
eq(await r1(`public.profile_get('asha_rao')`), null, "and her profile is hidden again");
eq((await choose(4, null, true)).taggable, true, "and on");

// Keep with the switch turned off first: hers, and private.
const quiet = await choose(14, null, false);
eq([quiet.r, quiet.username, quiet.taggable], ["ok", "rohan_verma", false], "kept with the switch off: chosen, not public");
eq(await rowOf(14), { username: "rohan_verma", source: "backfill", chosen_how: "kept", chosen: true }, "closed as kept");
eq(await r1(`public.profile_get('rohan_verma')`), null, "no public profile");
// Typing the given name is keeping it.
eq((await choose(15, "Sudarshanprasad")).username, "sudarshanprasad", "typing the given name is keeping it");
eq((await rowOf(15)).chosen_how, "kept", "closed as kept");

// ── 8. Change: their own name instead, free of the limit. ──
eq(await choose(5, "asha"), { r: "taken" }, "change: a taken name is refused as before");
eq(await choose(5, "admin_asha"), { r: "reserved" }, "change: a reserved one too");
eq(await choose(5, "x"), { r: "bad" }, "change: and a malformed one");
eq((await rowOf(5)).chosen, false, "a refused change leaves the given name waiting");
const changed = await choose(5, "Asha_Plays");
eq([changed.r, changed.username, changed.taggable], ["ok", "asha_plays", true], "Change: she saved asha_plays, hers and public by her own save");
eq(await one(`select username, taggable, changes, window_start from public.usernames where user_id = $1`, [U(5)]), { username: "asha_plays", taggable: true, changes: 0, window_start: null }, "it is her first username: not a change");
eq((await one(`select count(*)::int as n from private.username_changes where user_id = $1`, [U(5)])).n, 0, "nothing counted against the 3 in 30 days");
eq(await rowOf(5), { username: "asha_rao2", source: "backfill", chosen_how: "changed", chosen: true }, "her row is closed: changed");
eq((await one(`select count(*)::int as n from public.username_history where username = 'asha_rao2'`)).n, 0, "the given name she never used is not put in the history");
eq(await r1(`public.profile_get('asha_rao2')`), null, "and it points nowhere");
eq(await checkAll(6, "asha_rao2"), { r: "ok", username: "asha_rao2" }, "it is free again: it was never public");
// She still has all three changes of the 30 days.
for (const [i, u] of ["asha_p1", "asha_p2", "asha_p3"].entries()) eq((await choose(5, u)).username, u, `change ${i + 1} of 3 goes through`);
eq(await choose(5, "asha_p4"), { r: "limit" }, "the fourth is the limit, as for anyone");
eq((await one(`select count(*)::int as n from private.username_changes where user_id = $1`, [U(5)])).n, 3, "three counted, none of them the first");
// A change with the switch off first.
const hidden = await choose(6, "asha_six", false);
eq([hidden.username, hidden.taggable], ["asha_six", false], "a new name saved with the switch off: chosen and private");
eq((await rowOf(6)).chosen_how, "changed", "closed as changed");
// Someone with no row waiting (a database state from before, or set aside) picks one as today.
await q(`insert into public.users (id, name, phone) values ($1, 'Leela Nair', '+919800000031')`, [U(31)]);
eq(await choose(31), { r: "bad" }, "nothing given, nothing typed: nothing to keep");
eq(await choose(31, null, true), { r: "bad" }, "the switch alone has no username to be set on");
eq((await choose(31, "leela")).username, "leela", "a first username picked the old way, through the new function");
eq(await rowOf(31), undefined, "no row was made for her");

// ── 9. The older function still works, and what it leaves is put right. ──
// A person given a name picks one through public.username_set (an app from before this file).
eq((await r1(`public.username_set($1, $2, 'kabir_seven', null)`, [KEY, U(7)])).username, "kabir_seven", "the older write still works for a first username");
eq((await rowOf(7)).chosen, false, "it knows nothing of the waiting row");
eq(await ensure(KEY, 7), { r: "ok", assigned: null }, "the next ask sees their username and offers nothing");
eq(await rowOf(7), { username: "kabir2", source: "backfill", chosen_how: "own", chosen: true }, "and closes the row: their own");
// Someone takes a waiting name through the older function: its person is given another.
eq((await r1(`public.username_set($1, $2, 'zoya_khan2', null)`, [KEY, U(31)])).username, "zoya_khan2", "the older write can take a waiting name (it can't know)");
eq(await choose(8), { r: "moved", assigned: "zoya_khan3" }, "Keep it then says: that one went, here is another");
eq(await rowOf(8), { username: "zoya_khan3", source: "backfill", chosen_how: null, chosen: false }, "still waiting, with the new name");
eq((await one(`select count(*)::int as n from public.usernames where user_id = $1`, [U(8)])).n, 0, "nothing was made public by that");
eq((await choose(8)).username, "zoya_khan3", "and keeping the new one works");
await r1(`public.username_set($1, $2, 'tara_sen', null)`, [KEY, U(3)]);
eq(await ensure(KEY, 18), { r: "ok", assigned: "tara_sen2" }, "the same on a plain ask: the taken name is replaced");

// ── 10. To undo by hand: set the waiting ones aside. ──
{
  await db.exec("begin");
  const open = await waiting();
  ok(Object.keys(open).length >= 6, "some are still waiting");
  const rowsBefore = (await one(`select count(*)::int as n from private.username_assigned`)).n;
  await db.exec(`update private.username_assigned set chosen_at = now(), chosen_how = 'off' where chosen_at is null`);
  eq(await waiting(), {}, "none is waiting");
  eq((await one(`select count(*)::int as n from private.username_assigned`)).n, rowsBefore, "no row was removed");
  for (const n of Object.keys(open)) eq(await ensure(KEY, Number(n)), { r: "ok", assigned: null }, `account ${n} is offered nothing and given no new one`);
  eq(await checkAll(3, open[9]), { r: "ok", username: open[9] }, "and the names are free");
  eq(await choose(9), { r: "bad" }, "nothing to keep");
  eq((await choose(9, "ashutosh_p")).username, "ashutosh_p", "they pick one as people do today");
  await db.exec("rollback");
}

// ── 11. Nothing from before was changed. ──
const others = await q(`select n.nspname, p.proname, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private','net') and p.proname not in ('username_ensure', 'username_choose', 'username_check_all', 'username_from_name', 'username_is_free', 'username_assign') order by 1, 2`);
eq(others, before, "every function from before is as it was");
eq(await q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private', 'auth') and table_name <> 'username_assigned' order by 1, 2, ordinal_position`), columnsBefore, "every table from before has the columns it had");
eq((await one(`select count(*)::int as n from pg_proc where proname in ('username_ensure', 'username_choose', 'username_check_all', 'username_from_name', 'username_is_free', 'username_assign')`)).n, 6, "no overload after running it three times");
eq((await q(`select indexname from pg_indexes where schemaname = 'private' and tablename = 'username_assigned' order by 1`)).map((r) => r.indexname), ["username_assigned_pkey", "username_assigned_waiting_uidx"], "its two indexes, once each");
const noVersion = (rows) => rows.map((u) => ({ ...u, x: null }));
eq(noVersion((await usersNow()).filter((u) => Number(u.id.slice(-4)) <= 21)), noVersion(usersBefore), "public.users was never written for anyone");
eq((await one(`select count(*)::int as n from private.email_asks`)).n, 0, "no email was ever asked for");
eq((await one(`select count(*)::int as n from net.posts`)).n, 1, "and nothing more was posted after the one request the trigger made");

console.log(`usernames_assigned: ${passed} checks passed`);
