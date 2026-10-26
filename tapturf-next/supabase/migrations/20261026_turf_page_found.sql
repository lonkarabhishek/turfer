-- turf_page says "no such turf" in so many words.
--
-- It returned SQL null when no active turf matched, and the page turned
-- that into a 404 cached for a day. But an empty reply (a 200 with no
-- body) also reads as null in supabase-js, so a database or network fault
-- of that shape could still cache a 404 for a live turf, as a failed read
-- did for some 120 pages on 19 and 20 Oct. Now no match is
-- {"found": false}, and the app treats a bare null as a failure
-- (lib/turfPage/shape.ts turfPagePayload).
--
-- The rest is the live definition (supabase/migrations/20261020_turf_page.sql
-- as deployed), unchanged. Same signature and return type. Apply before the
-- app change: the app before it already reads {"found": false} as no turf.

create or replace function public.turf_page(p_key text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  t public.turfs;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_trending jsonb;
begin
  if p_key is null or length(p_key) > 200 then
    return jsonb_build_object('found', false);
  end if;

  if p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into t from public.turfs where id = p_key::uuid and is_active = true;
  else
    select * into t from public.turfs where slug = lower(p_key) and is_active = true;
  end if;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object('city', p.city, 'tagline', p.tagline)
    into v_trending
    from public.trending_turfs p
   where p.turf_id = t.id
     and p.starts_at <= now() and p.ends_at > now()
     and not exists (
       select 1 from public.trending_turfs q
        where q.city = p.city
          and q.starts_at <= now() and q.ends_at > now()
          and q.starts_at > p.starts_at)
   order by (p.city is not distinct from t.city) desc, p.starts_at desc
   limit 1;

  return jsonb_build_object(
    'turf', to_jsonb(t) - array['listing_review', 'listing_checked_at', 'review_summary_at', 'data_sources', 'field_confidence'],

    'claimed', exists (
      select 1 from public.turf_owners o where o.turf_id = t.id and o.status = 'active'),

    'trending', v_trending,
    'is_trending', coalesce(v_trending ->> 'city' = t.city, false),

    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
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
               'upvotes', (select count(*) from public.review_votes v where v.review_id = r.id)
             ) order by (coalesce(r.source, '') <> ''), r.created_at desc)
        from (
          select * from public.reviews
           where turf_id = t.id
           order by created_at desc
           limit 20
        ) r
        left join public.users u on u.id = r.user_id
    ), '[]'::jsonb),

    'review_stats', (
      select jsonb_build_object(
               'count', count(*),
               'average', coalesce(round(avg(least(greatest(rating, 1), 5)), 1), 0),
               'histogram', jsonb_build_array(
                 count(*) filter (where rating <= 1),
                 count(*) filter (where rating = 2),
                 count(*) filter (where rating = 3),
                 count(*) filter (where rating = 4),
                 count(*) filter (where rating >= 5)))
        from public.reviews
       where turf_id = t.id and source is null),

    'suggestions', coalesce((
      select jsonb_agg(to_jsonb(s) - 'ordinality' order by s.ordinality)
        from public.get_turf_suggestions(t.id) with ordinality s
    ), '[]'::jsonb),

    'games', coalesce((
      select jsonb_agg(to_jsonb(g) - 'host_phone' order by g.date, g.start_time)
        from (
          select * from public.games
           where turf_id = t.id
             and status in ('open', 'upcoming', 'active')
             and date >= v_today
           order by date, start_time
           limit 20
        ) g
    ), '[]'::jsonb)
  );
end;
$function$;
