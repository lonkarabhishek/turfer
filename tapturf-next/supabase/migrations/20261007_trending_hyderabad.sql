-- Hyderabad joined on 2026-10-07.
alter table public.trending_turfs drop constraint if exists trending_turfs_city_check;
alter table public.trending_turfs add constraint trending_turfs_city_check
  check (city = any (array['nashik'::text, 'pune'::text, 'mumbai'::text, 'nagpur'::text, 'hyderabad'::text]));
