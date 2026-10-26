// Builds supabase/migrations/20261026_account_links_reads.sql from the live
// bodies (each one's migration file) plus exact replacements, each of which
// must apply exactly once. Every base body must still have the prosrc md5
// production had when this was last checked (LIVE below), so a changed file
// or a newer live body stops the build instead of being overwritten.
// Run: node scripts/sql-tests/build_account_links_reads.mjs supabase/migrations supabase/migrations/20261026_account_links_reads.sql
import fs from "node:fs";
import { createHash } from "node:crypto";
const [dir, out] = process.argv.slice(2);
const read = (f) => fs.readFileSync(`${dir}/${f}`, "utf8");

// md5(pg_proc.prosrc) on production, read 2026-10-26 (definitions only):
//   select md5(prosrc) from pg_proc where oid = '<function>'::regprocedure;
const LIVE = {
  "20261019_mytapturf.sql:136": "0e1fb9794cc6f236098ff11d6fcffb41", // public._can_manage(text, uuid)
  "20261025_claims_account.sql:401": "72cda8cee715bea94004090609226773", // public.owner_home(text)
  "20261025_claims_account.sql:451": "57aefcb0bfc0798460cf50844e3b081e", // public.owner_claim(text, uuid, text, text, text)
  "20261025_claims_account.sql:659": "c1e1cf48c0d84355dd6b2dbd3a56a126", // public.owner_claim_verified(text, text, uuid, text, text)
  "20261025_claims_account.sql:896": "f644da47cb954bfd5747dac722d5103b", // public.owner_update_turf(text, uuid, jsonb)
  "20261022_people_fixes.sql:13": "aabb4b088d1026b04fd9a0a529bb8a72", // public.admin_people(text)
  "20261022_people_fixes.sql:287": "234a18ec543121fcda5b73efb0d8e82e", // public.get_recent_logins(integer, text)
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
parts.push(`-- One TapTurf account, two ways in: what myTapturf and the admin read.
-- Apply right after 20261026_account_links.sql (it uses its rules).
--
-- Body-only changes, same signatures and return types, each copied from the
-- live body (the file named above it) with the changes marked (n):
--   _can_manage, owner_home, owner_claim, owner_claim_verified,
--   owner_update_turf: a claim belongs to the account, so either of its
--     sign-ins (the phone, or the Google account added to it; Google, or
--     the number added to it) sees and manages it, and never makes a
--     second claim on the same turf.
--   admin_people, get_recent_logins: a Google sign-in counts for the
--     account it opens (a linked phone account, an old-app row), and a code
--     exchange that only added Google to a phone account is not a sign-in.
--     A Google account's myTapturf key is the phone account's it was added
--     to, never its own row's (an empty one the link was made over).
-- One new helper, private.account_phone10. Written without the destructive
-- SQL keywords. Safe to run again.

set local lock_timeout = '5s';

-- The 10 digits of the number this account opens with by OTP (its phone
-- sign-in, or a number proved from the profile), or null.
create or replace function private.account_phone10(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public._phone10(u.phone::text)
    from public.users u
   where u.id = p_user_id and u.phone is not null
     and private.phone_account(u.phone::text) = u.id;
$$;
revoke all on function private.account_phone10(uuid) from public, anon, authenticated;
`);

// ── _can_manage (20261019_mytapturf.sql:136) ──
parts.push(`-- 20261019_mytapturf.sql`);
parts.push(edit(fn("20261019_mytapturf.sql", 136), [[
  `    or exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.user_key = p_key and o.status = 'active')\n`,
  `    or exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.user_key = p_key and o.status = 'active')
    -- (1) The same account's claim made from its other sign-in.
    or exists (select 1 from public.turf_owners o
                where o.turf_id = p_turf_id and o.status = 'active'
                  and o.user_id is not null and o.user_id = private.caller_account(p_key))\n`,
]], "_can_manage"));
parts.push(`revoke all on function public._can_manage(text, uuid) from public, anon, authenticated;\n`);

// ── owner_home (20261025_claims_account.sql:401) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 401), [
  [`  v_uid uuid;\nbegin`, `  v_uid uuid;\n  v_p10 text;\nbegin`],
  [`  v_uid := private.caller_account(k);\n`, `  v_uid := private.caller_account(k);
  -- (1) The number this account opens with: the phone sign-in's own, or a verified one on the account.
  v_p10 := case when left(k, 2) = 'p:' then substr(k, 3) else private.account_phone10(v_uid) end;\n`],
  [`    'turfs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
        'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0),
        'status', o.status, 'via', o.via, 'since', o.created_at
      ) order by o.status, o.created_at)
      from public.turf_owners o join public.turfs t on t.id = o.turf_id
      where o.user_key = k and o.status in ('active', 'pending')
    ), '[]'::jsonb),`,
  `    -- (2) The account's claims from either of its sign-ins, one per turf.
    'turfs', coalesce((
      select jsonb_agg(x.j order by x.status, x.created_at) from (
        select distinct on (o.turf_id) o.status, o.created_at,
               jsonb_build_object(
                 'id', t.id, 'name', t.name, 'city', t.city, 'area', t.area,
                 'cover', coalesce(t.cover_image, to_jsonb(t.images) ->> 0),
                 'status', o.status, 'via', o.via, 'since', o.created_at) as j
          from public.turf_owners o join public.turfs t on t.id = o.turf_id
         where o.status in ('active', 'pending')
           and (o.user_key = k or (v_uid is not null and o.user_id = v_uid))
         order by o.turf_id, (o.status = 'active') desc, (o.user_key = k) desc, o.created_at
      ) x
    ), '[]'::jsonb),`],
  [`    'matches', case when left(k, 2) = 'p:' then coalesce((`, `    -- (3) Turfs that list the account's number, from either sign-in.
    'matches', case when v_p10 is not null then coalesce((`],
  [`        and substr(k, 3) in (public._phone10(t.contact_info ->> 'phone'), public._phone10(t.owner_phone), public._phone10(t.whatsapp_phone))
        and substr(k, 3) = any(private.turf_trusted_phones(t.id))
        and not exists (select 1 from public.turf_owners o where o.turf_id = t.id and o.user_key = k and o.status in ('active', 'pending'))`,
  `        and v_p10 in (public._phone10(t.contact_info ->> 'phone'), public._phone10(t.owner_phone), public._phone10(t.whatsapp_phone))
        and v_p10 = any(private.turf_trusted_phones(t.id))
        and not exists (select 1 from public.turf_owners o
                         where o.turf_id = t.id and (o.user_key = k or (v_uid is not null and o.user_id = v_uid))
                           and o.status in ('active', 'pending'))`],
], "owner_home"));
parts.push(`grant execute on function public.owner_home(text) to anon, authenticated;\n`);

