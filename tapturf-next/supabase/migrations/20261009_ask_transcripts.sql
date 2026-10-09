-- Admin view of Ask TapTurf conversations.
--
-- ask_queries gains the reply and intent so the admin can read an
-- exchange as it appeared to the player. Rows from the same hashed IP
-- within 30 minutes are shown as one thread. ask_finish gets a second
-- form with the new fields; the old form stays for older deploys.

alter table public.ask_queries add column if not exists reply text;
alter table public.ask_queries add column if not exists intent text;

create or replace function public.ask_finish(p_id bigint, p_filters jsonb, p_results integer, p_ms integer, p_source text, p_reply text, p_intent text)
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
      source = case when p_source in ('claude', 'keywords') then p_source else null end,
      reply = left(p_reply, 400),
      intent = left(p_intent, 20)
  where id = p_id and filters is null and created_at > now() - interval '2 minutes';
end;
$$;
revoke all on function public.ask_finish(bigint, jsonb, integer, integer, text, text, text) from public;
grant execute on function public.ask_finish(bigint, jsonb, integer, integer, text, text, text) to anon, authenticated;

-- Owner only: the last N days of asks, newest first, with the thread key.
create or replace function public.get_ask_transcripts(p_days integer default 7, p_limit integer default 500, p_firebase_token text default null)
returns table (id bigint, ip_hash text, query text, reply text, intent text, filters jsonb, results integer, ms integer, source text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select q.id, q.ip_hash, q.query, q.reply, q.intent, q.filters, q.results, q.ms, q.source, q.created_at
  from public.ask_queries q
  where q.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
  order by q.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
end;
$$;
revoke all on function public.get_ask_transcripts(integer, integer, text) from public;
grant execute on function public.get_ask_transcripts(integer, integer, text) to anon, authenticated;
