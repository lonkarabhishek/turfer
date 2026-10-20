-- The photo mirror job is stopped for good (owner's call on 20 Oct, after
-- the database overload). Turfs it already copied keep their links to
-- the turf-photos bucket; the rest keep their Google links. The edge
-- function was replaced with a no-op on the same day.
select cron.unschedule('mirror-turf-photos');