// ── owner_claim, five arguments (20261025_claims_account.sql:451) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 451), [
  [`  v_prev text;\n`, `  v_prev text;\n  v_p10 text;\n  v_okey text;\n  v_ostatus text;\n`],
  [`  select left(nullif(btrim(u.name), ''), 80) into v_name from public.users u where u.id = v_uid;\n`,
   `  select left(nullif(btrim(u.name), ''), 80) into v_name from public.users u where u.id = v_uid;
  -- (1) The number this account opens with, from either sign-in.
  v_p10 := case when left(k, 2) = 'p:' then substr(k, 3) else private.account_phone10(v_uid) end;\n`],
  [`  if v_status = 'pending' and left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))`,
   `  if v_status = 'pending' and v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))`],
  [`verified_phone = substr(k, 3), decided_at = now(), user_id = coalesce(user_id, v_uid)`,
   `verified_phone = v_p10, decided_at = now(), user_id = coalesce(user_id, v_uid)`],
  [`  if v_status = 'revoked' or private.claim_revoked(p_turf_id, k, v_uid, null) then`,
   `  -- (2) The same account's claim from its other sign-in: that one, never a second row.
  if v_status is distinct from 'revoked' then
    select o.user_key, o.status into v_okey, v_ostatus from public.turf_owners o
     where o.turf_id = p_turf_id and o.user_key <> k and o.user_id = v_uid and o.status in ('active', 'pending')
     order by (o.status = 'active') desc, o.created_at
     limit 1;
    if v_ostatus = 'pending' and v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}'))
       and not private.claim_revoked(p_turf_id, k, v_uid, null) then
      update public.turf_owners set status = 'active', via = 'phone_match', verified_phone = v_p10, decided_at = now()
       where turf_id = p_turf_id and user_key = v_okey and status = 'pending';
      insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
      values (p_turf_id, v_okey, v_uid, 'pending', 'active', 'phone_match');
      return jsonb_build_object('status', 'active');
    end if;
    if v_ostatus is not null then
      return jsonb_build_object('status', v_ostatus);
    end if;
  end if;
  if v_status = 'revoked' or private.claim_revoked(p_turf_id, k, v_uid, null) then`],
  [`  if (select count(*) from public.turf_owners where user_key = k and status = 'pending') >= 5 then`,
   `  if (select count(*) from public.turf_owners where (user_key = k or (user_id is not null and user_id = v_uid)) and status = 'pending') >= 5 then`],
  [`  if left(k, 2) = 'p:' and substr(k, 3) = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}')) then\n    v_status := 'active';`,
   `  if v_p10 is not null and v_p10 = any(coalesce(private.turf_trusted_phones(p_turf_id), '{}')) then\n    v_status := 'active';`],
  [`          case when v_status = 'active' then substr(k, 3) end, now(),`, `          case when v_status = 'active' then v_p10 end, now(),`],
], "owner_claim"));
parts.push(`grant execute on function public.owner_claim(text, uuid, text, text, text) to anon, authenticated;\n`);

