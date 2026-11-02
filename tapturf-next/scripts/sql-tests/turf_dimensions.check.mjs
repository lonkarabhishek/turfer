// Applies 20261102_turf_dimensions.sql (twice) to an in-memory Postgres
// (PGlite) built by turf_dimensions.db.mjs (the real helper bodies it calls,
// stand-ins for the account lookups and the cache queue) and checks: the
// column and its constraint (every shape the page could misread refused,
// for the data team's role too, which writes turfs without the private
// schema); who may save (the server key; an active claim for the account or
// from before claims named it, turfs.owner_id, or the site owner; never a
// pending, rejected or revoked claim, another turf's owner or a stranger;
// an unlisted turf is gone); every shared case in feet from
// lib/turfSize/cases.json, answered as lib/turfSize/sizes.ts answers it;
// what a save stores, logs and queues (the page only, urgent; never a
// list); a save that changes nothing writing nothing; 20 saves a turf in
// 24 hours; taking the sizes off; the form's read; the peers; and the grants.
// Never touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/turf_dimensions.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { KEY, adminPhone, setupSql } from "./turf_dimensions.db.mjs";

const [M] = process.argv.slice(2);
assert.ok(M, "pass the migrations folder");
const FILE = `${M}/20261102_turf_dimensions.sql`;
const CASES = JSON.parse(fs.readFileSync(path.join(M, "../../lib/turfSize/cases.json"), "utf8")).cases;
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const refused = async (p, re, w) => { await assert.rejects(p, re, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
// Not even inside a word: "dropped", "deleted" and "truncated" are out too.
ok(!/drop|delete|truncate/i.test(sql), "written without the words drop, delete and truncate");
ok(!/[—–]/.test(sql), "no em or en dashes");
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.\w+/i.test(sql.replace(/on function public\.[^;]*;/gi, "")), "no table grant on a public table changes");
ok(!/(alter|create)\s+policy/i.test(sql), "no policy is made or changed");
ok(!/create or replace function public\.(turf_page|owner_\w+)\b/.test(sql), "no existing function body replaced");

const db = new PGlite();
await db.exec(setupSql(M));
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const asRole = async (role, fn) => {
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); }
};

const T = (n) => `aaaaaaaa-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const U = (n) => `bbbbbbbb-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
await q(`insert into public.turfs (id, slug, name, city, is_active, owner_id, length_feet, width_feet, height_feet) values
  ('${T(1)}', 'kage-turf', 'Kage Turf', 'nashik', true, null, 120, 60, 30),
  ('${T(2)}', 'two-boxes', 'Two Boxes', 'nashik', true, '${U(4)}', null, null, null),
  ('${T(3)}', 'off-turf', 'Off Turf', 'pune', false, null, null, null, null),
  ('${T(4)}', null, 'No Slug', 'pune', true, null, null, null, null)`);
