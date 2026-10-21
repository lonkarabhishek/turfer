-- Phone identity must be an Indian number, compared in full.
--
-- _is_site_owner and _caller_key compared only the last 10 digits of the
-- phone Firebase verified. A foreign number whose last 10 digits match an
-- Indian one (+1 940 ... is a real US number) passed as that Indian user:
-- as the site owner for /admin, or as a turf owner in the owner portal.
-- Now the verified number must be +91 followed by 10 digits, and the owner
-- check compares the whole number. The owner's email path also requires a
-- Google identity on the token, since the app signs in by email only
-- through Google.

create or replace function public._is_site_owner(p_firebase_token text default null)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_phone text;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) = 'lonkarabhishek00@gmail.com'
     and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google' then
    return true;
  end if;
  if p_firebase_token is null or length(p_firebase_token) < 100
     or not exists (select 1 from pg_extension where extname = 'http') then
    return false;
  end if;
  begin
    execute $q$
      select r.content::jsonb #>> '{users,0,phoneNumber}'
      from extensions.http_post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY',
        json_build_object('idToken', $1)::text,
        'application/json'
      ) r
      where r.status = 200
    $q$ into v_phone using p_firebase_token;
  exception when others then
    return false;
  end;
  return coalesce(v_phone, '') = '+919403612979';
end;
$function$;

create or replace function public._caller_key(p_token text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_phone text;
begin
  if v_email <> '' then
    return 'e:' || v_email;
  end if;
  if p_token is null or length(p_token) < 100
     or not exists (select 1 from pg_extension where extname = 'http') then
    return null;
  end if;
  begin
    execute $q$
      select r.content::jsonb #>> '{users,0,phoneNumber}'
      from extensions.http_post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY',
        json_build_object('idToken', $1)::text,
        'application/json'
      ) r
      where r.status = 200
    $q$ into v_phone using p_token;
  exception when others then
    return null;
  end;
  if v_phone is null or v_phone !~ '^\+91[0-9]{10}$' then
    return null;
  end if;
  v_phone := public._phone10(v_phone);
  return case when v_phone is null then null else 'p:' || v_phone end;
end;
$function$;