// ── owner_claim_verified (20261025_claims_account.sql:659) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 659), [
  [`  v_status text;\n`, `  v_status text;\n  v_okey text;\n  v_ostatus text;\n`],
  [`  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;\n`,
   `  select status into v_status from public.turf_owners where turf_id = p_turf_id and user_key = k;
  -- (1) The same account's claim from its other sign-in: open that one, never a second row.
  if v_status is null then
    select o.user_key, o.status into v_okey, v_ostatus from public.turf_owners o
     where o.turf_id = p_turf_id and o.user_key <> k and o.user_id = v_uid and o.status in ('active', 'pending')
     order by (o.status = 'active') desc, o.created_at
     limit 1;
    if v_ostatus = 'active' then
      return jsonb_build_object('status', 'active');
    end if;
    if v_ostatus = 'pending' and not private.claim_revoked(p_turf_id, k, v_uid, v_phone) then
      update public.turf_owners
         set status = 'active', via = 'phone_match', verified_phone = v_phone, decided_at = now(),
             note = coalesce(left(nullif(trim(p_note), ''), 400), note), role = coalesce(v_role, role)
       where turf_id = p_turf_id and user_key = v_okey and status = 'pending';
      insert into private.turf_owner_events (turf_id, user_key, user_id, from_status, to_status, how)
      values (p_turf_id, v_okey, v_uid, 'pending', 'active', 'code:' || v_phone);
      return jsonb_build_object('status', 'active');
    end if;
  end if;\n`],
], "owner_claim_verified"));
parts.push(`revoke all on function public.owner_claim_verified(text, text, uuid, text, text) from public;
grant execute on function public.owner_claim_verified(text, text, uuid, text, text) to anon, authenticated;\n`);

// ── owner_update_turf (20261025_claims_account.sql:896) ──
parts.push(`-- 20261025_claims_account.sql`);
parts.push(edit(fn("20261025_claims_account.sql", 896), [[
  `        where o.turf_id = p_turf_id and o.user_key = k and o.status = 'active'
          and o.verified_phone is not null and o.user_key <> 'p:' || o.verified_phone\n`,
  `        where o.turf_id = p_turf_id and o.status = 'active'
          -- (1) The claim of this account, from whichever of its sign-ins.
          and (o.user_key = k or (o.user_id is not null and o.user_id = private.caller_account(k)))
          and o.verified_phone is not null and o.user_key <> 'p:' || o.verified_phone
          -- (2) A code to the account's own number is not someone else's.
          and o.verified_phone is distinct from private.account_phone10(o.user_id)\n`,
]], "owner_update_turf"));
parts.push(`grant execute on function public.owner_update_turf(text, uuid, jsonb) to anon, authenticated;\n`);

