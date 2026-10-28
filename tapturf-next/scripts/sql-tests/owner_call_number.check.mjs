// Applies the account, contact-email, admin-verified, auth-mirror, myTapturf,
// claims-account, people and lockdown-step-4 migrations to stand-ins for
// Supabase in an in-memory Postgres (PGlite), then 20261026_account_links.sql
// and 20261026_account_links_reads.sql (as account_links.check.mjs does), then
// 20261028_owner_call_number.sql twice, and checks that a turf owner can change
// the call number: a mobile or a landline with its STD code, written over every
// number the Call button could dial and logged; bad numbers refused; the 14-day
// hold for a claim opened with a code to someone else's number, for both
// numbers; the admin never held; clearing a number, never the last one; and the
// claim-anchor rule (a number an owner set opens no claim at once, nor does the
// researched number it replaced). Then, in the database game_reports.check.mjs
// uses, that owner_dashboard returns the three numbers and is otherwise the same.
// Never touches a real database. Made-up numbers only.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/owner_call_number.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { makeDb } from "./game_reports.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261028_owner_call_number.sql`;
const NEW = fs.readFileSync(FILE, "utf8");
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };

// ── The file. ──
assert.doesNotMatch(NEW, /\bdrop\b|\bdelete\b|\btruncate\b/i, "no destructive keywords");
assert.doesNotMatch(NEW, /[—–]/, "no em or en dashes");
passed += 2;
// Exactly what its generator makes from the live bodies (whose md5s it checks).
const regen = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "owner-call-")), "out.sql");
execFileSync(process.execPath, [new URL("./build_owner_call_number.mjs", import.meta.url).pathname, M, regen]);
eq(fs.readFileSync(regen, "utf8"), NEW, "the file is the generated one");
fs.rmSync(path.dirname(regen), { recursive: true, force: true });

// ── The database before it (account_links.check.mjs's stand-ins and migrations). ──
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema extensions;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('live_write', 'L'||repeat('1', 63));
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, phone text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text not null,
  identity_data jsonb not null, created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table public.users (
  id uuid not null default gen_random_uuid() primary key,
  email varchar unique, password varchar, name varchar not null, phone varchar,
  role varchar default 'user' check (role in ('user','owner','admin')),
  is_verified boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(),
  profile_image_url text, firebase_uid text unique);
create unique index users_phone_key on public.users (phone) where phone is not null;
alter table public.users enable row level security;
create policy "Anyone can insert users" on public.users for insert with check (true);
grant select, insert, update, delete on public.users to anon, authenticated;
create table public.user_logins (id bigint generated always as identity primary key, user_id uuid not null,
  method text not null check (method in ('phone','google')), created_at timestamptz not null default now());
create table public.live_matches (code text primary key, match jsonb, rev bigint, status text, updated_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name text, slug text, city text, area text, address text, is_active boolean default true,
  contact_info jsonb, owner_phone text, whatsapp_phone text, landline_phone text, cover_image text, images jsonb, owner_id uuid,
  morning_price int, afternoon_price int, evening_price int, weekend_morning_price int, weekend_afternoon_price int, weekend_evening_price int,
  has_floodlights boolean, is_covered boolean, parking_available boolean, washroom_available boolean, changing_room_available boolean,
  has_cafeteria boolean, has_drinking_water boolean, equipment_provided boolean, is_24x7 boolean, start_time time, end_time time,
  closed_days text, description text, surface_type text, number_of_grounds int, formats jsonb, opening_hours jsonb,
  price_owner_confirmed boolean, price_verified_at timestamptz, price_unit text, updated_at timestamptz default now());
