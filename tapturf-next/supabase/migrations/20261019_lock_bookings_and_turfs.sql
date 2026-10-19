-- Dev brief 19 Oct, security. Applied to production on 2026-10-19.
--
-- bookings had no row-level security: anyone with the anon key could
-- read or write every booking. Now a signed-in user reads only their
-- own bookings and a turf owner (turfs.owner_id) reads their turf's.
-- No browser role writes bookings; that goes through the server.
alter table public.bookings enable row level security;
revoke insert, update, delete, truncate on public.bookings from anon, authenticated;

create policy bookings_read_own on public.bookings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy bookings_owner_read on public.bookings
  for select to authenticated
  using (exists (select 1 from public.turfs t where t.id = bookings.turf_id and t.owner_id = (select auth.uid())));

-- turfs: the public roles only read (policy turfs_public_read_active).
-- Owner edits go through the myTapturf security-definer functions and
-- data ops use the service role, so no browser role keeps write rights.
revoke insert, update, delete, truncate on public.turfs from anon, authenticated;
