-- Web Push: notifications on the phone, the app closed (the site owner, 2 Nov
-- 2026: "i do have installed the webapp on my iphone but i dont get
-- notifications actively"). Until now the app only fired a notification from
-- an open tab (lib/notifications/browser.ts), which an iPhone never shows. A
-- home screen web app on iOS 16.4 and later, and Chrome, Firefox and Edge,
-- get them only through Web Push: a service worker (public/sw.js), a push
-- subscription the browser makes with TapTurf's VAPID public key
-- (lib/push/config.ts), and the server sending each one, encrypted, to the
-- browser's push service (Apple, Google, Mozilla or Microsoft).
--
-- 1. private.push_subscriptions: one row per push address (endpoint), the
--    account that turned "Notifications on this phone" on there, the two keys
--    that let only TapTurf send to it and keep the message private, the kind
--    of device (iphone, ipad, android, mac, windows, linux or other, from the
--    user agent: nothing else about it), when it last worked and how many
--    sends failed in a row. One account can have several (10 at most at
--    once; an 11th replaces the one used least lately). Never removed: a
--    subscription that ends becomes status gone, with why (off: turned off or
--    logged out on that phone; expired: the push service answered 404 or
--    410; failing: 8 failures in a row; replaced: the 11th). The same address
--    turned on by another account (another sign-in on that phone) moves to
--    it. 20 new addresses a day per account.
-- 2. private.push_sends: one row per notification sent out (claimed once, so
--    the same notification never goes out twice) and per test, with what
--    became of it (sent, gone, failed).
-- 3. The server-key functions (private.account_key_ok, the account the route
--    verified, never one the browser names), for app/api/push/**:
--    push_subscribe, push_unsubscribe and push_state (the caller's own, for
--    the switch on the Me tab), push_test_targets ("Send me a test": the
--    caller's own phones, 5 an hour), push_targets (for one notification:
--    its account's active subscriptions with the title, the message and the
--    page it opens, built from its type and metadata here: a game's page,
--    /game/<id>, else the Me tab's Alerts; lib/push/url.cases.json has the
--    cases) and push_report (what each send came to).
-- 4. notifications_push, after insert on public.notifications: when the
--    notification's account has an active subscription, pg_net posts {id}
--    to https://www.tapturf.in/api/push/dispatch with the secret the cache
--    queue and the photo sweeps send (private.app_secrets 'revalidate',
--    x-revalidate-secret). pg_net sends it after the insert commits; the
--    route reads push_targets and sends. It never blocks or fails the
--    insert: any error is a warning and the notification is made as before.
--
-- Apply any time: the app that ships with this works without it (the switch
-- says coming soon until this file is in and VAPID_PRIVATE_KEY is set in
-- Vercel), and until someone turns it on the trigger posts nothing.
-- Additive: two tables, functions, one trigger. Written without the
-- destructive SQL keywords; nothing is removed. Safe to run again.

set local lock_timeout = '5s';

-- ── 1. Tables (closed to the API roles) ───────────────────

create table if not exists private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- The account (public.users.id) that turned it on there.
  user_id uuid not null,
  -- The browser's push address: https, at its push service.
  endpoint text not null check (char_length(endpoint) between 20 and 1024 and endpoint like 'https://%'),
  -- The browser's public key (P-256, base64url) and its auth secret: only with these can a message be read.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  -- The kind of device, from the user agent; nothing else about it is kept.
  device text not null default 'other' check (device in ('iphone', 'ipad', 'android', 'mac', 'windows', 'linux', 'other')),
  status text not null default 'active' check (status in ('active', 'gone')),
  gone_reason text check (gone_reason is null or gone_reason in ('off', 'expired', 'failing', 'replaced')),
  created_at timestamptz not null default now(),
  -- Turned on (again) or moved to another account.
  updated_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  fail_count integer not null default 0,
  gone_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint)
);
create index if not exists push_subscriptions_user_active_idx on private.push_subscriptions (user_id) where status = 'active';
create index if not exists push_subscriptions_user_created_idx on private.push_subscriptions (user_id, created_at desc);
revoke all on private.push_subscriptions from public, anon, authenticated;
comment on table private.push_subscriptions is
  'Web Push: the push address of a phone or browser where an account turned on "Notifications on this phone" (push_subscribe), its keys and the kind of device. Gone ones stay, as status gone. Read only by the server-key push functions.';

create table if not exists private.push_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('notification', 'test')),
  -- The notification sent (null for a test); one send per notification.
  notification_id uuid,
  user_id uuid not null,
  targets integer not null default 0,
  sent integer,
  gone integer,
  failed integer,
  created_at timestamptz not null default now(),
  reported_at timestamptz
);
create unique index if not exists push_sends_notification_uidx on private.push_sends (notification_id) where notification_id is not null;
create index if not exists push_sends_user_idx on private.push_sends (user_id, created_at desc);
revoke all on private.push_sends from public, anon, authenticated;
comment on table private.push_sends is
  'Web Push: each notification sent to phones (once) and each "Send me a test", with how many were sent, gone and failed (push_report).';

-- ── 2. Helpers (closed to the API roles) ──────────────────

-- The page a notification opens: its game's page when its metadata names a
-- game (gameId, or game_id on older rows), else the Me tab's Alerts.
create or replace function private.push_url(p_type text, p_metadata jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when v.game ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then '/game/' || lower(v.game)
           else '/dashboard?tab=notifications'
         end
    from (select case when jsonb_typeof(p_metadata) = 'object'
                      then coalesce(nullif(p_metadata ->> 'gameId', ''), p_metadata ->> 'game_id')
                 end as game) v;
$$;
revoke all on function private.push_url(text, jsonb) from public, anon, authenticated;

-- An account's active subscriptions as the sender needs them, newest first.
create or replace function private.push_targets_of(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                            order by s.updated_at desc), '[]'::jsonb)
    from (select x.id, x.endpoint, x.p256dh, x.auth, x.updated_at
            from private.push_subscriptions x
           where x.user_id = p_user_id and x.status = 'active'
           order by x.updated_at desc
           limit 10) s;
$$;
revoke all on function private.push_targets_of(uuid) from public, anon, authenticated;

-- ── 3. The caller's own: on, off, where it stands ─────────

-- Turn notifications on for one push address (the browser's subscription;
-- the route checks the address is at a push service). p_device: the kind of
-- device (anything else is other). Answers {r: ok, devices} (the account's
-- active ones) or r: unavailable, bad, limit (20 new addresses a day).
create or replace function public.push_subscribe(p_key text, p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.push_subscriptions;
  v_device text;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_endpoint is null or p_p256dh is null or p_auth is null
     or char_length(p_endpoint) not between 20 and 1024 or p_endpoint not like 'https://%'
     or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' or p_auth !~ '^[A-Za-z0-9_-]{16,32}$'
     or not exists (select 1 from public.users u where u.id = p_user_id) then
    return jsonb_build_object('r', 'bad');
  end if;
  v_device := case when p_device in ('iphone', 'ipad', 'android', 'mac', 'windows', 'linux') then p_device else 'other' end;
  -- One change at a time per account (its cap and its day's count), and per address.
  perform pg_advisory_xact_lock(hashtextextended('push_subscribe:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('push_endpoint:' || p_endpoint, 0));
  select * into v_row from private.push_subscriptions s where s.endpoint = p_endpoint for update;
  -- A new address counts toward the day's 20; the same one again, or one moving here from another account, doesn't.
  if not found and (select count(*) from private.push_subscriptions s
                     where s.user_id = p_user_id and s.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('r', 'limit');
  end if;
  insert into private.push_subscriptions as s (user_id, endpoint, p256dh, auth, device)
  values (p_user_id, p_endpoint, p_p256dh, p_auth, v_device)
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device,
         status = 'active', gone_reason = null, gone_at = null, fail_count = 0, last_fail_at = null,
         -- A new account, or new keys: a new subscription, so its old send history doesn't count.
         last_ok_at = case when s.user_id = excluded.user_id and s.p256dh = excluded.p256dh and s.auth = excluded.auth then s.last_ok_at end,
         updated_at = now();
  -- At most 10 at once: the ones used least lately make room.
  update private.push_subscriptions s
     set status = 'gone', gone_reason = 'replaced', gone_at = now()
   where s.user_id = p_user_id and s.status = 'active'
     and s.id not in (select x.id from private.push_subscriptions x
                       where x.user_id = p_user_id and x.status = 'active'
                       order by x.updated_at desc
                       limit 10);
  return jsonb_build_object('r', 'ok', 'devices',
    (select count(*) from private.push_subscriptions s where s.user_id = p_user_id and s.status = 'active'));
end;
$$;
revoke all on function public.push_subscribe(text, uuid, text, text, text, text) from public;
grant execute on function public.push_subscribe(text, uuid, text, text, text, text) to anon, authenticated;

-- Turn them off for one push address of the caller's: status gone (off).
-- Another account's address is left alone. Answers {r: ok, devices} or r:
-- unavailable, bad.
create or replace function public.push_unsubscribe(p_key text, p_user_id uuid, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or p_endpoint is null or char_length(p_endpoint) > 1024 then
    return jsonb_build_object('r', 'bad');
  end if;
  update private.push_subscriptions s
     set status = 'gone', gone_reason = 'off', gone_at = now()
   where s.endpoint = p_endpoint and s.user_id = p_user_id and s.status = 'active';
  return jsonb_build_object('r', 'ok', 'devices',
    (select count(*) from private.push_subscriptions s where s.user_id = p_user_id and s.status = 'active'));
end;
$$;
revoke all on function public.push_unsubscribe(text, uuid, text) from public;
grant execute on function public.push_unsubscribe(text, uuid, text) to anon, authenticated;

-- Whether this push address is on for the caller, and how many of theirs are.
-- {r: ok, on, devices}, or r: unavailable, bad.
create or replace function public.push_state(p_key text, p_user_id uuid, p_endpoint text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null or char_length(p_endpoint) > 1024 then
    return jsonb_build_object('r', 'bad');
  end if;
  return jsonb_build_object('r', 'ok',
    'on', p_endpoint is not null and exists (select 1 from private.push_subscriptions s
                                              where s.endpoint = p_endpoint and s.user_id = p_user_id and s.status = 'active'),
    'devices', (select count(*) from private.push_subscriptions s where s.user_id = p_user_id and s.status = 'active'));
end;
$$;
revoke all on function public.push_state(text, uuid, text) from public;
grant execute on function public.push_state(text, uuid, text) to anon, authenticated;

-- "Send me a test": the caller's active subscriptions and a send to report
-- on. 5 an hour per account. {r: ok, send_id, targets} or r: unavailable,
-- bad, none (nothing on), limit.
create or replace function public.push_test_targets(p_key text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_targets jsonb;
  v_send uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_user_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push_test:' || p_user_id::text, 0));
  v_targets := private.push_targets_of(p_user_id);
  if jsonb_array_length(v_targets) = 0 then
    return jsonb_build_object('r', 'none');
  end if;
  if (select count(*) from private.push_sends x
       where x.user_id = p_user_id and x.kind = 'test' and x.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('r', 'limit');
  end if;
  insert into private.push_sends (kind, user_id, targets) values ('test', p_user_id, jsonb_array_length(v_targets))
  returning id into v_send;
  return jsonb_build_object('r', 'ok', 'send_id', v_send, 'targets', v_targets);
end;
$$;
revoke all on function public.push_test_targets(text, uuid) from public;
grant execute on function public.push_test_targets(text, uuid) to anon, authenticated;

-- ── 4. Sending a notification ─────────────────────────────

-- For /api/push/dispatch: one notification, claimed for sending (once), with
-- its account's active subscriptions. {r: ok, send_id, notification {id,
-- type, title, message, url}, targets [{id, endpoint, p256dh, auth}]}, or r:
-- unavailable, bad, gone (no such notification), old (made over a day ago),
-- none (nobody to send it to), sent (already sent).
create or replace function public.push_targets(p_key text, p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n public.notifications;
  v_targets jsonb;
  v_send uuid;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_notification_id is null then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_n from public.notifications n where n.id = p_notification_id;
  if not found then
    return jsonb_build_object('r', 'gone');
  end if;
  if v_n.created_at < now() - interval '1 day' then
    return jsonb_build_object('r', 'old');
  end if;
  v_targets := private.push_targets_of(v_n.user_id);
  if v_n.user_id is null or jsonb_array_length(v_targets) = 0 then
    return jsonb_build_object('r', 'none');
  end if;
  insert into private.push_sends (kind, notification_id, user_id, targets)
  values ('notification', v_n.id, v_n.user_id, jsonb_array_length(v_targets))
  on conflict (notification_id) where notification_id is not null do nothing
  returning id into v_send;
  if v_send is null then
    return jsonb_build_object('r', 'sent');
  end if;
  return jsonb_build_object('r', 'ok', 'send_id', v_send,
    'notification', jsonb_build_object('id', v_n.id, 'type', v_n.type, 'title', left(v_n.title, 120), 'message', left(v_n.message, 400),
                                       'url', private.push_url(v_n.type, v_n.metadata)),
    'targets', v_targets);
end;
$$;
revoke all on function public.push_targets(text, uuid) from public;
grant execute on function public.push_targets(text, uuid) to anon, authenticated;

-- What a send came to, per subscription: ok (last_ok_at, failures back to
-- 0), gone (the push service said 404 or 410: status gone, expired) or
-- failed (one more failure; the 8th in a row: gone, failing). Only that
-- send's account's subscriptions; a send is reported once. p_results: [{id,
-- result}]. {r: ok, sent, gone, failed}, or r: unavailable, bad, done.
create or replace function public.push_report(p_key text, p_send_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.push_sends;
  v_ok integer := 0;
  v_gone integer := 0;
  v_failed integer := 0;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('r', 'unavailable');
  end if;
  if p_send_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 50 then
    return jsonb_build_object('r', 'bad');
  end if;
  select * into v_send from private.push_sends x where x.id = p_send_id for update;
  if not found then
    return jsonb_build_object('r', 'bad');
  end if;
  if v_send.reported_at is not null then
    return jsonb_build_object('r', 'done');
  end if;
  with res as (
    select distinct on (s.id) s.id, e.value ->> 'result' as result
      from jsonb_array_elements(p_results) e
      join private.push_subscriptions s
        on s.id = case when jsonb_typeof(e.value) = 'object' and (e.value ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (e.value ->> 'id')::uuid end
     where s.user_id = v_send.user_id and e.value ->> 'result' in ('ok', 'gone', 'failed')
  ), done as (
    update private.push_subscriptions s
       set last_ok_at = case when r.result = 'ok' then now() else s.last_ok_at end,
           fail_count = case when r.result = 'ok' then 0 when r.result = 'failed' then s.fail_count + 1 else s.fail_count end,
           last_fail_at = case when r.result = 'failed' then now() else s.last_fail_at end,
           status = case when s.status = 'active' and (r.result = 'gone' or (r.result = 'failed' and s.fail_count + 1 >= 8)) then 'gone' else s.status end,
           gone_reason = case when s.status = 'active' and r.result = 'gone' then 'expired'
                              when s.status = 'active' and r.result = 'failed' and s.fail_count + 1 >= 8 then 'failing'
                              else s.gone_reason end,
           gone_at = case when s.status = 'active' and (r.result = 'gone' or (r.result = 'failed' and s.fail_count + 1 >= 8)) then now() else s.gone_at end
      from res r
     where s.id = r.id
    returning r.result
  )
  select count(*) filter (where d.result = 'ok'), count(*) filter (where d.result = 'gone'), count(*) filter (where d.result = 'failed')
    into v_ok, v_gone, v_failed
    from done d;
  update private.push_sends x set sent = v_ok, gone = v_gone, failed = v_failed, reported_at = now() where x.id = p_send_id;
  return jsonb_build_object('r', 'ok', 'sent', v_ok, 'gone', v_gone, 'failed', v_failed);
end;
$$;
revoke all on function public.push_report(text, uuid, jsonb) from public;
grant execute on function public.push_report(text, uuid, jsonb) to anon, authenticated;

-- ── 5. Every new notification: ask the app to send it ─────

-- After a notification is made: when its account has an active subscription,
-- post {id} to the app's dispatch route (pg_net sends it once the insert
-- commits; a rolled back insert sends nothing). Never blocks or fails the
-- insert: no secret, no pg_net or any error, and the notification is made
-- as before (a warning says why nothing was sent).
create or replace function private.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url constant text := 'https://www.tapturf.in/api/push/dispatch';
  v_secret text;
begin
  begin
    if new.user_id is null
       or not exists (select 1 from private.push_subscriptions s where s.user_id = new.user_id and s.status = 'active') then
      return null;
    end if;
    v_secret := (select s.value from private.app_secrets s where s.name = 'revalidate');
    if v_secret is null then
      return null;
    end if;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidate-secret', v_secret),
      body := jsonb_build_object('id', new.id),
      timeout_milliseconds := 15000
    );
  exception when others then
    raise warning 'push: notification % not sent to phones: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.push_on_notification() from public, anon, authenticated;

create or replace trigger notifications_push
  after insert on public.notifications
  for each row
  execute function private.push_on_notification();
