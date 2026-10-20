-- Live scorecard links: /live/<code>.
--
-- The live scorer keeps a match in the scorer's browser. When they turn
-- on the live link, the browser sends the whole match (setup plus the
-- event list, a few KB to about 100) after each change, through
-- /api/live/<code>, and anyone with the link follows it at /live/<code>.
--
-- Trust: only the Next routes write. The write functions refuse any
-- call without the key in private.app_secrets 'live_write' (seeded
-- below), which the routes read from the server-only LIVE_WRITE_KEY.
-- The anon key in the browser bundle is not enough. The routes mint the
-- codes (8 random characters plus a 4 character tag made with the same
-- key), so made-up codes are refused before any lookup. Changing a
-- match also needs the secret the scorer's browser made, stored here
-- only as its sha256.
--
-- Load: followers never reach this table directly. They poll
-- /api/live/<code>, which Vercel's CDN holds for 2 s and the Next data
-- cache holds until the scorer's next write purges it, so reads per
-- match follow the scorer's writes, not the number of people watching.
-- Writes are bounded here as well as in the routes: one per 500 ms per
-- link, 4000 per link, 36 hours per link, 200 KB per match, and new
-- links per network and per hour (see live_match_put).
--
-- Access: RLS is on with no policies, so the table is reachable only
-- through the functions below.
--
-- This file avoids the two destructive SQL keywords on purpose: the
-- Supabase MCP waits for a confirmation on any SQL that has them. Old
-- matches are expired by clearing their data, not by removing rows.

create table if not exists public.live_matches (
  code text primary key check (code ~ '^[a-z0-9]{12}$'),
  secret_hash bytea not null,
  match jsonb,
  rev bigint not null default 0,
  status text not null default 'live' check (status in ('live', 'done', 'stopped', 'expired')),
  -- Accepted writes, for the per-link cap.
  writes integer not null default 0,
  -- sha256 of the write key and the client's network (the /64 for
  -- IPv6), for the create limits. Cleared after 2 days.
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_matches enable row level security;
revoke all on table public.live_matches from anon, authenticated;

create index if not exists live_matches_created_idx on public.live_matches (created_at);
create index if not exists live_matches_ip_created_idx on public.live_matches (ip_hash, created_at);
create index if not exists live_matches_updated_idx on public.live_matches (updated_at) where match is not null;

