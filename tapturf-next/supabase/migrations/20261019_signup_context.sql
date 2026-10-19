-- Quiet sign-up context: how a new user found TapTurf and what they
-- looked at before signing up (first-visit source and UTM tags, visit
-- and day counts, cities and sports viewed, funnel step times, device
-- family). Gathered on the device, saved once at sign-up. No IP
-- addresses or raw user agents. Disclosed in the privacy policy.
--
-- users is publicly readable, so the context lives in its own table
-- with RLS on and no policies: only save_signup_context writes it and
-- only the service role (SQL, admin) reads it.
--
-- Note: an earlier draft added users.signup_context. It is empty and
-- unused; dropping it timed out on the busy users table, so it stays
-- until a quiet moment.

create table if not exists public.user_signup_context (
  user_id uuid primary key,
  ctx jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.user_signup_context enable row level security;
revoke all on public.user_signup_context from anon, authenticated;

-- Called from the browser right after an account is created. Only for
-- accounts under a day old, only once, payload capped.
create or replace function public.save_signup_context(p_user_id uuid, p_ctx jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ctx is null or jsonb_typeof(p_ctx) <> 'object' or pg_column_size(p_ctx) > 8000 then
    return;
  end if;
  if not exists (select 1 from public.users where id = p_user_id and created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.user_signup_context (user_id, ctx) values (p_user_id, p_ctx)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.save_signup_context(uuid, jsonb) from public;
grant execute on function public.save_signup_context(uuid, jsonb) to anon, authenticated;