create table public.games (id uuid primary key default gen_random_uuid(), creator_id uuid, turf_id uuid, host_name text, date date, status text, created_at timestamptz default now());
create table public.game_requests (id uuid primary key default gen_random_uuid(), user_id uuid, game_id uuid, requester_name text, status text, created_at timestamptz default now());
create table public.game_participants (id uuid primary key default gen_random_uuid(), game_id uuid, user_id uuid, joined_at timestamptz default now());
create table public.reviews (id uuid primary key default gen_random_uuid(), turf_id uuid, user_id uuid, rating int, comment text, author_name text, source text, created_at timestamptz default now());
create table public.review_votes (review_id uuid, user_id uuid);
create table public.bookings (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.turf_contact_clicks (id bigint generated always as identity primary key, turf_id uuid, user_id uuid, kind text, created_at timestamptz default now());
create table public.ask_queries (id bigint generated always as identity primary key, user_id uuid, query text, filters jsonb, created_at timestamptz default now());
create table public.turf_suggestions (id uuid primary key default gen_random_uuid(), turf_id uuid not null, user_id uuid, contact_phone text, whatsapp_phone text,
  status text not null default 'pending', created_at timestamptz not null default now(), moderated_at timestamptz, ai_review jsonb, notes text);
create table public.turf_suggestion_edits (id uuid primary key default gen_random_uuid(), suggestion_id uuid not null, changes jsonb not null, created_at timestamptz not null default now());
create table public.user_signup_context (user_id uuid primary key, ctx jsonb, created_at timestamptz default now());
create table private.user_cities (user_id uuid primary key, city text, source text, ip_city text, at_signup boolean, updated_at timestamptz);
`);
const MIG = ["20261019_mytapturf.sql", "20261019_mytapturf_claims.sql", "20261021_accounts_usernames.sql", "20261021_accounts_fixes.sql",
  "20261021_phone_identity_exact_india.sql", "20261022_people_fixes.sql", "20261025_contact_email.sql", "20261025_admin_verified.sql",
  "20261025_auth_mirror_google_only.sql", "20261025_claims_account.sql", "20261024_users_lockdown_step4.sql",
  "20261026_account_links.sql", "20261026_account_links_reads.sql"];
for (const f of MIG) await db.exec(fs.readFileSync(`${M}/${f}`, "utf8"));

// What production has for the functions the file replaces (pg_proc, read 2026-10-28), before and after.
const FNS = [["public", "owner_update_turf"], ["private", "turf_trusted_phones"], ["public", "owner_dashboard"], ["public", "admin_owner_claims"], ["private", "call_phone10"]];
const sigs = async () => (await q(`
  select n.nspname || '.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
         || ' ' || p.prosecdef::text || ' ' || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' '
         || case when has_function_privilege('anon', p.oid, 'execute') then 'a' else '-' end
         || case when has_function_privilege('authenticated', p.oid, 'execute') then 'a' else '-' end
         || case when has_function_privilege('public', p.oid, 'execute') then 'p' else '-' end as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (${FNS.map(([s, f]) => `('${s}', '${f}')`).join(", ")})
   order by 1`)).map((x) => x.sig);
const LIVE_SIGS = [
  `private.turf_trusted_phones(p_turf_id uuid) -> text[] true s search_path="" ---`,
  `public.admin_owner_claims(p_firebase_token text DEFAULT NULL::text) -> jsonb true v search_path=public aap`,
  `public.owner_dashboard(p_token text, p_turf_id uuid, p_days integer DEFAULT 30) -> jsonb true v search_path=public aap`,
  `public.owner_update_turf(p_token text, p_turf_id uuid, p_patch jsonb) -> jsonb true v search_path=public aap`,
];
eq(await sigs(), LIVE_SIGS, "before: the stand-in matches production's signatures, settings and grants");

// Firebase can't be reached here: _caller_key and firebase_phone10 stand-ins, as in claims_account.check.mjs.
const STANDINS = `
create or replace function private.firebase_phone10(p_token text) returns text language sql as
  $$ select case when p_token ~ '^proof:[6-9][0-9]{9}$' then substr(p_token, 7) end $$;
create or replace function public._caller_key(p_token text) returns text language sql security definer set search_path = public as $$
  select case when lower(coalesce(auth.jwt() ->> 'email', '')) <> '' and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
                   and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
              then 'e:' || lower(auth.jwt() ->> 'email')
              when p_token ~ '^phone:[6-9][0-9]{9}$' then 'p:' || substr(p_token, 7) end $$;
create or replace function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;
`;
await db.exec(STANDINS);

const KEY = (await one("select value from private.app_secrets where name = 'account'")).value;
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const phoneAccount = async (p10, name) => {
  const r = await rpc("account_resolve", [KEY, "phone", `+91${p10}`, null, null, name, null, true, false]);
  assert.equal(r.r, "ok", `account for ${name}`);
  return r.id;
};
const tp = async (turf) => (await one("select private.turf_trusted_phones($1) p", [turf])).p;
const turf = (id) => one(`select owner_phone, contact_info, landline_phone, whatsapp_phone, morning_price from public.turfs where id = $1`, [id]);
const logs = (id) => q(`select user_key, before, after from public.turf_edit_log where turf_id = $1 order by created_at, id`, [id]);
const update = (who, id, patch) => rpc("owner_update_turf", [`phone:${who}`, id, JSON.stringify(patch)]);

// ── Turfs and the people who manage them, before the file. ──
const T = (i) => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, "0")}`;
await q(`insert into public.turfs (id, name, slug, city, owner_phone, contact_info, landline_phone, whatsapp_phone) values
  ('${T(1)}', 'One', 'one', 'nashik', '+91 90000 00101', '{"phone":"+91 90000 00101","email":"one@example.com","website":"https://one.example"}', '0253 2350977', null),
  ('${T(2)}', 'Two', 'two', 'pune', '9000000201', null, null, null),
  ('${T(3)}', 'Three', 'three', 'nashik', null, '{"website":"https://three.example"}', '0253 2350978', '+919000000302'),
  ('${T(4)}', 'Four', 'four', 'pune', '9000000401', '{"phone":"9000000401"}', null, null)`);
const A = await phoneAccount("9000000101", "Asha Owner");
const S = await phoneAccount("9000000102", "Stranger Code");
const C = await phoneAccount("9000000103", "Chirag Later");
const W = await phoneAccount("9000000302", "Wasim Three");
eq(await rpc("owner_claim", ["phone:9000000101", T(1), null, null, "owner"]), { status: "active" }, "A's own number is on One: in at once");
eq(await rpc("owner_claim_verified", ["phone:9000000102", "proof:9000000201", T(2), null, "manager"]), { status: "active" }, "S opens Two with a code to its listed number (someone else's)");
eq(await rpc("owner_claim", ["phone:9000000302", T(3), null, null, "owner"]), { status: "active" }, "W's number is Three's WhatsApp: in at once");
ok(A && S && C && W, "four accounts");
eq((await tp(T(1))).includes("9000000101"), true, "before: One's researched number opens it at once");
eq(await tp(T(4)), ["9000000401", "9000000401"], "before: Four's listing phone and owner number both count");
// A number that came from a public suggestion, mirrored into the listing phone (the data team's pattern).
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T(4)}', 'suggestion:s1', '{"owner_phone":"9000000400"}', '{"owner_phone":"9000000401"}')`);
eq(await tp(T(4)), ["9000000401"], "before the file: the listing phone still counts though a suggestion put it there");

