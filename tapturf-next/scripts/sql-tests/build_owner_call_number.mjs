// Builds supabase/migrations/20261028_owner_call_number.sql from the live
// bodies (each one's migration file) plus exact replacements, each of which
// must apply exactly once. Every base body must still have the prosrc md5
// production had when this was last checked (LIVE below), so a changed file
// or a newer live body stops the build instead of being overwritten.
// Run: node scripts/sql-tests/build_owner_call_number.mjs supabase/migrations supabase/migrations/20261028_owner_call_number.sql
import fs from "node:fs";
import { createHash } from "node:crypto";
const [dir, out] = process.argv.slice(2);
const read = (f) => fs.readFileSync(`${dir}/${f}`, "utf8");

// md5(pg_proc.prosrc) on production, read 2026-10-28 (definitions only):
//   select p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
//    where (n.nspname, p.proname) in (('public','owner_update_turf'), ...);
const LIVE = {
  "20261026_account_links_reads.sql:359": "cf5f39068b40157e2cbad165afd2bbcb", // public.owner_update_turf(text, uuid, jsonb)
  "20261025_claims_account.sql:123": "b1b24305da9bae725c5916277b262285", // private.turf_trusted_phones(uuid)
  "20261027_game_reports.sql:1277": "86d72528a915294bedd20f59df7450a4", // public.owner_dashboard(text, uuid, integer)
  "20261025_claims_account.sql:730": "38f14cb4ff31b01d2689d461242e7cba", // public.admin_owner_claims(text)
};

/** The `create or replace function <sig>` statement starting at that line, to its closing `$$;`. */
function fn(file, startLine) {
  const lines = read(file).split("\n");
  const from = startLine - 1;
  assert(/^create or replace function /.test(lines[from]), `${file}:${startLine} is not a create`);
  const text = lines.slice(from).join("\n");
  const open = text.indexOf("$$");
  const close = text.indexOf("$$;", open + 2);
  const md5 = createHash("md5").update(text.slice(open + 2, close)).digest("hex");
  assert(LIVE[`${file}:${startLine}`] === md5, `${file}:${startLine}: body md5 ${md5} is not the live one`);
  return text.slice(0, close + 3);
}
function assert(c, m) {
  if (!c) throw new Error(m);
}
function edit(text, pairs, what) {
  for (const [a, b] of pairs) {
    const n = text.split(a).length - 1;
    assert(n === 1, `${what}: expected one match, found ${n}: ${a.slice(0, 80)}`);
    text = text.replace(a, () => b);
  }
  return text;
}

