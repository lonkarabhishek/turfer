-- "Ask TapTurf" query log and per-IP budget.
--
-- ask_begin() records the question and returns the row id, or NULL
-- when the same (hashed) IP has asked more than 40 times in the last
-- 10 minutes, so a script can't burn API credit. ask_finish() stores
-- what Claude made of it and how many turfs matched, for the admin
-- view of what people search for.
--
-- Closed table: RLS on, no policies, no grants. Only the two RPCs touch it.

create table if not exists public.ask_queries (
  id          bigint generated always as identity primary key,
  ip_hash     text not null check (char_length(ip_hash) <= 64),
  query       text not null check (char_length(query) <= 200),
  filters     jsonb,
  results     integer,
  ms          integer,
  source      text check (source in ('claude', 'keywords')),
  created_at  timestamptz not null default now()
);
create index if not exists ask_queries_ip_idx on public.ask_queries (ip_hash, created_at desc);
create index if not exists ask_queries_created_idx on public.ask_queries (created_at desc);
alter table public.ask_queries enable row level security;
revoke all on public.ask_queries from anon, authenticated;

create or replace function public.ask_begin(p_ip_hash text, p_query text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_ip_hash is null or p_query is null or char_length(p_query) < 2 then
    return null;
  end if;
  if (select count(*) from public.ask_queries
      where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= 40 then
    return null;
  end if;
  insert into public.ask_queries (ip_hash, query)
  values (left(p_ip_hash, 64), left(p_query, 200))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ask_begin(text, text) from public;
grant execute on function public.ask_begin(text, text) to anon, authenticated;

create or replace function public.ask_finish(p_id bigint, p_filters jsonb, p_results integer, p_ms integer, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ask_queries
  set filters = p_filters,
      results = p_results,
      ms = p_ms,
      source = case when p_source in ('claude', 'keywords') then p_source else null end
  where id = p_id and filters is null and created_at > now() - interval '2 minutes';
end;
$$;
revoke all on function public.ask_finish(bigint, jsonb, integer, integer, text) from public;
grant execute on function public.ask_finish(bigint, jsonb, integer, integer, text) to anon, authenticated;

-- Admin: what people asked, newest first.
create or replace function public.get_ask_queries(p_limit integer default 200, p_firebase_token text default null)
returns table (id bigint, query text, filters jsonb, results integer, ms integer, source text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select q.id, q.query, q.filters, q.results, q.ms, q.source, q.created_at
  from public.ask_queries q
  order by q.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.get_ask_queries(integer, text) from public;
grant execute on function public.get_ask_queries(integer, text) to anon, authenticated;
