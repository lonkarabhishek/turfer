-- Ask TapTurf now asks players to sign in before it answers. The log
-- keeps who asked (users.id) so the admin transcript shows a name
-- instead of a hashed IP. New ask_begin form takes the user; the old
-- form stays for older deploys. get_ask_transcripts_v2 adds the name
-- (the v1 return type can't be changed in place).

alter table public.ask_queries add column if not exists user_id uuid;

create or replace function public.ask_begin(p_ip_hash text, p_query text, p_user_id uuid)
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
  insert into public.ask_queries (ip_hash, query, user_id)
  values (left(p_ip_hash, 64), left(p_query, 200), p_user_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ask_begin(text, text, uuid) from public;
grant execute on function public.ask_begin(text, text, uuid) to anon, authenticated;

create or replace function public.get_ask_transcripts_v2(p_days integer default 7, p_limit integer default 500, p_firebase_token text default null)
returns table (id bigint, ip_hash text, query text, reply text, intent text, filters jsonb, results integer, ms integer, source text, created_at timestamptz, user_id uuid, user_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select q.id, q.ip_hash, q.query, q.reply, q.intent, q.filters, q.results, q.ms, q.source, q.created_at, q.user_id, u.name::text
  from public.ask_queries q
  left join public.users u on u.id = q.user_id
  where q.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
  order by q.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
end;
$$;
revoke all on function public.get_ask_transcripts_v2(integer, integer, text) from public;
grant execute on function public.get_ask_transcripts_v2(integer, integer, text) to anon, authenticated;
