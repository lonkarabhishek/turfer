-- Log of phone-OTP send attempts, to diagnose "OTP not coming".
-- Stores only the outcome and Firebase error code, plus the last 2
-- digits of the number (never the full number). Insert via RPC only.

create table if not exists public.otp_send_log (
  id          bigint generated always as identity primary key,
  ok          boolean not null,
  error_code  text check (char_length(error_code) <= 80),
  phone_tail  text check (char_length(phone_tail) <= 2),
  host        text check (char_length(host) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists otp_send_log_created_idx on public.otp_send_log (created_at desc);
alter table public.otp_send_log enable row level security;

create or replace function public.log_otp_send(
  p_ok boolean, p_error_code text default null, p_phone_tail text default null, p_host text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.otp_send_log (ok, error_code, phone_tail, host)
  values (coalesce(p_ok, false), left(p_error_code, 80), right(p_phone_tail, 2), left(p_host, 80));
$$;
revoke all on function public.log_otp_send(boolean, text, text, text) from public;
grant execute on function public.log_otp_send(boolean, text, text, text) to anon, authenticated;
