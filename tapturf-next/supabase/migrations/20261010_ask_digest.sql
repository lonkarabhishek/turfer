-- Weekly "where we fell short" digest of Ask TapTurf chats, made by
-- Haiku on demand from /admin and cached here so repeat views are free.
-- Owner-only through the security-definer functions; no policies.

create table if not exists public.ask_digests (
  id bigserial primary key,
  days integer not null,
  rows_seen integer not null,
  digest jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ask_digests enable row level security;

create or replace function public.get_ask_digest(p_days integer, p_firebase_token text default null)
returns table (id bigint, days integer, rows_seen integer, digest jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select d.id, d.days, d.rows_seen, d.digest, d.created_at
  from public.ask_digests d where d.days = p_days
  order by d.created_at desc limit 1;
end $$;
revoke all on function public.get_ask_digest(integer, text) from public;
grant execute on function public.get_ask_digest(integer, text) to anon, authenticated;

create or replace function public.save_ask_digest(p_days integer, p_rows integer, p_digest jsonb, p_firebase_token text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.ask_digests (days, rows_seen, digest) values (p_days, p_rows, p_digest) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_ask_digest(integer, integer, jsonb, text) from public;
grant execute on function public.save_ask_digest(integer, integer, jsonb, text) to anon, authenticated;
