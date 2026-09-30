-- "Most Trending Turf" spotlight, one per city per week.
--
-- Picked by the team (Supabase table editor). A row is live between
-- starts_at and ends_at; if windows overlap for a city, the latest
-- starts_at wins. Publicly readable (it's promotional content).

create table if not exists public.trending_turfs (
  id          uuid primary key default gen_random_uuid(),
  city        text not null check (city in ('nashik', 'pune', 'mumbai')),
  turf_id     uuid not null references public.turfs(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  tagline     text check (char_length(tagline) <= 140),
  created_at  timestamptz not null default now(),
  constraint trending_turfs_window check (ends_at > starts_at)
);
create index if not exists trending_turfs_live_idx on public.trending_turfs (city, starts_at desc);

alter table public.trending_turfs enable row level security;
drop policy if exists trending_turfs_public_read on public.trending_turfs;
create policy trending_turfs_public_read on public.trending_turfs
  for select to anon, authenticated using (true);

-- Revalidate pages when the spotlight changes (same hook as turfs).
drop trigger if exists on_trending_change_notify_revalidate on public.trending_turfs;
create trigger on_trending_change_notify_revalidate
  after insert or update or delete on public.trending_turfs
  for each row execute function public.notify_turf_change();

-- This week's Nashik pick: Mon 28 Sep to Mon 5 Oct 2026, IST.
insert into public.trending_turfs (city, turf_id, starts_at, ends_at, tagline)
values ('nashik', '5078b9c4-8993-4328-8a84-893c1780fd76',
        '2026-09-28 00:00:00+05:30', '2026-10-05 00:00:00+05:30',
        'The turf everyone in Nashik is booking this week.');
