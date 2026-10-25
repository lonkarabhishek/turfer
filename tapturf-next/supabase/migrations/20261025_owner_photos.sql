-- myTapturf: owners add photos of their turf themselves.
--
-- Until now an owner emailed photos and someone on the team added them by
-- hand. Now the browser shrinks each photo (long side 1600, plus a 640
-- card; drawing it again also leaves the location details behind) and
-- uploads both straight to the public turf-photos bucket as
-- owner/<turf_id>/<24 hex>.webp and <24 hex>-card.webp, the names
-- lib/utils/images.ts (MIRRORED) already knows. No service-role key, and
-- no photo passes through Vercel.
--
-- 1. public.turf_owner_photos: one row per photo an owner starts to add.
--    RLS on with no policies; only the functions here touch it. Status:
--    uploading (a ticket), checking (uploaded, not on the page yet), live,
--    held (kept off the page), removed, expired (a ticket never used).
-- 2. Upload tickets. owner_photo_start checks the caller (_caller_key,
--    _can_manage) and hands out random paths, open for uploads for 30
--    minutes and for finishing for 35 (an upload ending at 29:59 counts).
--    20261025_owner_photos_policies.sql adds the storage policies, whose
--    rule is public.owner_photo_object_ok: a file may be written only at
--    an open ticket's path, and read (for remove) or removed only once
--    nothing will show it. An upload in progress can't be listed, so its
--    name stays secret. No UPDATE policy: uploads never overwrite a file.
-- 3. owner_photo_finish checks both files are in the bucket at exactly the
--    sizes the browser sent, of the right type, the card smaller than the
--    photo, uploaded by this sign-in; the photo is then checking.
-- 4. The check: /api/my/photos/check (right after finish) and
--    /api/my/photos/sweep (a minute job, so it can't be skipped) run the
--    judge (lib/my/photoJudge.ts) on the full photo and its card and send
--    verdicts through owner_photo_verdicts with the server key
--    (private.account_key_ok, env ACCOUNT_KEY), so owners can't pass their
--    own photos. A good photo goes on the page; one that isn't the venue,
--    that the judge won't look at or can't read is held for the admin.
--    If the judge is down for 10 minutes, the photo goes up unchecked and
--    is checked when the judge is back.
-- 5. owner_photo_cover (any visible photo becomes the first photo and the
--    cover), owner_photo_remove (photos owners added), owner_photos (what
--    the Photos section on /my/turf/<id> shows).
-- 6. Admin: admin_owner_photos (held and waiting ones first, then the latest) and
--    admin_owner_photo_restore (a held photo on the page).
-- 7. A claim taken away (active to rejected or revoked) holds the photos
--    that person added, for the admin to put back.
-- 8. set_turf_cover (the admin AI cover pass) keeps a cover an owner chose
--    (while it is the cover and they still manage the turf), leaves owner
--    photos to their own check, and never makes a held or removed one the
--    cover.
-- 9. The minute job (private.owner_photos_tick): expires unused tickets,
--    puts up photos the judge left waiting 10 minutes, and asks
--    /api/my/photos/sweep to check what's due and to remove the files of
--    removed photos and unused tickets.
--
-- Limits: 10 photos a batch, 20 owner photos per turf (live or on their
-- way), 40 started per account per day (the site owner is exempt). To
-- pause: create or replace private.owner_photos_paused() to return true.
-- Tickets already issued stop working, finish refuses, and nothing goes up
-- unchecked; the app says so and points to email.
--
-- Only the photo columns of turfs change (images, cover_image), so the
-- old per-row webhook skips these updates, the cache queue refreshes the
-- city's lists and the turf page, and the edit log row written after the
-- turfs update (or tapturf.cache_urgent) makes that urgent.
--
-- Additive: one table, one small state table, new functions, a trigger,
-- a cron job, and set_turf_cover replaced with the same signature.
-- Written without the destructive SQL keywords. Safe to run again. Apply
-- before 20261025_owner_photos_policies.sql and before the code.

set local lock_timeout = '5s';

create table if not exists public.turf_owner_photos (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null,
  -- 'p:..' or 'e:..', from _caller_key, as in turf_owners.
  user_key text not null,
  -- 24 hex: the file name, without -card or the extension.
  name text not null unique,
  -- 'webp' or 'jpg' (checked in owner_photo_start).
  ext text not null,
  -- The start of a sha-256 of the original file: the same photo twice.
  src_hash text,
  -- uploading, checking, live, held, removed or expired. No CHECK
  -- constraints, so a new value never needs one taken off.
  status text not null default 'uploading',
  url text,
  full_bytes integer,
  card_bytes integer,
  created_at timestamptz not null default now(),
  -- Uploaded and accepted by owner_photo_finish.
  finished_at timestamptz,
  live_at timestamptz,
  checked_at timestamptz,
  -- Times the judge couldn't load it or gave no answer for it; held at 3.
  check_tries integer not null default 0,
  -- A check in progress claims the photo until then.
  next_check_at timestamptz,
  verdict jsonb,
  removed_at timestamptz,
  removed_by text,
  -- The sweep removed the files of a removed photo or an unused ticket.
  files_gone_at timestamptz
);
comment on table public.turf_owner_photos is 'Photos owners add on myTapturf (20261025_owner_photos.sql). Only the owner_photo functions touch it.';
create index if not exists turf_owner_photos_turf on public.turf_owner_photos (turf_id, status);
create index if not exists turf_owner_photos_key on public.turf_owner_photos (user_key, created_at desc);
create index if not exists turf_owner_photos_unchecked on public.turf_owner_photos (next_check_at)
  where checked_at is null and status in ('checking', 'live');
create index if not exists turf_owner_photos_files on public.turf_owner_photos (created_at)
  where files_gone_at is null and status in ('removed', 'expired');
create index if not exists turf_owner_photos_open on public.turf_owner_photos (created_at) where status = 'uploading';
alter table public.turf_owner_photos enable row level security;
revoke all on public.turf_owner_photos from public, anon, authenticated;

-- When the minute job last asked the sweep route to run.
create table if not exists private.owner_photos_state (id boolean primary key, last_post timestamptz);
revoke all on private.owner_photos_state from public, anon, authenticated;

-- ── Helpers ───────────────────────────────────────────────
-- The pause switch: create or replace with "select true" to pause.
create or replace function private.owner_photos_paused()
returns boolean
language sql
stable
set search_path = ''
as $$ select false $$;

-- lib/utils/images.ts normalizeImageUrl for the two hosts it changes:
-- Google user content gets =w1600-h1200, a Drive share link its
-- thumbnail form. The cover pass reviews normalised URLs; images keeps
-- them as stored.
create or replace function private.norm_image_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_path text;
  v_id text;
begin
  if p_url is null then
    return null;
  end if;
  if p_url ~* '^https?://lh[0-9]+\.googleusercontent\.com/' then
    v_path := substring(p_url from '^[^?#]*');
    return regexp_replace(v_path, '^(.*/[^/=]*)=[^/]*$', '\1') || '=w1600-h1200' || substr(p_url, length(v_path) + 1);
  end if;
  if strpos(p_url, 'drive.google.com') > 0 and strpos(p_url, 'drive.google.com/thumbnail') = 0 then
    v_id := coalesce(substring(p_url from '/file/d/([^/?]+)'), substring(p_url from '[?&]id=([^&]+)'));
    if v_id is not null then
      return 'https://drive.google.com/thumbnail?id=' || v_id || '&sz=w2000';
    end if;
  end if;
  return p_url;
end;
$$;

-- The cover pass hides this photo on the public page.
create or replace function private.image_hidden(p_url text, p_review jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_review) = 'array' then p_review else '[]'::jsonb end) r
     where r ->> 'usable' = 'false' and r ->> 'url' in (p_url, private.norm_image_url(p_url)))
