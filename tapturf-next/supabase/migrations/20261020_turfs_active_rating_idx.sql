-- The full turf list (is_active, ordered by rating desc then id) sorted
-- about 2,500 wide rows on disk for every page of every read. Read in
-- index order instead. Apply once the database is healthy again.
create index if not exists turfs_active_rating_idx on public.turfs (rating desc nulls first, id) where is_active;