// ── admin_people (20261022_people_fixes.sql:13) ──
parts.push(`-- 20261022_people_fixes.sql`);
parts.push(edit(fn("20261022_people_fixes.sql", 13), [
  [`      select au.id as user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
       where au.last_sign_in_at is not null
         and not exists (select 1 from public.user_logins x
                          where x.user_id = au.id and x.method = 'google'
                            and x.created_at >= au.last_sign_in_at - interval '10 minutes')`,
   `      -- (1) Counted for the account the sign-in opens (a linked phone account, an old-app row), once.
      -- (2) A code exchange that only added this Google account to a phone account is not a sign-in.
      select distinct on (m.user_id) m.user_id, au.last_sign_in_at as at,
             case when au.raw_app_meta_data ->> 'provider' = 'google' or au.raw_app_meta_data -> 'providers' @> '["google"]'::jsonb then 'google' else 'email' end as method
        from auth.users au
        cross join lateral (select coalesce(private.google_account(au.id), au.id) as user_id) m
       where au.last_sign_in_at is not null
         and not exists (select 1 from private.account_link_legs lg
                          where lg.auth_uid = au.id
                            and lg.returned_at between au.last_sign_in_at - interval '10 minutes' and au.last_sign_in_at + interval '10 minutes')
         and not exists (select 1 from public.user_logins x
                          where x.user_id = m.user_id and x.method = 'google'
                            and x.created_at >= au.last_sign_in_at - interval '10 minutes')
       order by m.user_id, au.last_sign_in_at desc`],
  [`            left join auth.users au on au.id = uu.id
            left join private.legacy_email_rows lg on lg.user_id = uu.id
          union all`,
   `            left join auth.users au on au.id = uu.id
            left join private.legacy_email_rows lg on lg.user_id = uu.id
           -- (3) A Google account added to a phone account opens that account (below), never
           -- its own row (an empty one the link was made over keeps no key of its own).
           where not exists (select 1 from private.account_google_links gl where gl.auth_uid = uu.id and gl.ended_at is null)
          union all`],
  [`          select uu.id, 'p:' || public._phone10(uu.phone::text)
            from public.users uu
            left join auth.users au on au.id = uu.id
           where uu.phone::text ~ '^\\+91[0-9]{10}$'
             and not exists (select 1 from private.users_phone_changes pc where pc.user_id = uu.id)
             and (au.id is null or exists (
                   select 1 from public.user_logins ul
                    where ul.user_id = uu.id and ul.method = 'phone' and ul.created_at < private.phone_logins_trusted_before()))
        ) k`,
   `          -- (4) The same rules as private.phone_account, which also counts a number proved with an OTP from the profile.
          select uu.id, 'p:' || public._phone10(uu.phone::text)
            from public.users uu
           where uu.phone::text ~ '^\\+91[0-9]{10}$'
             and private.phone_account(uu.phone::text) = uu.id
          union all
          -- (5) A Google account added to this phone account from the profile.
          select l.user_id, 'e:' || lower(a.email::text)
            from private.account_google_links l
            join auth.users a on a.id = l.auth_uid
           where l.ended_at is null and a.email is not null
        ) k`],
  [`      select k.user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from keys k
        join public.turf_owners tow on tow.user_key = k.user_key
        left join public.turfs t on t.id = tow.turf_id
       group by k.user_id`,
   `      -- (6) By the keys the account holds, and by the account the claim was made for.
      select c.user_id,
             jsonb_agg(jsonb_build_object(
                         'turf', coalesce(t.name::text, 'A removed turf'),
                         'slug', t.slug,
                         'status', tow.status,
                         'role', tow.role) order by tow.created_at desc, tow.turf_id) as list
        from (select k.user_id, tow0.turf_id, tow0.user_key
                from keys k join public.turf_owners tow0 on tow0.user_key = k.user_key
              union
              select tow0.user_id, tow0.turf_id, tow0.user_key
                from public.turf_owners tow0 where tow0.user_id is not null) c
        join public.turf_owners tow on tow.turf_id = c.turf_id and tow.user_key = c.user_key
        left join public.turfs t on t.id = tow.turf_id
       group by c.user_id`],
], "admin_people"));
parts.push(`revoke all on function public.admin_people(text) from public;
grant execute on function public.admin_people(text) to anon, authenticated;\n`);

// ── get_recent_logins (20261022_people_fixes.sql:287) ──
parts.push(`-- 20261022_people_fixes.sql`);
parts.push(edit(fn("20261022_people_fixes.sql", 287), [[
  `    select au.id, 'google'::text, au.last_sign_in_at
    from auth.users au
    where au.last_sign_in_at is not null
      and not exists (
        select 1 from public.user_logins x
        where x.user_id = au.id and x.method = 'google' and x.created_at >= au.last_sign_in_at - interval '10 minutes'
      )`,
  `    -- (1) Listed under the account the sign-in opens; a Google sign-in that opens none is not a TapTurf login.
    -- (2) A code exchange that only added this Google account to a phone account is not a sign-in.
    select m.user_id, 'google'::text, au.last_sign_in_at
    from auth.users au
    cross join lateral (select private.google_account(au.id) as user_id) m
    where au.last_sign_in_at is not null
      and m.user_id is not null
      and not exists (
        select 1 from private.account_link_legs lg
        where lg.auth_uid = au.id
          and lg.returned_at between au.last_sign_in_at - interval '10 minutes' and au.last_sign_in_at + interval '10 minutes'
      )
      and not exists (
        select 1 from public.user_logins x
        where x.user_id = m.user_id and x.method = 'google' and x.created_at >= au.last_sign_in_at - interval '10 minutes'
      )`,
]], "get_recent_logins"));
parts.push(`revoke all on function public.get_recent_logins(integer, text) from public;
grant execute on function public.get_recent_logins(integer, text) to anon, authenticated;\n`);

const sql = parts.join("\n\n").replace(/\n{3,}/g, "\n\n");
assert(!/\bdrop\b|\bdelete\b|\btruncate\b/i.test(sql), "no destructive keywords");
assert(!/[—–]/.test(sql), "no em or en dashes");
fs.writeFileSync(out, sql);
console.log(`wrote ${out}: ${sql.split("\n").length} lines`);
