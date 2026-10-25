-- Ask TapTurf on blog posts: a store for drawings, and daily caps on the
-- paid extras.
--
-- A drawing (lib/ai/blogArt.ts) is one Claude Opus call, many times the
-- cost of an answer, and the answers that point at a drawing are cached
-- and shared. Until now each server instance kept its own memory of what
-- it had drawn or failed to draw, so a brief that failed was drawn again
-- on every instance, every few minutes, for as long as anyone opened it.
-- This keeps that memory in one place for every instance:
--
-- 1. private.ask_art: one row per drawing (p_art, a sha-256 of the
--    article and the brief, made by the app). A drawing is made once and
--    kept. A failed one is tried at most twice, and not again within 6
--    hours of a failure. While one request draws it (for 90 seconds at
--    most: the art route stops at 60), the others are told it is busy
--    and the chat asks again shortly.
-- 2. private.ask_ai_uses: how many of each paid extra were used today
--    (the Asia/Kolkata date). 'art' is the Opus drawings, at most 200 a
--    day; 'web' is the answers that search the web, at most 1500 a day.
--    The caps are the constants in private.ask_ai_count.
-- 3. public.ask_ai_take (server key only): counts one use of an extra and
--    says whether it is allowed. /api/ask calls it before a web search.
-- 4. public.ask_art_claim (server key only): the stored drawing, or busy,
--    failed, capped, or go (this request draws it; that takes one from
--    today's 'art' count and the network's share). public.ask_art_done
--    stores what came of a go; public.ask_art_release gives the try back
--    when the model never drew anything.
--
-- The functions check the server key (private.account_key_ok, env
-- ACCOUNT_KEY), so a visitor can't read the store, use up the caps or
-- write a drawing. To draw every brief again (a new prompt or model),
-- the app bumps ART_VERSION, which is part of p_art.
--
-- Additive: three tables in the private schema and new functions. Written
-- without the destructive SQL keywords. Safe to run again.