const parts = [];
parts.push(`-- myTapturf: an owner can change the turf's call number, not only its
-- WhatsApp number. Apply before the app code that sends owner_phone (the
-- editor shows the call field only once owner_dashboard returns it).
--
-- Body-only changes, same signatures, return types, settings and grants,
-- each copied from the live body (the file named above it) with the
-- changes marked (n):
--   owner_update_turf, marked (3) to (6) after the two marks it already
--     has: patch key owner_phone, a mobile or a landline with its STD code
--     (private.call_phone10, the rules of normalizeIndianPhone in
--     lib/utils/phone.ts), stored as +91 and 10 digits. It replaces every
--     number the Call button could dial (owner_phone, then
--     contact_info.phone, then landline_phone): contact_info.phone, where
--     the key exists, gets the same number (taken out when the owner clears
--     it; other keys kept, never created), landline_phone is emptied, and
--     every old value goes into turf_edit_log.before. The 14-day hold on a
--     claim opened with a code to someone else's number covers it too, and
--     no save may leave the turf with neither a call nor a WhatsApp number.
--     Patch keys contact_info and landline_phone stay ignored.
--   turf_trusted_phones, marked (1): contact_info.phone opens a turf at
--     once only when an owner or a suggestion did not put it there, since
--     it now mirrors an owner's number. Two logged histories say so: its
--     own (owner_update_turf logs contact_info; an owner's number left in
--     it after an approved suggestion moved owner_phone on still counts as
--     the owner's) and owner_phone's (a suggestion logs only owner_phone,
--     and the data team copies it into contact_info by hand). On
--     2026-10-28 this took no number off any production turf.
--   owner_dashboard, marked (1): the turf also returns owner_phone,
--     landline_phone and contact_info.phone (contact_phone), so the editor
--     shows the number the page dials.
--   admin_owner_claims, marked (1): number_edits, the last 5 call or
--     WhatsApp number changes on the claim's turf (at, by, tapturf: made
--     by the site owner, field, from, to). A call number's "from" is the
--     number the Call button dialled before (owner_phone, then
--     contact_info.phone, then landline_phone: the first it can dial), and
--     a listing phone holding another mobile that a save replaced is its
--     own change (field contact_phone).
-- One new helper, private.call_phone10. Written without the destructive
-- SQL keywords. Safe to run again.
--
-- Replaced bodies; md5(pg_proc.prosrc) on production, read 2026-10-28,
-- equals the body in:
--   public.owner_update_turf(text, uuid, jsonb)   20261026_account_links_reads.sql  cf5f39068b40157e2cbad165afd2bbcb
--   private.turf_trusted_phones(uuid)              20261025_claims_account.sql       b1b24305da9bae725c5916277b262285
--   public.owner_dashboard(text, uuid, integer)    20261027_game_reports.sql         86d72528a915294bedd20f59df7450a4
--   public.admin_owner_claims(text)                20261025_claims_account.sql       38f14cb4ff31b01d2689d461242e7cba
-- and the helpers they call are unchanged since: private.number_set_by_others
-- e0654de1cd191d1e00f19e45e8188f66, public._phone10 f833f28ee85cef2b7dc3556e2ef4f47c,
-- public._turf_phones 3b12029749c408d4f6b46e4a728699f9.
-- Check them again right before applying (as postgres):
--   select n.nspname, p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where (n.nspname, p.proname) in (('public','owner_update_turf'), ('private','turf_trusted_phones'),
--          ('public','owner_dashboard'), ('public','admin_owner_claims'), ('private','number_set_by_others'),
--          ('public','_phone10'), ('public','_turf_phones'));

set local lock_timeout = '5s';

-- The 10 digits of a number the Call button can dial, or null: a mobile
-- (6 to 9 first) or a landline with its STD code (2 to 5 first), after
-- the 0091, 091, 0 and 91 prefixes normalizeIndianPhone takes off. A 7 or
-- 8 digit number without its STD code, 1800 numbers and foreign numbers
-- are not. Landlines are never a way in (public._phone10 is mobiles only).
create or replace function private.call_phone10(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^[2-9][0-9]{9}$' then d end from (
    select case when length(c) = 12 and left(c, 2) = '91' then substr(c, 3) else c end as d from (
      select case when length(b) = 13 and left(b, 3) = '091' then substr(b, 2)
                  when length(b) = 11 and left(b, 1) = '0' then substr(b, 2) else b end as c from (
        select case when left(a, 2) = '00' then substr(a, 3) else a end as b
          from (select regexp_replace(coalesce(p, ''), '\\D', '', 'g') as a) a0) b0) c0) d0;
$$;
revoke all on function private.call_phone10(text) from public, anon, authenticated;
`);

