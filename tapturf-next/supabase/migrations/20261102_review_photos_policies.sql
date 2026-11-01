-- Review photos: the three storage policies for the review-photos bucket
-- (20261102_reviews_trust.sql holds everything else; apply that first).
--
-- On its own because CREATE POLICY locks storage.objects for a moment:
-- every storage request waits behind it. Apply at a quiet hour; with the
-- short lock timeout it gives up instead of queueing the site, so if it
-- times out, run it again.
--
-- Only the server writes here (/api/reviews/photos, with the public key):
-- a photo and its thumbnail at an open ticket's paths, and taking away
-- (read, then remove) only a file nothing shows. public.review_photo_object_ok
-- holds the rule, so a change is a create or replace of that function and
-- the policies stay as they are. No UPDATE policy: uploads never overwrite
-- a file. Reading a photo needs no policy (a public bucket). Created once.
-- Safe to run again.

set local lock_timeout = '2s';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt review photos insert') then
    create policy "tt review photos insert" on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'review-photos' and public.review_photo_object_ok(name, 'insert'));
  end if;
  -- Taking a file away reads it first; a list shows only what may be taken away.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt review photos select') then
    create policy "tt review photos select" on storage.objects for select to anon, authenticated
      using (bucket_id = 'review-photos' and public.review_photo_object_ok(name, 'select'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'tt review photos remove') then
    create policy "tt review photos remove" on storage.objects for delete to anon, authenticated
      using (bucket_id = 'review-photos' and public.review_photo_object_ok(name, 'remove'));
  end if;
end;
$$;
