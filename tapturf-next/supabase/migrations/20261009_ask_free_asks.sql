-- Three free answers per visitor per day, then sign in. Visitors are
-- keyed by a browser-generated anon_id; signed-in players by user_id.

alter table public.ask_queries add column if not exists anon_id uuid;
create index if not exists ask_queries_anon_idx on public.ask_queries (anon_id, created_at desc);

create or replace function public.ask_begin_v2(p_ip_hash text, p_query text, p_user_id uuid, p_anon_id uuid)
returns table (id bigint, free_left integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_used integer;
  v_free constant integer := 3;
begin
  if p_ip_hash is null or p_query is null or char_length(p_query) < 2 or (p_user_id is null and p_anon_id is null) then
    return query select null::bigint, null::integer; return;
  end if;
  if (select count(*) from public.ask_queries q
      where q.ip_hash = p_ip_hash and q.created_at > now() - interval '10 minutes') >= 40 then
    return query select null::bigint, null::integer; return;
  end if;
  if p_user_id is null then
    select count(*)::integer into v_used from public.ask_queries q
    where q.anon_id = p_anon_id and q.created_at > now() - interval '1 day';
    if v_used >= v_free then
      return query select null::bigint, -1; return;
    end if;
  end if;
  insert into public.ask_queries (ip_hash, query, user_id, anon_id)
  values (left(p_ip_hash, 64), left(p_query, 200), p_user_id, case when p_user_id is null then p_anon_id else null end)
  returning ask_queries.id into v_id;
  return query select v_id, case when p_user_id is null then v_free - v_used - 1 else null end;
end;
$$;
revoke all on function public.ask_begin_v2(text, text, uuid, uuid) from public;
grant execute on function public.ask_begin_v2(text, text, uuid, uuid) to anon, authenticated;
