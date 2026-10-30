-- Profile photos and avatars (the Me tab, 30 Oct).
--
-- Every signed-in person can show a picture next to their name: a photo
-- they upload, their Google photo (only when they choose it), or one of
-- the sports avatars drawn in code (lib/account/avatar.ts, served at
-- /avatars/<id>.svg). It stays users.profile_image_url, so every place
-- that already shows that (profile_get, players_search, reports, game
-- pages, admin) shows the new picture with no other change.
--
-- 1. The public avatars bucket. The browser never writes to it. The
--    server route (/api/account/photo, lib/account/photoRoutes.ts) checks
--    the signed-in account, has the photo checked first
--    (lib/account/photoJudge.ts), and only then uploads it with the public
--    key to a random path only it knows (account_photo_start's ticket). A
--    photo the check turns down is never stored. 512 KB, WebP or JPEG.
-- 2. public.user_photos: one row per upload ticket. RLS on with no
--    policies; only the functions here touch it. Status: uploading (a
--    ticket), live, replaced (a newer picture took its place), removed
--    (Remove photo), refused (the check said no; never uploaded),
--    unchecked (the check could not run; never uploaded), expired (a
--    ticket not finished in 15 minutes).
-- 3. Server-key functions (private.account_key_ok, env ACCOUNT_KEY):
--    account_photo_ready, _start, _drop, _finish, _set (an avatar, the
--    Google photo, or none) and _files_gone. Ten uploads a day per
--    account. Every change also updates the copies of the picture on the
--    person's games and join requests (as account_update does for the
--    name), so Remove takes it off those too. Each answer lists the files
--    nothing shows any more; the route removes them, which
--    20261030_profile_photos_policies.sql allows for those files only.
-- 4. private.google_make_account no longer copies the Google photo onto a
--    new account: a Google sign-up starts with initials, and the Me tab
--    offers "Use my Google photo". Accounts that have it keep it.
-- 5. The quarter-hour job (private.user_photos_tick): when a file is still
--    to remove (the route's removal failed, storage slow or down) or a
--    ticket was left unused, it asks /api/account/photo/sweep, which
--    takes them from account_photo_sweep_list, removes the files and
--    marks them gone, as the owner photo sweep does.
--
-- To pause uploads: create or replace private.user_photos_paused() to
-- return true. Avatars, the Google photo and Remove keep working.
--
-- Additive: a bucket, a table, new functions, a cron job, and one
-- function replaced with the same signature. Written without the
-- destructive SQL keywords. Safe to run again. Apply before
-- 20261030_profile_photos_policies.sql.
-- The app works before either: the photo routes say photos are not on yet.

set local lock_timeout = '5s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create table if not exists public.user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- 24 hex: the file name, without the extension.
  name text not null unique,
  -- 'webp' or 'jpg' (checked in account_photo_start).
  ext text not null,
  -- The size the server checked and uploads; finish wants exactly this.
  bytes integer not null,
  -- uploading, live, replaced, removed, refused, unchecked or expired. No
  -- CHECK constraints, so a new value never needs one taken off.
  status text not null default 'uploading',
  url text,
  -- The check's answer (lib/account/photoJudge.ts), for the team.
  verdict jsonb,
  created_at timestamptz not null default now(),
  live_at timestamptz,
  ended_at timestamptz,
  -- The route removed the file of a replaced or removed photo, or of an unused ticket.
  files_gone_at timestamptz
);
comment on table public.user_photos is 'Profile photos people upload (20261030_profile_photos.sql). Only the account_photo functions touch it.';
create index if not exists user_photos_user on public.user_photos (user_id, created_at desc);
create index if not exists user_photos_files on public.user_photos (user_id)
  where files_gone_at is null and status in ('replaced', 'removed', 'expired');
alter table public.user_photos enable row level security;
revoke all on public.user_photos from public, anon, authenticated;

-- ── Helpers ───────────────────────────────────────────────
-- The pause switch: create or replace with "select true" to pause uploads.
create or replace function private.user_photos_paused()
returns boolean
language sql
stable
set search_path = ''
as $$ select false $$;
revoke all on function private.user_photos_paused() from public, anon, authenticated;

