-- Turf claims, clearer for owners and for the admin (the site owner, 5 Nov
-- 2026: players were claiming turfs to book them). Two new functions for
-- the admin, closed to everyone else by _is_site_owner, as admin_owner_claims is:
--
-- 1. admin_owner_claim_signals: for each waiting claim (status pending, the
--    newest 200, as admin_owner_claims lists them), the counts the admin's
--    "Looks like a player" line is worked out from (lib/admin/claimSignals.ts):
--    games the claimant's account created (anywhere, and at this turf), join
--    requests it sent, and from its sign-up context (public.user_signup_context,
--    saved once at sign-up) whether it tapped Call or WhatsApp before signing
--    up and how many turf pages it opened. Each row is keyed by the claim's
--    turf_id and user_key, the sign-in key ('p:' and a mobile, or 'e:' and
--    an email) that admin_owner_claims already gives the site owner, so the
--    route can match the two; otherwise counts and yes or no only: no name,
--    note or other contact leaves here. The account is the claim's user_id,
--    else the one its sign-in opens (private.account_for_key), as in
--    admin_owner_claims.
-- 2. admin_answer_owner_claim: the admin's decision, made by the unchanged
--    admin_decide_owner_claim first (its own site-owner check runs before it
--    reads or locks anything, so a phone sign-in's token goes to Google once
--    per decision and no claim row is held while it does), and when it took
--    a waiting claim to active
--    (approved) or rejected, one in-app notification to the claimant's
--    account in public.notifications, as the games functions make them
--    (type owner_claim_approved or owner_claim_rejected; title and message
--    from the admin route, lib/my/claimNotice.ts; metadata the turf's id and
--    slug, which the Alerts list links to). Revoking, restoring and closing a
--    revoked claim tell nobody anything, and deciding the same claim twice
--    sends one. Never an email or an SMS. The notifications_push trigger
--    already on public.notifications sends it to the claimant's phone where
--    they turned that on, as for every other notification.
--
-- Replaced: none. Who gets in at once (by number match or code),
-- turf_owners statuses, the 5-pending limit and the Claimed badge are as
-- before. Functions these call or sit beside, unchanged, each read from
-- production on 5 Nov 2026 (md5 of prosrc) and equal to its latest
-- definition in this folder:
--   public.admin_decide_owner_claim  a184babc6c2c445ecfb22d61e841ba41  (20261025_claims_account.sql)
--   public.admin_owner_claims        3824ae2c968c0c272d38530794280ef5  (20261028_owner_call_number.sql)
--   public.owner_phone_listed        a4872187e632980f2c3fd20d6ee60917  (20261026_account_links_reads.sql)
--   public.owner_claim (5 args)      444cb9652a317ff37d6a071f54342b44  (20261026_account_links_reads.sql)
--   public.owner_claim_info          5cb215b08dab4ce7b1fcf52bf6d4d046  (20261025_claims_account.sql)
--   public._is_site_owner            eda7841c5bd3105af03645721c0fc82c  (20261025_claims_account.sql)
--   private.account_for_key          a37bb5437bca089d3ed548a6b147fe54  (20261026_account_links.sql)
-- The turf's number a claimant gives on a listing with no mobile goes
-- through owner_phone_listed, which keeps it in private.claim_phone_checks
-- for the admin's "Number they gave": no new table.
--
-- Additive: two new functions and their grants. Written without the
-- destructive SQL keywords; nothing is removed or rewritten. Safe to run
-- again. The app works before this is applied (the route falls back to
-- admin_decide_owner_claim, and the cards show no player line).

set local lock_timeout = '5s';

-- ── 1. What points to a player, per waiting claim ─────────

create or replace function public.admin_owner_claim_signals(p_firebase_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'turf_id', c.turf_id,
             'user_key', c.user_key,
             'games', (select count(*) from public.games g where c.uid is not null and g.creator_id = c.uid),
             'games_here', (select count(*) from public.games g where c.uid is not null and g.creator_id = c.uid and g.turf_id = c.turf_id),
             'requests', (select count(*) from public.game_requests r where c.uid is not null and r.user_id = c.uid),
             -- Not recorded (no sign-up context, or none of it given): null, never false.
             'pre_contact_tap', case when jsonb_typeof(sc.ctx -> 'funnel') = 'object'
                                     then (sc.ctx -> 'funnel' ->> 'contact_click') is not null end,
             'pre_turfs_opened', case when jsonb_typeof(sc.ctx -> 'interest' -> 'turfs_opened') = 'number'
                                      then least(greatest(round((sc.ctx -> 'interest' ->> 'turfs_opened')::numeric), 0), 100000)::int end
           ) order by c.created_at desc)
      from (select o.turf_id, o.user_key, o.created_at, coalesce(o.user_id, private.account_for_key(o.user_key)) as uid
              from public.turf_owners o
             where o.status = 'pending'
             order by o.created_at desc
             limit 200) c
      left join public.user_signup_context sc on c.uid is not null and sc.user_id = c.uid
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_owner_claim_signals(text) from public;
grant execute on function public.admin_owner_claim_signals(text) to anon, authenticated;

-- ── 2. A decision, and the claimant told in the app ───────

create or replace function public.admin_answer_owner_claim(p_firebase_token text, p_turf_id uuid, p_user_key text, p_status text, p_title text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_uid uuid;
  v_out jsonb;
  v_sent integer := 0;
begin
  -- The decision, with its own site-owner check first: anyone else gets {error: forbidden}
  -- before any row is read or locked.
  v_out := public.admin_decide_owner_claim(p_firebase_token, p_turf_id, p_user_key, p_status);
  if coalesce(v_out ->> 'ok', '') = 'true' and p_status in ('active', 'rejected') then
    -- What the claim was before: the event admin_decide_owner_claim just logged. It holds the claim
    -- row (for update) until this transaction ends, so no other decision on it comes between.
    select e.from_status into v_prev
      from private.turf_owner_events e
     where e.turf_id = p_turf_id and e.user_key = p_user_key and e.how = 'admin' and e.to_status = p_status
     order by e.id desc
     limit 1;
    select coalesce(o.user_id, private.account_for_key(o.user_key)) into v_uid
      from public.turf_owners o
     where o.turf_id = p_turf_id and o.user_key = p_user_key;
  end if;
  if v_prev = 'pending'
     and nullif(btrim(coalesce(p_title, '')), '') is not null
     and nullif(btrim(coalesce(p_message, '')), '') is not null
     and v_uid is not null and exists (select 1 from public.users u where u.id = v_uid) then
    insert into public.notifications (user_id, type, title, message, metadata, is_read)
    select v_uid,
           case when p_status = 'active' then 'owner_claim_approved' else 'owner_claim_rejected' end,
           left(btrim(p_title), 120),
           left(btrim(p_message), 400),
           jsonb_build_object('turfId', t.id, 'slug', t.slug),
           false
      from public.turfs t
     where t.id = p_turf_id;
    get diagnostics v_sent = row_count;
  end if;
  return v_out || jsonb_build_object('notified', v_sent > 0);
end;
$$;
revoke all on function public.admin_answer_owner_claim(text, uuid, text, text, text, text) from public;
grant execute on function public.admin_answer_owner_claim(text, uuid, text, text, text, text) to anon, authenticated;
