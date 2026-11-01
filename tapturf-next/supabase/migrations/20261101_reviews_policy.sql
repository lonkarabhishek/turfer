-- Reviews policy (the site owner, 1 Nov 2026): every player report goes live
-- at once; a turf's owner asks TapTurf to take one off instead of a check
-- before it shows; and one new report a day.
--
-- 1. No hold. private.review_hold answers false, as it has on production
--    since 30 Oct (set by hand; this file records it), so a new report goes
--    live at once, and an edit no longer keeps a held report held. Reports
--    still held are let through below (none on 1 Nov: 19 player reports, all
--    live). hidden (the site owner) and removed (the author) stay as they are.
-- 2. One new report a day (India time), or one for each turf the player
--    played a TapTurf game at that day (private.review_daily: a game dated
--    today that has started and wasn't cancelled, which they hosted or
--    joined). Edits never count, nor posting again on a turf they already
--    posted on today. review_save answers r: limit with why: daily, allowed
--    and played (an app from before this file shows its plain limit line);
--    review_mine gains a daily key, so the sheet can say it before anything
--    is typed. The 5 new reports and 20 saves a day stay as they were.
-- 3. Removal requests, the "review of reviews". An owner with an active
--    claim on the turf asks TapTurf to take a player's report off
--    (owner_review_removal_ask: a reason from a short list and an optional
--    line) and sees their own requests (owner_review_removals); the site
--    owner decides (admin_review_removals, admin_review_removal_decide):
--    Remove hides the report, Keep closes the request. The report stays live
--    while a request waits, and its author is never told that anyone asked,
--    or who. One open request per report per owner, 10 a day per owner.
--    Requests are only ever added or updated.
--
-- Replaced bodies, same signatures, from production (pg_proc.prosrc, read
-- 1 Nov 2026): review_save and review_mine are the 20261027_game_reports.sql
-- bodies (same md5 as production) with the changes above; review_hold is
-- production's one-line body.
--
-- Apply after the app that reads it is live; that app works on the database
-- before this file too (no daily key, no removal functions: the owner action
-- stays hidden). Additive: functions, one table in the private schema, its
-- indexes, and one update of held rows. Written without the destructive SQL
-- keywords. Safe to run again.

set local lock_timeout = '5s';

-- ── 1. No hold ─────────────────────────────────────────────