-- Tickets left unused for 15 minutes are over (their file, if any, goes).
create or replace function private.user_photos_expire(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_photos set status = 'expired', ended_at = now()
   where user_id = p_user_id and status = 'uploading' and created_at <= now() - interval '15 minutes';
$$;
revoke all on function private.user_photos_expire(uuid) from public, anon, authenticated;

-- The picture a person shows, in one place: users.profile_image_url and
-- the copies on their games and join requests, so a removed photo leaves
-- every one of them. Games keep '' for none, as the app writes them.
create or replace function private.user_photo_apply(p_user_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set profile_image_url = p_url
   where id = p_user_id and profile_image_url is distinct from p_url;
  update public.games set host_profile_image_url = coalesce(p_url, '')
   where creator_id = p_user_id and coalesce(host_profile_image_url, '') <> coalesce(p_url, '');
  update public.game_requests set requester_avatar = p_url
   where user_id = p_user_id and requester_avatar is distinct from p_url;
end;
$$;
revoke all on function private.user_photo_apply(uuid, text) from public, anon, authenticated;

-- The files of this person's that nothing shows any more, for the route
-- to remove: replaced and removed photos, and expired tickets.
create or replace function private.user_photo_files(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.name || '.' || p.ext) order by p.created_at), '[]'::jsonb)
    from public.user_photos p
   where p.user_id = p_user_id and p.files_gone_at is null and p.status in ('replaced', 'removed', 'expired');
$$;
revoke all on function private.user_photo_files(uuid) from public, anon, authenticated;

