-- Keep private productivity/focus records outside the verified-owner cross-account
-- console. Personal focus, distraction and reward history remain in the user's
-- ordinary account snapshot and can still be exported by that same user.
-- Additive: only replaces two already-existing owner-admin RPC bodies.

create or replace function public.lifeos_admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_has_snapshot boolean;
begin
  if not public.lifeos_is_owner_admin() then
    raise insufficient_privilege using message = 'Owner authorization required';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'p_user_id is required';
  end if;

  select pg_catalog.jsonb_build_object(
    'account', pg_catalog.jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'phone', u.phone,
      'display_name', pg_catalog.left(pg_catalog.coalesce(
        pg_catalog.nullif(u.raw_user_meta_data ->> 'full_name', ''),
        pg_catalog.nullif(u.raw_user_meta_data ->> 'name', ''),
        pg_catalog.nullif(u.raw_user_meta_data ->> 'display_name', ''),
        u.email, u.phone, 'Unnamed account'
      ), 120),
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed', (u.email_confirmed_at is not null)
    ),
    'life_data', case when d.user_id is null then null else pg_catalog.jsonb_build_object(
      'data', d.data - array['focusSessions', 'rewardEvents']::text[],
      'updated_at', d.updated_at
    ) end
  ), (d.user_id is not null)
  into v_result, v_has_snapshot
  from auth.users as u
  left join public.life_data as d on d.user_id = u.id
  where u.id = p_user_id;

  if not found then raise no_data_found using message = 'Account not found'; end if;

  insert into public.lifeos_admin_audit (actor_id, target_user_id, action, metadata)
  values (auth.uid(), p_user_id, 'user-view', pg_catalog.jsonb_build_object('has_snapshot', v_has_snapshot));
  return v_result;
end;
$$;

revoke all on function public.lifeos_admin_get_user(uuid) from public, anon;
grant execute on function public.lifeos_admin_get_user(uuid) to authenticated;

create or replace function public.lifeos_admin_update_user_snapshot(
  p_user_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_data_bytes integer;
begin
  if not public.lifeos_is_owner_admin() then
    raise insufficient_privilege using message = 'Owner authorization required';
  end if;
  if p_user_id is null then raise exception using errcode = '22023', message = 'p_user_id is required'; end if;
  if p_expected_updated_at is null then raise exception using errcode = '22023', message = 'p_expected_updated_at is required'; end if;
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'p_data must be a JSON object';
  end if;

  v_data_bytes := pg_catalog.octet_length(p_data::text);
  if v_data_bytes > 1048576 then
    raise exception using errcode = '22023', message = 'p_data exceeds the 1 MiB serialized snapshot limit';
  end if;

  -- Admin edits only apply to the fields visible in the admin editor. Preserve
  -- the selected user's private productivity records byte-for-byte from the
  -- current row, even if the admin client submits keys with those names.
  update public.life_data as d
  set data = (p_data - array['focusSessions', 'rewardEvents']::text[])
             || case when d.data ? 'focusSessions' then pg_catalog.jsonb_build_object('focusSessions', d.data -> 'focusSessions') else '{}'::jsonb end
             || case when d.data ? 'rewardEvents' then pg_catalog.jsonb_build_object('rewardEvents', d.data -> 'rewardEvents') else '{}'::jsonb end,
      updated_at = pg_catalog.clock_timestamp()
  where d.user_id = p_user_id and d.updated_at = p_expected_updated_at
  returning d.updated_at into v_updated_at;

  if not found then
    perform 1 from public.life_data as d where d.user_id = p_user_id;
    if found then raise exception using errcode = '40001', message = 'Snapshot has changed; reload before saving'; end if;
    raise no_data_found using message = 'Snapshot not found; admin updates never create snapshots';
  end if;

  insert into public.lifeos_admin_audit (actor_id, target_user_id, action, metadata)
  values (auth.uid(), p_user_id, 'snapshot-update', pg_catalog.jsonb_build_object(
    'data_md5', pg_catalog.md5((p_data - array['focusSessions', 'rewardEvents']::text[])::text),
    'data_bytes', v_data_bytes,
    'private_productivity_preserved', true
  ));
  return v_updated_at;
end;
$$;

revoke all on function public.lifeos_admin_update_user_snapshot(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.lifeos_admin_update_user_snapshot(uuid, jsonb, timestamptz) to authenticated;
