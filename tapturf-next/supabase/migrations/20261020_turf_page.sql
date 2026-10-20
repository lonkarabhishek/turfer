-- Turf pages: one database call per page refresh, none per view.
--
-- 20 Oct outage follow-up. Each turf page render made 3 calls in a row
-- (select * by slug, turf_claim_status, trending_turfs: 84k trending and
-- 31.5k claim calls in 24 h), and every view, Googlebot's and scrapers'
-- included, then made 4 to 7 more from the browser (reviews twice, users,
-- review_votes, get_turf_suggestions, games), each with a CORS preflight
-- to Singapore. turf_page returns everything the page shows in one call;
-- app/turf/[id]/page.tsx renders it into the cached HTML and the browser
-- only reads again after the visitor's own write.
--
-- It is security definer, so it must never show more than anon already
-- can through RLS and get_turf_suggestions:
--   turf          active rows only (turfs_public_read_active), minus the
--                 admin-only columns no public page renders.
--   reviews       reviews_public_read; reviewer name and photo, which
--                 anon reads from users today; vote counts only, never
--                 who voted.
--   suggestions   exactly get_turf_suggestions (phones masked until a
--                 human approves them).
--   games         games are public; host_phone is left out.
--   claimed       the turf_claim_status rule. No names or numbers.
--   trending      the city's live "Most Trending Turf" pick, when it is
--                 this turf (latest start wins, as in lib/queries/trending.ts).
--
-- The page is cached for a day; the cache queue purges turf:<slug> when
-- the turf, its reviews, review votes, suggestions, games, claim or
-- trending pick change.
--
-- Apply before deploying the app code that calls it.

-- Upcoming games at a turf (also the unindexed games.turf_id foreign key
-- the performance advisor flags).
create index if not exists games_turf_date_idx on public.games (turf_id, date);

-- Latest reviews of a turf.
create index if not exists reviews_turf_created_idx on public.reviews (turf_id, created_at desc);

create or replace function public.turf_page(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.turfs;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_trending jsonb;
begin
  if p_key is null or length(p_key) > 200 then
    return null;
  end if;

  -- /turf/<slug>, or an old /turf/<id> link (the page 308s it to the slug).
  if p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into t from public.turfs where id = p_key::uuid and is_active = true;
  else
    select * into t from public.turfs where slug = lower(p_key) and is_active = true;
  end if;
  if not found then
    return null;
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

    -- Latest 20, players' own first (as lib/queries/reviews.ts sorted
    -- them). Imported rows carry the author's public name instead of a
    -- user. Comments are capped so one long import cannot bloat the page.
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

    -- In-app reviews only; Google's score is already on the turf row.
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

    -- Same filter as getUpcomingGamesForTurf; the page drops games that
    -- have already kicked off by start time.
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
$$;

grant execute on function public.turf_page(text) to anon, authenticated;

-- Notifications: the header's unread count. auth.uid() / auth.role() in
-- these policies ran once per row (advisor: auth_rls_initplan); wrapped
-- in a select they run once per statement. Same rules as before. The
-- block skips a policy that is not there, so it is safe to re-run.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      (E'Allow authenticated users to create\n  notifications', 'with check', $e$(select auth.role()) = 'authenticated'$e$),
      ('Enable insert for all authenticated users', 'with check', $e$(select auth.role()) = 'authenticated'$e$),
      ('Enable read access for own notifications', 'using', '(select auth.uid()) = user_id'),
      ('Enable update for own notifications', 'using', '(select auth.uid()) = user_id'),
      ('Users can delete own notifications', 'using', 'user_id = (select auth.uid())'),
      ('Users can update own notifications', 'using', 'user_id = (select auth.uid())'),
      ('Users can update their notifications', 'using', 'user_id = (select auth.uid())'),
      ('Users can view own notifications', 'using', 'user_id = (select auth.uid())'),
      ('Users can view their notifications', 'using', 'user_id = (select auth.uid())')
    ) v(name, clause, expr)
  loop
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'notifications' and policyname = p.name
    ) then
      execute format('alter policy %I on public.notifications %s (%s)', p.name, p.clause, p.expr);
    end if;
  end loop;
end;
$$;

-- The unread count (user_id = me and is_read = false) reads only unread rows.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where is_read = false;
