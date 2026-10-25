-- myTapturf owner photos: the three storage policies
-- (20261025_owner_photos.sql holds everything else; apply that first).
--
-- On its own because CREATE POLICY locks storage.objects for a moment:
-- every storage request waits behind it. Apply at a quiet hour; with the
-- short lock timeout it gives up instead of queueing the site, so if it
-- times out, run it again.
--
-- anon and authenticated (phone sign-ins have no Supabase session) may
-- write a file only at an open ticket's path, and read or remove one only
-- once nothing will show it: public.owner_photo_object_ok holds the rule,
-- so a change is a create or replace of that function and the policies
-- stay as they are. No UPDATE policy: uploads never overwrite a file.
-- Created once (postgres may create policies on storage.objects:
-- supautils.policy_grants). Safe to run again.

set local lock_timeout = '2s';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt owner photos insert') then
    create policy "tt owner photos insert" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'turf-photos' and public.owner_photo_object_ok(name, 'insert'));
  end if;
  -- Removing a file reads it first; a list shows only what may be removed.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt owner photos select') then
    create policy "tt owner photos select" on storage.objects for select to anon, authenticated
      using (bucket_id = 'turf-photos' and public.owner_photo_object_ok(name, 'select'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt owner photos delete') then
    create policy "tt owner photos delete" on storage.objects for delete to anon, authenticated
      using (bucket_id = 'turf-photos' and public.owner_photo_object_ok(name, 'delete'));
  end if;
end;
$$;