await db.exec(NEW);
await db.exec(NEW); // safe to run again
await db.exec(STANDINS);
eq(await sigs(), [`private.call_phone10(p text) -> text false i search_path="" ---`, ...LIVE_SIGS], "after: the same signatures, settings and grants, and call_phone10 closed");

// ── call_phone10 agrees with the editor (lib/my/numberCases.json, also run against normalizeIndianPhone). ──
const CASES = JSON.parse(fs.readFileSync(new URL("../../lib/my/numberCases.json", import.meta.url), "utf8")).cases;
for (const [typed, want] of CASES) eq((await one("select private.call_phone10($1) p", [typed])).p, want, `call_phone10(${JSON.stringify(typed)})`);
eq((await one("select private.call_phone10(null) p")).p, null, "call_phone10(null)");

// ── Trust after the file: an owner-set or suggested listing phone opens nothing at once. ──
eq(await tp(T(4)), [], "a listing phone equal to a suggested owner_phone is not trusted");
eq((await tp(T(1))).includes("9000000101"), true, "a researched number still opens One at once");

// ── 1. Bad numbers: refused, nothing written. ──
const one0 = await turf(T(1));
const logs0 = (await logs(T(1))).length;
for (const bad of ["2350977", "23509770", "1800 123 4567", "+1 415 555 0100", "12345", "call me", "+91 0253 2350977"]) {
  eq(await update("9000000101", T(1), { owner_phone: bad }), { error: "bad_value", field: "owner_phone" }, `refused: ${bad}`);
}
eq(await update("9000000101", T(1), { whatsapp_phone: "0253 2350977" }), { error: "bad_value", field: "whatsapp_phone" }, "a landline can't be the WhatsApp number");
eq(await update("9000000101", T(1), { morning_price: "800", owner_phone: "1800 123 4567" }), { error: "bad_value", field: "owner_phone" }, "with a price: nothing saves");
eq(await turf(T(1)), one0, "nothing written");
eq((await logs(T(1))).length, logs0, "nothing logged");

