// The database games_lockdown.check.mjs runs 20261030_games_lockdown.sql (and its
// step 2 and revert) against, in PGlite: stand-ins for Supabase's roles, auth
// schema, the server key and the site owner check, then public.users,
// public.turfs (the columns the functions read) and the four game tables as on
// production (columns, defaults, constraints, indexes, policies with their exact
// names and quals, grants and triggers, read 2026-10-30), the cache trigger with
// a recording mark_dirty, and close_past_games as live. Also used by the local
// end-to-end stand-in, so both run the same SQL. Made-up people only.

export const KEY = "server-key-0123456789";

export const SETUP = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema private; create schema auth; create schema extensions;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create table private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets values ('account', '${KEY}');
create function private.account_key_ok(p_key text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p_key is not null and p_key = (select s.value from private.app_secrets s where s.name = 'account') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated;
create function public._is_site_owner(p_firebase_token text default null) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.owner', true), '') = 'yes' $$;

create table public.users (id uuid primary key default gen_random_uuid(), email varchar unique, name varchar not null, phone varchar,
  role varchar default 'user', profile_image_url text, created_at timestamptz default now());
create table public.turfs (id uuid primary key default gen_random_uuid(), name varchar not null, slug text, city text, area text, address text,
  is_active boolean default true, sports jsonb default '[]', lat double precision, lng double precision, created_at timestamptz default now());
grant select on public.users, public.turfs to anon, authenticated;

-- The cache queue (20261020_cache_queue.sql): turf_key and the trigger as live (with the 'games' key); mark_dirty records.
create table private.test_dirty (key text, urgent boolean, at timestamptz default clock_timestamp());
create function private.mark_dirty(p_keys text[], p_urgent boolean default false) returns void language sql security definer set search_path = '' as
  $$ insert into private.test_dirty (key, urgent) select distinct k, coalesce(p_urgent, false) from unnest(p_keys) k where k is not null $$;
create function private.turf_key(p_turf_id uuid) returns text language sql stable security definer set search_path = '' as
  $$ select 'turf:' || lower(coalesce(t.slug, t.id::text)) from public.turfs t where t.id = p_turf_id $$;
create function private.mark_turf_child_dirty() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ignore constant text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  v_keys text[] := '{}';
begin
  if TG_OP = 'UPDATE' and (to_jsonb(NEW) - v_ignore) = (to_jsonb(OLD) - v_ignore) then
    return null;
  end if;
  if TG_OP <> 'DELETE' then
    v_keys := v_keys || private.turf_key(NEW.turf_id);
  end if;
  if TG_OP <> 'INSERT' then
    v_keys := v_keys || private.turf_key(OLD.turf_id);
  end if;
  if TG_TABLE_NAME = 'games' then
    v_keys := v_keys || 'games'::text;
  end if;
  perform private.mark_dirty(v_keys, current_setting('tapturf.cache_urgent', true) = 'on');
  return null;
end;
$$;

-- public.games as on production.
create table public.games (
  id uuid not null default gen_random_uuid() primary key,
  creator_id uuid references public.users (id) on delete cascade,
  turf_id uuid not null references public.turfs (id) on delete cascade,
  title text not null, description text, sport text not null, skill_level text default 'beginner',
  max_players integer not null, current_players integer default 1, date date not null,
  start_time time not null, end_time time not null, price_per_player numeric not null,
  status text default 'open' constraint games_status_check check (status = any (array['open', 'full', 'completed', 'cancelled'])),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  host_name text, host_phone text, host_profile_image_url text, turf_booked boolean default false);
create index games_turf_date_idx on public.games (turf_id, date);
create index idx_games_creator_id on public.games (creator_id);
create trigger games_mark_cache_dirty after insert or update or delete on public.games for each row execute function private.mark_turf_child_dirty('updated_at');

create table public.game_participants (
  id uuid not null default gen_random_uuid() primary key,
  game_id uuid references public.games (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  joined_at timestamptz default now(),
  constraint game_participants_game_id_user_id_key unique (game_id, user_id));

create table public.game_requests (
  id uuid not null default gen_random_uuid() primary key,
  game_id uuid references public.games (id),
  user_id uuid references public.users (id) on delete cascade,
  note text, status text default 'pending', created_at timestamptz default now(), responded_at timestamptz,
  requester_name varchar, requester_phone varchar, requester_avatar text, updated_at timestamptz default now());
create index idx_game_requests_game_id on public.game_requests (game_id);
create index idx_game_requests_status on public.game_requests (status);
create index idx_game_requests_user_id on public.game_requests (user_id);
create function public.update_game_requests_updated_at() returns trigger language plpgsql as $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
create trigger update_game_requests_updated_at before update on public.game_requests for each row execute function public.update_game_requests_updated_at();

create table public.notifications (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid references public.users (id) on delete cascade,
  type text not null, title text not null, message text not null, metadata jsonb default '{}'::jsonb,
  is_read boolean default false, created_at timestamptz default now());
create index idx_notifications_is_read on public.notifications (is_read);
create index idx_notifications_user_id on public.notifications (user_id);
create index notifications_user_unread_idx on public.notifications (user_id) where (is_read = false);

alter table public.games enable row level security;
alter table public.game_participants enable row level security;
alter table public.game_requests enable row level security;
alter table public.notifications enable row level security;

create policy "Allow all operations on games" on public.games for all using (true);
create policy "Anyone can create games" on public.games for insert with check (true);
create policy "Anyone can read games" on public.games for select using (true);
create policy "Anyone can update games" on public.games for update using (true);

create policy "Anyone can insert participants" on public.game_participants for insert with check (true);
create policy "Anyone can manage participants" on public.game_participants for all using (true) with check (true);
create policy "Anyone can view participants" on public.game_participants for select using (true);
create policy "System can insert participants" on public.game_participants for insert with check (true);
create policy "Users can view participants" on public.game_participants for select using (true);

create policy "Anyone can create requests" on public.game_requests for insert with check (true);
create policy "Anyone can update game requests" on public.game_requests for update using (true) with check (true);
create policy "Anyone can view own requests" on public.game_requests for select using (true);
create policy "Enable insert for authenticated users" on public.game_requests for insert with check ((auth.role() = 'authenticated'::text) and (auth.uid() = user_id));
create policy "Enable read for requesters and game owners" on public.game_requests for select
  using ((auth.uid() = user_id) or (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id))));
