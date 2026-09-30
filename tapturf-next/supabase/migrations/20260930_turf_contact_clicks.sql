-- Count Call / WhatsApp taps on turf pages.
--
-- One row per tap. `signed_in` = false means the visitor hit the login
-- prompt instead of the dialer / WhatsApp (useful as a funnel).
-- Writes only via log_turf_contact_click(); reads only via the
-- aggregate get_contact_click_stats() (no user ids leave the DB).

create table if not exists public.turf_contact_clicks (
  id          bigint generated always as identity primary key,
  turf_id     uuid not null references public.turfs(id) on delete cascade,
  kind        text not null check (kind in ('call', 'whatsapp')),
  source      text not null check (char_length(source) <= 40),
  signed_in   boolean not null default false,
  user_id     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists turf_contact_clicks_created_idx on public.turf_contact_clicks (created_at desc);
create index if not exists turf_contact_clicks_turf_idx on public.turf_contact_clicks (turf_id, created_at desc);
alter table public.turf_contact_clicks enable row level security;
-- No policies: table is closed to the API; functions below are the door.

create or replace function public.log_turf_contact_click(
  p_turf_id uuid,
  p_kind text,
  p_source text,
  p_signed_in boolean default false,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('call', 'whatsapp') then return; end if;
  if not exists (select 1 from public.turfs where id = p_turf_id) then return; end if;
  -- Light flood guard: ignore a same user/turf/kind repeat within 10s
  -- (double taps, a tap and then the sticky-bar tap).
  if p_user_id is not null and exists (
    select 1 from public.turf_contact_clicks
    where user_id = p_user_id and turf_id = p_turf_id and kind = p_kind
      and created_at > now() - interval '10 seconds'
  ) then
    return;
  end if;
  insert into public.turf_contact_clicks (turf_id, kind, source, signed_in, user_id)
  values (p_turf_id, p_kind, left(coalesce(p_source, 'unknown'), 40), coalesce(p_signed_in, false), p_user_id);
end;
$$;
revoke all on function public.log_turf_contact_click(uuid, text, text, boolean, uuid) from public;
grant execute on function public.log_turf_contact_click(uuid, text, text, boolean, uuid) to anon, authenticated;

-- Aggregates for /admin: totals per kind over a window, plus top turfs.
create or replace function public.get_contact_click_stats(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select * from public.turf_contact_clicks
    where created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  ),
  top as (
    select t.id, t.name, t.city,
           count(*) filter (where w.kind = 'call' and w.signed_in) as calls,
           count(*) filter (where w.kind = 'whatsapp' and w.signed_in) as whatsapps,
           count(*) filter (where not w.signed_in) as login_prompts
    from w join public.turfs t on t.id = w.turf_id
    group by t.id, t.name, t.city
    order by count(*) filter (where w.signed_in) desc, count(*) desc
    limit 15
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'calls', (select count(*) from w where kind = 'call' and signed_in),
    'whatsapps', (select count(*) from w where kind = 'whatsapp' and signed_in),
    'login_prompts', (select count(*) from w where not signed_in),
    'unique_users', (select count(distinct user_id) from w where signed_in and user_id is not null),
    'turfs', (select count(distinct turf_id) from w where signed_in),
    'top', coalesce((select jsonb_agg(to_jsonb(top)) from top), '[]'::jsonb)
  );
$$;
revoke all on function public.get_contact_click_stats(integer) from public;
grant execute on function public.get_contact_click_stats(integer) to anon, authenticated;
