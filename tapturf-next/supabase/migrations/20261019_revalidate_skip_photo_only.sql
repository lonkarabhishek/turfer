-- The turf webhook (notify_turf_change -> /api/revalidate) fired on every
-- row update. While mirror-turf-photos ran (about 10 photo-only updates a
-- minute) each one rebuilt the home, listing, city and sport pages, and
-- each rebuild read every turf: the database got busy enough that a
-- production build hit the 3 s statement timeout. Photo-only updates now
-- skip the webhook; turf pages pick the new photos up on their hourly
-- refresh. Applied to production on 2026-10-19.
create or replace function public.notify_turf_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'net', 'extensions'
as $function$
declare
  v_secret text := (select value from private.app_secrets where name = 'revalidate');
  v_url    constant text := 'https://www.tapturf.in/api/revalidate';
  v_photo  constant text[] := array['images', 'cover_image', 'image_review', 'updated_at'];
begin
  -- Photo-only updates (mirror-turf-photos swapping Google links for our
  -- copies, about 10 a minute while it runs) skip the webhook: each one
  -- rebuilt every listing page. Turf pages pick them up on their hourly refresh.
  if TG_OP = 'UPDATE' and (to_jsonb(NEW) - v_photo) = (to_jsonb(OLD) - v_photo) then
    return NEW;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-revalidate-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    ),
    timeout_milliseconds := 5000
  );
  return coalesce(NEW, OLD);
end;
$function$;
