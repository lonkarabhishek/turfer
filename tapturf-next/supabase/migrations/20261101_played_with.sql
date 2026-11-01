-- Played with, and "Let players I've played with see my WhatsApp".
--
-- The Me tab lists the people who were in the same played games as you
-- (lib/profile/playedWith.ts, from rows the public can already read:
-- games, game_participants, users' name and photo). This file adds only
-- what the public must not read:
--   * their username, for a profile that is public (usernames.taggable),
--     so the list can link to /u/<username>;
--   * their WhatsApp number, only when THEY turned sharing on
--     (private.whatsapp_shares, off until they do), their number was
--     proved with a one-time code (private.phone_proven), and the person
--     asking really played a game with them.
-- And, for the public profile page's numbers and medals, which account a
-- public username belongs to, for the server only (public.profile_owner).
--
-- Played means the game happened: not cancelled, and its end has passed
-- (its date and end time, India time; past midnight when it ends at or
-- before its start; an hour after the start when it has no end). A
-- person was in it as a participant or as its host. lib/profile/history.ts
-- is the same rule.
--
-- Every function checks the server key (private.account_key_ok, env
-- ACCOUNT_KEY): the Next server calls them for the account it verified
-- (a Firebase ID token or a Google session, lib/profile/deps.ts), never
-- the browser. EXECUTE goes to anon only, the role the server's key-gated
-- calls use; the table and the helpers are closed.
--
-- Needs 20261021_accounts_usernames.sql and 20261027_verified_tick.sql
-- (private.phone_proven). Additive: nothing is removed or changed, no
-- existing function is replaced. Safe to run again. The app works before
-- it: the list shows names and photos without usernames or numbers, the
-- switch says it is not available yet, and the public profile shows no
-- numbers.

set local lock_timeout = '5s';

-- Who shares their WhatsApp number with the people they played with. No row: off.
create table if not exists private.whatsapp_shares (
  user_id uuid primary key references public.users(id),
  share boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on private.whatsapp_shares from public, anon, authenticated;

-- When a game is over (lib/profile/history.ts gameEndsAt).
create or replace function private.game_over_at(p_date date, p_start time, p_end time)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_date + coalesce(p_start, time '00:00'))
          + case
              when p_end is null then interval '1 hour'
              when p_end <= coalesce(p_start, time '00:00') then (p_end - coalesce(p_start, time '00:00')) + interval '1 day'
              else p_end - coalesce(p_start, time '00:00')
            end) at time zone 'Asia/Kolkata';
$$;
revoke all on function private.game_over_at(date, time, time) from public, anon, authenticated;

-- The games a person played: in them or hosting them, not cancelled, over.
create or replace function private.played_game_ids(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id
    from public.games g
   where (g.creator_id = p_user_id
          or exists (select 1 from public.game_participants p where p.game_id = g.id and p.user_id = p_user_id))
     and g.status is distinct from 'cancelled'
     and private.game_over_at(g.date, g.start_time, g.end_time) <= now();
$$;
revoke all on function private.played_game_ids(uuid) from public, anon, authenticated;

-- The account's number as the switch sees it: ok (proved with a one-time code), unproven, or none.
create or replace function private.whatsapp_phone_state(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when u.phone is null or u.phone !~ '^\+91[0-9]{10}$' then 'none'
           when private.phone_proven(u.id) then 'ok'
           else 'unproven'
         end
    from public.users u
   where u.id = p_user_id;
$$;
revoke all on function private.whatsapp_phone_state(uuid) from public, anon, authenticated;

-- The switch: read it (p_on null), or turn it on or off. On only for a
-- proved number (r 'phone' otherwise, nothing changed). Off always works.
create or replace function public.account_whatsapp(p_key text, p_user_id uuid, p_on boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  v_phone := private.whatsapp_phone_state(p_user_id);
  if v_phone is null then
    return jsonb_build_object('r', 'bad');
  end if;
  if p_on and v_phone <> 'ok' then
    return jsonb_build_object('r', 'phone', 'phone', v_phone,
                              'on', coalesce((select s.share from private.whatsapp_shares s where s.user_id = p_user_id), false));
  end if;
  if p_on is not null then
    insert into private.whatsapp_shares (user_id, share, updated_at)
    values (p_user_id, p_on, now())
    on conflict (user_id) do update set share = excluded.share, updated_at = excluded.updated_at;
  end if;
  return jsonb_build_object('r', 'ok', 'phone', v_phone,
                            'on', coalesce((select s.share from private.whatsapp_shares s where s.user_id = p_user_id), false));
end;
$$;
revoke all on function public.account_whatsapp(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.account_whatsapp(text, uuid, boolean) to anon;

-- The people in the games this account played, other than itself: each
-- one's public username (only when their profile is public) and their
-- WhatsApp number (only when they share it and it is proved). Ids go to
-- the server, which sends the browser names, photos and these only.
create or replace function public.played_with_extras(p_key text, p_user_id uuid)
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
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok', 'players', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.user_id,
             'u', n.username,
             'wa', case when s.share and u.phone ~ '^\+91[0-9]{10}$' and private.phone_proven(u.id) then u.phone end)
           order by o.user_id)
      from (select distinct x.user_id
              from (select p.user_id
                      from public.game_participants p
                     where p.game_id in (select private.played_game_ids(p_user_id))
                    union
                    select g.creator_id
                      from public.games g
                     where g.id in (select private.played_game_ids(p_user_id))) x
             where x.user_id is not null and x.user_id <> p_user_id) o
      join public.users u on u.id = o.user_id
      left join public.usernames n on n.user_id = o.user_id and n.taggable
      left join private.whatsapp_shares s on s.user_id = o.user_id
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.played_with_extras(text, uuid) from public, anon, authenticated;
grant execute on function public.played_with_extras(text, uuid) to anon;

-- The account a public profile's username belongs to, for the server's
-- numbers and medals on that page; never sent to a browser. Only a
-- current username whose profile is public (profile_get shows it).
create or replace function public.profile_owner(p_key text, p_username text)
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
  return jsonb_build_object('r', 'ok', 'id', (
    select n.user_id from public.usernames n
     where n.username = lower(coalesce(p_username, '')) and n.taggable));
end;
$$;
revoke all on function public.profile_owner(text, text) from public, anon, authenticated;
grant execute on function public.profile_owner(text, text) to anon;
