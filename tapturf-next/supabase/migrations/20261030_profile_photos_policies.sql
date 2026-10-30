-- Profile photos: the three storage policies for the avatars bucket
-- (20261030_profile_photos.sql holds everything else; apply that first).
--
-- On its own because CREATE POLICY locks storage.objects for a moment:
-- every storage request waits behind it. Apply at a quiet hour; with the
-- short lock timeout it gives up instead of queueing the site, so if it
-- times out, run it again.
--
-- Only the server writes here (/api/account/photo, with the public key):
-- a file at an open ticket's path, and remove (read, then delete) only a
-- file nothing shows. public.avatar_object_ok holds the rule, so a change
-- is a create or replace of that function and the policies stay as they
-- are. No UPDATE policy: uploads never overwrite a file. Reading a
-- picture needs no policy (a public bucket). Created once. Safe to run
-- again.

set local lock_timeout = '2s';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt avatars insert') then
    create policy "tt avatars insert" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'avatars' and public.avatar_object_ok(name, 'insert'));
  end if;
  -- Removing a file reads it first; a list shows only what may be removed.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt avatars select') then
    create policy "tt avatars select" on storage.objects for select to anon, authenticated
      using (bucket_id = 'avatars' and public.avatar_object_ok(name, 'select'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt avatars delete') then
    create policy "tt avatars delete" on storage.objects for delete to anon, authenticated
      using (bucket_id = 'avatars' and public.avatar_object_ok(name, 'delete'));
  end if;
end;
$$;
