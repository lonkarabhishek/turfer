-- AI cover-photo pass. For each turf, Claude looks at the listed photos
-- and picks the one that best shows the playing surface; weak ones
-- (logos, screenshots, blur) are flagged in image_review and hidden by
-- the app. Only the site owner can run it (see /api/admin/covers).
--
--   image_review: [{"url": "...", "usable": true, "quality": 4, "shows": "pitch", "note": "..."}]
--   cover_reviewed_at: when the pass last ran for this turf (null = pending)

alter table public.turfs add column if not exists image_review jsonb;
alter table public.turfs add column if not exists cover_reviewed_at timestamptz;

create or replace function public.get_cover_review_batch(p_limit integer default 5, p_firebase_token text default null)
returns table (id uuid, name text, images jsonb, cover_image text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select t.id, t.name::text, t.images, t.cover_image::text
  from public.turfs t
  where t.is_active
    and t.cover_reviewed_at is null
    and jsonb_typeof(t.images) = 'array'
    and jsonb_array_length(t.images) >= 1
  order by t.total_reviews desc nulls last, t.name
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end;
$$;
revoke all on function public.get_cover_review_batch(integer, text) from public;
grant execute on function public.get_cover_review_batch(integer, text) to anon, authenticated;

create or replace function public.set_turf_cover(p_turf_id uuid, p_cover text, p_review jsonb, p_firebase_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.turfs
  set cover_image = coalesce(p_cover, cover_image),
      image_review = p_review,
      cover_reviewed_at = now()
  where id = p_turf_id;
end;
$$;
revoke all on function public.set_turf_cover(uuid, text, jsonb, text) from public;
grant execute on function public.set_turf_cover(uuid, text, jsonb, text) to anon, authenticated;

create or replace function public.cover_review_progress(p_firebase_token text default null)
returns table (total integer, reviewed integer, flagged integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select
    count(*)::integer as total,
    count(*) filter (where cover_reviewed_at is not null)::integer as reviewed,
    coalesce(sum((select count(*) from jsonb_array_elements(coalesce(image_review, '[]'::jsonb)) r where (r->>'usable') = 'false')), 0)::integer as flagged
  from public.turfs
  where is_active and jsonb_typeof(images) = 'array' and jsonb_array_length(images) >= 1;
end;
$$;
revoke all on function public.cover_review_progress(text) from public;
grant execute on function public.cover_review_progress(text) to anon, authenticated;