// ── 2. Patch keys contact_info and landline_phone are not the owner's to send. ──
eq(await update("9000000101", T(1), { contact_info: { phone: "9000000999" }, landline_phone: "0253 1111111" }), { ok: true, changed: [] }, "ignored");
eq(await turf(T(1)), one0, "still nothing written");

// ── 3. A mobile: written over every number the Call button could dial, other contact keys kept, logged. ──
let r = await update("9000000101", T(1), { owner_phone: "98765 43210" });
eq([r.ok, [...r.changed].sort()], [true, ["contact_info", "landline_phone", "owner_phone"]], "saved");
eq(await turf(T(1)), {
  owner_phone: "+919876543210", contact_info: { phone: "+919876543210", email: "one@example.com", website: "https://one.example" },
  landline_phone: null, whatsapp_phone: null, morning_price: null,
}, "owner_phone and the listing phone are the new number, the landline is emptied, email and website stay");
let L = await logs(T(1));
eq(L.length, logs0 + 1, "one log row");
eq(L.at(-1), {
  user_key: "p:9000000101",
  before: { owner_phone: "+91 90000 00101", contact_info: { phone: "+91 90000 00101", email: "one@example.com", website: "https://one.example" }, landline_phone: "0253 2350977" },
  after: { owner_phone: "+919876543210", contact_info: { phone: "+919876543210", email: "one@example.com", website: "https://one.example" }, landline_phone: null },
}, "the log keeps every old value");

// ── 4. Trust: neither the old nor the new number opens One at once now. ──
eq(await tp(T(1)), [], "the replaced researched number and the owner's new one: neither");
eq(await rpc("owner_phone_listed", ["phone:9000000103", T(1), "9876543210"]), { listed: false, blocked: true }, "the owner's new number: a check by hand");
eq(await rpc("owner_phone_listed", ["phone:9000000103", T(1), "9000000101"]), { listed: false }, "the old number is not on the listing");
eq(await rpc("owner_claim_verified", ["phone:9000000103", "proof:9876543210", T(1), null, "staff"]), { error: "needs_check" }, "a code to the owner's new number: a check by hand");
eq(await rpc("owner_claim_info", ["phone:9000000103", T(1)]), { mobiles: 0, endings: [] }, "the claim form offers no number to send a code to");
eq((await one(`select public._can_manage('p:9000000103', '${T(1)}') c`)).c, false, "C is not in");
eq(await rpc("owner_claim", ["phone:9876543210", T(1), null, null, null]).catch(() => null), { error: "no_account" }, "the new number's own sign-in (no account) gets nowhere at once either");

// ── 5. A landline with its STD code. ──
r = await update("9000000101", T(1), { owner_phone: "022-2437-9284" });
eq([r.ok, [...r.changed].sort()], [true, ["contact_info", "owner_phone"]], "a landline saves (no landline column left to empty)");
eq((await turf(T(1))).owner_phone, "+912224379284", "stored as +91 and the 10 digits");
eq((await turf(T(1))).contact_info.phone, "+912224379284", "mirrored");
eq(await tp(T(1)), [], "a landline is never a way in");
// Three: landline only, no listing phone key: the landline is emptied, contact_info never gets a phone key.
r = await update("9000000302", T(3), { owner_phone: "0253 235 0977" });
eq([r.ok, [...r.changed].sort()], [true, ["landline_phone", "owner_phone"]], "Three: saved");
eq(await turf(T(3)), { owner_phone: "+912532350977", contact_info: { website: "https://three.example" }, landline_phone: null, whatsapp_phone: "+919000000302", morning_price: null },
  "Three: the landline moves into owner_phone, contact_info keeps no phone key");