// ── owner_update_turf (20261026_account_links_reads.sql:359) ──
parts.push(`-- 20261026_account_links_reads.sql`);
parts.push(edit(fn("20261026_account_links_reads.sql", 359), [
  [`  -- then signs in with that number itself is, for TapTurf, its holder, and is not held.)
  if p_patch ? 'whatsapp_phone' and not public._is_admin_key(k) and exists (`,
   `  -- then signs in with that number itself is, for TapTurf, its holder, and is not held.)
  -- (3) Nor a new call number: the same hold, told by the field asked for.
  if (p_patch ? 'whatsapp_phone' or p_patch ? 'owner_phone') and not public._is_admin_key(k) and exists (`],
  [`    return jsonb_build_object('error', 'held', 'field', 'whatsapp_phone');`,
   `    return jsonb_build_object('error', 'held', 'field', case when p_patch ? 'owner_phone' then 'owner_phone' else 'whatsapp_phone' end);`],
  [`    v_after := v_after || jsonb_build_object('whatsapp_phone', case when v is null then null else '+91' || public._phone10(v) end);
  end if;
`,
   `    v_after := v_after || jsonb_build_object('whatsapp_phone', case when v is null then null else '+91' || public._phone10(v) end);
  end if;
  -- (4) The call number: a mobile or a landline with its STD code, as +91 and 10 digits, or
  -- none. It replaces every number the Call button could dial (owner_phone, then
  -- contact_info.phone, then landline_phone), so the page never falls back to an older one:
  -- contact_info.phone, where the key exists, gets the same number (taken out when cleared;
  -- other keys kept, never created), and landline_phone is emptied. The old values are logged.
  if p_patch ? 'owner_phone' then
    v := nullif(trim(p_patch ->> 'owner_phone'), '');
    if v is not null and private.call_phone10(v) is null then
      return jsonb_build_object('error', 'bad_value', 'field', 'owner_phone');
    end if;
    v := '+91' || private.call_phone10(v);
    v_before := v_before || jsonb_build_object('owner_phone', t.owner_phone);
    v_after := v_after || jsonb_build_object('owner_phone', v);
    if jsonb_typeof(t.contact_info) = 'object' and t.contact_info ? 'phone' then
      v_before := v_before || jsonb_build_object('contact_info', t.contact_info);
      v_after := v_after || jsonb_build_object('contact_info', case when v is null then t.contact_info - 'phone' else jsonb_set(t.contact_info, '{phone}', to_jsonb(v)) end);
    end if;
    if t.landline_phone is not null then
      v_before := v_before || jsonb_build_object('landline_phone', t.landline_phone);
      v_after := v_after || jsonb_build_object('landline_phone', null::text);
    end if;
  end if;
  -- (5) A change of numbers leaves at least one way to reach the turf: a number to call
  -- (what the Call button dials after this save) or a WhatsApp mobile.
  if (v_after ? 'owner_phone' or v_after ? 'whatsapp_phone')
     and (case when v_after ? 'owner_phone' then v_after ->> 'owner_phone'
          else coalesce(private.call_phone10(t.owner_phone), private.call_phone10(t.contact_info ->> 'phone'), private.call_phone10(t.landline_phone)) end) is null
     and public._phone10(case when v_after ? 'whatsapp_phone' then v_after ->> 'whatsapp_phone' else t.whatsapp_phone end) is null then
    return jsonb_build_object('error', 'no_number');
  end if;
`],
  [`    whatsapp_phone = case when v_after ? 'whatsapp_phone' then v_after ->> 'whatsapp_phone' else whatsapp_phone end,
`,
   `    whatsapp_phone = case when v_after ? 'whatsapp_phone' then v_after ->> 'whatsapp_phone' else whatsapp_phone end,
    -- (6) The call number and the columns it replaces (4).
    owner_phone = case when v_after ? 'owner_phone' then v_after ->> 'owner_phone' else owner_phone end,
    contact_info = case when v_after ? 'contact_info' then v_after -> 'contact_info' else contact_info end,
    landline_phone = case when v_after ? 'landline_phone' then v_after ->> 'landline_phone' else landline_phone end,
`],
], "owner_update_turf"));
parts.push(`grant execute on function public.owner_update_turf(text, uuid, jsonb) to anon, authenticated;\n`);

// ── turf_trusted_phones (20261025_claims_account.sql:123) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 123), [[
  `    select public._phone10(t.contact_info ->> 'phone') as x from public.turfs t where t.id = p_turf_id\n`,
  `    -- (1) The listing's phone, unless an owner or a suggestion put it there. owner_update_turf
    -- writes an owner's call number into it as well as into owner_phone and logs both, so its own
    -- latest logged change counts (a suggestion approved later moves owner_phone on, not this);
    -- a suggestion logs only owner_phone, which the data team copies in, so owner_phone's counts too.
    select case when not private.number_set_by_others(t.id, 'owner_phone', t.contact_info ->> 'phone')
                 and not coalesce((
                   select not public._is_admin_key(l.user_key)
                          and public._phone10(l.after -> 'contact_info' ->> 'phone') is not distinct from public._phone10(t.contact_info ->> 'phone')
                     from public.turf_edit_log l
                    where l.turf_id = t.id and l.after ? 'contact_info'
                      and public._phone10(l.before -> 'contact_info' ->> 'phone') is distinct from public._phone10(l.after -> 'contact_info' ->> 'phone')
                    order by l.created_at desc, l.id desc
                    limit 1), false)
           then public._phone10(t.contact_info ->> 'phone') end as x
      from public.turfs t where t.id = p_turf_id\n`,
]], "turf_trusted_phones"));
parts.push(`revoke all on function private.turf_trusted_phones(uuid) from public, anon, authenticated;\n`);

