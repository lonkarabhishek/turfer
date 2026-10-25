-- The auth.users -> public.users mirror (on_auth_user_created_sync_public_users)
-- makes a TapTurf account only for a Google sign-up, and never takes a
-- phone number from sign-up metadata.
--
-- It copied every new auth user, whatever the provider, with
-- coalesce(new.phone, raw_user_meta_data->>'phone'). Sign-up metadata is
-- whatever the caller sends: an email-and-password sign-up with someone
-- else's number in it (the old app sent data.phone) would make a row that
-- holds that number before its owner ever signs up, and their phone
-- sign-up would then be refused as a conflict. The app signs people up
-- by Google (this trigger, then account_resolve) or by phone
-- (account_resolve only), so nothing else needs the copy.
--
-- A Google sign-up the trigger skips still gets its account: POST
-- /api/account/me runs account_resolve with create. Same trigger, same
-- function name (create or replace); nothing dropped. Safe to run again.

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
          or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb) then
    return new;
  end if;
  begin
    insert into public.users (id, email, name, phone, role, profile_image_url, created_at)
    values (
      new.id,
      new.email,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
               nullif(btrim(new.raw_user_meta_data->>'name'), ''),
               nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
               'User'),
      -- Only a number auth itself verified; never one from sign-up metadata.
      new.phone,
      'user',
      coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
      coalesce(new.created_at, now())
    )
    on conflict do nothing;
  exception when others then
    -- never block an auth sign-up because of the profile mirror
    raise warning 'handle_auth_user_created: could not mirror auth user % into public.users: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