eq((await logs(T(3))).at(-1).before, { owner_phone: null, landline_phone: "0253 2350978" }, "Three: the old landline is logged");

// ── 6. Clearing: never the last number. ──
const before6 = await turf(T(1));
eq(await update("9000000101", T(1), { owner_phone: "" }), { error: "no_number" }, "no WhatsApp: the call number can't be cleared");
eq(await update("9000000101", T(1), { owner_phone: "", whatsapp_phone: "" }), { error: "no_number" }, "nor both at once");
eq(await turf(T(1)), before6, "nothing written");
eq((await update("9000000101", T(1), { whatsapp_phone: "90000 00301" })).ok, true, "a WhatsApp number first (an own-number claim is never held)");
r = await update("9000000101", T(1), { owner_phone: "" });
eq([r.ok, [...r.changed].sort()], [true, ["contact_info", "owner_phone"]], "now the call number clears");
eq(await turf(T(1)), { owner_phone: null, contact_info: { email: "one@example.com", website: "https://one.example" }, landline_phone: null, whatsapp_phone: "+919000000301", morning_price: null },
  "owner_phone empty, the listing phone key taken out, the rest kept");
eq(await update("9000000101", T(1), { whatsapp_phone: "" }), { error: "no_number" }, "and the WhatsApp number can't go now");
eq((await update("9000000101", T(1), { owner_phone: "9876543210", whatsapp_phone: "" })).ok, true, "swapped in one save: a call number, no WhatsApp");
eq(await turf(T(1)), { owner_phone: "+919876543210", contact_info: { email: "one@example.com", website: "https://one.example" }, landline_phone: null, whatsapp_phone: null, morning_price: null },
  "no listing phone key is made where there was none");
eq((await update("9000000101", T(1), { morning_price: "900" })).ok, true, "a turf's other edits never need a number check");
// A turf with no number at all can still save the rest; a number save there needs a number.
await q(`insert into public.turfs (id, name, slug, city) values ('${T(5)}', 'Five', 'five', 'pune')`);
await q(`insert into public.turf_owners (turf_id, user_key, user_id, status, via) values ('${T(5)}', 'p:9000000101', '${A}', 'active', 'admin')`);
eq((await update("9000000101", T(5), { evening_price: "1200" })).ok, true, "Five has no number: prices still save");
eq(await update("9000000101", T(5), { whatsapp_phone: "" }), { error: "no_number" }, "clearing a WhatsApp number it doesn't have: refused (no number either way)");

// ── 7. The hold: a claim opened with a code to someone else's number, for 14 days, both numbers. ──
eq(await update("9000000102", T(2), { owner_phone: "9000000555" }), { error: "held", field: "owner_phone" }, "the call number is held");
eq(await update("9000000102", T(2), { whatsapp_phone: "9000000556" }), { error: "held", field: "whatsapp_phone" }, "the WhatsApp number is held");
eq(await update("9000000102", T(2), { whatsapp_phone: "9000000556", owner_phone: "9000000555" }), { error: "held", field: "owner_phone" }, "both: told about the call number");
eq(await update("9000000102", T(2), { owner_phone: "1800 123 4567" }), { error: "held", field: "owner_phone" }, "held before the number is even read");
eq((await update("9000000102", T(2), { morning_price: "700" })).ok, true, "prices still save");
eq(await turf(T(2)), { owner_phone: "9000000201", contact_info: null, landline_phone: null, whatsapp_phone: null, morning_price: 700 }, "no number changed");
// The admin is never held, and a number the admin sets is TapTurf's: trusted.
eq((await update("9403612979", T(2), { owner_phone: "9000000777" })).ok, true, "the admin changes it at once");
eq(await tp(T(2)), ["9000000777"], "a number the admin set opens the turf at once");
eq((await logs(T(2))).at(-1).user_key, "p:9403612979", "logged under the admin's key");
// 14 days on, the claimant can.
await q(`update public.turf_owners set decided_at = now() - interval '15 days' where turf_id = '${T(2)}' and user_key = 'p:9000000102'`);
r = await update("9000000102", T(2), { owner_phone: "9000000555" });
eq([r.ok, r.changed], [true, ["owner_phone"]], "after 14 days the call number changes");
eq(await turf(T(2)), { owner_phone: "+919000000555", contact_info: null, landline_phone: null, whatsapp_phone: null, morning_price: 700 }, "a null contact_info stays null");
eq(await tp(T(2)), [], "and the owner's number is not trusted");
eq((await update("9000000102", T(2), { whatsapp_phone: "9000000556" })).ok, true, "nor is WhatsApp held any more");
// A claim opened with a code to the account's own number is not held (W got in with its own number on Three).
eq((await update("9000000302", T(3), { whatsapp_phone: "9000000303" })).ok, true, "an own-number claim: never held");

