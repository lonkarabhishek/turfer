-- Live links close after 2 hours without an update.
--
-- Until now a live link took writes for 36 hours from its first one, and
-- a match nobody finished stayed "live" until the hourly job cleared it
-- 30 days after its last update. The site owner's rule (29 Oct): a link
-- whose last accepted update is 2 hours old or more is closed. No more
-- updates are accepted, live or finished alike; followers keep seeing the
-- last score, marked "Stopped updating at 7:41 pm", and a finished match
-- keeps its result; the scorer can turn on a new link.
--
-- live_match_put answers a write to a closed link with 'gone' and
-- 'idle': true ({"r": "gone", "idle": true}) and changes nothing. The
-- scorer's browser stops sending on 'gone' (an app from before this file
-- reads it as a plain 'gone' and turns the link off); with idle it says
-- the link closed after 2 hours and keeps its secret, so the scorer can
-- still turn it off. The match is kept, not cleared: the hourly job
-- still clears it 30 days after its last update, as before.
--
-- Closed is worked out on read, from updated_at, and never stored:
-- * the status check (live, done, stopped, expired) stays as it is, so
--   no constraint changes and every reader of status reads what it did;
-- * the hourly job 'live-matches-expire' is unchanged: a link closes
--   without a write of its own, to the second, where an hourly job would
--   leave up to an hour in which writes were still taken;
-- * the app reads it the same way, from the updated_at followers are
--   already served (LIVE_IDLE_CLOSE_MS in lib/live/types.ts: keep the two
--   at 2 hours together).
-- updated_at moves only on an accepted write, or on a stop, which makes
-- the link stopped anyway.
--
-- In live_match_put only the 2 hours is new: the update that takes a
-- write also needs updated_at under 2 hours old, and a refused write to a
-- closed link answers gone right after the stopped and expired check, so
-- before forbidden (as for a stopped link), stale, limit and slow. Every
-- other answer is unchanged, for every link that is not closed.
-- live_match_stop, live_match_get, live_match_get_k and the hourly job are
-- unchanged: a scorer can still turn a closed link off, which clears it.
--
-- admin_live_matches (the admin home's "Live scoreboards shared" tile)
-- counts a live link closed this way as 'closed', so "live now" counts
-- only links still taking updates. The admin list (admin_live_links)
-- already returns status and updated_at and is unchanged; the app labels
-- such a link "Closed (idle)".
--
-- Both functions are replaced with the same signature, so no overload is
-- made and their owners and grants stay. live_match_put's body is the one
-- live in production on 29 Oct (md5 of prosrc
-- deeaa98c1a3a97eab0c71ce0799ad15a, the same as 20261021_live_matches.sql)
-- with the two changes above, and admin_live_matches' the one from
-- 20261026_tool_uses.sql (99bd9503730f558ac41aa9fe426e1edf) with the
-- status case. Written without the destructive SQL keywords. Safe to run
-- again. Check: scripts/sql-tests/live_idle_close.check.mjs.
--
-- Apply it after the app deploy (and after 20261029_live_link_starts.sql,
-- which goes before it): the app from before reads gone with idle as a
-- plain gone and turns the link off on the phone, while followers still
-- see its last score and it can no longer be turned off from there.

-- Send the whole match. Returns {r, rev}; rev is set for 'ok' (the
-- stored rev) and 'stale' (the server's rev, so the scorer can go past
-- it). r is one of:
--   ok, stale (rev not newer), slow (under 500 ms since the last write),
--   forbidden (wrong secret), gone (stopped or expired; with idle true,
--   closed after 2 hours without an update), limit (link or network
--   caps), busy (the site-wide cap on new links), too_big, bad,
--   unavailable (wrong write key: the routes' env var is out of step).
-- The first send for a code creates the row. rev is capped at 2^52 so
-- the +1 of a stop or an expiry stays a safe integer in JavaScript.
create or replace function public.live_match_put(
  p_key text,
  p_code text,
  p_secret text,
  p_match jsonb,
  p_status text,
  p_rev bigint,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_rev bigint;
  v_marker boolean;
  r public.live_matches;
begin
  -- The key on its own, first: a wrong one is the server's mistake (a
  -- rotation half done), so the scorer backs off and retries instead of
  -- giving up on a request it cannot fix.
  if p_key is null
     or p_key is distinct from (select s.value from private.app_secrets s where s.name = 'live_write') then
    return jsonb_build_object('r', 'unavailable');
  end if;
  -- Every null is spelled out: a null comparison would make the whole
  -- condition null, and plpgsql treats that as false.
  if p_code is null or p_code !~ '^[a-z0-9]{12}$'
     or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
     or p_match is null or jsonb_typeof(p_match) <> 'object'
     or p_status is null or p_status not in ('live', 'done')
     or p_rev is null or p_rev <= 0 or p_rev > 4503599627370496
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('r', 'bad');
  end if;
  if octet_length(p_match::text) > 250000 then
    return jsonb_build_object('r', 'too_big');
  end if;

  v_hash := sha256(convert_to(p_secret, 'UTF8'));

  -- Twice at most: a first send that loses the insert race to another
  -- request for the same code goes round once more as an update.
  for i in 1..2 loop
    -- The usual case, one statement. Its row lock is taken only on a
    -- row whose secret matches, so a caller without the secret never
    -- holds up the scorer.
    update public.live_matches m
       set match = p_match,
           status = p_status,
           rev = p_rev,
           writes = m.writes + 1,
           updated_at = now()
     where m.code = p_code
       and m.secret_hash = v_hash
       and m.status in ('live', 'done')
       and m.rev < p_rev
       and m.updated_at <= now() - interval '500 milliseconds'
       -- Closed after 2 hours without an update (the header says why).
       and m.updated_at > now() - interval '2 hours'
       and m.writes < 4000
       and m.created_at > now() - interval '36 hours'
    returning m.rev into v_rev;
    if found then
      return jsonb_build_object('r', 'ok', 'rev', v_rev);
    end if;

    -- Refused or new: a plain read (no lock) says which.
    select * into r from public.live_matches m where m.code = p_code;
    -- A stop marker someone else left (another secret, nothing ever
    -- written) does not block the scorer: anyone who saw the link before
    -- its first send landed could otherwise kill it. The scorer's own
    -- marker (same secret) still answers 'gone' below.
    v_marker := found and r.status = 'stopped' and r.writes = 0 and r.match is null
                and not (v_hash = any(coalesce(r.stoppers, array[r.secret_hash])));
    if found and not v_marker then
      if r.status in ('stopped', 'expired') then
        return jsonb_build_object('r', 'gone');
      end if;
      -- Live or done, and closed: gone like a stopped link, whoever asks,
      -- with idle so the scorer is told why. Nothing changes.
      if r.updated_at <= now() - interval '2 hours' then
        return jsonb_build_object('r', 'gone', 'idle', true);
      end if;
      if r.secret_hash <> v_hash then
        return jsonb_build_object('r', 'forbidden');
      end if;
      if r.rev >= p_rev then
        return jsonb_build_object('r', 'stale', 'rev', r.rev);
      end if;
      if r.writes >= 4000 or r.created_at <= now() - interval '36 hours' then
        return jsonb_build_object('r', 'limit');
      end if;
      -- Too soon after the last write, or another write landed between
      -- the two statements: either way, try again shortly.
      return jsonb_build_object('r', 'slow');
    end if;

    -- A new link. Counts stop at the cap, so each is a short index scan.
    -- Per network: every link made in the window counts, whatever its
    -- status, so finishing or stopping links does not make room.
    if (select count(*) from (
          select 1 from public.live_matches m
           where m.ip_hash = p_ip_hash and m.created_at > now() - interval '24 hours'
           limit 30) x) >= 30
       or (select count(*) from (
          select 1 from public.live_matches m
           where m.ip_hash = p_ip_hash and m.created_at > now() - interval '1 hour'
           limit 8) x) >= 8 then
      return jsonb_build_object('r', 'limit');
    end if;
    -- Site-wide: its own answer, so scorers retry later instead of being
    -- told their network made too many. Stop markers (writes 0, below)
    -- are not new links: a stop must not use up everyone's budget.
    if (select count(*) from (
          select 1 from public.live_matches m
           where m.created_at > now() - interval '1 hour' and m.writes > 0
           limit 200) x) >= 200 then
      return jsonb_build_object('r', 'busy');
    end if;

    if v_marker then
      update public.live_matches m
         set secret_hash = v_hash, match = p_match, status = p_status, rev = p_rev, stoppers = null,
             writes = 1, ip_hash = p_ip_hash, created_at = now(), updated_at = now()
       where m.code = p_code and m.status = 'stopped' and m.writes = 0
         and m.stoppers is not distinct from r.stoppers;
    else
      insert into public.live_matches (code, secret_hash, match, rev, status, writes, ip_hash)
      values (p_code, v_hash, p_match, p_rev, p_status, 1, p_ip_hash)
      on conflict (code) do nothing;
    end if;
    -- found is false when the conflict skipped the insert, or the marker
    -- changed in between.
    if found then
      return jsonb_build_object('r', 'ok', 'rev', p_rev);
    end if;
  end loop;
  return jsonb_build_object('r', 'slow');
end;
$$;

-- Live scoreboard links per day (in India) and status, for the admin
-- home's tile. A live link closed after 2 hours without an update counts
-- as 'closed', not 'live'. The match itself is never read. Site owner only.
create or replace function public.admin_live_matches(p_firebase_token text default null)
returns table (day date, status text, n integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select (m.created_at at time zone 'Asia/Kolkata')::date,
         case when m.status = 'live' and m.updated_at <= now() - interval '2 hours' then 'closed' else m.status end,
         count(*)::integer
    from public.live_matches m
   group by 1, 2
   order by 1, 2;
end;
$$;