// U1 active owner by account; U2 pending; U3 revoked; U4 turfs.owner_id of T2; U5 an old claim by key;
// U6 the site owner (by number); U7 a stranger; U8 active on T2 only; U9 the site owner by Google.
const ADMIN = adminPhone(M);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status) values
  ('${T(1)}', 'p:9800000001', '${U(1)}', 'active'),
  ('${T(1)}', 'p:9800000002', '${U(2)}', 'pending'),
  ('${T(1)}', 'p:9800000003', '${U(3)}', 'revoked'),
  ('${T(1)}', 'e:old@x.in', null, 'active'),
  ('${T(1)}', 'p:9800000010', '${U(10)}', 'rejected'),
  ('${T(2)}', 'p:9800000008', '${U(8)}', 'active')`);
await q(`insert into private.key_accounts values ('e:old@x.in', '${U(5)}')`);
await q(`insert into private.proven_phones values ('${U(6)}', $1), ('${U(1)}', '9800000001')`, [ADMIN]);
await q(`insert into auth.users values ('${U(9)}', 'LonkarAbhishek00@gmail.com'), ('${U(7)}', 'stranger@x.in')`);

// What a migration that fails half way would leave: nothing. Before it, the column isn't there.
eq((await one(`select count(*)::int n from information_schema.columns where table_name = 'turfs' and column_name = 'ground_sizes'`)).n, 0, "no column before");

await db.exec(sql);
await db.exec(sql);
passed++;
eq((await one(`select is_nullable, data_type from information_schema.columns where table_name = 'turfs' and column_name = 'ground_sizes'`)), { is_nullable: "YES", data_type: "jsonb" }, "one nullable jsonb column");
eq((await one(`select count(*)::int n from pg_constraint where conname = 'turfs_ground_sizes_ok'`)).n, 1, "its check, once (applied twice)");
eq((await q(`select ground_sizes from public.turfs where ground_sizes is not null`)), [], "every turf without sizes to start");

const save = async (user, turf, sizes, key = KEY) => (await one(`select public.turf_ground_sizes_save($1, $2::uuid, $3::uuid, $4::jsonb) j`, [key, user, turf, JSON.stringify(sizes)])).j;
const mine = async (user, turf, key = KEY) => (await one(`select public.turf_ground_sizes_mine($1, $2::uuid, $3::uuid) j`, [key, user, turf])).j;
const stored = async (turf) => (await one(`select ground_sizes g from public.turfs where id = $1`, [turf])).g;
const dirty = async () => { const r = await q("select keys, urgent from private.dirty_log order by id"); await q("truncate private.dirty_log"); return r; };
const logRows = async (turf) => q(`select user_key, before, after from public.turf_edit_log where turf_id = $1 order by id`, [turf]);
const box = (l, w, h, extra = {}) => ({ name: null, sport: null, length_ft: l, width_ft: w, height_ft: h, ...extra });
await dirty();

/* ---------------- who may save ---------------- */
const S = { unit: "ft", grounds: [box(120, 60, 40)] };
eq(await save(U(1), T(1), S, "wrong-key"), { r: "unavailable" }, "a wrong server key");
eq(await save(U(1), T(1), S, null), { r: "unavailable" }, "no server key");
eq(await save(U(2), T(1), S), { r: "forbidden" }, "a pending claim: account_manages_turf counts it, a save never does");
eq(await save(U(3), T(1), S), { r: "forbidden" }, "a revoked claim");
eq(await save(U(10), T(1), S), { r: "forbidden" }, "a rejected claim");
eq(await save(U(7), T(1), S), { r: "forbidden" }, "a stranger (with a Google sign-in)");
eq(await save(U(8), T(1), S), { r: "forbidden" }, "the owner of another turf");
eq(await save(U(4), T(1), S), { r: "forbidden" }, "turfs.owner_id of another turf");
eq(await save(null, T(1), S), { r: "forbidden" }, "no account");
eq(await save(U(1), T(3), S), { r: "gone" }, "an unlisted turf");
eq(await save(U(1), "cccccccc-0000-4000-8000-000000000000", S), { r: "gone" }, "no such turf");
eq(await stored(T(1)), null, "none of those wrote anything");
eq(await logRows(T(1)), [], "or logged anything");
eq(await dirty(), [], "or queued anything");

const okSave = async (user, turf, sizes) => {
  const r = await save(user, turf, sizes);
  assert.equal(r.r, "ok", JSON.stringify(r));
  return r;
};
ok((await okSave(U(1), T(1), S)).changed, "an active claim for the account");
ok((await okSave(U(5), T(1), { unit: "ft", grounds: [box(121, 60, 40)] })).changed, "an active claim from before claims named the account, under a sign-in that opens it");
ok((await okSave(U(4), T(2), S)).changed, "turfs.owner_id");
ok((await okSave(U(8), T(2), { unit: "ft", grounds: [box(130, 60, 40)] })).changed, "an active claim on that turf");
ok((await okSave(U(6), T(1), { unit: "ft", grounds: [box(122, 60, 40)] })).changed, "the site owner by number, any turf");
ok((await okSave(U(9), T(4), S)).changed, "the site owner by Google, any turf (the address in any case)");
await q("truncate public.turf_edit_log");
await q("update public.turfs set ground_sizes = null where id in ($1, $2, $3)", [T(1), T(2), T(4)]);
await dirty();

/* ---------------- the shared cases, as sizes.ts answers them ---------------- */
let cases = 0;
for (const c of CASES) {
  if (c.unit !== "ft" || c.sql === false) continue;
  const grounds = c.grounds.map((g) => {
    const o = {};
    if ("name" in g) o.name = g.name;
    if ("sport" in g) o.sport = g.sport;
    for (const d of ["length", "width", "height"]) if (d in g) o[`${d}_ft`] = g[d];
    return o;
  });
  await q("update public.turfs set ground_sizes = null where id = $1", [T(1)]);
  await q("truncate public.turf_edit_log");
  const r = await save(U(1), T(1), { unit: "ft", grounds });
  if (c.ok) {
    eq(r.r, "ok", `${c.what}: saved`);
    eq(r.ground_sizes === null ? [] : r.ground_sizes.grounds, c.ok, `${c.what}: stored as sizes.ts stores it`);
  } else {
    eq({ r: r.r, ground: r.ground, field: r.field }, { r: "bad", ground: c.problem.ground, field: c.problem.field }, `${c.what}: refused on the same box`);
  }
  cases++;
}
ok(cases >= 20, `${cases} shared cases in feet`);
eq(await save(U(1), T(1), { unit: "yards", grounds: [] }), { r: "bad", ground: -1, field: "unit" }, "a unit that is not ft or m");
eq(await save(U(1), T(1), { grounds: "x" }), { r: "bad", ground: -1, field: "grounds" }, "no list");
eq(await save(U(1), T(1), null), { r: "bad", ground: -1, field: "grounds" }, "nothing at all");
eq(await save(U(1), T(1), { unit: "ft", grounds: [{ length_ft: "120", width_ft: 60 }] }), { r: "bad", ground: 0, field: "length" }, "a number as text (the route sends numbers)");
eq(await save(U(1), T(1), { unit: "ft", grounds: [7] }), { r: "bad", ground: 0, field: "grounds" }, "a ground that is not an object");
eq(await save(U(1), T(1), { unit: "ft", grounds: [{ name: 5, length_ft: 120, width_ft: 60 }] }), { r: "bad", ground: 0, field: "name" }, "a name that is not text");

/* ---------------- what a save stores, logs and queues ---------------- */
await q("update public.turfs set ground_sizes = null, updated_at = '2026-10-01' where id = $1", [T(1)]);
await q("truncate public.turf_edit_log");
await dirty();
const two = { unit: "m", grounds: [box(120.1, 60, 40, { name: "Box 1", sport: "cricket" }), box(90, 45, null, { name: "Box 2", sport: "football" })] };
const r1 = await okSave(U(1), T(1), two);
const g1 = await stored(T(1));
eq(Object.keys(g1).sort(), ["grounds", "source", "unit", "updated_at"], "the stored keys");
eq(g1.grounds, two.grounds, "both grounds, in order");
eq([g1.unit, g1.source], ["m", "owner"], "the owner's unit, source owner");
ok(Math.abs(Date.parse(g1.updated_at) - Date.now()) < 60_000, "dated now");
eq(r1.ground_sizes, g1, "the answer carries what was stored");
eq(r1.saves_left, 19, "19 saves left today");
ok((await one(`select updated_at > now() - interval '1 minute' f from public.turfs where id = $1`, [T(1)])).f, "turfs.updated_at moves, as for any owner edit");
eq(await logRows(T(1)), [{ user_key: `account:${U(1)}`, before: { ground_sizes: null }, after: { ground_sizes: g1 } }], "logged, by account");
eq(await dirty(), [{ keys: ["turf:kage-turf"], urgent: false }, { keys: ["turf:kage-turf"], urgent: true }],
  "the page only (the trigger counts the column as DETAIL: no list), and urgent");

// The same again (numbers as 120.10 or 120): nothing written, logged, queued or counted.
const same = await okSave(U(1), T(1), { unit: "m", grounds: [box(120.1, 60.0, 40, { name: " Box  1 ", sport: "cricket" }), box(90, 45, null, { name: "Box 2", sport: "football" })] });
eq([same.changed, same.saves_left], [false, 19], "the same grounds: no change");
eq((await logRows(T(1))).length, 1, "not logged");
eq(await dirty(), [], "not queued");
ok((await okSave(U(1), T(1), { unit: "ft", grounds: two.grounds })).changed, "only the unit: a change (the form shows it again)");

// Taking them off.
const off = await okSave(U(1), T(1), { unit: "ft", grounds: [] });
eq([off.changed, off.ground_sizes], [true, null], "an empty list takes the sizes off");
eq(await stored(T(1)), null, "none stored");
eq((await logRows(T(1))).at(-1).after, { ground_sizes: null }, "logged as off");
eq((await okSave(U(1), T(1), { unit: "ft", grounds: [] })).changed, false, "off again: no change");
await dirty();

/* ---------------- 20 saves a turf in 24 hours ---------------- */
await q("truncate public.turf_edit_log");
let left;
for (let i = 0; i < 20; i++) left = (await okSave(i % 2 ? U(1) : U(6), T(1), { unit: "ft", grounds: [box(100 + i, 60, 30)] })).saves_left;
eq(left, 0, "the 20th leaves none");
eq(await save(U(1), T(1), { unit: "ft", grounds: [box(150, 60, 30)] }), { r: "limit" }, "the 21st is refused, whoever saves");
eq((await stored(T(1))).grounds[0].length_ft, 119, "the 20th is what stays");
eq((await okSave(U(1), T(1), { unit: "ft", grounds: [box(119, 60, 30)] })).changed, false, "a save that changes nothing still answers");
ok((await okSave(U(4), T(2), { unit: "ft", grounds: [box(150, 60, 30)] })).changed, "another turf has its own 20");
await q(`update public.turf_edit_log set created_at = now() - interval '25 hours' where turf_id = $1 and id in (select id from public.turf_edit_log where turf_id = $1 order by id limit 3)`, [T(1)]);
eq((await okSave(U(1), T(1), { unit: "ft", grounds: [box(150, 60, 30)] })).saves_left, 2, "saves older than 24 hours no longer count");
// Other edits in the log never count.
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) select $1, 'p:9800000001', '{}', '{"description": "x"}' from generate_series(1, 30)`, [T(1)]);
eq((await mine(U(1), T(1))).saves_left, 2, "an owner's other edits are not ground sizes");
await q("truncate public.turf_edit_log");
await dirty();

