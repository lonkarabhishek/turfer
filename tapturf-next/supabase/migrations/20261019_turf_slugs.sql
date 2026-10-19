-- Dev brief 19 Oct, SEO: turf pages move from /turf/<id> to
-- /turf/<slug> (e.g. /turf/turf-up-hinjewadi); the app 308s old id
-- links to the slug. Applied to production on 2026-10-19.
--
-- A slug is set once (name plus area, or city when there is no area)
-- and never changes on rename, so links stay stable. A clash gets the
-- first six characters of the id appended.

alter table public.turfs add column if not exists slug text;

create or replace function public._slugify(p text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçß', 'aaaaaaaeeeeeiiiiiooooooouuuuuncs'),
    '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public._turf_base_slug(p_name text, p_area text, p_city text)
returns text
language sql
immutable
as $$
  with s as (
    select coalesce(nullif(public._slugify(p_name), ''), 'turf') as n,
           public._slugify(coalesce(nullif(trim(p_area), ''), p_city)) as a
  )
  select left(trim(both '-' from case when a = '' or position(a in n) > 0 then n else n || '-' || a end), 80) from s;
$$;

create or replace function public._turf_set_slug()
returns trigger
language plpgsql
as $$
declare
  b text;
begin
  if new.slug is null or new.slug = '' then
    b := public._turf_base_slug(new.name, new.area, new.city);
    if exists (select 1 from public.turfs where slug = b and id <> new.id) then
      b := b || '-' || left(new.id::text, 6);
    end if;
    new.slug := b;
  end if;
  return new;
end;
$$;

-- Fill existing rows. Triggers are skipped so the fill doesn't fire a
-- revalidate webhook per row; the deploy rebuilds every page anyway.
-- The most reviewed turf keeps the plain slug when two share a name.
begin;
set local session_replication_role = replica;
with ranked as (
  select id, public._turf_base_slug(name, area, city) as b,
         row_number() over (partition by public._turf_base_slug(name, area, city) order by total_reviews desc nulls last, id) as rn
  from public.turfs
)
update public.turfs t
   set slug = case when r.rn = 1 then r.b else r.b || '-' || left(t.id::text, 6) end
  from ranked r
 where r.id = t.id and t.slug is null;
commit;

create unique index if not exists turfs_slug_key on public.turfs (slug);

create trigger turfs_set_slug
  before insert or update of name, slug on public.turfs
  for each row execute function public._turf_set_slug();