create or replace function private.review_hold(p_user uuid, p_turf uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Every report goes live at once (the site owner, 30 Oct 2026). The arguments stay, so
  -- review_save's call is unchanged.
  select false;
$$;
revoke all on function private.review_hold(uuid, uuid) from public, anon, authenticated;

update public.reviews set status = 'live' where status = 'held' and source is null;

comment on column public.reviews.status is
  'live; removed by its author (review_remove); hidden by the site owner, for abuse or on an owner''s removal request (private.review_removal_requests). held is no longer set (private.review_hold answers false). Only live rows are public.';

-- ── 2. One new report a day ────────────────────────────────

-- How many new reports the account may post today (India time) and how many it has.
-- allowed: 1, or the number of turfs it played a TapTurf game at today (dated today,
-- started by now, not cancelled; hosted, or joined: a participant row or an accepted
-- request). posted: the other turfs it posted a new report on today (a first one, or
-- one posted again), so posting again on this turf adds nothing. full: a new report
-- here would be refused.
create or replace function private.review_daily(p_user uuid, p_turf uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select (now() at time zone 'Asia/Kolkata')::date as day,
           (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata') as since
  ),
  played as (
    select count(distinct g.turf_id)::int as n
      from public.games g, d
     where g.date = d.day
       and coalesce(g.status, 'open') <> 'cancelled'
       and ((g.date + g.start_time) at time zone 'Asia/Kolkata') <= now()
       and (g.creator_id = p_user
            or exists (select 1 from public.game_participants p where p.game_id = g.id and p.user_id = p_user)
            or exists (select 1 from public.game_requests q where q.game_id = g.id and q.user_id = p_user and q.status = 'accepted'))
  ),
  posted as (
    select count(distinct x.turf_id)::int as n
      from (select s.turf_id from private.review_saves s, d
             where s.user_id = p_user and s.action in ('create', 'repost') and s.saved_at >= d.since
            union
            select r.turf_id from public.reviews r, d
             where r.user_id = p_user and r.source is null and r.created_at >= d.since) x
     where x.turf_id is distinct from p_turf
  )
  select jsonb_build_object(
           'allowed', greatest(1, played.n),
           'posted', posted.n,
           'played', played.n,
           'full', posted.n >= greatest(1, played.n))
    from played, posted;
$$;
revoke all on function private.review_daily(uuid, uuid) from public, anon, authenticated;

-- 20261027_game_reports.sql, with: the daily rule above for a new report (r: limit, why:
-- daily, allowed, played), and an edit of a held report goes live like any other (a hidden
-- one stays hidden). Answers {r: ok, created, review, note, after, price_saved}, or r:
-- unavailable, bad, gone, own_turf, limit, exists, contact_info (with field).
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

  -- Where the report came from and how long it took: kept only when well formed.
  v_channel := case when (p_report ->> 'channel') in ('turf_page', 'link', 'owner_link', 'game', 'ask', 'edit') then p_report ->> 'channel' end;
  if jsonb_typeof(p_report -> 'ms') = 'number' and (p_report ->> 'ms') ~ '^[0-9]{1,6}$' then
    v_ms := (p_report ->> 'ms')::int;
    if v_ms > 600000 then
      v_ms := null;
    end if;
  end if;

  if private.review_text_problem(v_comment) is not null then
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

-- 20261027_game_reports.sql, with one new key: daily (private.review_daily), for the
-- sheet to say before anything is typed that a new report here would be over the day's
-- limit. Null for a manager (they can't rate the turf anyway).
create or replace function public.review_mine(p_key text, p_user_id uuid, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.reviews;
  v_mine jsonb := null;
  v_blocked boolean;
  v_hint jsonb := null;
  v_price int;
  v_sports jsonb;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_turf_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select t.sports into v_sports from public.turfs t where t.id = p_turf_id and t.is_active = true;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  v_blocked := private.account_manages_turf(p_user_id, p_turf_id);

  select * into v_row from public.reviews r where r.user_id = p_user_id and r.turf_id = p_turf_id and r.source is null;
  if found then
    v_mine := private.review_mine_json(v_row);
  elsif not v_blocked then
    select jsonb_build_object(
             'kind', 'game',
             'at', (g.date + g.start_time) at time zone 'Asia/Kolkata',
             'sport', case when jsonb_typeof(v_sports) = 'array' and v_sports ? g.sport then g.sport end,
             'played_when', case when g.start_time < time '12:00' then 'morning'
                                 when g.start_time < time '16:00' then 'afternoon'
                                 when g.start_time < time '19:00' then 'evening'
                                 else 'night' end)
      into v_hint
      from public.games g
     where g.turf_id = p_turf_id
       and coalesce(g.status, 'open') <> 'cancelled'
       and g.date >= (now() at time zone 'Asia/Kolkata')::date - 31
       and ((g.date + g.start_time) at time zone 'Asia/Kolkata') between now() - interval '30 days' and now() - interval '2 hours'
       and (g.creator_id = p_user_id
            or exists (select 1 from public.game_participants p where p.game_id = g.id and p.user_id = p_user_id))
     order by g.date desc, g.start_time desc
     limit 1;
    if v_hint is null then
      select jsonb_build_object('kind', c.kind, 'at', c.created_at)
        into v_hint
        from public.turf_contact_clicks c
       where c.user_id = p_user_id and c.turf_id = p_turf_id and c.signed_in = true
         and c.kind in ('call', 'whatsapp')
         and c.created_at between now() - interval '14 days' and now() - interval '12 hours'
       order by c.created_at desc
       limit 1;
    end if;
  end if;

  select case when s.price_min = s.price_max then s.price_min end into v_price
    from public.turf_suggestions s where s.turf_id = p_turf_id and s.user_id = p_user_id;

  return jsonb_build_object(
    'r', 'ok',
    'mine', v_mine,
    'voted', coalesce((
      select jsonb_agg(v.review_id order by v.review_id)
        from public.review_votes v join public.reviews r on r.id = v.review_id
       where v.user_id = p_user_id and v.withdrawn_at is null and r.turf_id = p_turf_id), '[]'::jsonb),
    'blocked', case when v_blocked then 'own_turf' end,
    'hint', v_hint,
    'my_price', v_price,
    'daily', case when not v_blocked then private.review_daily(p_user_id, p_turf_id) end);
end;
$$;
revoke all on function public.review_mine(text, uuid, uuid) from public;
grant execute on function public.review_mine(text, uuid, uuid) to anon, authenticated;

-- ── 3. Removal requests ────────────────────────────────────

create table if not exists private.review_removal_requests (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  turf_id uuid not null,
  -- Who asked: the sign-in (myTapturf's caller key) and the account it opened then.
  asked_key text not null,
  asked_account uuid,
  reason text not null check (reason in ('not_played', 'abusive', 'personal', 'wrong_turf', 'other')),
  detail text check (detail is null or char_length(detail) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'removed', 'kept')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- One open request per report per owner (their account, else their sign-in).
create unique index if not exists review_removal_requests_one_open_uidx
  on private.review_removal_requests (review_id, (coalesce(asked_account::text, asked_key))) where status = 'open';
create index if not exists review_removal_requests_open_idx
  on private.review_removal_requests (created_at) where status = 'open';
create index if not exists review_removal_requests_owner_idx
  on private.review_removal_requests ((coalesce(asked_account::text, asked_key)), created_at desc);
create index if not exists review_removal_requests_turf_idx
  on private.review_removal_requests (turf_id, created_at desc);
revoke all on private.review_removal_requests from public, anon, authenticated;
comment on table private.review_removal_requests is
  'An owner asking TapTurf to take a player''s report on their turf off (owner_review_removal_ask). The site owner decides (admin_review_removal_decide): removed hides the report, kept leaves it. Never shown to the report''s author.';

-- An active claim on the turf for this sign-in, read the way public._can_manage reads
-- one (a claim for the account the key opens, or under the key itself from before
-- claims named the account), without its site-owner pass: TapTurf decides requests,
-- it doesn't make them.
create or replace function private.review_owner_claim(p_key text, p_turf uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null and p_turf is not null and exists (
    select 1 from public.turf_owners o
     where o.turf_id = p_turf and o.status = 'active'
       and ((o.user_key = p_key and o.user_id is null)
            or (o.user_id is not null and o.user_id = (select private.account_for_key(p_key)))));
$$;
revoke all on function private.review_owner_claim(text, uuid) from public, anon, authenticated;

-- An owner asks TapTurf to take a player's report on their turf off. p_reason:
-- not_played, abusive, personal, wrong_turf or other; p_detail: an optional line, up
-- to 300 characters. The report stays live meanwhile. Answers {ok, id, status: open},
-- with already: true when this owner's request on it is still open; or error:
-- forbidden (no active claim on that turf), bad, not_found (no TapTurf report with
-- that id), gone (it isn't live), limit (10 a day per owner).
create or replace function public.owner_review_removal_ask(p_token text, p_review_id uuid, p_reason text, p_detail text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_review public.reviews;
  v_account uuid;
  v_who text;
  v_detail text;
  v_id uuid;
begin
  if k is null then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_review_id is null or p_reason is null or p_reason not in ('not_played', 'abusive', 'personal', 'wrong_turf', 'other') then
    return jsonb_build_object('error', 'bad');
  end if;
  v_detail := private.review_clean_text(p_detail);
  if char_length(v_detail) > 300 then
    return jsonb_build_object('error', 'bad');
  end if;
  select * into v_review from public.reviews r where r.id = p_review_id and r.source is null;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if not private.review_owner_claim(k, v_review.turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_review.status <> 'live' then
    return jsonb_build_object('error', 'gone');
  end if;
  v_account := private.account_for_key(k);
  v_who := coalesce(v_account::text, k);
  -- One request at a time per owner, so the day's count sees every one before it.
  perform pg_advisory_xact_lock(hashtextextended('review_removal:' || v_who, 0));
  select q.id into v_id from private.review_removal_requests q
   where q.review_id = p_review_id and q.status = 'open' and coalesce(q.asked_account::text, q.asked_key) = v_who;
  if found then
    return jsonb_build_object('ok', true, 'id', v_id, 'status', 'open', 'already', true);
  end if;
  if (select count(*) from private.review_removal_requests q
       where coalesce(q.asked_account::text, q.asked_key) = v_who and q.created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('error', 'limit');
  end if;
  insert into private.review_removal_requests (review_id, turf_id, asked_key, asked_account, reason, detail)
  values (p_review_id, v_review.turf_id, k, v_account, p_reason, v_detail)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'open');
end;
$$;
revoke all on function public.owner_review_removal_ask(text, uuid, text, text) from public;
grant execute on function public.owner_review_removal_ask(text, uuid, text, text) to anon, authenticated;

-- This owner's requests on the turf's reports, the latest per report from the last 180
-- days: {requests: [{review_id, status, reason, created_at, decided_at}]}, or error:
-- forbidden. Never anyone else's.
create or replace function public.owner_review_removals(p_token text, p_turf_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public._caller_key(p_token);
  v_who text;
begin
  if not private.review_owner_claim(k, p_turf_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_who := coalesce(private.account_for_key(k)::text, k);
  return jsonb_build_object('requests', coalesce((
    select jsonb_agg(jsonb_build_object('review_id', x.review_id, 'status', x.status, 'reason', x.reason,
                                        'created_at', x.created_at, 'decided_at', x.decided_at)
                     order by x.created_at desc)
      from (select distinct on (q.review_id) q.review_id, q.status, q.reason, q.created_at, q.decided_at
              from private.review_removal_requests q
             where q.turf_id = p_turf_id and coalesce(q.asked_account::text, q.asked_key) = v_who
               and q.created_at > now() - interval '180 days'
             order by q.review_id, q.created_at desc) x), '[]'::jsonb));
end;
$$;
revoke all on function public.owner_review_removals(text, uuid) from public;
grant execute on function public.owner_review_removals(text, uuid) to anon, authenticated;

-- The site owner's queue: every open request, oldest first, then the 30 latest decided.
-- Each with the report as players see it (and its author's public name), the turf, who
-- asked (their account's name, else the name on their claim; never their number or
-- email) and why, and how many other owners asked about the same report.
-- {open, requests: [...]}, or error: forbidden.
create or replace function public.admin_review_removals(p_firebase_token text default null)
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
    'open', (select count(*) from private.review_removal_requests q where q.status = 'open'),
    'requests', coalesce((
      select jsonb_agg(x.j order by x.open desc, x.sort_at)
        from (
          select q.status = 'open' as open,
                 case when q.status = 'open' then extract(epoch from q.created_at) else -extract(epoch from coalesce(q.decided_at, q.created_at)) end as sort_at,
                 jsonb_build_object(
                   'id', q.id, 'status', q.status, 'reason', q.reason, 'detail', q.detail,
                   'created_at', q.created_at, 'decided_at', q.decided_at,
                   'asked_by', jsonb_build_object(
                     'name', coalesce(nullif(btrim(u.name), ''),
                                      (select nullif(btrim(o.name), '') from public.turf_owners o
                                        where o.turf_id = q.turf_id and o.user_key = q.asked_key
                                        order by o.created_at desc limit 1)),
                     'account', q.asked_account,
                     'kind', case left(q.asked_key, 2) when 'p:' then 'phone' when 'e:' then 'email' end),
                   'others', (select count(*) from private.review_removal_requests z
                               where z.review_id = q.review_id and z.status = 'open' and z.id <> q.id),
                   'turf', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'city', t.city),
                   'review', case when r.id is not null then jsonb_build_object(
                     'id', r.id, 'rating', r.rating, 'comment', left(r.comment, 2000), 'sport', r.sport,
                     'played_when', r.played_when, 'aspects', r.aspects, 'play_again', r.play_again,
                     'created_at', r.created_at, 'edited_at', r.edited_at, 'status', r.status, 'author', a.name) end) as j
            from (select * from private.review_removal_requests where status = 'open'
                  union all
                  (select * from private.review_removal_requests where status <> 'open'
                    order by decided_at desc nulls last limit 30)) q
            left join public.reviews r on r.id = q.review_id
            left join public.users a on a.id = r.user_id
            left join public.users u on u.id = q.asked_account
            left join public.turfs t on t.id = q.turf_id
        ) x), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_review_removals(text) from public;
grant execute on function public.admin_review_removals(text) to anon, authenticated;

-- The site owner's answer: remove (the report is hidden, as for abuse: off the page, out
-- of every count, and its author sees it as hidden, never who asked) or keep. Either
-- closes every open request on that report. {ok, status: removed | kept, turf_id,
-- review_id, closed}, with already: true when it was decided before; or error:
-- forbidden, bad, not_found.
create or replace function public.admin_review_removal_decide(p_firebase_token text, p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review uuid;
  v_req private.review_removal_requests;
  v_status text;
  v_n integer;
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_id is null or p_decision is null or p_decision not in ('remove', 'keep') then
    return jsonb_build_object('error', 'bad');
  end if;
  select q.review_id into v_review from private.review_removal_requests q where q.id = p_id;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- One decision at a time per report: it closes every open request on it.
  perform pg_advisory_xact_lock(hashtextextended('review_removal_decide:' || v_review::text, 0));
  select * into v_req from private.review_removal_requests q where q.id = p_id for update;
  if v_req.status <> 'open' then
    return jsonb_build_object('ok', true, 'status', v_req.status, 'turf_id', v_req.turf_id, 'review_id', v_req.review_id, 'closed', 0, 'already', true);
  end if;
  v_status := case when p_decision = 'remove' then 'removed' else 'kept' end;
  if p_decision = 'remove' then
    -- The page refreshes within a minute, not at the next sweep.
    perform set_config('tapturf.cache_urgent', 'on', true);
    update public.reviews r set status = 'hidden'
     where r.id = v_req.review_id and r.source is null and r.status <> 'hidden';
  end if;
  update private.review_removal_requests q
     set status = v_status, decided_at = now()
   where q.review_id = v_req.review_id and q.status = 'open';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'status', v_status, 'turf_id', v_req.turf_id, 'review_id', v_req.review_id, 'closed', v_n);
end;
$$;
revoke all on function public.admin_review_removal_decide(text, uuid, text) from public;
grant execute on function public.admin_review_removal_decide(text, uuid, text) to anon, authenticated;