/* ---------------- the form's read ---------------- */
const m1 = await mine(U(1), T(1));
eq([m1.r, m1.ground_sizes.grounds.length, m1.saves_left], ["ok", 1, 20], "the saved sizes and the saves left");
eq(m1.legacy, { length_ft: 120, width_ft: 60, height_ft: 30 }, "the researched size, to check");
eq((await mine(U(4), T(2))).legacy, null, "no researched size: none");
eq(await mine(U(2), T(1)), { r: "forbidden" }, "pending: no read");
eq(await mine(U(7), T(1)), { r: "forbidden" }, "a stranger: no read");
eq(await mine(U(1), T(1), "nope"), { r: "unavailable" }, "the key");
eq(await mine(U(1), T(3)), { r: "gone" }, "an unlisted turf");

/* ---------------- the stored shape: nobody can write another ---------------- */
const good = await stored(T(1));
const badShapes = [
  ["a bare list", [good.grounds[0]]],
  ["no grounds", { ...good, grounds: [] }],
  ["five grounds", { ...good, grounds: Array(5).fill(good.grounds[0]) }],
  ["another source", { ...good, source: "research" }],
  ["another unit", { ...good, unit: "yd" }],
  ["no date", { ...good, updated_at: null }],
  ["an extra key", { ...good, note: "x" }],
  ["a ground with an extra key", { ...good, grounds: [{ ...good.grounds[0], colour: "green" }] }],
  ["width over length", { ...good, grounds: [box(60, 120, 30)] }],
  ["too long", { ...good, grounds: [box(401, 60, 30)] }],
  ["nets too high", { ...good, grounds: [box(120, 60, 121)] }],
  ["not to 0.1 ft", { ...good, grounds: [box(120.05, 60, 30)] }],
  ["an untrimmed name", { ...good, grounds: [box(120, 60, 30, { name: " Box" })] }],
  ["an empty name", { ...good, grounds: [box(120, 60, 30, { name: "" })] }],
  ["another sport", { ...good, grounds: [box(120, 60, 30, { sport: "tennis" })] }],
  ["a length as text", { ...good, grounds: [{ ...box(120, 60, 30), length_ft: "120" }] }],
];
for (const [what, v] of badShapes) {
  await refused(asRole("data_team", () => q(`update public.turfs set ground_sizes = $1::jsonb where id = $2`, [JSON.stringify(v), T(4)])), /turfs_ground_sizes_ok|check constraint|invalid input syntax/, `refused: ${what}`);
}
eq((await asRole("data_team", () => db.query(`update public.turfs set ground_sizes = $1::jsonb where id = $2`, [JSON.stringify({ ...good, grounds: [box(120, 60, null)] }), T(4)]))).affectedRows, 1, "the data team's role writes a good shape");
eq((await stored(T(4))).grounds[0].height_ft, null, "without the private schema");
eq((await asRole("data_team", () => db.query(`update public.turfs set name = 'No Slug Turf' where id = $1`, [T(4)]))).affectedRows, 1, "and any other column, the check passing on the row's sizes");
await refused(asRole("anon", () => q(`update public.turfs set ground_sizes = null where id = $1`, [T(1)])), /permission denied/, "anon can't write turfs");
await refused(asRole("authenticated", () => q(`update public.turfs set ground_sizes = null where id = $1`, [T(1)])), /permission denied/, "nor a signed-in browser");
await dirty();

