-- Listing gap checker (data ops) and "what players say" summaries.
-- Both stored on the turf row, both owner-only through security-definer
-- functions, both run in batches from /admin. Applied 2026-10-10.

alter table public.turfs
  add column if not exists listing_review jsonb,
  add column if not exists listing_checked_at timestamptz,
  add column if not exists review_summary jsonb,
  add column if not exists review_summary_at timestamptz;

-- Listing checker -----------------------------------------------------

create or replace function public.get_listing_check_batch(p_limit integer default 5, p_firebase_token text default null)
returns table (id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select t.id from public.turfs t
  where t.is_active and (t.listing_checked_at is null or t.updated_at > t.listing_checked_at)
  order by t.created_at desc nulls last, t.name
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end $$;
revoke all on function public.get_listing_check_batch(integer, text) from public;
grant execute on function public.get_listing_check_batch(integer, text) to anon, authenticated;

create or replace function public.set_listing_review(p_turf_id uuid, p_review jsonb, p_firebase_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.turfs set listing_review = p_review, listing_checked_at = now() where id = p_turf_id;
end $$;
revoke all on function public.set_listing_review(uuid, jsonb, text) from public;
grant execute on function public.set_listing_review(uuid, jsonb, text) to anon, authenticated;

create or replace function public.listing_check_progress(p_firebase_token text default null)
returns table (total integer, reviewed integer, flagged integer)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select count(*)::integer,
         count(*) filter (where t.listing_checked_at is not null and not (t.updated_at > t.listing_checked_at))::integer,
         count(*) filter (where t.listing_review ->> 'ok' = 'false')::integer
  from public.turfs t where t.is_active;
end $$;
revoke all on function public.listing_check_progress(text) from public;
grant execute on function public.listing_check_progress(text) to anon, authenticated;

create or replace function public.get_listing_reviews(p_firebase_token text default null)
returns table (id uuid, name text, city text, listing_review jsonb, listing_checked_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select t.id, t.name::text, t.city::text, t.listing_review, t.listing_checked_at
  from public.turfs t
  where t.is_active and t.listing_review ->> 'ok' = 'false'
  order by t.listing_checked_at desc limit 300;
end $$;
revoke all on function public.get_listing_reviews(text) from public;
grant execute on function public.get_listing_reviews(text) to anon, authenticated;

-- What players say ----------------------------------------------------

create or replace function public.get_review_summary_batch(p_limit integer default 5, p_firebase_token text default null)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select t.id, t.name::text from public.turfs t
  where t.is_active
    and (select count(*) from public.reviews r where r.turf_id = t.id and r.comment is not null and length(trim(r.comment)) > 10) >= 2
    and (t.review_summary_at is null or exists (select 1 from public.reviews r where r.turf_id = t.id and r.created_at > t.review_summary_at))
  order by t.total_reviews desc nulls last, t.name
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end $$;
revoke all on function public.get_review_summary_batch(integer, text) from public;
grant execute on function public.get_review_summary_batch(integer, text) to anon, authenticated;

create or replace function public.set_review_summary(p_turf_id uuid, p_summary jsonb, p_firebase_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.turfs set review_summary = p_summary, review_summary_at = now() where id = p_turf_id;
end $$;
revoke all on function public.set_review_summary(uuid, jsonb, text) from public;
grant execute on function public.set_review_summary(uuid, jsonb, text) to anon, authenticated;

create or replace function public.review_summary_progress(p_firebase_token text default null)
returns table (total integer, reviewed integer, flagged integer)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with c as (
    select t.id, t.review_summary_at,
      (select count(*) from public.reviews r where r.turf_id = t.id and r.comment is not null and length(trim(r.comment)) > 10) as n,
      exists (select 1 from public.reviews r where r.turf_id = t.id and t.review_summary_at is not null and r.created_at > t.review_summary_at) as stale
    from public.turfs t where t.is_active
  )
  select count(*) filter (where n >= 2)::integer,
         count(*) filter (where n >= 2 and review_summary_at is not null and not stale)::integer,
         0::integer
  from c;
end $$;
revoke all on function public.review_summary_progress(text) from public;
grant execute on function public.review_summary_progress(text) to anon, authenticated;
