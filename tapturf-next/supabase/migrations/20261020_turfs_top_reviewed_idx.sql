-- getTopTurfKeys (lib/queries/turfs.ts) picks the turf pages a production
-- build renders: the most reviewed active turfs. Without an index each
-- build sorted every active row; read them in index order instead.
-- 20 Oct outage follow-up. Safe to apply any time (a few ms on 2.6k rows).
create index if not exists turfs_active_reviews_idx on public.turfs (total_reviews desc nulls last, id) where is_active;
