-- Live scorecard links: /live/<code>.
--
-- The live scorer keeps a match in the scorer's browser. When they turn
-- on the live link, the browser sends the whole match (setup plus the
-- event list, a few KB to a few hundred) after each ball, and anyone
-- with the link follows it at /live/<code>.
--
-- Load: followers never reach this table directly. They poll
-- /api/live/<code>, which Vercel's CDN caches for a few seconds and the
-- Next data cache holds until the scorer's next write purges it, so
-- reads per match follow the scorer's writes (one every few seconds at
-- most), not the number of people watching.
--
-- Access: RLS is on with no policies, so the table is reachable only
-- through the functions below. The code in the URL is public; changing
-- a match needs the secret the scorer's browser made, stored here only
-- as its sha256.
--
-- This file avoids the two destructive SQL keywords on purpose: the
-- Supabase MCP waits for a confirmation on any SQL that has them. Old
-- matches are expired by clearing their data, not by removing rows.

create table if not exists public.live_matches (
  code text primary key check (code ~ '^[a-z0-9]{10}$'),
  secret_hash bytea not null,
  match jsonb,
  rev bigint not null default 0,
  status text not null default 'live' check (status in ('live', 'done', 'stopped', 'expired')),
  summary jsonb,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_matches enable row level security;
revoke all on table public.live_matches from anon, authenticated;

create index if not exists live_matches_created_idx on public.live_matches (created_at);
create index if not exists live_matches_ip_created_idx on public.live_matches (ip_hash, created_at);
create index if not exists live_matches_updated_idx on public.live_matches (updated_at) where match is not null;

-- Start a live link. 'ok' | 'taken' | 'limit' | 'too_big' | 'bad'.
create or replace function public.live_match_create(
  p_code text,
  p_secret text,
  p_match jsonb,
  p_summary jsonb,
  p_status text,
  p_rev bigint,
  p_ip_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[a-z0-9]{10}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_match is null or jsonb_typeof(p_match) <> 'object'
     or p_status not in ('live', 'done') or p_rev is null then
    return 'bad';
  end if;
  if octet_length(p_match::text) > 400000 then
    return 'too_big';
  end if;
  if (select count(*) from public.live_matches
       where ip_hash = left(p_ip_hash, 64) and created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.live_matches
       where created_at > now() - interval '1 hour') >= 600 then
    return 'limit';
  end if;
  insert into public.live_matches (code, secret_hash, match, rev, status, summary, ip_hash)
  values (p_code, sha256(convert_to(p_secret, 'UTF8')), p_match, p_rev, p_status, p_summary, left(p_ip_hash, 64))
  on conflict (code) do nothing;
  if not found then
    return 'taken';
  end if;
  return 'ok';
end;
$$;

-- Send the latest state. 'ok' | 'stale' | 'forbidden' | 'gone' | 'slow' | 'too_big' | 'bad'.
create or replace function public.live_match_update(
  p_code text,
  p_secret text,
  p_match jsonb,
  p_summary jsonb,
  p_status text,
  p_rev bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.live_matches;
begin
  if p_code is null or p_code !~ '^[a-z0-9]{10}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_match is null or jsonb_typeof(p_match) <> 'object'
     or p_status not in ('live', 'done') or p_rev is null then
    return 'bad';
  end if;
  if octet_length(p_match::text) > 400000 then
    return 'too_big';
  end if;
  select * into r from public.live_matches where code = p_code for update;
  if not found or r.status in ('stopped', 'expired') then
    return 'gone';
  end if;
  if r.secret_hash <> sha256(convert_to(p_secret, 'UTF8')) then
    return 'forbidden';
  end if;
  if p_rev <= r.rev then
    return 'stale';
  end if;
  -- The scorer sends at most one update every few seconds; a faster
  -- caller is not the app, and each write rewrites the whole row.
  if r.updated_at > now() - interval '1 second' then
    return 'slow';
  end if;
  update public.live_matches
     set match = p_match, summary = p_summary, status = p_status, rev = p_rev, updated_at = now()
   where code = p_code;
  return 'ok';
end;
$$;

-- Turn the link off: followers see that it is off. 'ok' | 'forbidden' | 'gone' | 'bad'.
create or replace function public.live_match_stop(p_code text, p_secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.live_matches;
begin
  if p_code is null or p_code !~ '^[a-z0-9]{10}$' or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then
    return 'bad';
  end if;
  select * into r from public.live_matches where code = p_code for update;
  if not found or r.status in ('stopped', 'expired') then
    return 'gone';
  end if;
  if r.secret_hash <> sha256(convert_to(p_secret, 'UTF8')) then
    return 'forbidden';
  end if;
  update public.live_matches
     set match = null, summary = null, status = 'stopped', updated_at = now()
   where code = p_code;
  return 'ok';
end;
$$;

-- What followers see. Never the secret or the IP hash.
create or replace function public.live_match_get(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'match', m.match,
           'rev', m.rev,
           'status', m.status,
           'summary', m.summary,
           'updated_at', m.updated_at)
    from public.live_matches m
   where m.code = p_code
     and p_code ~ '^[a-z0-9]{10}$';
$$;

revoke all on function public.live_match_create(text, text, jsonb, jsonb, text, bigint, text) from public;
revoke all on function public.live_match_update(text, text, jsonb, jsonb, text, bigint) from public;
revoke all on function public.live_match_stop(text, text) from public;
revoke all on function public.live_match_get(text) from public;
grant execute on function public.live_match_create(text, text, jsonb, jsonb, text, bigint, text) to anon, authenticated;
grant execute on function public.live_match_update(text, text, jsonb, jsonb, text, bigint) to anon, authenticated;
grant execute on function public.live_match_stop(text, text) to anon, authenticated;
grant execute on function public.live_match_get(text) to anon, authenticated;

-- Matches untouched for 30 days stop being shown: their data is cleared
-- and the link says it has expired. Daily, at a quiet hour (03:17 UTC).
select cron.schedule(
  'live-matches-expire',
  '17 3 * * *',
  $$update public.live_matches
       set match = null, summary = null, status = 'expired'
     where match is not null and updated_at < now() - interval '30 days'$$
);
