-- Adds the Contacts and Schedule pages (and Study Studio) to the owner menu editor's allowlist.
-- Optional: only needed if you edit the global menu in Admin. Contacts and Schedule already
-- appear for every user without it. Personal contacts stay inside each user's
-- private life_data row (owner-only RLS), so no new tables are needed.
create or replace function public.lifeos_admin_save_navigation(p_items jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_item_count integer;
begin
  if not public.lifeos_is_owner_admin() then
    raise insufficient_privilege using message = 'Owner authorization required';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'p_items must be a JSON array';
  end if;

  v_item_count := pg_catalog.jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 20 then
    raise exception using
      errcode = '22023',
      message = 'p_items must contain between 1 and 20 entries';
  end if;
  if pg_catalog.octet_length(p_items::text) > 16384 then
    raise exception using
      errcode = '22023',
      message = 'p_items exceeds the 16 KiB serialized menu limit';
  end if;

  -- Each item has exactly the four documented safe fields. Strict internal
  -- routes, a finite icon list, and control-character rejection prevent this
  -- globally readable document from becoming an external-link or script sink.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as e(item)
    where pg_catalog.jsonb_typeof(e.item) <> 'object'
      or not (e.item ? 'label' and e.item ? 'to' and e.item ? 'icon' and e.item ? 'visible')
      or (e.item - 'label' - 'to' - 'icon' - 'visible') <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(e.item -> 'label') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(e.item ->> 'label')) not between 1 and 80
      or (e.item ->> 'label') ~ '[[:cntrl:]]'
      or pg_catalog.jsonb_typeof(e.item -> 'to') <> 'string'
      or (e.item ->> 'to') not in (
        '/', '/today', '/library', '/goals', '/projects', '/calendar',
        '/habits', '/insights', '/journal', '/albums', '/public', '/settings', '/productivity', '/notifications',
        '/study', '/contacts', '/schedule'
      )
      or pg_catalog.jsonb_typeof(e.item -> 'icon') <> 'string'
      or (e.item ->> 'icon') not in (
        'layout-dashboard', 'sunrise', 'library', 'target', 'folder-kanban',
        'calendar-days', 'repeat', 'bar-chart-3', 'book-open', 'images',
        'globe-2', 'settings', 'timer', 'bell', 'graduation-cap', 'contact-round', 'calendar-clock'
      )
      or pg_catalog.jsonb_typeof(e.item -> 'visible') <> 'boolean'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Each navigation item must be a safe label, fixed internal path, allowed icon, and boolean visibility flag';
  end if;

  insert into public.lifeos_menu_config as c (key, value, updated_at)
  values (
    'navigation',
    pg_catalog.jsonb_build_object('items', p_items),
    pg_catalog.clock_timestamp()
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at
  returning updated_at into v_updated_at;

  -- Do not place labels, routes, or any user data in this global-change audit.
  insert into public.lifeos_admin_audit (actor_id, target_user_id, action, metadata)
  values (
    auth.uid(),
    null,
    'navigation-update',
    pg_catalog.jsonb_build_object('item_count', v_item_count)
  );

  return v_updated_at;
end;
$$;
revoke all on function public.lifeos_admin_save_navigation(jsonb) from public, anon;
grant execute on function public.lifeos_admin_save_navigation(jsonb) to authenticated;