/* ---------------- the peers ---------------- */
await q("update public.turfs set ground_sizes = $1::jsonb where id = $2", [JSON.stringify({ ...good, grounds: [box(150, 80, 45), box(90, 50, null)] }), T(3)]);
const peers = (await one(`select public.turf_ground_size_peers() j`)).j;
eq(peers, [
  [T(1), "nashik", [[150, 60, 30]]],
  [T(2), "nashik", [[150, 60, 30]]],
  [T(4), "pune", [[120, 60, null]]],
], "every active turf with sizes, numbers only, by id (an unlisted one left out)");
eq(await asRole("anon", async () => (await one(`select public.turf_ground_size_peers() j`)).j), peers, "anon gets the same");
await q("update public.turfs set ground_sizes = null where id in ($1, $2, $3, $4)", [T(1), T(2), T(3), T(4)]);
eq((await one(`select public.turf_ground_size_peers() j`)).j, [], "none: an empty list");

/* ---------------- grants ---------------- */
const can = async (role, fn) => (await one(`select has_function_privilege($1, $2, 'execute') x`, [role, fn])).x;
for (const fn of ["public.turf_ground_sizes_save(text, uuid, uuid, jsonb)", "public.turf_ground_sizes_mine(text, uuid, uuid)", "public.turf_ground_size_peers()"]) {
  eq([await can("anon", fn), await can("authenticated", fn), await can("nobody", fn)], [true, true, false], `${fn}: anon and authenticated, not PUBLIC`);
}
for (const fn of ["private.turf_ground_sizes_editor(uuid, uuid)", "private.turf_ground_sizes_left(uuid)"]) {
  eq([await can("anon", fn), await can("authenticated", fn), await can("nobody", fn)], [false, false, false], `${fn}: closed`);
}
eq(await can("nobody", "private.turf_ground_sizes_ok(jsonb)"), true, "the shape check: PUBLIC, since it runs as whoever writes a row");
const defs = await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname like 'turf_ground_size%' order by 1`);
eq(defs.map((d) => [d.proname, d.prosecdef, d.proconfig]), [
  ["turf_ground_size_peers", false, ["search_path=\"\""]],
  ["turf_ground_sizes_editor", true, ["search_path=\"\""]],
  ["turf_ground_sizes_left", true, ["search_path=\"\""]],
  ["turf_ground_sizes_mine", true, ["search_path=\"\""]],
  ["turf_ground_sizes_ok", false, ["search_path=\"\""]],
  ["turf_ground_sizes_save", true, ["search_path=\"\""]],
], "definers where they must be, every one with an empty search_path");

console.log(`turf_dimensions: ${passed} checks passed`);
await db.close();