// ── owner_dashboard (20261027_game_reports.sql:1277) ──
parts.push(`-- 20261027_game_reports.sql`);
parts.push(edit(fn("20261027_game_reports.sql", 1277), [[
  `               t.description, t.number_of_grounds, t.surface_type, t.formats, t.whatsapp_phone\n`,
  `               t.description, t.number_of_grounds, t.surface_type, t.formats, t.whatsapp_phone,
               -- (1) The numbers the Call button picks from, so the editor shows the one it dials.
               t.owner_phone, t.landline_phone, t.contact_info ->> 'phone' as contact_phone\n`,
]], "owner_dashboard"));
parts.push(`grant execute on function public.owner_dashboard(text, uuid, integer) to anon, authenticated;\n`);

// ── admin_owner_claims (20261025_claims_account.sql:730) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 730), [[
  `             t.name as turf_name, t.slug, t.city, t.area, public._turf_phones(t.id) as listed_phones,\n`,
  `             t.name as turf_name, t.slug, t.city, t.area, public._turf_phones(t.id) as listed_phones,
             -- (1) The last 5 changes to this turf's call or WhatsApp number, newest first, so a
             -- number given on a claim can be matched with one an owner took off the listing. A call
             -- number's "from" is the number the Call button dialled before (getPhone's order:
             -- owner_phone, the listing phone, landline_phone; the first it can dial, else
             -- owner_phone as it was); a listing phone holding another mobile, which the same save
             -- replaced, is its own change (contact_phone).
             coalesce((
               select jsonb_agg(e.j order by e.at desc, e.id desc, e.k) from (
                 select l.created_at as at, l.id, f.k,
                        jsonb_build_object('at', l.created_at, 'by', l.user_key, 'tapturf', public._is_admin_key(l.user_key),
                                           'field', f.k, 'from', f.b, 'to', f.a) as j
                   from public.turf_edit_log l
                   cross join lateral (select coalesce(
                       case when private.call_phone10(l.before ->> 'owner_phone') is not null then l.before ->> 'owner_phone' end,
                       case when private.call_phone10(l.before -> 'contact_info' ->> 'phone') is not null then l.before -> 'contact_info' ->> 'phone' end,
                       case when private.call_phone10(l.before ->> 'landline_phone') is not null then l.before ->> 'landline_phone' end,
                       l.before ->> 'owner_phone') as dialled) d
                   cross join lateral (values
                       ('owner_phone', d.dialled, l.after ->> 'owner_phone', l.after ? 'owner_phone'),
                       ('whatsapp_phone', l.before ->> 'whatsapp_phone', l.after ->> 'whatsapp_phone', l.after ? 'whatsapp_phone'),
                       ('contact_phone', l.before -> 'contact_info' ->> 'phone', l.after -> 'contact_info' ->> 'phone',
                        l.after ? 'contact_info' and public._phone10(l.before -> 'contact_info' ->> 'phone') is not null
                        and public._phone10(l.before -> 'contact_info' ->> 'phone') is distinct from private.call_phone10(d.dialled))) f(k, b, a, has)
                  where l.turf_id = o.turf_id and f.has and f.b is distinct from f.a
                  order by l.created_at desc, l.id desc, f.k
                  limit 5) e
             ), '[]'::jsonb) as number_edits,\n`,
]], "admin_owner_claims"));
parts.push(`grant execute on function public.admin_owner_claims(text) to anon, authenticated;\n`);

const sql = parts.join("\n\n").replace(/\n{3,}/g, "\n\n");
assert(!/\bdrop\b|\bdelete\b|\btruncate\b/i.test(sql), "no destructive keywords");
assert(!/[—–]/.test(sql), "no em or en dashes");
fs.writeFileSync(out, sql);
console.log(`wrote ${out}: ${sql.split("\n").length} lines`);