// ── 8. The trusted-number cases from claims_account.check.mjs still hold. ──
const T6 = T(6);
await q(`insert into public.turfs (id, name, slug, city, whatsapp_phone, contact_info) values ('${T6}', 'Six', 'six', 'pune', '+919800000007', '{"phone":"9800000008"}')`);
eq(await tp(T6), ["9800000008", "9800000007"], "both listed numbers count");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T6}', 'e:someone@x.in', '{"whatsapp_phone":null}', '{"whatsapp_phone":"+919800000007"}')`);
eq(await tp(T6), ["9800000008"], "not the one an owner set");
eq(await rpc("owner_claim_info", ["phone:9000000103", T6]), { mobiles: 1, endings: ["08"] }, "the claim form only offers the other");
eq(await rpc("owner_phone_listed", ["phone:9000000103", T6, "9800000007"]), { listed: false, blocked: true }, "an owner-set number is not a way in: a check by hand");
await q(`update public.turfs set whatsapp_phone = '+919800000009' where id = '${T6}'`);
eq(await tp(T6), ["9800000008", "9800000009"], "a number changed since (by TapTurf) counts again");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T6}', 'suggestion:abc', '{"owner_phone":null}', '{"owner_phone":"9800000031"}')`);
await q(`update public.turfs set owner_phone = '9800000031' where id = '${T6}'`);
ok(!(await tp(T6)).includes("9800000031"), "a suggested number is not trusted");
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T6}', 'e:lonkarabhishek00@gmail.com', '{"owner_phone":"9800000031"}', '{"owner_phone":"9800000032"}')`);
await q(`update public.turfs set owner_phone = '9800000032' where id = '${T6}'`);
ok((await tp(T6)).includes("9800000032"), "one the site owner set is");
eq((await tp(T6))[0], "9800000008", "the researched listing phone (never logged as owner_phone) still counts");
// The same number saved again in another format by an owner keeps it TapTurf's.
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T6}', 'p:9800000097', '{"owner_phone":"9800000032"}', '{"owner_phone":"+91 98000 00032"}')`);
ok((await tp(T6)).includes("9800000032"), "a re-save of the same number in another format changes nothing");
// The listing phone the admin set through myTapturf is trusted too.
await q(`update public.turfs set contact_info = '{"phone":"+919000000777"}' where id = '${T(2)}'`);
await q(`insert into public.turf_edit_log (turf_id, user_key, before, after) values ('${T(2)}', 'p:9403612979', '{"owner_phone":"+919000000555"}', '{"owner_phone":"+919000000777"}')`);
await q(`update public.turfs set owner_phone = '+919000000777' where id = '${T(2)}'`);
eq(await tp(T(2)), ["9000000777", "9000000777"], "an admin-set call number, mirrored: both count");

// ── 9. Admin: the latest number changes on each claim's turf, newest first, at most 5. ──
eq(await rpc("admin_owner_claims", [null]), { error: "forbidden" }, "not the site owner");
await q(`select set_config('test.owner', 'yes', false)`);
const claims = await rpc("admin_owner_claims", [null]);
const c1 = claims.find((c) => c.turf_id === T(1));
const all1 = (await logs(T(1))).reverse().flatMap((l) => ["owner_phone", "whatsapp_phone"].filter((k) => k in l.after && l.before[k] !== l.after[k])
  .map((k) => ({ by: l.user_key, field: k, from: l.before[k] ?? null, to: l.after[k] ?? null })));