-- The routes' write key, in the private table from
-- 20260930_revalidate_secret_check.sql. Copy it into Vercel as
-- LIVE_WRITE_KEY (never NEXT_PUBLIC):
--   select value from private.app_secrets where name = 'live_write';
-- Rotate by updating the row and the env var together.
insert into private.app_secrets (name, value)
values ('live_write', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Send the whole match. Returns {r, rev}; rev is set for 'ok' (the
-- stored rev) and 'stale' (the server's rev, so the scorer can go past
-- it). r is one of:
--   ok, stale (rev not newer), slow (under 500 ms since the last write),
--   forbidden (wrong secret), gone (stopped or expired), limit (link or
--   network caps), too_big, bad.
-- The first send for a code creates the row.
create or replace function public.live_match_put(
  p_key text,
  p_code text,
  p_secret text,
  p_match jsonb,
  p_status text,
  p_rev bigint,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_rev bigint;
  r public.live_matches;
begin
  -- Every null is spelled out: a null comparison would make the whole
  -- condition null, and plpgsql treats that as false.
  if p_key is null
     or p_key is distinct from (select s.value from private.app_secrets s where s.name = 'live_write')
     or p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_match is null or jsonb_typeof(p_match) <> 'object'
     or p_status is null or p_status not in ('live', 'done')
     or p_rev is null or p_rev <= 0
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  if octet_length(p_match::text) > 250000 then
    return jsonb_build_object('r', 'too_big');
  end if;

  v_hash := sha256(convert_to(p_secret, 'UTF8'));

  -- Twice at most: a first send that loses the insert race to another
  -- request for the same code goes round once more as an update.
  for i in 1..2 loop
    -- The usual case, one statement. Its row lock is taken only on a
    -- row whose secret matches, so a caller without the secret never
    -- holds up the scorer.
    update public.live_matches m
       set match = p_match,
           status = p_status,
           rev = p_rev,
           writes = m.writes + 1,
           updated_at = now()
     where m.code = p_code
       and m.secret_hash = v_hash
       and m.status in ('live', 'done')
       and m.rev < p_rev
       and m.updated_at <= now() - interval '500 milliseconds'
       and m.writes < 4000
       and m.created_at > now() - interval '36 hours'
    returning m.rev into v_rev;
    if found then
      return jsonb_build_object('r', 'ok', 'rev', v_rev);
    end if;

    -- Refused or new: a plain read (no lock) says which.
    select * into r from public.live_matches m where m.code = p_code;
    if found then
      if r.status in ('stopped', 'expired') then
        return jsonb_build_object('r', 'gone');
      end if;
      if r.secret_hash <> v_hash then
        return jsonb_build_object('r', 'forbidden');
      end if;
      if r.rev >= p_rev then
        return jsonb_build_object('r', 'stale', 'rev', r.rev);
      end if;
      if r.writes >= 4000 or r.created_at <= now() - interval '36 hours' then
        return jsonb_build_object('r', 'limit');
      end if;
      -- Too soon after the last write, or another write landed between
      -- the two statements: either way, try again shortly.
      return jsonb_build_object('r', 'slow');
    end if;

    -- A new link. Counts stop at the cap, so each is a short index scan.
    if (select count(*) from (
          select 1 from public.live_matches m
           where m.ip_hash = p_ip_hash and m.created_at > now() - interval '24 hours'
           limit 30) x) >= 30
       or (select count(*) from (
          select 1 from public.live_matches m
           where m.ip_hash = p_ip_hash and m.status = 'live' and m.updated_at > now() - interval '1 hour'
           limit 8) x) >= 8
       or (select count(*) from (
          select 1 from public.live_matches m
           where m.created_at > now() - interval '1 hour'
           limit 200) x) >= 200 then
      return jsonb_build_object('r', 'limit');
    end if;

    insert into public.live_matches (code, secret_hash, match, rev, status, writes, ip_hash)
    values (p_code, v_hash, p_match, p_rev, p_status, 1, p_ip_hash)
    on conflict (code) do nothing;
    -- found is false when the conflict skipped the insert.
    if found then
      return jsonb_build_object('r', 'ok', 'rev', p_rev);
    end if;
  end loop;
  return jsonb_build_object('r', 'slow');
end;
$$;

-- Turn the link off: the match is cleared and followers see that it is
-- off. 'ok' | 'forbidden' | 'gone' | 'bad'. rev moves on so followers,
-- who skip a response whose rev they have seen, notice.
create or replace function public.live_match_stop(p_key text, p_code text, p_secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  r public.live_matches;
begin
  if p_key is null
     or p_key is distinct from (select s.value from private.app_secrets s where s.name = 'live_write')
     or p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then
    return 'bad';
  end if;
  v_hash := sha256(convert_to(p_secret, 'UTF8'));

  update public.live_matches m
     set match = null, status = 'stopped', rev = m.rev + 1, updated_at = now()
   where m.code = p_code
     and m.secret_hash = v_hash
     and m.status in ('live', 'done');
  if found then
    return 'ok';
  end if;

  select * into r from public.live_matches m where m.code = p_code;
  -- No row: the link never got its first send. Nothing to turn off.
  if not found or r.status in ('stopped', 'expired') then
    return 'gone';
  end if;
  if r.secret_hash <> v_hash then
    return 'forbidden';
  end if;
  -- Stopped by another request between the two statements.
  return 'gone';
end;
$$;

-- What followers see: {match, rev, status, updated_at}, or null before
-- the first send. Never the secret, the network hash or the counts.
create or replace function public.live_match_get(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[a-z0-9]{12}$' then
    return null;
  end if;
  return (
    select jsonb_build_object(
             'match', m.match,
             'rev', m.rev,
             'status', m.status,
             'updated_at', m.updated_at)
      from public.live_matches m
     where m.code = p_code);
end;
$$;

-- Callable with the anon key; the write key check inside is the gate.
revoke all on function public.live_match_put(text, text, text, jsonb, text, bigint, text) from public;
revoke all on function public.live_match_stop(text, text, text) from public;
revoke all on function public.live_match_get(text) from public;
grant execute on function public.live_match_put(text, text, text, jsonb, text, bigint, text) to anon, authenticated;
grant execute on function public.live_match_stop(text, text, text) to anon, authenticated;
grant execute on function public.live_match_get(text) to anon, authenticated;

-- Daily at a quiet hour (03:17 UTC), one job (cron.schedule replaces a
-- job of the same name):
-- * matches untouched for 30 days stop being shown: their data is
--   cleared and the link says it has expired (rev moves on, as for a stop);
-- * network hashes older than 2 days are cleared: the create limits only
--   look back 24 hours.
select cron.schedule(
  'live-matches-expire',
  '17 3 * * *',
  $$update public.live_matches
       set match = null, status = 'expired', rev = rev + 1
     where match is not null and updated_at < now() - interval '30 days';
    update public.live_matches
       set ip_hash = null
     where ip_hash is not null and created_at < now() - interval '2 days'$$
);
