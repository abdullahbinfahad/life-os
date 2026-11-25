-- Life OS — fix for the Admin account directory error 42804
-- ("structure of query does not match function result type").
-- Supabase stores auth.users.email as varchar(255) while the function declares
-- text; every returned column is now cast to its declared type.
-- Safe to re-run. Changes only this one function; no data is touched.

create or replace function public.lifeos_admin_list_users(
  p_limit integer default 25,
  p_offset integer default 0,
  p_query text default null
)
returns table (
  user_id uuid,
  email text,
  phone text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  snapshot_updated_at timestamptz,
  has_snapshot boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
begin
  if not public.lifeos_is_owner_admin() then
    raise insufficient_privilege using message = 'Owner authorization required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'p_limit must be between 1 and 100';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception using
      errcode = '22023',
      message = 'p_offset must be between 0 and 1000000';
  end if;
  if pg_catalog.char_length(v_query) > 200 then
    raise exception using
      errcode = '22023',
      message = 'p_query must be at most 200 characters';
  end if;

  insert into public.lifeos_admin_audit (actor_id, target_user_id, action, metadata)
  values (
    auth.uid(),
    null,
    'user-list',
    pg_catalog.jsonb_build_object('limit', p_limit, 'offset', p_offset)
  );

  return query
  select
    u.id::uuid,
    u.email::text,
    u.phone::text,
    pg_catalog.left(
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(u.raw_user_meta_data ->> 'display_name', ''),
        u.email::text,
        u.phone::text,
        'Unnamed account'
      ),
      120
    )::text as display_name,
    u.created_at::timestamptz,
    u.last_sign_in_at::timestamptz,
    (u.email_confirmed_at is not null)::boolean as email_confirmed,
    d.updated_at::timestamptz,
    (d.user_id is not null)::boolean as has_snapshot
  from auth.users as u
  left join public.life_data as d on d.user_id = u.id
  where v_query = ''
    or pg_catalog.strpos(pg_catalog.lower(coalesce(u.email, '')), v_query) > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(u.phone, '')), v_query) > 0
    or pg_catalog.strpos(
      pg_catalog.lower(coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        nullif(u.raw_user_meta_data ->> 'display_name', ''),
        u.email,
        u.phone,
        'Unnamed account'
      )),
      v_query
    ) > 0
  order by u.created_at desc nulls last, u.id asc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.lifeos_admin_list_users(integer, integer, text) from public, anon;
grant execute on function public.lifeos_admin_list_users(integer, integer, text) to authenticated;

-- Read-only catalog verification; this returns the resolved function signature.
select pg_catalog.to_regprocedure('public.lifeos_admin_list_users(integer,integer,text)')
  as installed_function;

notify pgrst, 'reload schema';

-- Check: should show "installed". (Calling the function here would be refused,
-- because the SQL Editor is not signed in as your Life OS owner account.)
select case when pg_catalog.to_regprocedure('public.lifeos_admin_list_users(integer,integer,text)') is null
            then 'MISSING' else 'installed' end as lifeos_admin_list_users;
