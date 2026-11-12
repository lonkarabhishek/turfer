-- Free the site owner's admin number from his old test account (12 Nov 2026).
--
-- The site owner asked for one account, his main Google one, that both his
-- Google sign-in and his admin phone number open. public.account_set_phone
-- refuses a number another users row holds, and his old test account
-- (b8e4af57-c3fb-4593-bb6d-3805a706a699, made 30 Oct 2025, two past games
-- hosted) holds it. With his OK this takes the number off that row only:
-- nothing is removed, its games, requests and notifications stay as they
-- are, and it can no longer be opened by phone. He then adds the number to
-- his main account himself through the app (Me tab, Change number: a fresh
-- Google sign-in and a Firebase OTP, account_set_phone), which ends that
-- account's current phone link as a change, as the app does.
--
-- users_phone_change_audit records the change. The number stays an admin
-- key (public._is_admin_key), so whichever account holds it next is the
-- site owner's. No number or address is written here. Safe to run again:
-- a second run finds the number already gone and changes nothing.
do $$
declare
  n int;
begin
  update public.users
     set phone = null
   where id = 'b8e4af57-c3fb-4593-bb6d-3805a706a699'
     and phone is not null;
  get diagnostics n = row_count;
  if n > 1 then
    raise exception 'free_test_phone: expected at most one row, got %', n;
  end if;
end;
$$;