ok(all1.length > 5, `One has more than 5 number changes (${all1.length})`);
eq(c1.number_edits.length, 5, "at most 5");
eq(c1.number_edits.map(({ by, field, from, to }) => ({ by, field, from, to })), all1.slice(0, 5), "newest first, with who, which number, from and to");
ok(c1.number_edits.every((e, i, a) => i === 0 || Date.parse(a[i - 1].at) >= Date.parse(e.at)), "ordered by time");
const c3 = claims.find((c) => c.turf_id === T(3));
eq(c3.number_edits.map(({ field, from, to }) => ({ field, from, to })), [
  { field: "whatsapp_phone", from: "+919000000302", to: "+919000000303" },
  { field: "owner_phone", from: null, to: "+912532350977" },
], "Three: both changes");
const c2 = claims.find((c) => c.turf_id === T(2));
eq(c2.number_edits[0], { at: c2.number_edits[0].at, by: "p:9403612979", tapturf: true, field: "owner_phone", from: "+919000000555", to: "+919000000777" }, "Two: the admin's change last, marked as TapTurf's");
eq(c2.number_edits.map((e) => e.tapturf), [true, false, false, true], "Two: the owner's own changes are not TapTurf's");
ok(claims.every((c) => Array.isArray(c.number_edits)), "every claim has the list");
ok(claims.every((c) => "listed_phones" in c && "their_listed_phone" in c && "account" in c), "and keeps its other keys");
await q(`select set_config('test.owner', '', false)`);

// ── 10. Grants. ──
eq((await one(`select has_function_privilege('anon', 'private.call_phone10(text)', 'execute') a`)).a, false, "call_phone10 closed");
eq((await one(`select has_function_privilege('anon', 'private.turf_trusted_phones(uuid)', 'execute') a`)).a, false, "turf_trusted_phones closed");

// ── 11. owner_dashboard, in the database game_reports.check.mjs uses: three more keys, nothing else changed. ──
const db2 = await makeDb(PGlite, M);
const q2 = async (s, p) => (await db2.query(s, p)).rows;
await db2.exec(fs.readFileSync(`${M}/20261027_game_reports.sql`, "utf8"));
await q2(`alter table public.turfs add column if not exists landline_phone text`);
const U9 = "aaaaaaaa-aaaa-4aaa-8aaa-000000000009", T9 = "bbbbbbbb-bbbb-4bbb-8bbb-000000000009";
await q2(`insert into public.users (id, name, phone) values ('${U9}', 'Owner Nine', '+919000000909')`);
await q2(`insert into public.turfs (id, name, slug, city, sports, owner_phone, contact_info, landline_phone, whatsapp_phone) values
  ('${T9}', 'Nine', 'nine', 'pune', '["Football"]', '+91 90000 00901', '{"phone":"+91 90000 00901","email":"nine@example.com"}', '0253 2350979', '+919000000902')`);
await q2(`insert into public.turf_owners (turf_id, user_key, status, via, user_id) values ('${T9}', 'p:9000000909', 'active', 'phone_match', '${U9}')`);
const dash = async () => (await q2(`select public.owner_dashboard('phone:9000000909', '${T9}', 30) d`))[0].d;
const before = await dash();
ok(!("owner_phone" in before.turf), "before: no call number in the dashboard");
await q2(`set check_function_bodies = off`);
await db2.exec(NEW);
await q2(`reset check_function_bodies`);
const after = await dash();
eq([after.turf.owner_phone, after.turf.landline_phone, after.turf.contact_phone], ["+91 90000 00901", "0253 2350979", "+91 90000 00901"], "the three numbers the Call button picks from");
const strip = (d) => ({ ...d, turf: Object.fromEntries(Object.entries(d.turf).filter(([k]) => !["owner_phone", "landline_phone", "contact_phone"].includes(k))) });
eq(strip(after), before, "everything else is the same");
eq((await q2(`select public.owner_dashboard('phone:9000000999', '${T9}', 30) d`))[0].d, { error: "forbidden" }, "still only for those who manage it");

console.log(`owner_call_number: ${passed} checks passed`);