-- ── Who may write a file ──────────────────────────────────
-- Storage checks its policies as anon or authenticated; this runs as its
-- owner, so it can read the tickets. Open to the API, but it only says
-- whether a random path has an open window. insert: an open ticket (the
-- server's upload). select and delete (remove needs both): only a file
-- nothing shows, so nobody can list or remove a picture that is up.
create or replace function public.avatar_object_ok(p_object text, p_op text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(coalesce(p_object, ''), '^([0-9a-f]{24})\.(webp|jpg)$');
begin
  if m is null or p_op is null then
    return false;
  end if;
  if p_op = 'insert' and private.user_photos_paused() then
    return false;
  end if;
  return exists (
    select 1 from public.user_photos p
     where p.name = m[1] and p.ext = m[2]
       and case
         when p_op = 'insert' then p.status = 'uploading' and p.created_at > now() - interval '10 minutes'
         when p_op in ('select', 'delete') then p.status in ('replaced', 'removed', 'expired')
         else false
       end);
end;
$$;
revoke all on function public.avatar_object_ok(text, text) from public;
grant execute on function public.avatar_object_ok(text, text) to anon, authenticated;

-- ── The account functions ─────────────────────────────────
-- Whether this database has photos, and whether uploads are on.
create or replace function public.account_photo_ready(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  return jsonb_build_object('r', 'ok', 'paused', private.user_photos_paused());
end;
$$;
revoke all on function public.account_photo_ready(text) from public;
grant execute on function public.account_photo_ready(text) to anon, authenticated;

-- A ticket for one upload: a random path the server uploads to within 10
-- minutes. p_bytes is the size of the file the server checked.
create or replace function public.account_photo_start(p_key text, p_user_id uuid, p_ext text, p_bytes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today integer;
  v_name text;
  v_id uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if private.user_photos_paused() then
    return jsonb_build_object('r', 'paused');
  end if;
  if p_user_id is null or coalesce(p_ext, '') not in ('webp', 'jpg') or coalesce(p_bytes, 0) not between 1000 and 524288
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  -- One at a time per account, so two uploads can't pass the daily cap together.
  perform pg_advisory_xact_lock(hashtext('user_photos:' || p_user_id::text));
  perform private.user_photos_expire(p_user_id);
  -- Refused and unchecked ones count: each one cost a check.
  select count(*) into v_today from public.user_photos
   where user_id = p_user_id and created_at > now() - interval '1 day';
  if v_today >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_name := encode(extensions.gen_random_bytes(12), 'hex');
  insert into public.user_photos (user_id, name, ext, bytes)
  values (p_user_id, v_name, p_ext, p_bytes)
  returning id into v_id;
  return jsonb_build_object('r', 'ok', 'id', v_id, 'path', v_name || '.' || p_ext, 'bucket', 'avatars');
end;
$$;
revoke all on function public.account_photo_start(text, uuid, text, integer) from public;
grant execute on function public.account_photo_start(text, uuid, text, integer) to anon, authenticated;

-- A ticket that won't be finished: the check said no (refused), the check
-- couldn't run (unchecked; both never uploaded), or the upload failed
-- (expired: a file may be there, so it is listed for removal).
create or replace function public.account_photo_drop(p_key text, p_user_id uuid, p_id uuid, p_outcome text, p_verdict jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if coalesce(p_outcome, '') not in ('refused', 'unchecked', 'expired') then
    return jsonb_build_object('r', 'bad');
  end if;
  update public.user_photos
     set status = p_outcome, ended_at = now(),
         verdict = case when jsonb_typeof(p_verdict) = 'object' then p_verdict else verdict end
   where id = p_id and user_id = p_user_id and status = 'uploading';
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.account_photo_drop(text, uuid, uuid, text, jsonb) from public;
grant execute on function public.account_photo_drop(text, uuid, uuid, text, jsonb) to anon, authenticated;

-- Uploaded: the file must be in the bucket at exactly the size and type
-- the server checked. It becomes the person's picture; the photo it
-- replaces is listed for removal.
create or replace function public.account_photo_finish(p_key text, p_user_id uuid, p_id uuid, p_verdict jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base constant text := 'https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/avatars/';
  p public.user_photos%rowtype;
  v_path text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('user_photos:' || p_user_id::text));
  select * into p from public.user_photos
   where id = p_id and user_id = p_user_id and status = 'uploading'
     and created_at > now() - interval '15 minutes'
     for update;
  if not found then
    return jsonb_build_object('r', 'expired');
  end if;
  v_path := p.name || '.' || p.ext;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'avatars' and o.name = v_path
       and o.metadata ->> 'size' = p.bytes::text
       and o.metadata ->> 'mimetype' = case p.ext when 'webp' then 'image/webp' else 'image/jpeg' end
       and o.archived_at is null and not coalesce(o.is_delete_marker, false)) then
    return jsonb_build_object('r', 'missing');
  end if;
  update public.user_photos set status = 'replaced', ended_at = now()
   where user_id = p_user_id and status = 'live';
  update public.user_photos
     set status = 'live', url = base || v_path, live_at = now(),
         verdict = case when jsonb_typeof(p_verdict) = 'object' then p_verdict else verdict end
   where id = p.id;
  perform private.user_photo_apply(p_user_id, base || v_path);
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok', 'files', private.user_photo_files(p_user_id));
end;
$$;
revoke all on function public.account_photo_finish(text, uuid, uuid, jsonb) from public;
grant execute on function public.account_photo_finish(text, uuid, uuid, jsonb) to anon, authenticated;

-- An avatar (p_kind 'preset', p_value its id: /avatars/<id>.svg), the
-- Google photo (p_kind 'google', p_value the photo URL of the verified
-- Google sign-in, never one the browser sent) or none (Remove photo).
-- An uploaded photo it takes the place of is listed for removal.
create or replace function public.account_photo_set(p_key text, p_user_id uuid, p_kind text, p_value text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_url := case
    when p_kind = 'preset' and p_value ~ '^[a-z][a-z0-9-]{1,30}$' then '/avatars/' || p_value || '.svg'
    when p_kind = 'google' and length(p_value) <= 1000
         and p_value ~ '^https://lh[0-9]+\.googleusercontent\.com/[A-Za-z0-9/_=.~-]+$' then p_value
  end;
  if p_user_id is null or (v_url is null and p_kind is distinct from 'none') then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtext('user_photos:' || p_user_id::text));
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  perform private.user_photos_expire(p_user_id);
  update public.user_photos set status = case when v_url is null then 'removed' else 'replaced' end, ended_at = now()
   where user_id = p_user_id and status = 'live';
  perform private.user_photo_apply(p_user_id, v_url);
  return private.profile_json(p_user_id) || jsonb_build_object('r', 'ok', 'files', private.user_photo_files(p_user_id));
end;
$$;
revoke all on function public.account_photo_set(text, uuid, text, text) from public;
grant execute on function public.account_photo_set(text, uuid, text, text) to anon, authenticated;

-- The route removed these files from the bucket.
create or replace function public.account_photo_files_gone(p_key text, p_user_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  update public.user_photos set files_gone_at = now()
   where user_id = p_user_id and id = any(coalesce(p_ids, '{}')) and files_gone_at is null
     and status in ('replaced', 'removed', 'expired');
  get diagnostics n = row_count;
  return jsonb_build_object('r', 'ok', 'gone', n);
end;
$$;
revoke all on function public.account_photo_files_gone(text, uuid, uuid[]) from public;
grant execute on function public.account_photo_files_gone(text, uuid, uuid[]) to anon, authenticated;

-- ── Files left behind, tried again ────────────────────────
-- The route removes a file once, after its reply. One it couldn't remove
-- (storage slow or down) stays listed until it is gone. Two minutes'
-- grace, so the sweep never races the route's own removal.

-- For /api/account/photo/sweep: ends tickets left unused for 15 minutes
-- (anyone's), then the files still to remove, oldest first, 50 at most.
create or replace function public.account_photo_sweep_list(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  update public.user_photos set status = 'expired', ended_at = now()
   where status = 'uploading' and created_at <= now() - interval '15 minutes';
  return jsonb_build_object('r', 'ok', 'files', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'user_id', f.user_id, 'path', f.name || '.' || f.ext) order by f.ended_at)
      from (select p.id, p.user_id, p.name, p.ext, p.ended_at from public.user_photos p
             where p.files_gone_at is null and p.status in ('replaced', 'removed', 'expired')
               and p.ended_at <= now() - interval '2 minutes'
             order by p.ended_at
             limit 50) f
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.account_photo_sweep_list(text) from public;
grant execute on function public.account_photo_sweep_list(text) to anon, authenticated;

-- Every 15 minutes: asks the app to sweep only when there is something to
-- do, with the secret the cache queue and the owner photo sweep use.
create or replace function private.user_photos_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url constant text := 'https://www.tapturf.in/api/account/photo/sweep';
  v_secret text;
begin
  if not exists (
    select 1 from public.user_photos p
     where (p.files_gone_at is null and p.status in ('replaced', 'removed', 'expired') and p.ended_at <= now() - interval '2 minutes')
        or (p.status = 'uploading' and p.created_at <= now() - interval '15 minutes')) then
    return;
  end if;
  v_secret := (select s.value from private.app_secrets s where s.name = 'revalidate');
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function private.user_photos_tick() from public, anon, authenticated;
select cron.schedule('profile-photos-sweep', '*/15 * * * *', 'select private.user_photos_tick()');

-- ── A new Google account starts without the Google photo ──
-- Same signature and body as 20261026_account_links.sql, but the photo is
-- left empty: people choose it on the Me tab ("Use my Google photo").
create or replace function private.google_make_account(p_uid uuid, p_email text, p_name text, p_avatar text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := p_email;
begin
  if v_email is not null and exists (select 1 from public.users u where lower(u.email) = lower(v_email)) then
    perform private.report('google_email_held', jsonb_build_object('auth_uid', p_uid));
    v_email := null;
  end if;
  insert into public.users (id, email, name, profile_image_url, role, password)
  values (p_uid, v_email,
          coalesce(private.clean_name(p_name), nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'User'),
          null, 'user', 'oauth-no-password')
  on conflict do nothing;
  return (select u.id from public.users u where u.id = p_uid);
end;
$$;
revoke all on function private.google_make_account(uuid, text, text, text) from public, anon, authenticated;
