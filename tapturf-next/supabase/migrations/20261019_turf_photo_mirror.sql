-- Dev brief 19 Oct: photos were hotlinked from lh3.googleusercontent.com,
-- whose links can expire. The edge function mirror-turf-photos copies
-- them into the public turf-photos bucket (two WebP sizes per photo)
-- and swaps the links on the turf. Applied to production on 2026-10-19.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('turf-photos', 'turf-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- One row per turf the job has picked up. A turf with a failed photo is
-- retried after 15 minutes, up to 5 times.
create table if not exists public.photo_mirror_jobs (
  turf_id uuid primary key,
  tries integer not null default 0,
  last_try timestamptz,
  done_at timestamptz,
  mirrored integer not null default 0,
  last_error text
);
alter table public.photo_mirror_jobs enable row level security;
revoke all on public.photo_mirror_jobs from anon, authenticated;

-- Server-only secrets (RLS on, no policies, no grants for the browser
-- roles). mirror_photos gates the edge function, which has verify_jwt off.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value)
values ('mirror_photos', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

-- Next turfs to mirror: active, still holding a Google photo, most
-- reviewed first.
create or replace function public.claim_photo_batch(p_n integer default 5)
returns setof uuid
language sql
security definer
set search_path to 'public'
as $$
  insert into public.photo_mirror_jobs as j (turf_id, tries, last_try)
  select t.id, 1, now()
  from public.turfs t
  left join public.photo_mirror_jobs pj on pj.turf_id = t.id
  where t.is_active
    and (t.images::text like '%googleusercontent.com%' or coalesce(t.cover_image, '') like '%googleusercontent.com%')
    and (pj.turf_id is null or (pj.tries < 5 and (pj.last_try is null or pj.last_try < now() - interval '15 minutes')))
  order by t.total_reviews desc nulls last
  limit least(greatest(coalesce(p_n, 5), 1), 10)
  on conflict (turf_id) do update set tries = j.tries + 1, last_try = now()
  returning j.turf_id;
$$;

create or replace function public.finish_photo_job(p_turf_id uuid, p_mirrored integer, p_error text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.photo_mirror_jobs
     set done_at = now(),
         mirrored = mirrored + coalesce(p_mirrored, 0),
         last_error = left(p_error, 500),
         tries = case when p_error is null then 0 else tries end
   where turf_id = p_turf_id;
$$;

revoke all on function public.claim_photo_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_photo_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_photo_batch(integer) to service_role;
grant execute on function public.finish_photo_job(uuid, integer, text) to service_role;

-- Five turfs every 30 seconds until no Google photos are left.
select cron.schedule('mirror-turf-photos', '30 seconds', $cron$
  select net.http_post(
    url := 'https://hwfsbpzercuoshodmnuf.supabase.co/functions/v1/mirror-turf-photos?n=5',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mirror-secret', (select value from public.app_secrets where name = 'mirror_photos')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
$cron$);