create table if not exists private.ask_art (
  -- sha-256 hex of the version, slug and brief (lib/ai/blogArt.ts artKey).
  art text primary key,
  slug text not null,
  -- idle (never drawn), drawing, ok or failed. No CHECK: the functions
  -- here are the only writers.
  status text not null default 'idle',
  -- The sanitised drawing, when ok.
  svg text,
  -- Opus calls started for it, including one in progress.
  tries integer not null default 0,
  claimed_at timestamptz,
  failed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.ask_art from public, anon, authenticated;

create table if not exists private.ask_ai_uses (
  day date not null,
  kind text not null,
  n integer not null default 0,
  primary key (day, kind)
);
revoke all on private.ask_ai_uses from public, anon, authenticated;

-- Drawings started today per network (a hash of the visitor's network,
-- made by the app), so one visitor can't use up everyone's drawings.
create table if not exists private.ask_ai_uses_net (
  day date not null,
  kind text not null,
  net text not null,
  n integer not null default 0,
  primary key (day, kind, net)
);
revoke all on private.ask_ai_uses_net from public, anon, authenticated;

-- One use of p_kind today, when today's cap allows it. The row lock the
-- upsert takes makes two requests at once count one after the other, so
-- the cap is never passed.
create or replace function private.ask_ai_count(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap constant integer := case p_kind when 'web' then 1500 when 'art' then 200 end;
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_cap is null then
    return false;
  end if;
  insert into private.ask_ai_uses as u (day, kind, n) values (v_day, p_kind, 1)
  on conflict (day, kind) do update set n = u.n + 1 where u.n < v_cap;
  -- Nothing written: the cap was already reached.
  return found;
end;
$$;

create or replace function public.ask_ai_take(p_key text, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return false;
  end if;
  return private.ask_ai_count(p_kind);
end;
$$;

-- What to do about one drawing. ok (with the svg): it is drawn. busy:
-- another request is drawing it right now. failed: two tries used, or
-- the last one failed under 6 hours ago. capped: today's drawings are
-- used up, or this network's share of them (20 a day). go: this request
-- draws it, and must call ask_art_done (or ask_art_release when the
-- model never drew anything).
-- A claim older than 90 seconds that never finished (the request died,
-- or the model was overloaded) is not a recorded failure: the next
-- request may try again, if a try is left.
create or replace function public.ask_art_claim(p_key text, p_art text, p_slug text, p_net text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.ask_art%rowtype;
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not private.account_key_ok(p_key) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_art is null or p_art !~ '^[0-9a-f]{64}$' or p_slug is null or p_slug !~ '^[a-z0-9-]{1,120}$'
     or (p_net is not null and p_net !~ '^[0-9a-f]{16,64}$') then
    return jsonb_build_object('error', 'bad_input');
  end if;
  -- The row first, then its lock: two requests for a new drawing at once
  -- wait for each other here, and only one of them gets go.
  insert into private.ask_art (art, slug) values (p_art, p_slug) on conflict (art) do nothing;
  select * into r from private.ask_art a where a.art = p_art for update;
  if r.status = 'ok' and r.svg is not null then
    return jsonb_build_object('status', 'ok', 'svg', r.svg);
  end if;
  if r.status = 'drawing' and r.claimed_at > now() - interval '90 seconds' then
    return jsonb_build_object('status', 'busy');
  end if;
  if r.tries >= 2 or (r.status = 'failed' and r.failed_at > now() - interval '6 hours') then
    return jsonb_build_object('status', 'failed');
  end if;
  -- This network's share first, then everyone's.
  if p_net is not null then
    insert into private.ask_ai_uses_net as u (day, kind, net, n) values (v_day, 'art', p_net, 1)
    on conflict (day, kind, net) do update set n = u.n + 1 where u.n < 20;
    if not found then
      return jsonb_build_object('status', 'capped');
    end if;
  end if;
  if not private.ask_ai_count('art') then
    return jsonb_build_object('status', 'capped');
  end if;
  update private.ask_art a
     set status = 'drawing', claimed_at = now(), tries = a.tries + 1, slug = p_slug
   where a.art = p_art;
  return jsonb_build_object('status', 'go');
end;
$$;

-- What came of a go: the sanitised drawing, or null when it failed. A
-- drawing too long to be one of ours counts as a failure. A failure
-- never overwrites a drawing that is already there (two requests can
-- draw the same one only after a claim lapsed). True when stored.
create or replace function public.ask_art_done(p_key text, p_art text, p_svg text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.account_key_ok(p_key) then
    return false;
  end if;
  if p_svg is not null and length(p_svg) between 1 and 200000 then
    update private.ask_art a set status = 'ok', svg = p_svg, done_at = now()
     where a.art = p_art and a.status <> 'ok';
  else
    update private.ask_art a set status = 'failed', failed_at = now(), done_at = now()
     where a.art = p_art and a.status = 'drawing';
  end if;
  return found;
end;
$$;

-- A go where the model never drew anything (rate limited, overloaded,
-- unreachable, or our own account or request at fault): the try and the
-- day's count are given back, so a bad hour on the API side doesn't use
-- up a drawing's two tries. True when there was a claim to give back.
create or replace function public.ask_art_release(p_key text, p_art text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day constant date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not private.account_key_ok(p_key) then
    return false;
  end if;
  update private.ask_art a set status = 'idle', tries = greatest(a.tries - 1, 0), claimed_at = null
   where a.art = p_art and a.status = 'drawing';
  if not found then
    return false;
  end if;
  update private.ask_ai_uses u set n = greatest(u.n - 1, 0) where u.day = v_day and u.kind = 'art';
  return true;
end;
$$;

revoke all on function private.ask_ai_count(text) from public, anon, authenticated;
revoke all on function public.ask_ai_take(text, text) from public;
revoke all on function public.ask_art_claim(text, text, text, text) from public;
revoke all on function public.ask_art_release(text, text) from public;
revoke all on function public.ask_art_done(text, text, text) from public;
grant execute on function public.ask_ai_take(text, text) to anon, authenticated;
grant execute on function public.ask_art_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.ask_art_release(text, text) to anon, authenticated;
grant execute on function public.ask_art_done(text, text, text) to anon, authenticated;
