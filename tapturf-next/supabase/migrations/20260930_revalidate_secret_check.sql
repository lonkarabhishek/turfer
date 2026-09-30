-- On-demand revalidation without depending on a Vercel env var.
--
-- The shared secret moves out of notify_turf_change()'s source into a
-- private table (schema "private" is not exposed through the API).
-- /api/revalidate verifies the x-revalidate-secret header by calling
-- check_revalidate_secret(); if REVALIDATE_SECRET is set in Vercel the
-- route uses that instead. Rotate with:
--   update private.app_secrets set value = '<new 64-hex>' where name = 'revalidate';
-- (and update the Vercel env var too if you set one).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  name  text primary key,
  value text not null
);
revoke all on private.app_secrets from public, anon, authenticated;

-- Seed from the secret currently embedded in the trigger function, so
-- the value itself never appears in this file.
insert into private.app_secrets (name, value)
select 'revalidate', m[1]
from regexp_matches(pg_get_functiondef('public.notify_turf_change'::regproc), '([0-9a-f]{64})') as m
on conflict (name) do nothing;

create or replace function public.check_revalidate_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_secret is not null
    and length(p_secret) = 64
    and p_secret = (select value from private.app_secrets where name = 'revalidate'),
    false);
$$;
revoke all on function public.check_revalidate_secret(text) from public;
grant execute on function public.check_revalidate_secret(text) to anon, authenticated;

create or replace function public.notify_turf_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
declare
  v_secret text := (select value from private.app_secrets where name = 'revalidate');
  v_url    constant text := 'https://www.tapturf.in/api/revalidate';
begin
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-revalidate-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    ),
    timeout_milliseconds := 5000
  );
  return coalesce(NEW, OLD);
end;
$function$;
revoke all on function public.notify_turf_change() from public, anon, authenticated;
