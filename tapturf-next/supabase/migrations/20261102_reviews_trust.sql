-- Reviews trust (the site owner's notes, 1 Nov 2026): with every report live
-- at once, more that shows a player was really there, and a way for anyone
-- to say a report breaks the rules.
--
-- 1. The public tip's text rule: private.review_tip_problem is
--    private.review_text_problem (phone numbers, emails, links, bare
--    domains) plus an @handle to message someone on (WhatsApp, Instagram,
--    Telegram). lib/reviews/screen.ts has the same rules as one list
--    (CONTACT_RULES, TIP_RULES; npm run test:reviews checks the two say the
--    same) and the sheet keeps Post off while the tip breaks them. The
--    private note keeps private.review_text_problem.
-- 2. Played here (verified): private.review_played_here, worked out at
--    every read of a report (private.review_row_json, so the turf page,
--    review_save and review_mine all carry played_here). True when its
--    author was in a TapTurf game at that turf, as host or as a player who
--    was in it before it started, that was not cancelled, was made (and
--    last moved) before it started, had started by the time the report was
--    written (its latest version) at most 365 days before, and is over now
--    (private.game_over_at, 20261101_played_with.sql). Only true or false
--    is ever read out: never who played, or which game.
-- 3. Photos from the game, up to 3 on a report. The public review-photos
--    bucket; the browser never writes to it. The server route
--    (/api/reviews/photos, lib/reviews/photoRoutes.ts) takes the photo and
--    its thumbnail the phone made (1600 and 360 px, drawn again, so the
--    camera's details and location are gone; the server strips them again),
--    has them checked (lib/reviews/photoJudge.ts) and only then uploads
--    them to a random path only it knows (review_photo_start's ticket). A
--    photo the check turns down is never stored. private.review_photos, one
--    row per ticket: uploading, ready (stored, not on a report yet), live
--    (on a report), removed (its author took it off, or took the report
--    down), hidden (TapTurf hid the report), refused, unchecked (never
--    stored) or expired (a ticket not finished in 15 minutes, or a photo
--    never posted in 2 days). review_save takes the report's photos as a
--    list of ids (p_report.photos: the list replaces the ones it had; left
--    out, they stay). A report that leaves the page takes its photos with it
--    (private.review_photos_follow, after update of reviews.status), and
--    the quarter-hour job (private.review_photos_tick) asks
--    /api/reviews/photos/sweep to remove the files nothing shows, through
--    the storage API, as profile photos do. Ten uploads a day per account.
-- 4. Report this review ("flags" here: a report is the review itself). A
--    signed-in player reports someone else's live TapTurf report
--    (review_flag: a reason from a short list and an optional line), once
--    per report (again only after it changes), 10 a day per account; it
--    stays up while it waits, and its author is never told. The site owner
--    decides (admin_review_flags, admin_review_flag_decide): Hide hides it
--    the way a removal request's Remove does, Keep leaves it; either closes
--    every open report of it. Owners' removal requests stay as they are.
--
-- Replaced bodies, same signatures, every key kept, from production
-- (pg_proc.prosrc read SELECT-only on 1 Nov 2026, md5 of prosrc):
--   public.review_save       1b8fd1e452366dfb0c828da80686a823 (20261101_reviews_policy.sql), with the
--                            tip's rule and the photos;
--   private.review_row_json  c88a60b9b82d3354be6091cc759ef5ae (20261027_game_reports.sql), with two new
--                            keys, played_here and photos.
-- It calls private.game_start_at and private.game_over_at and reads
-- private.game_start_moves (20261101_played_with.sql), and
-- private.mark_dirty and private.turf_key (the cache queue), as production has them.
--
-- Apply after the app that reads it is live; that app works on the database
-- before this file too (no photos offered, no Report button, no badge).
-- Then apply 20261102_review_photos_policies.sql at a quiet hour (it takes
-- a lock on storage.objects). Additive: a bucket, two tables in the private
-- schema and their indexes, functions, a trigger and a cron job. Written
-- without the destructive SQL keywords. Safe to run again.

set local lock_timeout = '5s';

-- ── 1. The tip's text rule ────────────────────────────────

-- 'contact_info' when the tip has what private.review_text_problem catches, or an
-- @handle: an @ not inside a word, then a letter or _ and 2 to 29 more letters,
-- digits, dots or _, so "@7pm" and "@ 800" pass. lib/reviews/screen.ts TIP_RULES is
-- the same, rule for rule.
create or replace function private.review_tip_problem(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(private.review_text_problem(p), case
    when p is null then null
    when p ~* '(^|[^a-z0-9._%+-])@[a-z_][a-z0-9._]{2,29}' then 'contact_info'
  end);
$$;
revoke all on function private.review_tip_problem(text) from public, anon, authenticated;

-- ── 2. Played here ────────────────────────────────────────

-- Whether p_user played a TapTurf game at p_turf by p_at (when the report was
-- written): hosted it, or was in it before it started; not cancelled; made, and
-- last moved, before it started; started by p_at, at most 365 days before; over
-- now. The date bounds let games_turf_date_idx find the turf's games.
create or replace function private.review_played_here(p_user uuid, p_turf uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_turf is not null and p_at is not null and exists (
    select 1
      from public.games g
      left join private.game_start_moves m on m.game_id = g.id
     where g.turf_id = p_turf
       and g.date between (p_at at time zone 'Asia/Kolkata')::date - 366 and (p_at at time zone 'Asia/Kolkata')::date + 1
       and g.status is distinct from 'cancelled'
       and private.game_start_at(g.date, g.start_time) <= p_at
       and private.game_start_at(g.date, g.start_time) > p_at - interval '365 days'
       and private.game_over_at(g.date, g.start_time, g.end_time) <= now()
       and greatest(g.created_at, m.moved_at) < private.game_start_at(g.date, g.start_time)
       and (g.creator_id = p_user
            or exists (select 1 from public.game_participants p
                        where p.game_id = g.id and p.user_id = p_user
                          and p.joined_at < private.game_start_at(g.date, g.start_time))));
$$;
revoke all on function private.review_played_here(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ── 3. Photos ─────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create table if not exists private.review_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  turf_id uuid not null,
  -- The report it is on; null until it is posted with one.
  review_id uuid,
  -- 24 hex: the file names, <name>.<ext> and its thumbnail <name>_t.<ext>.
  name text not null unique,
  -- 'webp' or 'jpg' (checked in review_photo_start).
  ext text not null,
  -- The sizes the server checked and uploads; finish wants exactly these.
  bytes integer not null,
  thumb_bytes integer not null,
  w integer not null,
  h integer not null,
  -- Its place on the report, 1 to 3.
  position smallint,
  -- uploading, ready, live, removed, hidden, refused, unchecked or expired. No
  -- CHECK constraints, so a new value never needs one taken off.
  status text not null default 'uploading',
  -- The check's answer (lib/reviews/photoJudge.ts), for the team.
  verdict jsonb,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  live_at timestamptz,
  ended_at timestamptz,
  -- The route removed both files of a photo nothing shows any more.
  files_gone_at timestamptz
);
create index if not exists review_photos_user_idx on private.review_photos (user_id, created_at desc);
create index if not exists review_photos_review_idx on private.review_photos (review_id) where status = 'live';
create index if not exists review_photos_files_idx on private.review_photos (ended_at)
  where files_gone_at is null and status in ('removed', 'hidden', 'expired');
revoke all on private.review_photos from public, anon, authenticated;
comment on table private.review_photos is
  'Photos players add to their reports (20261102_reviews_trust.sql). Only the review_photo functions, review_save and private.review_photos_follow write it; private.review_row_json reads the live ones.';

-- The pause switch: create or replace with "select true" to pause uploads. Photos
-- already on reports stay, and taking one off still works.
create or replace function private.review_photos_paused()
returns boolean
language sql
stable
set search_path = ''
as $$ select false $$;
revoke all on function private.review_photos_paused() from public, anon, authenticated;

-- Tickets left unused for 15 minutes are over (their files, if any, go).
create or replace function private.review_photos_expire(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.review_photos set status = 'expired', ended_at = now()
   where user_id = p_user_id and status = 'uploading' and created_at <= now() - interval '15 minutes';
$$;
revoke all on function private.review_photos_expire(uuid) from public, anon, authenticated;

-- One photo as the routes and the page read it.
create or replace function private.review_photo_json(p private.review_photos)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'path', p.name || '.' || p.ext, 'thumb', p.name || '_t.' || p.ext, 'w', p.w, 'h', p.h);
$$;
revoke all on function private.review_photo_json(private.review_photos) from public, anon, authenticated;

-- Who may write a file. Storage checks its policies as anon or authenticated;
-- this runs as its owner, so it can read the tickets. Open to the API, but it only
-- says whether a random path has an open window. insert: an open ticket (the
-- server's upload). select and remove (taking a file away needs both): only a file
-- nothing shows, so nobody can list or take away a photo that is up.
create or replace function public.review_photo_object_ok(p_object text, p_op text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(coalesce(p_object, ''), '^([0-9a-f]{24})(_t)?\.(webp|jpg)$');
begin
  if m is null or p_op is null then
    return false;
  end if;
  if p_op = 'insert' and private.review_photos_paused() then
    return false;
  end if;
  return exists (
    select 1 from private.review_photos p
     where p.name = m[1] and p.ext = m[3]
       and case
         when p_op = 'insert' then p.status = 'uploading' and p.created_at > now() - interval '10 minutes'
         when p_op in ('select', 'remove') then p.status in ('removed', 'hidden', 'expired')
         else false
       end);
end;
$$;
revoke all on function public.review_photo_object_ok(text, text) from public;
grant execute on function public.review_photo_object_ok(text, text) to anon, authenticated;

-- Whether this database has review photos, whether uploads are on, and how many
-- this account may still add today.
create or replace function public.review_photo_ready(p_key text, p_user_id uuid)
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
  return jsonb_build_object('r', 'ok', 'paused', private.review_photos_paused(),
    'left', greatest(0, 10 - (select count(*) from private.review_photos p
                                where p.user_id = p_user_id and p.created_at > now() - interval '1 day')));
end;
$$;
revoke all on function public.review_photo_ready(text, uuid) from public;
grant execute on function public.review_photo_ready(text, uuid) to anon, authenticated;

-- A ticket for one upload: a random name the server uploads the photo and its
-- thumbnail to within 10 minutes. The sizes are of the files the server checked.
-- Not for a turf the account manages (it can't rate it), nor one that isn't active.
-- Answers {r: ok, id, path, thumb, bucket, left}, or r: paused, bad, gone, own_turf, limit.
create or replace function public.review_photo_start(p_key text, p_user_id uuid, p_turf_id uuid, p_ext text,
                                                     p_bytes integer, p_thumb_bytes integer, p_w integer, p_h integer)
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
  if private.review_photos_paused() then
    return jsonb_build_object('r', 'paused');
  end if;
  if p_user_id is null or p_turf_id is null or coalesce(p_ext, '') not in ('webp', 'jpg')
     or coalesce(p_bytes, 0) not between 1000 and 1048576
     or coalesce(p_thumb_bytes, 0) not between 200 and 131072 or p_thumb_bytes >= p_bytes
     or coalesce(p_w, 0) not between 1 and 1600 or coalesce(p_h, 0) not between 1 and 1600
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  if not exists (select 1 from public.turfs t where t.id = p_turf_id and t.is_active = true) then
    return jsonb_build_object('r', 'gone');
  end if;
  if private.account_manages_turf(p_user_id, p_turf_id) then
    return jsonb_build_object('r', 'own_turf');
  end if;
  -- One at a time per account, so two uploads can't pass the daily cap together.
  perform pg_advisory_xact_lock(hashtextextended('review_photos:' || p_user_id::text, 0));
  perform private.review_photos_expire(p_user_id);
  -- Refused and unchecked ones count: each one cost a check.
  select count(*) into v_today from private.review_photos
   where user_id = p_user_id and created_at > now() - interval '1 day';
  if v_today >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  v_name := encode(extensions.gen_random_bytes(12), 'hex');
  insert into private.review_photos (user_id, turf_id, name, ext, bytes, thumb_bytes, w, h)
  values (p_user_id, p_turf_id, v_name, p_ext, p_bytes, p_thumb_bytes, p_w, p_h)
  returning id into v_id;
  return jsonb_build_object('r', 'ok', 'id', v_id, 'path', v_name || '.' || p_ext, 'thumb', v_name || '_t.' || p_ext,
                            'bucket', 'review-photos', 'left', 9 - v_today);
end;
$$;
revoke all on function public.review_photo_start(text, uuid, uuid, text, integer, integer, integer, integer) from public;
grant execute on function public.review_photo_start(text, uuid, uuid, text, integer, integer, integer, integer) to anon, authenticated;

-- A ticket that won't be finished: the check said no (refused), the check couldn't
-- run (unchecked; both never stored), or the upload failed (expired: a file may be
-- there, so it is listed for the sweep).
create or replace function public.review_photo_end(p_key text, p_user_id uuid, p_id uuid, p_outcome text, p_verdict jsonb default null)
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
  update private.review_photos
     set status = p_outcome, ended_at = now(),
         verdict = case when jsonb_typeof(p_verdict) = 'object' then p_verdict else verdict end
   where id = p_id and user_id = p_user_id and status = 'uploading';
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok');
end;
$$;
revoke all on function public.review_photo_end(text, uuid, uuid, text, jsonb) from public;
grant execute on function public.review_photo_end(text, uuid, uuid, text, jsonb) to anon, authenticated;

-- Uploaded: both files must be in the bucket at exactly the sizes and type the server
-- checked. The photo is ready to go on a report: {r: ok, photo}, or r: expired, missing.
create or replace function public.review_photo_finish(p_key text, p_user_id uuid, p_id uuid, p_verdict jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p private.review_photos;
  v_type text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('review_photos:' || p_user_id::text, 0));
  select * into p from private.review_photos x
   where x.id = p_id and x.user_id = p_user_id and x.status = 'uploading'
     and x.created_at > now() - interval '15 minutes'
     for update;
  if not found then
    return jsonb_build_object('r', 'expired');
  end if;
  v_type := case p.ext when 'webp' then 'image/webp' else 'image/jpeg' end;
  if (select count(*) from storage.objects o
       where o.bucket_id = 'review-photos'
         and ((o.name = p.name || '.' || p.ext and o.metadata ->> 'size' = p.bytes::text)
              or (o.name = p.name || '_t.' || p.ext and o.metadata ->> 'size' = p.thumb_bytes::text))
         and o.metadata ->> 'mimetype' = v_type
         and o.archived_at is null and not coalesce(o.is_delete_marker, false)) <> 2 then
    return jsonb_build_object('r', 'missing');
  end if;
  update private.review_photos x
     set status = 'ready', ready_at = now(),
         verdict = case when jsonb_typeof(p_verdict) = 'object' then p_verdict else x.verdict end
   where x.id = p.id
  returning * into p;
  return jsonb_build_object('r', 'ok', 'photo', private.review_photo_json(p));
end;
$$;
revoke all on function public.review_photo_finish(text, uuid, uuid, jsonb) from public;
grant execute on function public.review_photo_finish(text, uuid, uuid, jsonb) to anon, authenticated;

-- A photo taken out of the sheet before it was posted (ready, this account's): it
-- goes, and its files are listed for the route to take away. One already on a report
-- comes off when the report is saved without it (review_save). {r: ok, files}, or r: bad.
create or replace function public.review_photo_discard(p_key text, p_user_id uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p private.review_photos;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  update private.review_photos x set status = 'removed', ended_at = now()
   where x.id = p_id and x.user_id = p_user_id and x.status = 'ready' and x.review_id is null
  returning * into p;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok', 'files', jsonb_build_array(
    jsonb_build_object('id', p.id, 'paths', jsonb_build_array(p.name || '.' || p.ext, p.name || '_t.' || p.ext))));
end;
$$;
revoke all on function public.review_photo_discard(text, uuid, uuid) from public;
grant execute on function public.review_photo_discard(text, uuid, uuid) to anon, authenticated;

-- The route (or the sweep) took these photos' files away.
create or replace function public.review_photo_files_gone(p_key text, p_ids uuid[])
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
  update private.review_photos set files_gone_at = now()
   where id = any(coalesce(p_ids, '{}')) and files_gone_at is null and status in ('removed', 'hidden', 'expired');
  get diagnostics n = row_count;
  return jsonb_build_object('r', 'ok', 'gone', n);
end;
$$;
revoke all on function public.review_photo_files_gone(text, uuid[]) from public;
grant execute on function public.review_photo_files_gone(text, uuid[]) to anon, authenticated;

-- A report that leaves the page (its author took it down, TapTurf hid it) takes its
-- photos with it, at once: off every read, their files listed for the sweep. Posting
-- the report again doesn't bring them back.
create or replace function private.review_photos_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.review_photos p
     set status = case when new.status = 'hidden' then 'hidden' else 'removed' end, ended_at = now()
   where p.review_id = new.id and p.status = 'live';
  return null;
end;
$$;
revoke all on function private.review_photos_follow() from public, anon, authenticated;

create or replace trigger reviews_photos_follow
  after update of status on public.reviews
  for each row
  when (old.status = 'live' and new.status is distinct from 'live')
  execute function private.review_photos_follow();

-- For /api/reviews/photos/sweep: ends tickets left unused for 15 minutes and photos
-- never posted in 2 days, takes off any live photo whose report isn't live (one the
-- trigger can't see, such as a report taken out of the table), then lists the files
-- still to take away, oldest first, 50 photos at most. Two minutes' grace, so the
-- sweep never races the route's own removal.
create or replace function public.review_photo_sweep_list(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  update private.review_photos set status = 'expired', ended_at = now()
   where (status = 'uploading' and created_at <= now() - interval '15 minutes')
      or (status = 'ready' and review_id is null and ready_at <= now() - interval '2 days');
  update private.review_photos p
     set status = case when exists (select 1 from public.reviews r where r.id = p.review_id and r.status = 'hidden') then 'hidden' else 'removed' end,
         ended_at = now()
   where p.status = 'live'
     and not exists (select 1 from public.reviews r where r.id = p.review_id and r.status = 'live');
  return jsonb_build_object('r', 'ok', 'files', coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'paths', jsonb_build_array(f.name || '.' || f.ext, f.name || '_t.' || f.ext)) order by f.ended_at)
      from (select p.id, p.name, p.ext, p.ended_at from private.review_photos p
             where p.files_gone_at is null and p.status in ('removed', 'hidden', 'expired')
               and p.ended_at <= now() - interval '2 minutes'
             order by p.ended_at
             limit 50) f
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.review_photo_sweep_list(text) from public;
grant execute on function public.review_photo_sweep_list(text) to anon, authenticated;

-- Every 15 minutes: asks the app to sweep only when there is something to do, with
-- the secret the cache queue and the photo sweeps use.
create or replace function private.review_photos_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url constant text := 'https://www.tapturf.in/api/reviews/photos/sweep';
  v_secret text;
begin
  if not exists (
    select 1 from private.review_photos p
     where (p.files_gone_at is null and p.status in ('removed', 'hidden', 'expired') and p.ended_at <= now() - interval '2 minutes')
        or (p.status = 'uploading' and p.created_at <= now() - interval '15 minutes')
        or (p.status = 'ready' and p.review_id is null and p.ready_at <= now() - interval '2 days')
        or (p.status = 'live' and not exists (select 1 from public.reviews r where r.id = p.review_id and r.status = 'live'))) then
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
revoke all on function private.review_photos_tick() from public, anon, authenticated;
select cron.schedule('review-photos-sweep', '8,23,38,53 * * * *', 'select private.review_photos_tick()');

-- ── 4. Report this review ─────────────────────────────────

create table if not exists private.review_flags (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  turf_id uuid not null,
  -- The account that reported it (the route's verified caller).
  user_id uuid not null,
  reason text not null check (reason in ('not_played', 'abusive', 'spam', 'personal', 'other')),
  detail text check (detail is null or char_length(detail) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'hidden', 'kept')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- One open report per report per account.
create unique index if not exists review_flags_one_open_uidx on private.review_flags (review_id, user_id) where status = 'open';
create index if not exists review_flags_open_idx on private.review_flags (created_at) where status = 'open';
create index if not exists review_flags_review_idx on private.review_flags (review_id, created_at desc);
create index if not exists review_flags_user_idx on private.review_flags (user_id, created_at desc);
revoke all on private.review_flags from public, anon, authenticated;
comment on table private.review_flags is
  'A player reporting a TapTurf report that breaks the rules (review_flag). The site owner decides (admin_review_flag_decide): hidden hides the report, kept leaves it. Never shown to the report''s author.';

-- A signed-in player reports someone else's live TapTurf report. p_reason:
-- not_played, abusive, spam, personal or other; p_detail: an optional line, up to
-- 300 characters. Once per report, and again only after the report changed since
-- their last one was decided. 10 a day per account. The report stays live meanwhile.
-- Answers {r: ok, already}, or r: bad, gone (not a live report), google, own, limit.
create or replace function public.review_flag(p_key text, p_user_id uuid, p_review_id uuid, p_reason text, p_detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
  v_detail text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_review_id is null or p_reason is null
     or p_reason not in ('not_played', 'abusive', 'spam', 'personal', 'other')
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  v_detail := private.review_clean_text(p_detail);
  if char_length(v_detail) > 300 then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_review from public.reviews r where r.id = p_review_id;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if coalesce(v_review.source, '') <> '' then
    return jsonb_build_object('r', 'google');
  end if;
  if v_review.user_id = p_user_id then
    return jsonb_build_object('r', 'own');
  end if;
  if v_review.status <> 'live' then
    return jsonb_build_object('r', 'gone');
  end if;
  -- One report at a time per account, so the day's count sees every one before it.
  perform pg_advisory_xact_lock(hashtextextended('review_flag:' || p_user_id::text, 0));
  if exists (select 1 from private.review_flags f
              where f.review_id = p_review_id and f.user_id = p_user_id
                and (f.status = 'open' or f.decided_at >= coalesce(v_review.edited_at, v_review.created_at))) then
    return jsonb_build_object('r', 'ok', 'already', true);
  end if;
  if (select count(*) from private.review_flags f where f.user_id = p_user_id and f.created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('r', 'limit');
  end if;
  insert into private.review_flags (review_id, turf_id, user_id, reason, detail)
  values (p_review_id, v_review.turf_id, p_user_id, p_reason, v_detail);
  return jsonb_build_object('r', 'ok', 'already', false);
end;
$$;
revoke all on function public.review_flag(text, uuid, uuid, text, text) from public;
grant execute on function public.review_flag(text, uuid, uuid, text, text) to anon, authenticated;

-- The site owner's queue: every open report, oldest first, then the 30 latest
-- decided. Each with the report as players see it (its author's public name, the
-- badge and its photos), the turf, who reported it (their account's public name,
-- and whether they manage that turf; never their number or email) and why, and how
-- many others reported the same one. {open, flags: [...]}, or error: forbidden.
create or replace function public.admin_review_flags(p_firebase_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object(
    'open', (select count(*) from private.review_flags f where f.status = 'open'),
    'flags', coalesce((
      select jsonb_agg(x.j order by x.open desc, x.sort_at)
        from (
          select f.status = 'open' as open,
                 case when f.status = 'open' then extract(epoch from f.created_at) else -extract(epoch from coalesce(f.decided_at, f.created_at)) end as sort_at,
                 jsonb_build_object(
                   'id', f.id, 'status', f.status, 'reason', f.reason, 'detail', f.detail,
                   'created_at', f.created_at, 'decided_at', f.decided_at,
                   'by', jsonb_build_object('name', nullif(btrim(u.name), ''), 'account', f.user_id,
                                            'manages', private.account_manages_turf(f.user_id, f.turf_id)),
                   'others', (select count(*) from private.review_flags z
                               where z.review_id = f.review_id and z.status = 'open' and z.id <> f.id),
                   'turf', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'city', t.city),
                   'review', case when r.id is not null then
                     private.review_row_json(r) - array['user_avatar', 'source', 'author_name', 'author_url', 'source_url', 'source_date_label', 'upvotes']
                       || jsonb_build_object('status', r.status, 'author', a.name, 'author_id', r.user_id,
                                             'photos', (select jsonb_agg(private.review_photo_json(ph) order by ph.position)
                                                          from private.review_photos ph where ph.review_id = r.id and ph.status in ('live', 'hidden')))
                   end) as j
            from (select * from private.review_flags where status = 'open'
                  union all
                  (select * from private.review_flags where status <> 'open'
                    order by decided_at desc nulls last limit 30)) f
            left join public.reviews r on r.id = f.review_id
            left join public.users a on a.id = r.user_id
            left join public.users u on u.id = f.user_id
            left join public.turfs t on t.id = f.turf_id
        ) x), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_review_flags(text) from public;
grant execute on function public.admin_review_flags(text) to anon, authenticated;

-- The site owner's answer: hide (the report is hidden, as a removal request's Remove
-- hides it: off the page and out of every count, its photos with it, and its author
-- sees it as hidden, never who reported it) or keep. Either closes every open report
-- of it. Hide hides only a live report: on one its author already took down it hides
-- nothing and closes them as kept. {ok, status: hidden | kept, turf_id, review_id,
-- closed}, with already: true when it was decided before; or error: forbidden, bad, not_found.
create or replace function public.admin_review_flag_decide(p_firebase_token text, p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review uuid;
  v_flag private.review_flags;
  v_live boolean;
  v_status text;
  v_n integer;
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_id is null or p_decision is null or p_decision not in ('hide', 'keep') then
    return jsonb_build_object('error', 'bad');
  end if;
  select f.review_id into v_review from private.review_flags f where f.id = p_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- One decision at a time per report: it closes every open report of it.
  perform pg_advisory_xact_lock(hashtextextended('review_flag_decide:' || v_review::text, 0));
  select * into v_flag from private.review_flags f where f.id = p_id for update;
  if v_flag.status <> 'open' then
    return jsonb_build_object('ok', true, 'status', v_flag.status, 'turf_id', v_flag.turf_id, 'review_id', v_flag.review_id, 'closed', 0, 'already', true);
  end if;
  -- The report's row, held, so its author can't take it down while this decides.
  v_live := coalesce((select r.status = 'live' from public.reviews r
                       where r.id = v_flag.review_id and r.source is null for update), false);
  v_status := case when p_decision = 'hide' and v_live then 'hidden' else 'kept' end;
  update private.review_flags f
     set status = v_status, decided_at = now()
   where f.review_id = v_flag.review_id and f.status = 'open';
  get diagnostics v_n = row_count;
  if v_status = 'hidden' then
    -- The page refreshes within a minute, not at the next sweep.
    perform set_config('tapturf.cache_urgent', 'on', true);
    update public.reviews r set status = 'hidden'
     where r.id = v_flag.review_id and r.source is null and r.status = 'live';
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'turf_id', v_flag.turf_id, 'review_id', v_flag.review_id, 'closed', v_n);
end;
$$;
revoke all on function public.admin_review_flag_decide(text, uuid, text) from public;
grant execute on function public.admin_review_flag_decide(text, uuid, text) to anon, authenticated;

-- A report hidden another way (an owner's removal request, Remove) closes its open
-- reports too, as hidden.
create or replace function private.review_flags_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.review_flags f set status = 'hidden', decided_at = now()
   where f.review_id = new.id and f.status = 'open';
  return null;
end;
$$;
revoke all on function private.review_flags_follow() from public, anon, authenticated;

create or replace trigger reviews_flags_follow
  after update of status on public.reviews
  for each row
  when (old.status is distinct from 'hidden' and new.status = 'hidden')
  execute function private.review_flags_follow();

-- ── 5. Replaced bodies ────────────────────────────────────

-- 20261027_game_reports.sql (production md5 c88a60b9b82d3354be6091cc759ef5ae), with two
-- new keys: played_here (private.review_played_here, at the report's latest version;
-- false for a Google row) and photos (its live ones in order, null for none).
create or replace function private.review_row_json(r public.reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', r.id,
           'user_id', r.user_id,
           'turf_id', r.turf_id,
           'rating', r.rating,
           'comment', left(r.comment, 2000),
           'created_at', r.created_at,
           'source', r.source,
           'author_name', r.author_name,
           'author_url', r.author_url,
           'source_url', r.source_url,
           'source_date_label', r.source_date_label,
           'user_name', case when coalesce(r.source, '') = '' then u.name else r.author_name end,
           'user_avatar', case when coalesce(r.source, '') = '' then u.profile_image_url end,
           'upvotes', (select count(*) from public.review_votes v
                        where v.review_id = r.id and v.withdrawn_at is null and v.user_id is distinct from r.user_id),
           'sport', r.sport,
           'played_when', r.played_when,
           'aspects', r.aspects,
           'play_again', r.play_again,
           'verified_via', r.verified_via,
           'edited_at', r.edited_at,
           'played_here', coalesce(r.source, '') = ''
                          and private.review_played_here(r.user_id, r.turf_id, coalesce(r.edited_at, r.created_at)),
           'photos', case when coalesce(r.source, '') = '' then (
                       select jsonb_agg(private.review_photo_json(ph) order by ph.position, ph.live_at)
                         from private.review_photos ph where ph.review_id = r.id and ph.status = 'live') end)
    from (select 1) one
    left join public.users u on u.id = r.user_id;
$$;
revoke all on function private.review_row_json(public.reviews) from public, anon, authenticated;

-- 20261101_reviews_policy.sql (production md5 1b8fd1e452366dfb0c828da80686a823), with:
-- the tip checked with the tip's rule (private.review_tip_problem; the note keeps
-- private.review_text_problem), and the photos: p_report.photos, up to 3 ids, replaces
-- the report's photos in that order (left out, they stay). Only this account's photos
-- for this turf that are ready or already on this report go on, and only on a live
-- report (a hidden one's stay off); the rest are left out. Answers as before.
create or replace function public.review_save(p_key text, p_user_id uuid, p_turf_id uuid, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turf public.turfs;
  v_old public.reviews;
  v_row public.reviews;
  v_rating int;
  v_sport text;
  v_when text;
  v_aspects jsonb;
  v_again smallint;
  v_comment text;
  v_has_note boolean;
  v_note_body text;
  v_show_name boolean := false;
  v_price int;
  v_channel text;
  v_ms int;
  v_base text;
  v_created boolean := false;
  v_id uuid;
  v_new boolean;
  v_held boolean := false;
  v_verified text;
  v_price_saved boolean := false;
  v_note jsonb := null;
  v_n private.review_notes;
  v_claimed boolean;
  v_daily jsonb;
  v_has_photos boolean;
  v_photos uuid[];
  v_moved integer := 0;
  v_k integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null or p_report is null or jsonb_typeof(p_report) <> 'object' then
    return jsonb_build_object('r', 'bad');
  end if;
  -- One save at a time per account: the limits below then count every save before this one.
  perform pg_advisory_xact_lock(hashtextextended('review_save:' || p_user_id::text, 0));
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_turf from public.turfs t where t.id = p_turf_id and t.is_active = true;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if private.account_manages_turf(p_user_id, p_turf_id) then
    return jsonb_build_object('r', 'own_turf');
  end if;

  -- The report, each field checked (the route checked it too).
  if jsonb_typeof(p_report -> 'rating') is distinct from 'number' or (p_report ->> 'rating') !~ '^[1-5]$' then
    return jsonb_build_object('r', 'bad');
  end if;
  v_rating := (p_report ->> 'rating')::int;

  if jsonb_typeof(p_report -> 'sport') = 'string' then
    v_sport := p_report ->> 'sport';
    if not (jsonb_typeof(v_turf.sports) = 'array' and v_turf.sports ? v_sport) then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'sport'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'played_when') = 'string' and (p_report ->> 'played_when') in ('morning', 'afternoon', 'evening', 'night') then
    v_when := p_report ->> 'played_when';
  elsif coalesce(jsonb_typeof(p_report -> 'played_when'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'play_again') = 'number' and (p_report ->> 'play_again') in ('-1', '0', '1') then
    v_again := (p_report ->> 'play_again')::smallint;
  elsif coalesce(jsonb_typeof(p_report -> 'play_again'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  v_aspects := case when jsonb_typeof(p_report -> 'aspects') = 'object' and p_report -> 'aspects' <> '{}'::jsonb
                    then p_report -> 'aspects' end;
  if coalesce(jsonb_typeof(p_report -> 'aspects'), 'null') not in ('null', 'object') or not private.review_aspects_ok(v_aspects) then
    return jsonb_build_object('r', 'bad');
  end if;

  if jsonb_typeof(p_report -> 'comment') = 'string' then
    v_comment := private.review_clean_text(p_report ->> 'comment');
    if char_length(v_comment) > 500 then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'comment'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  v_has_note := p_report ? 'note' and jsonb_typeof(p_report -> 'note') = 'object';
  if p_report ? 'note' and not v_has_note and jsonb_typeof(p_report -> 'note') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;
  if v_has_note then
    if jsonb_typeof(p_report -> 'note' -> 'body') = 'string' then
      v_note_body := private.review_clean_text(p_report -> 'note' ->> 'body');
      if char_length(v_note_body) > 400 then
        return jsonb_build_object('r', 'bad');
      end if;
    elsif coalesce(jsonb_typeof(p_report -> 'note' -> 'body'), 'null') <> 'null' then
      return jsonb_build_object('r', 'bad');
    end if;
    v_show_name := case when jsonb_typeof(p_report -> 'note' -> 'show_name') = 'boolean'
                        then (p_report -> 'note' ->> 'show_name')::boolean else false end;
  end if;

  if jsonb_typeof(p_report -> 'price_paid') = 'number' then
    if (p_report ->> 'price_paid') !~ '^[0-9]{3,5}$' then
      return jsonb_build_object('r', 'bad');
    end if;
    v_price := (p_report ->> 'price_paid')::int;
    if v_price not between 100 and 20000 then
      return jsonb_build_object('r', 'bad');
    end if;
  elsif coalesce(jsonb_typeof(p_report -> 'price_paid'), 'null') <> 'null' then
    return jsonb_build_object('r', 'bad');
  end if;

  if coalesce(jsonb_typeof(p_report -> 'base'), 'null') not in ('null', 'string') then
    return jsonb_build_object('r', 'bad');
  end if;
  v_base := p_report ->> 'base';

  -- The photos: a list of up to 3 ids (each once, in the order given), or left out.
  v_has_photos := jsonb_typeof(p_report -> 'photos') = 'array';
  if coalesce(jsonb_typeof(p_report -> 'photos'), 'null') not in ('null', 'array') then
    return jsonb_build_object('r', 'bad');
  end if;
  if v_has_photos then
    if jsonb_array_length(p_report -> 'photos') > 3
       or exists (select 1 from jsonb_array_elements(p_report -> 'photos') e
                   where jsonb_typeof(e) <> 'string'
                      or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return jsonb_build_object('r', 'bad');
    end if;
    select coalesce(array_agg(x.id order by x.at), '{}') into v_photos
      from (select (e #>> '{}')::uuid as id, min(n) as at
              from jsonb_array_elements(p_report -> 'photos') with ordinality t(e, n)
             group by 1) x;
  end if;

  -- Where the report came from and how long it took: kept only when well formed.
  v_channel := case when (p_report ->> 'channel') in ('turf_page', 'link', 'owner_link', 'game', 'ask', 'edit') then p_report ->> 'channel' end;
  if jsonb_typeof(p_report -> 'ms') = 'number' and (p_report ->> 'ms') ~ '^[0-9]{1,6}$' then
    v_ms := (p_report ->> 'ms')::int;
    if v_ms > 600000 then
      v_ms := null;
    end if;
  end if;

  -- The public tip has the tip's rule (an @handle too); the private note keeps its own.
  if private.review_tip_problem(v_comment) is not null then
    return jsonb_build_object('r', 'contact_info', 'field', 'comment');
  end if;
  if private.review_text_problem(v_note_body) is not null then
    return jsonb_build_object('r', 'contact_info', 'field', 'note');
  end if;

  -- One save at a time per turf too: the rush check and the note batches count the turf's other saves.
  perform pg_advisory_xact_lock(hashtextextended('review_turf:' || p_turf_id::text, 0));
  select * into v_old from public.reviews r
   where r.user_id = p_user_id and r.turf_id = p_turf_id and r.source is null
   for update;

  -- Never a silent overwrite: a save must name the report it replaces.
  if v_old.id is not null and v_old.status <> 'removed' and v_base is distinct from v_old.id::text then
    return jsonb_build_object('r', 'exists', 'review', private.review_mine_json(v_old));
  end if;

  -- Per account: 5 new reports and 20 saves a day.
  v_new := v_old.id is null or v_old.status = 'removed';
  if (select count(*) from private.review_saves s where s.user_id = p_user_id and s.saved_at > now() - interval '24 hours') >= 20
     or (v_new
         and (select count(*) from private.review_saves s
               where s.user_id = p_user_id and s.saved_at > now() - interval '24 hours' and s.action in ('create', 'repost')) >= 5) then
    return jsonb_build_object('r', 'limit');
  end if;
  -- And one new report a day, or one for each turf they played a TapTurf game at today
  -- (private.review_daily). Edits never count, nor posting here again today.
  if v_new then
    v_daily := private.review_daily(p_user_id, p_turf_id);
    if (v_daily ->> 'full')::boolean then
      return jsonb_build_object('r', 'limit', 'why', 'daily', 'allowed', v_daily -> 'allowed', 'played', v_daily -> 'played');
    end if;
  end if;

  -- Always false now (every report goes live at once); kept so the call stays as it was.
  v_held := v_new and private.review_hold(p_user_id, p_turf_id);
  -- Worked out again at every save, so a game that is cancelled or taken away takes the badge with it.
  v_verified := private.review_verified_via(p_user_id, p_turf_id);

  -- The page refreshes within a minute, not at the next sweep.
  perform set_config('tapturf.cache_urgent', 'on', true);

  if v_old.id is not null then
    insert into private.review_saves (review_id, user_id, turf_id, action, channel, ms, price_sent, before)
    values (v_old.id, p_user_id, p_turf_id, case when v_old.status = 'removed' then 'repost' else 'edit' end,
            v_channel, v_ms, v_price is not null, to_jsonb(v_old));
    update public.reviews r
       set rating = v_rating,
           comment = v_comment,
           sport = v_sport,
           played_when = v_when,
           aspects = v_aspects,
           play_again = v_again,
           verified_via = v_verified,
           edited_at = case when (v_rating, v_comment, v_aspects, v_again) is distinct from (v_old.rating, v_old.comment, v_old.aspects, v_old.play_again)
                            then now() else v_old.edited_at end,
           status = case when v_old.status = 'hidden' then 'hidden' when v_held then 'held' else 'live' end
     where r.id = v_old.id
    returning * into v_row;
  else
    insert into public.reviews as r (user_id, turf_id, rating, comment, sport, played_when, aspects, play_again, verified_via, status)
    values (p_user_id, p_turf_id, v_rating, v_comment, v_sport, v_when, v_aspects, v_again, v_verified,
            case when v_held then 'held' else 'live' end)
    on conflict (user_id, turf_id) where source is null do update
       set rating = excluded.rating, comment = excluded.comment, sport = excluded.sport,
           played_when = excluded.played_when, aspects = excluded.aspects, play_again = excluded.play_again,
           verified_via = excluded.verified_via, edited_at = now(),
           status = case when r.status = 'hidden' then r.status else excluded.status end
    returning r.id, (r.xmax = 0) into v_id, v_created;
    select * into v_row from public.reviews r where r.id = v_id;
    insert into private.review_saves (review_id, user_id, turf_id, action, channel, ms, price_sent, before)
    values (v_row.id, p_user_id, p_turf_id, case when v_created then 'create' else 'edit' end, v_channel, v_ms, v_price is not null, null);
  end if;

  -- The photos, on a live report only: the ones it had and the list left out come off,
  -- the listed ones go on in order (this account's, for this turf, ready or already on
  -- it). A change of photos alone changes no column of the report, so the page is
  -- queued here.
  if v_has_photos and v_row.status = 'live' then
    update private.review_photos ph set status = 'removed', ended_at = now()
     where ph.review_id = v_row.id and ph.status = 'live' and not (ph.id = any(v_photos));
    get diagnostics v_k = row_count;
    v_moved := v_moved + v_k;
    update private.review_photos ph
       set review_id = v_row.id, status = 'live', position = array_position(v_photos, ph.id),
           live_at = coalesce(ph.live_at, now())
     where ph.id = any(v_photos) and ph.user_id = p_user_id and ph.turf_id = p_turf_id
       and (ph.status = 'ready' or (ph.status = 'live' and ph.review_id = v_row.id))
       and (ph.review_id is distinct from v_row.id or ph.position is distinct from array_position(v_photos, ph.id));
    get diagnostics v_k = row_count;
    v_moved := v_moved + v_k;
    if v_moved > 0 then
      perform private.mark_dirty(array[private.turf_key(p_turf_id)], true);
    end if;
  end if;

  -- The private note. A named one arrives at the next 09:00 IST at least 8 hours on; an
  -- unnamed one waits for its batch (below). What the owner already has stays on show
  -- until the new version arrives.
  if v_has_note then
    select * into v_n from private.review_notes n where n.review_id = v_row.id for update;
    if v_note_body is null then
      update private.review_notes n
         set body = null, shown_body = null, shown_named = null, shown_at = null, deliver_after = null,
             cleared_at = now(), updated_at = now()
       where n.review_id = v_row.id and (n.body is not null or n.shown_body is not null);
    elsif v_n.review_id is null then
      insert into private.review_notes (review_id, turf_id, user_id, body, show_name, deliver_after)
      values (v_row.id, p_turf_id, p_user_id, v_note_body, v_show_name,
              case when v_show_name then private.next_note_delivery(now()) end);
    elsif v_n.body is distinct from v_note_body or v_n.show_name is distinct from v_show_name or v_n.cleared_at is not null then
      update private.review_notes n
         set shown_body = case when n.body is not null and n.cleared_at is null and n.deliver_after <= now() then n.body else n.shown_body end,
             shown_named = case when n.body is not null and n.cleared_at is null and n.deliver_after <= now() then n.show_name else n.shown_named end,
             shown_at = case when n.body is not null and n.cleared_at is null and n.deliver_after <= now() then n.deliver_after else n.shown_at end,
             body = v_note_body,
             show_name = v_show_name,
             deliver_after = case when v_show_name then private.next_note_delivery(now()) end,
             cleared_at = null,
             updated_at = now()
       where n.review_id = v_row.id;
    end if;
  end if;

  -- Unnamed notes go to the owner only in batches of 3 or more players, all at once,
  -- so the time a note arrives points at no one.
  if (select count(distinct n.user_id)
        from private.review_notes n join public.reviews r on r.id = n.review_id
       where n.turf_id = p_turf_id and n.body is not null and n.cleared_at is null and not n.show_name
         and n.deliver_after is null and r.status = 'live') >= 3 then
    update private.review_notes n
       set deliver_after = private.next_note_delivery(now())
      from public.reviews r
     where r.id = n.review_id and n.turf_id = p_turf_id and n.body is not null and n.cleared_at is null
       and not n.show_name and n.deliver_after is null and r.status = 'live';
  end if;

  select * into v_n from private.review_notes n
   where n.review_id = v_row.id and n.body is not null and n.cleared_at is null;
  if v_n.review_id is not null then
    v_claimed := exists (select 1 from public.turf_owners o where o.turf_id = p_turf_id and o.status = 'active');
    v_note := jsonb_build_object(
      'delivers', case when not v_claimed then 'on_claim' when v_n.deliver_after is null then 'batch' else 'tomorrow' end,
      'at', v_n.deliver_after);
  end if;

  -- The rate they paid, as their From players price: only while the turf has fewer than
  -- 3 other players' prices (the sheet asks only then), and not from a held report.
  -- Never loses the report.
  if v_price is not null and v_row.status = 'live'
     and (select count(*) from public.turf_suggestions s
           where s.turf_id = p_turf_id and s.user_id is distinct from p_user_id and s.status <> 'rejected'
             and (s.price_min is not null or s.price_max is not null)) < 3 then
    begin
      v_price_saved := private.review_share_price(p_user_id, p_turf_id, v_price);
    exception when others then
      v_price_saved := false;
    end;
  end if;

  return jsonb_build_object(
    'r', 'ok',
    'created', v_created,
    'review', private.review_row_json(v_row) || jsonb_build_object('status', v_row.status),
    'note', v_note,
    'price_saved', v_price_saved,
    'after', jsonb_build_object(
      'tapturf_n', (select count(*) from public.reviews r where r.turf_id = p_turf_id and r.source is null and r.status = 'live'),
      'aspects', coalesce((
        select jsonb_object_agg(k, (
                 select count(*) from public.reviews r
                  where r.turf_id = p_turf_id and r.source is null and r.status = 'live'
                    and jsonb_typeof(r.aspects) = 'object' and r.aspects ? k
                    and coalesce(r.edited_at, r.created_at) >= now() - interval '365 days'))
          from jsonb_object_keys(coalesce(v_row.aspects, '{}'::jsonb)) k), '{}'::jsonb)));
end;
$$;
revoke all on function public.review_save(text, uuid, uuid, jsonb) from public;
grant execute on function public.review_save(text, uuid, uuid, jsonb) to anon, authenticated;