$$;

-- The first photo players see when there is no cover: the first one not
-- hidden, or the first one when all are (as lib/queries/turfs.ts does).
create or replace function private.first_visible_image(p_images jsonb, p_review jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select e from jsonb_array_elements_text(case when jsonb_typeof(p_images) = 'array' then p_images else '[]'::jsonb end) with ordinality x(e, i)
      where not private.image_hidden(e, p_review) order by i limit 1),
    case when jsonb_typeof(p_images) = 'array' then p_images ->> 0 end)
$$;

-- Photos waiting for the judge go on the page, right after the first
-- photo (and after the ones of the same batch already up); the cover
-- too when there is none. The caller may hold the turf row already.
-- Returns how many went up.
create or replace function private.owner_photos_publish(p_turf_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_new jsonb;
  v_images jsonb;
  v_since timestamptz;
  v_batch timestamptz;
  v_after integer;
begin
  select id, images, image_review into t from public.turfs where id = p_turf_id for update;
  if not found then
    return 0;
  end if;
  select coalesce(jsonb_agg(p.url order by p.finished_at, p.id), '[]'::jsonb) into v_new
    from public.turf_owner_photos p
   where p.id = any(p_ids) and p.turf_id = p_turf_id and p.status = 'checking' and p.url is not null;
  if jsonb_array_length(v_new) = 0 then
    return 0;
  end if;
  v_images := coalesce(case when jsonb_typeof(t.images) = 'array' then t.images end, '[]'::jsonb)
              - array(select jsonb_array_elements_text(v_new));
  -- After the first photo and the photos of the same batch (one
  -- owner_photo_start: one created_at) that an earlier check already put
  -- up, so a batch keeps its order however many checks it takes.
  select p.finished_at, p.created_at into v_since, v_batch from public.turf_owner_photos p
   where p.id = any(p_ids) and p.turf_id = p_turf_id and p.status = 'checking'
   order by p.finished_at, p.id limit 1;
  select count(*) into v_after from (
    select bool_and(exists (select 1 from public.turf_owner_photos o
                             where o.turf_id = p_turf_id and o.url = x.e and o.status = 'live'
                               and o.created_at = v_batch and o.finished_at < v_since))
             over (order by x.i) as earlier
      from jsonb_array_elements_text(v_images - 0) with ordinality x(e, i)) z
   where z.earlier;
  v_images := case when jsonb_array_length(v_images) = 0 then v_new
                   else jsonb_build_array(v_images -> 0)
                        || coalesce((select jsonb_agg(x.e order by x.i) from jsonb_array_elements(v_images - 0) with ordinality x(e, i) where x.i <= v_after), '[]'::jsonb)
                        || v_new
                        || coalesce((select jsonb_agg(x.e order by x.i) from jsonb_array_elements(v_images - 0) with ordinality x(e, i) where x.i > v_after), '[]'::jsonb) end;
  update public.turfs
     set images = v_images,
         cover_image = coalesce(nullif(cover_image, ''), private.first_visible_image(v_images, t.image_review))
   where id = p_turf_id;
  -- After the turfs update: turf_edit_log_cache_urgent makes its keys urgent.
  insert into public.turf_edit_log (turf_id, user_key, before, after)
  select p_turf_id, p.user_key, jsonb_build_object('photos_added', '[]'::jsonb),
         jsonb_build_object('photos_added', jsonb_agg(p.url order by p.finished_at, p.id))
    from public.turf_owner_photos p
   where p.id = any(p_ids) and p.turf_id = p_turf_id and p.status = 'checking' and p.url is not null
   group by p.user_key;
  update public.turf_owner_photos
     set status = 'live', live_at = now()
   where id = any(p_ids) and turf_id = p_turf_id and status = 'checking' and url is not null;
  return jsonb_array_length(v_new);
end;
$$;

-- Live or waiting photos kept off the page; the cover moves on if it was
-- one of them. The caller sets the verdict. Returns how many were held.
create or replace function private.owner_photos_hold(p_turf_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_urls text[];
  v_images jsonb;
  n integer;
begin
  select id, images, cover_image, image_review into t from public.turfs where id = p_turf_id for update;
  select coalesce(array_agg(p.url) filter (where p.status = 'live' and p.url is not null), '{}') into v_urls
    from public.turf_owner_photos p
   where p.id = any(p_ids) and p.turf_id = p_turf_id and p.status in ('live', 'checking');
  update public.turf_owner_photos set status = 'held'
   where id = any(p_ids) and turf_id = p_turf_id and status in ('live', 'checking');
  get diagnostics n = row_count;
  if cardinality(v_urls) > 0 and t.id is not null then
    -- Off the page at the next minute tick.
    perform set_config('tapturf.cache_urgent', 'on', true);
    v_images := coalesce(case when jsonb_typeof(t.images) = 'array' then t.images end, '[]'::jsonb) - v_urls;
    update public.turfs
       set images = v_images,
           cover_image = case when cover_image = any(v_urls) then private.first_visible_image(v_images, t.image_review) else cover_image end
     where id = p_turf_id
       and (images is distinct from v_images or cover_image = any(v_urls));
  end if;
  return n;
end;
$$;

-- ── Who may write a file ──────────────────────────────────
-- Storage checks its policies as anon or authenticated; this runs as its
-- owner (postgres, which bypasses RLS), so it can read the tickets. Open
-- to the API, but it only says whether a random path has an open window.
-- insert: an open ticket. select and delete (remove needs both): only a
-- file nothing will show (a removed photo, an unused ticket), so a list
-- never shows a file on its way to the page.
create or replace function public.owner_photo_object_ok(p_object text, p_op text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[] := regexp_match(coalesce(p_object, ''),
    '^owner/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{24})(-card)?\.(webp|jpg)$');
begin
  if m is null or p_op is null then
    return false;
  end if;
  if p_op = 'insert' and private.owner_photos_paused() then
    return false;
  end if;
  return exists (
    select 1 from public.turf_owner_photos p
     where p.name = m[2] and p.turf_id = m[1]::uuid and p.ext = m[4]
       and case
         when p_op = 'insert' then p.status = 'uploading' and p.created_at > now() - interval '30 minutes'
         when p_op in ('select', 'delete') then p.status in ('removed', 'expired')
                                             or (p.status = 'uploading' and p.created_at <= now() - interval '35 minutes')
         else false
       end);
end;
$$;

-- ── Start: one ticket per photo ───────────────────────────
-- items keeps the order of the files sent: a ticket {id, path, card_path},
-- or {duplicate: true} for a photo already on the page (or kept off it,
-- or being checked), or sent twice in this batch.
create or replace function public.owner_photo_start(p_token text, p_turf_id uuid, p_count integer, p_ext text, p_hashes text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  n integer := coalesce(p_count, 0);
  v_hash text[] := '{}';
  v_seen text[] := '{}';
  v_dup boolean[] := '{}';
  h text;
  d boolean;
  v_new integer := 0;
  v_live integer;
  v_today integer;
  v_items jsonb := '[]'::jsonb;
  v_name text;
  v_id uuid;
begin
  if private.owner_photos_paused() then
    return jsonb_build_object('error', 'paused');
  end if;
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if n < 1 or n > 10 or coalesce(p_ext, '') not in ('webp', 'jpg')
     or (p_hashes is not null and coalesce(cardinality(p_hashes), 0) <> n) then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- One batch per turf at a time (two managers can't pass the turf cap
  -- together), then per account (two turfs at once can't pass the daily cap).
  perform pg_advisory_xact_lock(hashtext('owner_photos:' || p_turf_id::text));
  perform pg_advisory_xact_lock(hashtext('owner_photos_key:' || k));
  update public.turf_owner_photos set status = 'expired'
   where turf_id = p_turf_id and status = 'uploading' and created_at < now() - interval '35 minutes';

  for i in 1..n loop
    h := case when p_hashes is null then null else left(nullif(btrim(p_hashes[i]), ''), 64) end;
    d := false;
    if h is not null then
      d := (h = any(v_seen))
           or exists (select 1 from public.turf_owner_photos x
                       where x.turf_id = p_turf_id and x.src_hash = h and x.status in ('checking', 'live', 'held'));
      v_seen := v_seen || h;
    end if;
    v_hash := v_hash || h;
    v_dup := v_dup || d;
    if not d then
      v_new := v_new + 1;
    end if;
  end loop;

  -- Caps before any ticket, so a refused batch leaves nothing behind.
  -- A ticket past its 30 minutes can't take an upload any more (only be finished): it holds no place.
  select count(*) into v_live from public.turf_owner_photos
   where turf_id = p_turf_id
     and (status in ('live', 'checking') or (status = 'uploading' and created_at > now() - interval '30 minutes'));
  if v_live + v_new > 20 then
    return jsonb_build_object('error', 'too_many', 'left', greatest(0, 20 - v_live));
  end if;
  if not public._is_admin_key(k) then
    select count(*) into v_today from public.turf_owner_photos
     where user_key = k and created_at > now() - interval '1 day';
    if v_today + v_new > 40 then
      return jsonb_build_object('error', 'daily_limit', 'left', greatest(0, 40 - v_today));
    end if;
  end if;

  for i in 1..n loop
    if v_dup[i] then
      v_items := v_items || jsonb_build_array(jsonb_build_object('duplicate', true));
      continue;
    end if;
    v_name := encode(extensions.gen_random_bytes(12), 'hex');
    insert into public.turf_owner_photos (turf_id, user_key, name, ext, src_hash)
    values (p_turf_id, k, v_name, p_ext, v_hash[i])
    returning id into v_id;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'path', 'owner/' || p_turf_id::text || '/' || v_name || '.' || p_ext,
      'card_path', 'owner/' || p_turf_id::text || '/' || v_name || '-card.' || p_ext));
  end loop;
  return jsonb_build_object('ok', true, 'bucket', 'turf-photos', 'items', v_items);
end;
$$;

-- ── Finish: uploaded, now the check ───────────────────────
-- p_sizes: the byte sizes the browser uploaded, two per id in order (the
-- photo, then its card). A file of another size, type or uploader is not
-- this photo: that id comes back in missing.
create or replace function public.owner_photo_finish(p_token text, p_turf_id uuid, p_ids uuid[], p_sizes bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  base constant text := 'https://hwfsbpzercuoshodmnuf.supabase.co/storage/v1/object/public/turf-photos/';
  v_uid text := auth.uid()::text;
  p record;
  i integer;
  v_full text;
  v_card text;
  v_fs bigint;
  v_cs bigint;
  v_mime text;
  v_done uuid[] := '{}';
begin
  if private.owner_photos_paused() then
    return jsonb_build_object('error', 'paused');
  end if;
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_ids is null or coalesce(cardinality(p_ids), 0) not between 1 and 10
     or p_sizes is null or coalesce(cardinality(p_sizes), 0) <> 2 * cardinality(p_ids) then
    return jsonb_build_object('error', 'bad_request');
  end if;
  if not exists (select 1 from public.turfs where id = p_turf_id and is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  for p in
    select * from public.turf_owner_photos
     where id = any(p_ids) and turf_id = p_turf_id and user_key = k and status = 'uploading'
       and created_at > now() - interval '35 minutes'
     order by array_position(p_ids, id)
       for update
  loop
    i := array_position(p_ids, p.id);
    v_fs := p_sizes[2 * i - 1];
    v_cs := p_sizes[2 * i];
    if v_fs is null or v_cs is null or v_cs < 1000 or v_fs > 3145728 or v_cs >= v_fs then
      continue;
    end if;
    v_mime := case p.ext when 'webp' then 'image/webp' else 'image/jpeg' end;
    v_full := 'owner/' || p_turf_id::text || '/' || p.name || '.' || p.ext;
    v_card := 'owner/' || p_turf_id::text || '/' || p.name || '-card.' || p.ext;
    if (select count(*) from storage.objects o
         where o.bucket_id = 'turf-photos'
           and ((o.name = v_full and o.metadata ->> 'size' = v_fs::text)
             or (o.name = v_card and o.metadata ->> 'size' = v_cs::text))
           and o.metadata ->> 'mimetype' = v_mime
           and o.archived_at is null and not coalesce(o.is_delete_marker, false)
           and o.owner_id is not distinct from v_uid) <> 2 then
      continue;
    end if;
    update public.turf_owner_photos
       -- A millisecond apart, in the order sent: the order they go on the page.
       set status = 'checking', url = base || v_full, full_bytes = v_fs, card_bytes = v_cs,
           finished_at = now() + i * interval '1 millisecond'
     where id = p.id;
    v_done := v_done || p.id;
  end loop;
  return jsonb_build_object('ok', true, 'checking', to_jsonb(v_done),
    'missing', coalesce((select jsonb_agg(to_jsonb(x)) from unnest(p_ids) x where not (x = any(v_done))), '[]'::jsonb));
end;
$$;

-- ── Make cover: first photo on cards and in the gallery ───
-- p_url is the element as stored in turfs.images (owner_photos.images).
create or replace function public.owner_photo_cover(p_token text, p_turf_id uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  t record;
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select id, images, cover_image, image_review into t from public.turfs where id = p_turf_id and is_active for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_url is null or coalesce(jsonb_typeof(t.images), '') <> 'array' or not (t.images ? p_url) then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- Hidden, unless the cover pass flagged them all (the page then shows them all).
  if private.image_hidden(p_url, t.image_review)
     and exists (select 1 from jsonb_array_elements_text(t.images) e where not private.image_hidden(e, t.image_review)) then
    return jsonb_build_object('error', 'hidden');
  end if;
  if t.cover_image is not distinct from p_url and t.images ->> 0 = p_url then
    return jsonb_build_object('ok', true);
  end if;
  update public.turfs
     set images = jsonb_build_array(p_url) || (t.images - p_url),
         cover_image = p_url
   where id = p_turf_id;
  -- set_turf_cover reads this: the AI cover pass keeps an owner's choice.
  insert into public.turf_edit_log (turf_id, user_key, before, after)
  values (p_turf_id, k, jsonb_build_object('cover_image', t.cover_image), jsonb_build_object('cover_image', p_url));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Remove a photo an owner added ─────────────────────────
-- Off the page at once. The browser removes the two files now and the
-- sweep makes sure of it.
create or replace function public.owner_photo_remove(p_token text, p_turf_id uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  p public.turf_owner_photos%rowtype;
  t record;
  v_images jsonb;
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  -- The turf first, then the photo, as the check does.
  select id, images, cover_image, image_review into t from public.turfs where id = p_turf_id for update;
  select * into p from public.turf_owner_photos
   where id = p_id and turf_id = p_turf_id and status in ('live', 'held', 'checking')
     for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p.status = 'live' and p.url is not null and t.id is not null then
    v_images := coalesce(case when jsonb_typeof(t.images) = 'array' then t.images end, '[]'::jsonb) - p.url;
    update public.turfs
       set images = v_images,
           cover_image = case when cover_image = p.url then private.first_visible_image(v_images, t.image_review) else cover_image end
     where id = p_turf_id;
  end if;
  update public.turf_owner_photos
     set status = 'removed', removed_at = now(), removed_by = k
   where id = p.id;
  insert into public.turf_edit_log (turf_id, user_key, before, after)
  values (p_turf_id, k, jsonb_build_object('photo_removed', null), jsonb_build_object('photo_removed', p.url));
  return jsonb_build_object('ok', true, 'paths', jsonb_build_array(
    'owner/' || p_turf_id::text || '/' || p.name || '.' || p.ext,
    'owner/' || p_turf_id::text || '/' || p.name || '-card.' || p.ext));
end;
$$;

-- ── What the Photos section shows ─────────────────────────
-- images as stored, the cover, the photos the cover pass hides (by the
-- URL it reviewed, which the app compares after normalising, as the
-- public page does), and the photos owners added that are live, being
-- checked or held.
create or replace function public.owner_photos(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public._caller_key(p_token);
  t record;
begin
  if not public._can_manage(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select id, images, cover_image, image_review into t from public.turfs where id = p_turf_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object(
    'images', case when jsonb_typeof(t.images) = 'array' then t.images else '[]'::jsonb end,
    'cover', t.cover_image,
    'flagged', coalesce((
      select jsonb_agg(jsonb_build_object('url', r ->> 'url', 'note', r ->> 'note'))
        from jsonb_array_elements(case when jsonb_typeof(t.image_review) = 'array' then t.image_review else '[]'::jsonb end) r
       where r ->> 'usable' = 'false' and r ->> 'url' is not null
    ), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'url', p.url, 'status', p.status, 'at', coalesce(p.live_at, p.finished_at, p.created_at),
               'checked', p.checked_at is not null, 'note', p.verdict ->> 'note'
             ) order by p.created_at desc)
        from public.turf_owner_photos p
       where p.turf_id = p_turf_id and p.status in ('live', 'checking', 'held') and p.url is not null
    ), '[]'::jsonb),
    'max_mine', 20,
    'max_batch', 10
  );
end;
$$;

-- ── The check (server key only) ───────────────────────────
-- Photos no one has judged yet, oldest first, at most 9 a call, each
-- claimed for 3 minutes so two checks never judge one photo. p_force
-- (admin's Check now) takes them even while claimed.
create or replace function public.owner_photos_to_check(p_key text, p_turf_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  with c as (
    select p.id from public.turf_owner_photos p
     where p.turf_id = p_turf_id and p.status in ('checking', 'live') and p.checked_at is null and p.url is not null
       and not coalesce(p.verdict ->> 'override', '') = 'true'
       and (coalesce(p_force, false) or coalesce(p.next_check_at, '-infinity'::timestamptz) <= now())
     order by p.finished_at nulls last, p.id
     limit 9
       for update skip locked
  ), u as (
    update public.turf_owner_photos p set next_check_at = now() + interval '3 minutes'
      from c where p.id = c.id
    returning p.id, p.url, p.finished_at
  )
  select jsonb_agg(jsonb_build_object('id', u.id, 'url', u.url, 'card_url', regexp_replace(u.url, '\.(webp|jpg)$', '-card.\1'))
                   order by u.finished_at, u.id)
    into v_items from u;
  return jsonb_build_object('ok', true, 'items', coalesce(v_items, '[]'::jsonb));
end;
$$;

-- p_verdicts: [{id, outcome, usable, quality, shows, note}]. outcome:
-- judged (usable says), refused (the judge wouldn't look: held),
-- unreadable (the judge couldn't read the file: held), unloadable (we
-- couldn't fetch it) and unanswered (the judge answered, but not about
-- this photo): tried again, held at the third. A good photo goes on the
-- page; a held one comes off it. A photo with no verdict (the judge was
-- down) is left for the next check.
create or replace function public.owner_photo_verdicts(p_key text, p_turf_id uuid, p_verdicts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  p public.turf_owner_photos%rowtype;
  v_out text;
  v_bad boolean;
  v_note text;
  v_tries integer;
  v_hold uuid[] := '{}';
  v_pub uuid[] := '{}';
  v_live uuid[] := '{}';
  v_seen uuid[] := '{}';
  v_checked integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_verdicts is null or jsonb_typeof(p_verdicts) <> 'array' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  -- The turf first, then the photos, as remove and restore do.
  perform 1 from public.turfs where id = p_turf_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  for v in select e from jsonb_array_elements(p_verdicts) e loop
    if jsonb_typeof(v) <> 'object'
       or coalesce(v ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    -- One verdict per photo a call.
    if (v ->> 'id')::uuid = any(v_seen) then
      continue;
    end if;
    v_seen := v_seen || (v ->> 'id')::uuid;
    select * into p from public.turf_owner_photos
     where id = (v ->> 'id')::uuid and turf_id = p_turf_id and status in ('checking', 'live') and checked_at is null
       and not coalesce(verdict ->> 'override', '') = 'true'
       for update;
    if not found then
      continue;
    end if;
    v_out := v ->> 'outcome';
    if v_out = 'judged' and jsonb_typeof(v -> 'usable') = 'boolean' then
      v_bad := not (v ->> 'usable')::boolean;
      v_note := left(v ->> 'note', 200);
    elsif v_out = 'refused' then
      v_bad := true;
      v_note := 'Kept for a manual look';
    elsif v_out = 'unreadable' then
      v_bad := true;
      v_note := 'Could not read this photo';
    elsif v_out in ('unloadable', 'unanswered') then
      update public.turf_owner_photos set check_tries = check_tries + 1 where id = p.id returning check_tries into v_tries;
      if v_tries < 3 then
        continue;
      end if;
      v_bad := true;
      v_note := case v_out when 'unloadable' then 'Could not load this photo' else 'Kept for a manual look' end;
    else
      continue;
    end if;
    update public.turf_owner_photos
       set checked_at = now(),
           verdict = coalesce(verdict, '{}'::jsonb) || jsonb_build_object(
             'usable', not v_bad, 'outcome', v_out,
             'quality', case when jsonb_typeof(v -> 'quality') = 'number' then v -> 'quality' end,
             'shows', left(v ->> 'shows', 40), 'note', v_note)
     where id = p.id;
    v_checked := v_checked + 1;
    if v_bad then
      v_hold := v_hold || p.id;
    elsif p.status = 'checking' then
      v_pub := v_pub || p.id;
    else
      v_live := v_live || p.id;
    end if;
  end loop;
  if cardinality(v_hold) > 0 then
    perform private.owner_photos_hold(p_turf_id, v_hold);
  end if;
  if cardinality(v_pub) > 0 then
    perform private.owner_photos_publish(p_turf_id, v_pub);
  end if;
  return jsonb_build_object('ok', true, 'checked', v_checked, 'live', to_jsonb(v_pub || v_live), 'held', to_jsonb(v_hold));
end;
$$;

-- ── The sweep (server key only) ───────────────────────────
-- What /api/my/photos/sweep does next: turfs with photos due a check (5
-- at most), and files to remove (removed photos, unused tickets; 50).
create or replace function public.owner_photos_sweep_list(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object('ok', true,
    'turfs', coalesce((
      select jsonb_agg(x.turf_id) from (
        select p.turf_id, min(p.finished_at) as since from public.turf_owner_photos p
         where p.status in ('checking', 'live') and p.checked_at is null and p.url is not null
           and not coalesce(p.verdict ->> 'override', '') = 'true'
           and coalesce(p.next_check_at, '-infinity'::timestamptz) <= now()
         group by p.turf_id
         order by since nulls last
         limit 5) x
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'paths', jsonb_build_array(
               'owner/' || f.turf_id::text || '/' || f.name || '.' || f.ext,
               'owner/' || f.turf_id::text || '/' || f.name || '-card.' || f.ext)))
        from (select p.id, p.turf_id, p.name, p.ext from public.turf_owner_photos p
               where p.files_gone_at is null and p.status in ('removed', 'expired')
               order by p.created_at limit 50) f
    ), '[]'::jsonb));
end;
$$;

-- The sweep removed these files.
create or replace function public.owner_photo_files_gone(p_key text, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  update public.turf_owner_photos set files_gone_at = now()
   where id = any(coalesce(p_ids, '{}')) and status in ('removed', 'expired') and files_gone_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'done', n);
end;
$$;

-- ── The minute job ────────────────────────────────────────
-- Expire unused tickets, put up photos the judge left waiting 10 minutes
-- (not while paused), and ask the sweep route to run when there is a
-- check due (at most once a minute) or files to remove (every 15 minutes).
create or replace function private.owner_photos_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url constant text := 'https://www.tapturf.in/api/my/photos/sweep';
  v_turf uuid;
  v_check boolean;
  v_files boolean;
  v_last timestamptz;
  v_gap interval;
  v_secret text;
begin
  update public.turf_owner_photos set status = 'expired'
   where status = 'uploading' and created_at < now() - interval '35 minutes';
  if not private.owner_photos_paused() then
    for v_turf in
      select distinct p.turf_id from public.turf_owner_photos p
       where p.status = 'checking' and p.finished_at < now() - interval '10 minutes'
       order by p.turf_id
    loop
      perform private.owner_photos_publish(v_turf, array(
        select p.id from public.turf_owner_photos p
         where p.turf_id = v_turf and p.status = 'checking' and p.finished_at < now() - interval '10 minutes'));
    end loop;
  end if;

  v_check := exists (
    select 1 from public.turf_owner_photos p
     where p.status in ('checking', 'live') and p.checked_at is null and p.url is not null
       and not coalesce(p.verdict ->> 'override', '') = 'true'
       and coalesce(p.next_check_at, '-infinity'::timestamptz) <= now());
  v_files := exists (select 1 from public.turf_owner_photos p where p.files_gone_at is null and p.status in ('removed', 'expired'));
  if not (v_check or v_files) then
    return;
  end if;
  select s.last_post into v_last from private.owner_photos_state s where s.id;
  -- A check at most once a minute; files alone every 15 minutes.
  v_gap := case when v_check then interval '50 seconds' else interval '15 minutes' end;
  if v_last > now() - v_gap then
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
    timeout_milliseconds := 60000
  );
  insert into private.owner_photos_state (id, last_post) values (true, now())
  on conflict (id) do update set last_post = excluded.last_post;
end;
$$;
revoke all on function private.owner_photos_tick() from public, anon, authenticated;
select cron.schedule('owner-photos-sweep', '* * * * *', 'select private.owner_photos_tick()');

-- ── A claim taken away holds that person's photos ────────
create or replace function private.owner_photos_on_unclaim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    -- The turf first, then the photos, as the check, publish and remove do.
    perform 1 from public.turfs where id = new.turf_id for update;
    update public.turf_owner_photos set status = 'expired'
     where turf_id = new.turf_id and user_key = new.user_key and status = 'uploading';
    select array_agg(p.id) into v_ids from public.turf_owner_photos p
     where p.turf_id = new.turf_id and p.user_key = new.user_key and p.status in ('live', 'checking');
    if v_ids is not null then
      update public.turf_owner_photos
         set verdict = coalesce(verdict, '{}'::jsonb) || jsonb_build_object('note', 'Claim taken away', 'unclaimed', true)
       where id = any(v_ids);
      perform private.owner_photos_hold(new.turf_id, v_ids);
    end if;
  end if;
  return null;
end;
$$;
create or replace trigger turf_owners_hold_photos
  after update of status on public.turf_owners
  for each row execute function private.owner_photos_on_unclaim();

-- ── Admin ─────────────────────────────────────────────────
create or replace function public.admin_owner_photos(p_firebase_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(x order by (x.status in ('held', 'checking')) desc, x.created_at desc) from (
      select p.id, p.turf_id, p.user_key, p.status, p.url, p.full_bytes as bytes, p.created_at, p.finished_at, p.live_at,
             p.checked_at, p.check_tries, p.verdict, p.removed_at, p.removed_by,
             t.name as turf_name, t.slug, t.city, t.area
        from public.turf_owner_photos p
        left join public.turfs t on t.id = p.turf_id
       where p.status in ('checking', 'live', 'held', 'removed')
       -- Held and waiting first, so none drops off the list.
       order by (p.status in ('held', 'checking')) desc, p.created_at desc
       limit 200
    ) x
  ), '[]'::jsonb);
end;
$$;

-- A held photo on the page, right after the first photo; the check
-- leaves it alone from then on.
create or replace function public.admin_owner_photo_restore(p_firebase_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turf uuid;
  p public.turf_owner_photos%rowtype;
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select turf_id into v_turf from public.turf_owner_photos where id = p_id;
  -- The turf first, then the photo.
  perform 1 from public.turfs where id = v_turf for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into p from public.turf_owner_photos where id = p_id for update;
  if not found or p.status <> 'held' or p.url is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  update public.turf_owner_photos
     set status = 'checking', verdict = coalesce(verdict, '{}'::jsonb) || jsonb_build_object('override', true)
   where id = p.id;
  perform private.owner_photos_publish(p.turf_id, array[p.id]);
  return jsonb_build_object('ok', true, 'turf_id', p.turf_id);
end;
$$;

-- ── The AI cover pass and owner photos ────────────────────
-- Same as 20261009_cover_review.sql, except: a cover the owner chose
-- (owner_photo_cover logs cover_image) is kept, and kept visible, while it
-- is still the cover and its chooser still manages the turf; photos owners
-- added are left to their own check (a slow fetch here must not hide one),
-- and one that is no longer live never becomes the cover. The rest of the
-- review is saved.
create or replace function public.set_turf_cover(p_turf_id uuid, p_cover text, p_review jsonb, p_firebase_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cover text;
  v_choice text;
  v_by text;
  v_locked boolean;
  v_review jsonb;
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- The turf first, so a hold or remove running now is seen below.
  select cover_image into v_cover from public.turfs where id = p_turf_id for update;
  select l.after ->> 'cover_image', l.user_key into v_choice, v_by
    from public.turf_edit_log l
   where l.turf_id = p_turf_id and l.after ? 'cover_image'
   order by l.created_at desc, l.id desc
   limit 1;
  v_locked := v_choice is not null and v_choice = v_cover and public._can_manage(v_by, p_turf_id);
  v_review := case when jsonb_typeof(p_review) = 'array' then (
      select coalesce(jsonb_agg(r order by i), '[]'::jsonb)
        from jsonb_array_elements(p_review) with ordinality x(r, i)
       where not exists (select 1 from public.turf_owner_photos o where o.turf_id = p_turf_id and o.url = r ->> 'url')
         and not (v_locked and r ->> 'usable' = 'false' and r ->> 'url' in (v_cover, private.norm_image_url(v_cover))))
    else p_review end;
  update public.turfs
  set cover_image = case
        when v_locked then cover_image
        when exists (select 1 from public.turf_owner_photos o where o.turf_id = p_turf_id and o.url = p_cover and o.status <> 'live') then cover_image
        else coalesce(p_cover, cover_image)
      end,
      image_review = v_review,
      cover_reviewed_at = now()
  where id = p_turf_id;
end;
$$;

-- Callable through the API: each function checks its caller (a sign-in
-- that manages the turf, the server key, or the site owner).
revoke all on function private.owner_photos_paused() from public, anon, authenticated;
revoke all on function private.norm_image_url(text) from public, anon, authenticated;
revoke all on function private.image_hidden(text, jsonb) from public, anon, authenticated;
revoke all on function private.first_visible_image(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.owner_photos_publish(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.owner_photos_hold(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.owner_photos_on_unclaim() from public, anon, authenticated;
revoke all on function public.owner_photo_object_ok(text, text) from public;
revoke all on function public.owner_photo_start(text, uuid, integer, text, text[]) from public;
revoke all on function public.owner_photo_finish(text, uuid, uuid[], bigint[]) from public;
revoke all on function public.owner_photo_cover(text, uuid, text) from public;
revoke all on function public.owner_photo_remove(text, uuid, uuid) from public;
revoke all on function public.owner_photos(text, uuid) from public;
revoke all on function public.owner_photos_to_check(text, uuid, boolean) from public;
revoke all on function public.owner_photo_verdicts(text, uuid, jsonb) from public;
revoke all on function public.owner_photos_sweep_list(text) from public;
revoke all on function public.owner_photo_files_gone(text, uuid[]) from public;
revoke all on function public.admin_owner_photos(text) from public;
revoke all on function public.admin_owner_photo_restore(text, uuid) from public;
grant execute on function public.owner_photo_object_ok(text, text) to anon, authenticated;
grant execute on function public.owner_photo_start(text, uuid, integer, text, text[]) to anon, authenticated;
grant execute on function public.owner_photo_finish(text, uuid, uuid[], bigint[]) to anon, authenticated;
grant execute on function public.owner_photo_cover(text, uuid, text) to anon, authenticated;
grant execute on function public.owner_photo_remove(text, uuid, uuid) to anon, authenticated;
grant execute on function public.owner_photos(text, uuid) to anon, authenticated;
grant execute on function public.owner_photos_to_check(text, uuid, boolean) to anon, authenticated;
grant execute on function public.owner_photo_verdicts(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.owner_photos_sweep_list(text) to anon, authenticated;
grant execute on function public.owner_photo_files_gone(text, uuid[]) to anon, authenticated;
grant execute on function public.admin_owner_photos(text) to anon, authenticated;
grant execute on function public.admin_owner_photo_restore(text, uuid) to anon, authenticated;
