-- Suggestion checker and one-click approval.
--
-- Claude's verdict lands in ai_review; the admin approves or rejects in
-- /admin/suggestions. On approve, moderate_suggestion() writes only the
-- whitelisted columns the admin ticked, so a suggestion can never touch
-- anything else on the turf row. All three functions are owner-only.

alter table public.turf_suggestions add column if not exists ai_review jsonb;
alter table public.turf_suggestions add column if not exists reviewed_at timestamptz;
alter table public.turf_suggestions add column if not exists moderated_at timestamptz;

create or replace function public.get_pending_suggestions(p_limit integer default 200, p_firebase_token text default null)
returns table (
  id uuid, turf_id uuid, turf_name text, turf_city text,
  submitter_name text, relationship text, contact_phone text, whatsapp_phone text,
  price_min integer, price_max integer, price_notes text, opening_hours text,
  sports text[], amenities text[], notes text, status text,
  created_at timestamptz, updated_at timestamptz, edit_count integer,
  ai_review jsonb, reviewed_at timestamptz,
  current jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.turf_id, t.name::text, t.city::text,
         s.submitter_name, s.relationship, s.contact_phone, s.whatsapp_phone,
         s.price_min, s.price_max, s.price_notes, s.opening_hours,
         s.sports, s.amenities, s.notes, s.status,
         s.created_at, s.updated_at, s.edit_count,
         s.ai_review, s.reviewed_at,
         jsonb_build_object(
           'owner_phone', t.owner_phone,
           'whatsapp_phone', t.whatsapp_phone,
           'landline_phone', t.landline_phone,
           'morning_price', t.morning_price,
           'afternoon_price', t.afternoon_price,
           'evening_price', t.evening_price,
           'weekend_evening_price', t.weekend_evening_price,
           'opening_hours', t.opening_hours,
           'start_time', t.start_time,
           'end_time', t.end_time,
           'is_24x7', t.is_24x7,
           'sports', coalesce(t.sports, '[]'::jsonb),
           'amenities', coalesce(t.amenities, '[]'::jsonb)
         ) as current
  from public.turf_suggestions s
  join public.turfs t on t.id = s.turf_id
  where s.status = 'pending'
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.get_pending_suggestions(integer, text) from public;
grant execute on function public.get_pending_suggestions(integer, text) to anon, authenticated;

create or replace function public.set_suggestion_review(p_id uuid, p_review jsonb, p_firebase_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.turf_suggestions set ai_review = p_review, reviewed_at = now() where id = p_id;
end;
$$;
revoke all on function public.set_suggestion_review(uuid, jsonb, text) from public;
grant execute on function public.set_suggestion_review(uuid, jsonb, text) to anon, authenticated;

-- p_apply keys (anything else is ignored): owner_phone, whatsapp_phone,
-- morning_price, afternoon_price, evening_price, weekend_evening_price,
-- opening_hours ({"daily": "..."}), sports_add (array), amenities_add (array).
create or replace function public.moderate_suggestion(p_id uuid, p_action text, p_apply jsonb default '{}'::jsonb, p_firebase_token text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turf uuid;
  v_daily text;
begin
  if not public._is_site_owner(p_firebase_token) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'bad action';
  end if;
  select turf_id into v_turf from public.turf_suggestions where id = p_id and status = 'pending';
  if v_turf is null then
    return;
  end if;

  if p_action = 'approve' then
    v_daily := p_apply->'opening_hours'->>'daily';
    update public.turfs t set
      owner_phone = coalesce(nullif(p_apply->>'owner_phone', ''), t.owner_phone),
      whatsapp_phone = coalesce(nullif(p_apply->>'whatsapp_phone', ''), t.whatsapp_phone),
      morning_price = coalesce((p_apply->>'morning_price')::numeric, t.morning_price),
      afternoon_price = coalesce((p_apply->>'afternoon_price')::numeric, t.afternoon_price),
      evening_price = coalesce((p_apply->>'evening_price')::numeric, t.evening_price),
      weekend_evening_price = coalesce((p_apply->>'weekend_evening_price')::numeric, t.weekend_evening_price),
      opening_hours = case when v_daily is not null and v_daily <> '' then jsonb_build_object('daily', v_daily) else t.opening_hours end,
      is_24x7 = case when v_daily is not null and v_daily ilike '%24 hours%' then true
                     when v_daily is not null and v_daily <> '' then false
                     else t.is_24x7 end,
      sports = case when jsonb_typeof(p_apply->'sports_add') = 'array'
                    then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                          from jsonb_array_elements_text(coalesce(t.sports, '[]'::jsonb) || (p_apply->'sports_add')) x)
                    else t.sports end,
      amenities = case when jsonb_typeof(p_apply->'amenities_add') = 'array'
                       then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                             from jsonb_array_elements_text(coalesce(t.amenities, '[]'::jsonb) || (p_apply->'amenities_add')) x)
                       else t.amenities end,
      updated_at = now()
    where t.id = v_turf;
  end if;

  update public.turf_suggestions
  set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      moderated_at = now()
  where id = p_id;
end;
$$;
revoke all on function public.moderate_suggestion(uuid, text, jsonb, text) from public;
grant execute on function public.moderate_suggestion(uuid, text, jsonb, text) to anon, authenticated;
