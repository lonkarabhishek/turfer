// Applies 20261124_live_mine.sql (twice) to an in-memory Postgres (PGlite) on
// top of the real live links (20261021_live_matches.sql, 20261029_live_link_starts.sql,
// 20261029_live_idle_close.sql), the real live tournaments
// (20261102_live_tournaments.sql, and 20261123_tournament_host.sql for the read
// its tournament pick is compared with) and the real key checks, all read from
// the repo's migrations, with stand-ins only for what those read (Supabase's
// roles, the key table, pg_cron, public.users, public.usernames, the site owner
// check, the verified tick and the badges table), and checks: the file's rules
// (additive, none of the destructive keywords even inside a word or a comment,
// no backslash anywhere, search_path '', its header's md5 is the repo's latest
// body, nothing replaced, no table, no index); the grants and settings are
// tournament_mine's; a wrong key is refused; only that account's links come
// back; the order (updated last first) and the cap of 30; exactly the eleven
// named fields, with nothing else of the match (no player, ball or venue) and
// no secret hash or network hash; a board says its sport; a tournament is named
// only for a fixture not taken out in a tournament that is on, and it is the
// tournament public.live_tournament picks; a link turned off, an expired one
// and one whose row is gone are left out; a link closed for want of updates is
// still listed (the app words it); reading writes nothing. Never touches a real
// database. Made-up people.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/live_mine.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const [M] = process.argv.slice(2);
if (!M) throw new Error("usage: live_mine.check.mjs <supabase/migrations>");
const NAME = "20261124_live_mine.sql";
const NEW = fs.readFileSync(`${M}/${NAME}`, "utf8");
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
assert.doesNotMatch(code, /\b(update|insert\s+into)\b/i, "writes nothing anywhere");
assert.doesNotMatch(code, /\b(create|alter)\s+(table|index|unique|policy|trigger|schema|type|view)\b|cron\.schedule/i, "no table, index, policy, trigger or job");
assert.doesNotMatch(code, /\bgrant\b[^;]*\bon\s+(?!function public\.live_links_mine\()/i, "the grant is on its own function");
const from = NEW.indexOf("as $$", NEW.indexOf("create or replace function public.live_links_mine")) + 5;
const BODY = NEW.slice(from, NEW.indexOf("$$;", from));
assert.match(BODY, /^\nbegin\n  if not private\.account_key_ok\(p_key\) then\n    return jsonb_build_object\('r', 'unavailable'\);\n  end if;/, "the key is checked before anything is read, and refused as tournament_mine refuses it");
assert.match(BODY, /where s\.user_id = p_user_id\n/, "every row is one that account started");
assert.doesNotMatch(BODY, /secret|ip_hash|stoppers|writes|\brev\b|method|players|events|venue|\bemail\b|\bphone\b|public\.users|usernames/i, "its body reads no secret, no network hash, no player, no ball, no venue and nothing about people");
assert.equal((BODY.match(/\bm\.match\b/g) ?? []).length, (BODY.match(/jsonb_typeof\(m\.match\) = 'object'|\bm\.match ->/g) ?? []).length, "and never selects the whole match: it is only asked whether it is an object, and for single values");
passed += 11;
const MADE = [...NEW.matchAll(/create or replace function (\w+)\.(\w+)\(/gi)].map((m) => `${m[1]}.${m[2]}`);
eq(MADE, ["public.live_links_mine"], "exactly one function");
eq((code.match(/security definer/g) ?? []).length, 1, "security definer");
eq((code.match(/set search_path = ''/g) ?? []).length, 1, "with an empty search_path");
eq((code.match(/\bstable\b/g) ?? []).length, 1, "stable");
eq((code.match(/revoke all on function public\.live_links_mine\(text, uuid\) from public, anon, authenticated;/g) ?? []).length, 1, "revoked from public, anon and authenticated before its grant");
eq((code.match(/grant execute on function public\.live_links_mine\(text, uuid\) to anon, authenticated;/g) ?? []).length, 1, "granted as tournament_mine is");
// The match values it reads: these four paths and no other.
eq([...BODY.matchAll(/m\.match\s*->>?\s*'(\w+)'(?:\s*->>\s*'(\w+)')?/g)].map((m) => (m[2] ? `${m[1]}.${m[2]}` : m[1])), ["kind", "sport", "setup.teamA", "setup.teamB", "setup.title"], "from the match: its kind, a board's sport, the two sides and the title");
for (const w of ["Replaced: none.", "Gated exactly as public.tournament_mine", "never the whole match", "Never the link's secret hash, the\n--     network hash", "A cleared link is left out", "No table is altered", "no index is added", "The app works before this file", "production\n-- was not read for this file", "Shown to nobody but the signed-in player themselves", "Safe to run\n-- again."])
  ok(NEW.includes(w), `the header says: ${w.replace(/\n--\s+/g, " ")}`);

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
const CALLED = ["private.account_key_ok"];
eq(HEADER.map((h) => h.fn), CALLED, "the header lists the one function it calls");
for (const h of HEADER) {
  const def = repoDef(h.fn);
  eq(md5(def?.body ?? ""), h.md5, `${h.fn}: the header's md5 is the repo's latest body`);
  eq(def?.file, h.file, `${h.fn}: and the header names the file that has it`);
}
const calls = new Set([...code.matchAll(/\b(public|private)\.(\w+)\s*\(/g)].map((m) => `${m[1]}.${m[2]}`).filter((f) => !MADE.includes(f)));
eq([...calls].sort(), CALLED, "it calls exactly that one");
const reads = (sql) => [...new Set([...sql.replace(/^\s*--.*$/gm, "").matchAll(/\b(?:from|join)\s+((?:public|private)\.\w+)/g)].map((m) => m[1]))].sort();
eq(reads(BODY), ["private.live_link_starts", "private.tournament_fixtures", "private.tournaments", "public.live_matches"], "it reads exactly the four tables its header names");
eq(repoDef("public.live_links_mine"), null, "the function is new: no earlier file has it");
for (const file of FILES.filter((f) => f < NAME)) ok(!/live_links_mine/.test(fs.readFileSync(`${M}/${file}`, "utf8")), `${file} knows nothing of it`);

// ── The database before it: the real files, with stand-ins for what they read. ──
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
create schema cron;
create table cron.jobs (name text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
create table private.app_secrets (name text primary key, value text not null);
create table public.users (id uuid primary key, name character varying, email text, phone text, profile_image_url text);
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as $$ select false $$;
-- For 20261123_tournament_host.sql, which is loaded only so this file's tournament pick can be compared with public.live_tournament's.
create function private.user_verified(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
create table private.player_badges (user_id uuid primary key, medal text, medals integer not null default 0);
`);
await db.exec(USERNAMES);

// Refuses to run without what it needs, changing nothing.
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /live_mine needs/, "before the live links and the tournaments it refuses");
await db.exec("rollback");
eq((await one(`select to_regprocedure('public.live_links_mine(text, uuid)') as f`)).f, null, "and leaves nothing behind");

await db.exec(fs.readFileSync(`${M}/20261021_live_matches.sql`, "utf8"));
await db.exec(repoDef("private.account_key_ok").sql);
await db.exec(repoDef("private.live_key_ok").sql);
await db.exec(repoDef("public.live_match_get_k").sql);
eq(md5((await one(`select prosrc from pg_proc where proname = 'account_key_ok'`)).prosrc), HEADER[0].md5, "the key check loaded here is the body the header names");
await db.exec(fs.readFileSync(`${M}/20261026_admin_live_links.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261029_live_link_starts.sql`, "utf8"));
await db.exec(fs.readFileSync(`${M}/20261029_live_idle_close.sql`, "utf8"));
await assert.rejects(db.exec(`begin; ${NEW}; commit;`), /live_mine needs/, "with the live links but before the tournaments it still refuses");
await db.exec("rollback");
passed += 2;
await db.exec(fs.readFileSync(`${M}/20261102_live_tournaments.sql`, "utf8"));
await db.exec(`begin; ${fs.readFileSync(`${M}/20261123_tournament_host.sql`, "utf8")}; commit;`);
await db.exec(`
insert into private.app_secrets (name, value) values ('account', 'account-key') on conflict (name) do update set value = excluded.value;
insert into private.app_secrets (name, value) values ('live_write', 'live-key') on conflict (name) do update set value = excluded.value;
`);
const LIVE = "live-key";
const ACCOUNT = "account-key";

const fns = () => q(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, p.prosecdef, p.proconfig, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.proname <> 'live_links_mine' order by 1`);
const columns = () => q(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_schema in ('public', 'private') order by 1, 2, ordinal_position`);
const indexes = () => q(`select schemaname, tablename, indexname from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`);
const before = { fns: await fns(), columns: await columns(), indexes: await indexes() };
ok((await indexes()).some((i) => i.indexname === "live_link_starts_user"), "the index the read uses is there already (live_link_starts_user)");
await db.exec(`begin; ${NEW}; commit;`);

// ── Fixture: made-up people and their live links. ──
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ASHA = U(1), RAVI = U(2), NOLINKS = U(3), NOBODY = U(9);
for (const [id, name, phone, email] of [[ASHA, "Asha Rao", "+919800000001", "asha@example.test"], [RAVI, "Ravi Kumar", "+919800000002", "ravi@example.test"], [NOLINKS, "Kiran Shah", "+919800000003", null]])
  await q(`insert into public.users (id, name, phone, email) values ($1, $2, $3, $4)`, [id, name, phone, email]);
const L = (n) => `l${String(n).padStart(11, "0")}`;
const SECRET = (n) => createHash("sha256").update(`secret-${n}`).digest("hex");
const NET = (n) => createHash("md5").update(`net-${n}`).digest("hex");
const cricket = (a, b, o = {}) => ({ v: 1, id: "m1", createdAt: 1, setup: { teamA: a, teamB: b, title: "", venue: "Kings Turf Arena", overs: 6, players: { a: [{ id: "a1", name: "Amit Secretbat" }], b: [{ id: "b1", name: "Sameer Hiddenbowl" }] }, ...o }, events: [{ type: "ball", runs: 4, extra: "none", extraRuns: 0 }] });
const board = (sport, a, b, o = {}) => ({ v: 1, kind: "board", id: "b1", createdAt: 1, sport, setup: { teamA: a, teamB: b, title: "", venue: "Greenfield Sports Hub", rules: { halves: 2 }, ...o }, events: [{ type: "goal", side: "a", player: "Striker Unseen" }] });
// Each link from its own network, so the new-link limits (8 an hour a network) are never what is being tested.
let made = 0;
const put = async (n, match, status = "live") => (await one(`select public.live_match_put($1, $2, $3, $4::jsonb, $5, 1, $6) as r`, [LIVE, L(n), SECRET(n), JSON.stringify(match), status, NET(++made)])).r.r;
const record = async (n, user, tool = "cricket") => (await one(`select public.live_link_start_record($1, $2, $3, $4, 'phone') as r`, [LIVE, L(n), user, tool])).r;
const at = (n, minutesAgo) => db.exec(`update public.live_matches set updated_at = now() - interval '${minutesAgo} minutes' where code = '${L(n)}'`);
const mine = async (user, key = ACCOUNT) => (await one(`select public.live_links_mine($1, $2) as r`, [key, user])).r;
const list = async (user) => (await mine(user)).list;
const codes = async (user) => (await list(user)).map((x) => x.code);

// Asha: 1 live now (cricket), 2 finished (cricket), 3 a football board, 4 live but idle 3 hours.
// Ravi: 11 live (cricket), 12 a badminton board.
eq(await put(1, cricket("Titans", "Royals", { title: "Sunday Smash League · Match 3" })), "ok", "Asha's live match");
eq(await put(2, cricket("Strikers", "Kings"), "done"), "ok", "her finished match");
eq(await put(3, board("football", "Red FC", "Blue FC")), "ok", "her football board");
eq(await put(4, cricket("Baner Blasters", "Kothrud Kings")), "ok", "a match she left part of the way");
eq(await put(11, cricket("Ravi XI", "Rest of the World", { title: "Ravi's private cup" })), "ok", "Ravi's live match");
eq(await put(12, board("badminton", "Ravi K", "Ishaan M"), "done"), "ok", "Ravi's badminton board");
for (const [n, u, tool] of [[1, ASHA, "cricket"], [2, ASHA, "cricket"], [3, ASHA, "board"], [4, ASHA, "cricket"], [11, RAVI, "cricket"], [12, RAVI, "board"]]) eq(await record(n, u, tool), "ok", `link ${n}: its starter recorded`);
await at(1, 1); await at(2, 60 * 26); await at(3, 60 * 50); await at(4, 180); await at(11, 2); await at(12, 30);

// ── 1. Grants and settings: tournament_mine's. ──
const priv = async (fn) => Object.fromEntries(await Promise.all(["anon", "authenticated", "public"].map(async (role) => [role, (await one(`select has_function_privilege($1, 'public.${fn}(text, uuid)', 'execute') as p`, [role])).p])));
eq(await priv("live_links_mine"), await priv("tournament_mine"), "who may call it is exactly who may call tournament_mine");
eq(await priv("live_links_mine"), { anon: true, authenticated: true, public: false }, "anon and authenticated (the key is the gate), never public's default");
const shape = async (fn) => one(`select prosecdef, proconfig, provolatile, prorettype::regtype::text as returns, pg_get_function_identity_arguments(oid) as args from pg_proc where proname = $1`, [fn]);
eq(await shape("live_links_mine"), await shape("tournament_mine"), "security definer, search_path empty, stable, the same arguments and return type as tournament_mine");
eq((await shape("live_links_mine")).proconfig, ['search_path=""'], "search_path is empty");
eq((await shape("live_links_mine")).args, "p_key text, p_user_id uuid", "its arguments");

// ── 2. A wrong key is refused, whoever is asked about. ──
for (const k of [null, "", "wrong", LIVE, ACCOUNT + "x", ACCOUNT.slice(1), "ACCOUNT-KEY"]) {
  eq(await mine(ASHA, k), { r: "unavailable" }, `refused without the account key (${k === null ? "null" : `"${k}"`}), though she has links`);
  eq(await mine(NOBODY, k), { r: "unavailable" }, "and for an account that is none, the same answer");
}
eq(await mine(null, "wrong"), { r: "unavailable" }, "the key comes first: a wrong key with no account learns nothing");
eq(await mine(null), { r: "bad" }, "the key and no account: bad");

// ── 3. Only that account's links, exactly these fields. ──
const KEYS = "code,sport,started_at,status,team_a,team_b,title,tool,tournament,tournament_name,updated_at";
eq((await mine(ASHA)).r, "ok", "the key and an account: ok");
eq(Object.keys(await mine(ASHA)).sort().join(), "list,r", "r and list, nothing else");
eq(await codes(ASHA), [L(1), L(4), L(2), L(3)], "Asha's four links, the one updated last first");
eq(await codes(RAVI), [L(11), L(12)], "Ravi's two, and none of hers");
eq(await list(NOLINKS), [], "an account with no link: an empty list");
eq(await list(NOBODY), [], "an account that does not exist: an empty list");
for (const u of [ASHA, RAVI]) for (const x of await list(u)) eq(Object.keys(x).sort().join(), KEYS, `${x.code}: eleven keys and no other`);
const A = Object.fromEntries((await list(ASHA)).map((x) => [x.code, x]));
const pick = (x) => ({ tool: x.tool, status: x.status, sport: x.sport, team_a: x.team_a, team_b: x.team_b, title: x.title, tournament: x.tournament, tournament_name: x.tournament_name });
eq(pick(A[L(1)]), { tool: "cricket", status: "live", sport: null, team_a: "Titans", team_b: "Royals", title: "Sunday Smash League · Match 3", tournament: null, tournament_name: null }, "a live cricket match: the two sides and its title, no sport, no tournament");
eq(pick(A[L(2)]), { tool: "cricket", status: "done", sport: null, team_a: "Strikers", team_b: "Kings", title: "", tournament: null, tournament_name: null }, "a finished one says done");
eq(pick(A[L(3)]), { tool: "board", status: "live", sport: "football", team_a: "Red FC", team_b: "Blue FC", title: "", tournament: null, tournament_name: null }, "a board says its sport");
eq(pick(A[L(4)]), { tool: "cricket", status: "live", sport: null, team_a: "Baner Blasters", team_b: "Kothrud Kings", title: "", tournament: null, tournament_name: null }, "a link with no update for 3 hours is still listed, as live with its last update: the app words it");
ok(Date.now() - Date.parse(A[L(4)].updated_at) > 2 * 3600_000, "and its updated_at says how long ago");
for (const x of await list(ASHA)) ok(Number.isFinite(Date.parse(x.started_at)) && Number.isFinite(Date.parse(x.updated_at)), `${x.code}: both times are times`);
eq((await list(RAVI)).map(pick)[1], { tool: "board", status: "done", sport: "badminton", team_a: "Ravi K", team_b: "Ishaan M", title: "", tournament: null, tournament_name: null }, "Ravi's finished badminton board");
// Nothing else of the match, no secret, no hash, nothing of the other account.
const stored = await q(`select code, encode(secret_hash, 'hex') as secret_hash, ip_hash from public.live_matches order by code`);
ok(stored.every((s) => /^[0-9a-f]{64}$/.test(s.secret_hash) && /^[0-9a-f]{32}$/.test(s.ip_hash)), "every link here has a secret hash and a network hash stored");
for (const [who, u, other] of [["Asha", ASHA, RAVI], ["Ravi", RAVI, ASHA]]) {
  const text = JSON.stringify(await mine(u));
  ok(!stored.some((s) => text.includes(s.secret_hash) || text.includes(s.ip_hash)), `${who}: no secret hash and no network hash`);
  for (let n = 1; n <= 12; n++) ok(!text.includes(SECRET(n)), `${who}: not link ${n}'s secret either`);
  ok(!/Secretbat|Hiddenbowl|Unseen|Kings Turf Arena|Greenfield|events|players|venue|rules|overs|"ball"|"goal"/.test(text), `${who}: no player, no ball, no venue, no rules: nothing else of the match`);
  ok(!/0000-4000-8000|9800000|example[.]test|phone|google|method|user/.test(text), `${who}: no account id, number, email or sign-in method`);
  ok(!text.includes(other === RAVI ? "Ravi" : "Titans") && !(await codes(u)).some((c) => (other === RAVI ? [L(11), L(12)] : [L(1), L(2), L(3), L(4)]).includes(c)), `${who}: nothing of the other account's links, not a code and not a name`);
}
// Long values are cut.
eq(await put(5, cricket("A".repeat(70), "B".repeat(70), { title: "T".repeat(90) })), "ok", "a match with very long names");
eq(await record(5, RAVI), "ok", "Ravi's");
const long = (await list(RAVI)).find((x) => x.code === L(5));
eq([long.team_a.length, long.team_b.length, long.title.length], [40, 40, 60], "the sides are cut to 40 and the title to 60");
// A match with no setup at all still answers, with nothing to name.
await db.exec(`update public.live_matches set match = '{"v": 1, "kind": "board", "sport": "${"x".repeat(40)}"}'::jsonb where code = '${L(5)}'`);
eq(pick((await list(RAVI)).find((x) => x.code === L(5))), { tool: "cricket", status: "live", sport: "x".repeat(24), team_a: null, team_b: null, title: null, tournament: null, tournament_name: null }, "a match with no setup: nulls, and the sport cut to 24");
// A starter is the first one recorded: a link is never on two accounts' lists.
eq(await record(1, RAVI), "known", "Ravi can't become the starter of Asha's link");
ok(!(await codes(RAVI)).includes(L(1)) && (await codes(ASHA)).includes(L(1)), "it stays hers alone");

// ── 4. The tournament a link is a fixture of. ──
const settings = { format: "league", legs: 1, matches: 0, playoffs: "none", overs: 6, points: { win: 2, tie: 1, nr: 1, loss: 0 }, venue: null, starts: null, ends: null };
const TEAMS = ["Titans", "Strikers", "Royals", "Kings"].map((name) => ({ name, short: null }));
const PAIRS = [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]];
const league = (name) => ({ name, settings, teams: TEAMS, fixtures: PAIRS.map(([home, away], i) => ({ id: i + 1, stage: "league", slot: null, round: Math.floor(i / 2) + 1, seq: i, home, away, day: null, time: null, result: null })) });
const C = (n) => `t${String(n).padStart(11, "0")}`;
const TS = (n) => String(n).padStart(2, "0").repeat(32);
const create = async (n, name) => (await one(`select public.tournament_create($1, $2, $3, $4::jsonb, $5) as r`, [LIVE, C(n), TS(n), JSON.stringify(league(name)), String(n).padStart(32, "0")])).r.r;
const change = async (n, op, d = {}) => (await one(`select public.tournament_update($1, $2, $3, $4, $5::jsonb) as r`, [LIVE, C(n), TS(n), op, JSON.stringify(d)])).r.r;
const banner = async (n) => (await one(`select public.live_tournament($1, $2) as r`, [LIVE, L(n)])).r;
const tOf = async (user, n) => { const x = (await list(user)).find((y) => y.code === L(n)); return [x.tournament, x.tournament_name]; };
eq(await create(1, "Sunday Smash League"), "ok", "a league (Ravi runs it; kept with nobody's account here)");
eq(await create(2, "Koregaon Park Cup"), "ok", "another");
eq(await tOf(ASHA, 1), [null, null], "no fixture has the link yet: no tournament");
eq(await change(1, "live_link", { id: 3, live_code: L(1) }), "ok", "match 3 of the league is scored on Asha's link");
eq(await tOf(ASHA, 1), [C(1), "Sunday Smash League"], "her link names the tournament: its code and its name");
eq((await banner(1)).code, C(1), "the same tournament the scorecard's own banner names");
eq(await tOf(ASHA, 2), [null, null], "her other links name none");
eq(await change(1, "settings", { name: "Sunday Smash League 2026", settings }), "ok", "the tournament is renamed");
eq(await tOf(ASHA, 1), [C(1), "Sunday Smash League 2026"], "the name is read, not kept");
// A fixture taken out: not named.
eq(await change(1, "fixture_remove", { id: 3 }), "ok", "the fixture is taken out");
eq(await tOf(ASHA, 1), [null, null], "a link whose fixture was taken out names no tournament");
eq(await banner(1), null, "as the scorecard's banner");
// One link on two fixtures (kept for the next match), in two tournaments: the one still without a result is named.
eq(await change(1, "live_link", { id: 1, live_code: L(2) }), "ok", "her finished link is fixture 1 of the league");
await db.exec(`update private.tournament_fixtures set live_result = '${JSON.stringify({ a: { runs: 60, wickets: 3, balls: 36, allOut: false, name: "Titans" }, b: { runs: 50, wickets: 5, balls: 36, allOut: false, name: "Strikers" }, outcome: "a", battedFirst: "a", text: "Titans won by 10 runs" })}'::jsonb, live_rev = 2 where code = '${C(1)}' and id = 1`);
eq(await tOf(ASHA, 2), [C(1), "Sunday Smash League 2026"], "one fixture: its tournament");
eq(await change(2, "live_link", { id: 2, live_code: L(2) }), "ok", "the same link is then used for a match of the other tournament");
eq(await tOf(ASHA, 2), [C(2), "Koregaon Park Cup"], "the match still without a result is the one named");
eq((await banner(2)).code, C(2), "the scorecard's banner picks the same one");
for (const n of [1, 2, 3, 4]) eq((await tOf(ASHA, n))[0], (await banner(n))?.code ?? null, `link ${n}: the tournament named is always public.live_tournament's pick`);
// A tournament taken down: not named.
eq(await change(2, "remove"), "ok", "the cup is taken down");
eq(await tOf(ASHA, 2), [C(1), "Sunday Smash League 2026"], "a taken-down tournament is not named: the link falls back to the one that is on");
eq(await change(1, "remove"), "ok", "the league is taken down too");
eq(await tOf(ASHA, 2), [null, null], "and then no tournament is named at all");
eq(await codes(ASHA), [L(1), L(4), L(2), L(3)], "the links themselves are all still listed, in the same order");

// ── 5. Cleared links are left out. ──
// Turned off by the scorer: the match is cleared, the row stays.
eq((await one(`select public.live_match_stop($1, $2, $3) as r`, [LIVE, L(3), SECRET(3)])).r, "ok", "Asha turns her football board's link off");
eq((await one(`select status, match is null as cleared from public.live_matches where code = $1`, [L(3)])), { status: "stopped", cleared: true }, "it is stopped and its match cleared");
eq(await codes(ASHA), [L(1), L(4), L(2)], "a link turned off is left out");
ok((await q(`select 1 from private.live_link_starts where code = $1`, [L(3)])).length === 1, "though its starter row is still there");
// Expired by the hourly job, 30 days after its last update.
await at(2, 60 * 24 * 31);
await db.exec((await one(`select command from cron.jobs where name = 'live-matches-expire'`)).command);
eq((await one(`select status, match is null as cleared from public.live_matches where code = $1`, [L(2)])), { status: "expired", cleared: true }, "the hourly job expires her old finished link");
eq(await codes(ASHA), [L(1), L(4)], "an expired link is left out");
// A starter row whose link has no row at all.
await q(`insert into private.live_link_starts (code, user_id, tool, method) values ($1, $2, 'cricket', 'phone')`, [L(99), ASHA]);
eq(await codes(ASHA), [L(1), L(4)], "a link whose row is gone is left out");
// A stopped status with a match still there (never stored that way; were it, it would still be left out).
await db.exec(`update public.live_matches set status = 'stopped' where code = '${L(4)}'`);
eq(await codes(ASHA), [L(1)], "only live and done links are listed");
await db.exec(`update public.live_matches set status = 'live' where code = '${L(4)}'`);
eq(await codes(ASHA), [L(1), L(4)], "put back");

// ── 6. The order and the cap. ──
// 33 more for Asha, each updated a minute apart (link 100 the latest), two of them at the same instant.
for (let n = 100; n < 133; n++) {
  eq(await put(n, cricket(`Home ${n}`, `Away ${n}`), n % 2 ? "done" : "live"), "ok", `link ${n} made`);
  await record(n, ASHA);
  await at(n, 10 + (n - 100));
}
await db.exec(`update public.live_matches set updated_at = (select updated_at from public.live_matches where code = '${L(110)}') where code = '${L(111)}'`);
const capped = await codes(ASHA);
eq(capped.length, 30, "30 at most");
eq(capped[0], L(1), "the one updated last leads");
eq(capped.slice(1, 12), [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110].map(L), "then by last update, newest first");
eq(capped.slice(11, 13), [L(110), L(111)], "two updated at the same instant come in the order of their codes");
ok(!capped.includes(L(4)) && !capped.includes(L(132)), "the oldest are the ones left off (her 3 hour old one among them)");
const times = (await list(ASHA)).map((x) => Date.parse(x.updated_at));
ok(times.every((t, i) => i === 0 || t <= times[i - 1]), "updated_at never rises down the list");
eq((await codes(RAVI)).length, 3, "Ravi's list is his own three, whatever Asha has");

// ── 7. As the server's client (anon with the key), and as a browser without it. ──
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  try {
    eq((await db.query(`select public.live_links_mine($1, $2) as r`, [ACCOUNT, RAVI])).rows[0].r.list.length, 3, `${role} with the account key gets the list`);
    eq((await db.query(`select public.live_links_mine($1, $2) as r`, ["guess", RAVI])).rows[0].r, { r: "unavailable" }, `${role} with a guessed key gets nothing`);
    for (const t of ["private.live_link_starts", "public.live_matches", "private.tournaments", "private.tournament_fixtures"]) {
      await assert.rejects(db.query(`select * from ${t}`), /permission denied/, `${role} can't read ${t}: the read tells only what it returns`);
      passed++;
    }
  } finally {
    await db.exec("reset role");
  }
}

// ── 8. Reading writes nothing; safe to run again; nothing from before changed. ──
const state = async () => ({
  m: await q(`select code, rev, writes, status, updated_at, xmin::text as x from public.live_matches order by code`),
  s: await q(`select code, user_id, tool, method, started_at, xmin::text as x from private.live_link_starts order by code`),
  t: await q(`select code, rev, status, updated_at, xmin::text as x from private.tournaments order by code`),
  f: await q(`select code, id, status, live_code, updated_at, xmin::text as x from private.tournament_fixtures order by code, id`),
});
const s1 = await state();
const a1 = await mine(ASHA);
for (const u of [ASHA, RAVI, NOLINKS, NOBODY, null]) await mine(u);
await mine(ASHA, "wrong");
eq(await state(), s1, "a read changes no row of any table");
await db.exec(`begin; ${NEW}; commit;`);
eq(await state(), s1, "run again: nothing changes");
eq(await mine(ASHA), a1, "and it answers the same");
eq((await one(`select count(*)::int as n from pg_proc where proname = 'live_links_mine'`)).n, 1, "no overload after running it twice");
eq(await priv("live_links_mine"), await priv("tournament_mine"), "the grants are still tournament_mine's");
eq(await fns(), before.fns, "every function from before is as it was (tournament_mine, live_tournament and the live writes among them)");
eq(await columns(), before.columns, "every table has the columns it had, and there is no new table");
eq(await indexes(), before.indexes, "no index was added");

console.log(`live_mine: ${passed} checks passed`);
