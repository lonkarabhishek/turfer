-- NOT a migration: run by hand only to undo the games lockdown
-- (supabase/migrations/20261030_games_lockdown_step2.sql) if the app has
-- to roll back past the /api/games, /api/game-requests and
-- /api/notifications routes. Run it BEFORE deploying the older app.
-- Restores exactly the grants and policies as they were on 2026-10-30
-- (pg_policies and information_schema.role_table_grants, read that day):
-- this reopens the tables to anyone holding the anon key, as before.
-- GRANT and ALTER POLICY only: nothing is removed. The step 1 functions
-- stay (the app before them never calls them).

grant all on public.games, public.game_requests, public.game_participants, public.notifications to anon, authenticated;

alter policy "Allow all operations on games" on public.games using (true);
alter policy "Anyone can create games" on public.games with check (true);
alter policy "Anyone can update games" on public.games using (true);

alter policy "Anyone can manage participants" on public.game_participants using (true) with check (true);
alter policy "Anyone can insert participants" on public.game_participants with check (true);
alter policy "System can insert participants" on public.game_participants with check (true);

alter policy "Anyone can create requests" on public.game_requests with check (true);
alter policy "Anyone can update game requests" on public.game_requests using (true) with check (true);
alter policy "Anyone can view own requests" on public.game_requests using (true);
alter policy "Enable insert for authenticated users" on public.game_requests
  with check ((auth.role() = 'authenticated'::text) and (auth.uid() = user_id));
alter policy "Users can create requests" on public.game_requests with check (user_id = auth.uid());
alter policy "Enable update for game owners" on public.game_requests
  using (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id)));
alter policy "Game hosts can update requests for their
  games" on public.game_requests
  using (auth.uid() in (select games.creator_id from public.games where (games.id = game_requests.game_id)));
alter policy "Hosts can update request status" on public.game_requests
  using (game_id in (select games.id from public.games where (games.creator_id = auth.uid())));
alter policy "Hosts can update requests" on public.game_requests
  using (exists (select 1 from public.games where ((games.id = game_requests.game_id) and (games.creator_id = auth.uid()))));

alter policy "Allow all operations for authenticated
  users" on public.notifications using (true) with check (true);
alter policy "Allow authenticated users to create
  notifications" on public.notifications with check (((select auth.role() as role) = 'authenticated'::text));
alter policy "Anyone can create notifications" on public.notifications with check (true);
alter policy "System can create notifications" on public.notifications with check (true);
alter policy "Users can insert notifications for others" on public.notifications with check (true);
alter policy "Enable insert for all authenticated users" on public.notifications
  with check (((select auth.role() as role) = 'authenticated'::text));
alter policy "Anyone can read notifications" on public.notifications using (true);
alter policy "Anyone can update notifications" on public.notifications using (true);
alter policy "Enable update for own notifications" on public.notifications using (((select auth.uid() as uid) = user_id));
alter policy "Users can update own notifications" on public.notifications using ((user_id = (select auth.uid() as uid)));
alter policy "Users can update their notifications" on public.notifications using ((user_id = (select auth.uid() as uid)));