create policy "Enable update for game owners" on public.game_requests for update
  using (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id)));
create policy "Game hosts can update requests for their\n  games" on public.game_requests for update
  using (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id)));
create policy "Game hosts can view requests for their\n  games" on public.game_requests for select
  using (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id)));
create policy "Hosts can update request status" on public.game_requests for update
  using (game_id in (select games.id from public.games where (games.creator_id = auth.uid())));
create policy "Hosts can update requests" on public.game_requests for update
  using (exists (select 1 from public.games where ((games.id = game_requests.game_id) and (games.creator_id = auth.uid()))));
create policy "Hosts can view requests" on public.game_requests for select
  using (exists (select 1 from public.games where ((games.id = game_requests.game_id) and (games.creator_id = auth.uid()))));
create policy "Users and hosts can delete game requests" on public.game_requests for delete
  using ((auth.uid() = user_id) or (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id))));
create policy "Users can create requests" on public.game_requests for insert with check (user_id = auth.uid());
create policy "Users can view game requests they made" on public.game_requests for select using (auth.uid() = user_id);
create policy "Users can view own requests" on public.game_requests for select using (user_id = auth.uid());
create policy "Users can view requests for their games" on public.game_requests for select
  using (game_id in (select games.id from public.games where (games.creator_id = auth.uid())));

create policy "Allow all operations for authenticated\n  users" on public.notifications for all to authenticated using (true) with check (true);
create policy "Allow authenticated users to create\n  notifications" on public.notifications for insert with check (((select auth.role() as role) = 'authenticated'::text));
create policy "Anyone can create notifications" on public.notifications for insert with check (true);
create policy "Anyone can read notifications" on public.notifications for select using (true);
create policy "Anyone can update notifications" on public.notifications for update using (true);
create policy "Enable insert for all authenticated users" on public.notifications for insert with check (((select auth.role() as role) = 'authenticated'::text));
create policy "Enable read access for own notifications" on public.notifications for select using (((select auth.uid() as uid) = user_id));
create policy "Enable update for own notifications" on public.notifications for update using (((select auth.uid() as uid) = user_id));
create policy "System can create notifications" on public.notifications for insert with check (true);
create policy "Users can delete own notifications" on public.notifications for delete using ((user_id = (select auth.uid() as uid)));
create policy "Users can insert notifications for others" on public.notifications for insert with check (true);
create policy "Users can update own notifications" on public.notifications for update using ((user_id = (select auth.uid() as uid)));
create policy "Users can update their notifications" on public.notifications for update using ((user_id = (select auth.uid() as uid)));
create policy "Users can view own notifications" on public.notifications for select using ((user_id = (select auth.uid() as uid)));
create policy "Users can view their notifications" on public.notifications for select using ((user_id = (select auth.uid() as uid)));

grant all on public.games, public.game_participants, public.game_requests, public.notifications to anon, authenticated, service_role;

-- 20261019_close_past_games.sql as live (pg_proc.prosrc, 30 Oct).
create function public.close_past_games() returns integer language sql security definer set search_path = '' as $$
  with done as (
    update public.games g
       set status = 'completed', updated_at = now()
     where g.status in ('open', 'full')
       and g.date is not null
       and (case
              when g.end_time is not null and g.start_time is not null and g.end_time > g.start_time then g.date + g.end_time
              when g.start_time is not null then g.date + g.start_time + interval '2 hours'
              else g.date + time '23:59'
            end) < (now() at time zone 'Asia/Kolkata') - interval '30 minutes'
    returning 1
  )
  select count(*)::integer from done;
$$;
revoke all on function public.close_past_games() from public, anon, authenticated;
`;

/** A database as production was before the lockdown files. */
export async function makeDb(PGlite) {
  const db = new PGlite();
  await db.exec(SETUP);
  return db;
}
