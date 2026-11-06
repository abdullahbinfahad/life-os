-- Safe collaboration fallback when a shared project has no admin assigned.
-- Project members may update only the project status while no admin exists.
-- An existing member may claim the vacant admin role; project-row locking
-- serializes simultaneous claims. This does not grant project-detail or member
-- management privileges to non-admins.

create index if not exists shared_project_members_project_admin_idx
  on public.shared_project_members (project_id)
  where role = 'admin';

-- Serialize every project role change/removal with status fallback checks and
-- admin claims. Re-check the caller's role only after the project lock is held.
create or replace function public.shared_set_project_member_role(
  p_project_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role text;
  v_target_role text;
  v_target_exists boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1 from public.shared_projects as p where p.id = p_project_id for update;
  if not found then
    raise exception 'Shared project not found' using errcode = '22023';
  end if;
  if not public.shared_can_manage_project(p_project_id) then
    raise exception 'Lead or admin authorization required' using errcode = '42501';
  end if;
  if p_user_id is null or p_role not in ('lead', 'admin', 'member', 'guest', 'viewer') then
    raise exception 'Invalid project membership' using errcode = '22023';
  end if;

  v_current_role := public.shared_project_role(p_project_id);
  select m.role into v_target_role
  from public.shared_project_members as m
  where m.project_id = p_project_id and m.user_id = p_user_id
  for update;
  v_target_exists := found;

  if v_current_role <> 'lead' and (p_role = 'lead' or v_target_role = 'lead') then
    raise exception 'Only a lead may manage leads' using errcode = '42501';
  end if;

  if v_target_exists then
    update public.shared_project_members
       set role = p_role
     where project_id = p_project_id and user_id = p_user_id;
  else
    insert into public.shared_project_members (project_id, user_id, role, created_by)
    values (p_project_id, p_user_id, p_role, auth.uid());
  end if;
end;
$$;

create or replace function public.shared_remove_project_member(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role text;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1 from public.shared_projects as p where p.id = p_project_id for update;
  if not found then
    raise exception 'Shared project not found' using errcode = '22023';
  end if;

  select m.role into v_target_role
  from public.shared_project_members as m
  where m.project_id = p_project_id and m.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Project membership not found' using errcode = '22023';
  end if;

  if p_user_id is distinct from auth.uid() then
    if not public.shared_can_manage_project(p_project_id) then
      raise exception 'Lead or admin authorization required' using errcode = '42501';
    end if;
    v_current_role := public.shared_project_role(p_project_id);
    if v_current_role <> 'lead' and v_target_role = 'lead' then
      raise exception 'Only a lead may remove a lead' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1 from public.shared_project_members as m
    where m.project_id = p_project_id and m.user_id <> p_user_id
  ) then
    raise exception 'A shared project must retain at least one member' using errcode = '23514';
  end if;
  delete from public.shared_project_members
  where project_id = p_project_id and user_id = p_user_id;
end;
$$;

create or replace function public.shared_update_project_status(
  p_project_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_current_status text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('planning', 'active', 'on-hold', 'done') then
    raise exception 'Invalid project status' using errcode = '22023';
  end if;

  select p.status into v_current_status
  from public.shared_projects as p
  where p.id = p_project_id
  for update;
  if not found then
    raise exception 'Shared project not found' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.shared_project_members as m
  where m.project_id = p_project_id and m.user_id = v_actor_id;
  if not found then
    raise exception 'Only a current project member may change project status' using errcode = '42501';
  end if;

  if v_role = 'member' then
    if exists (
      select 1 from public.shared_project_members as m
      where m.project_id = p_project_id and m.role = 'admin'
    ) then
      raise exception 'A project admin is assigned; ask an admin to change project status' using errcode = '42501';
    end if;
  elsif v_role not in ('lead', 'admin') then
    raise exception 'Only project members may change status when no admin is assigned' using errcode = '42501';
  end if;

  if v_current_status is distinct from p_status then
    update public.shared_projects
       set status = p_status
     where id = p_project_id;
  end if;
end;
$$;

create or replace function public.shared_claim_project_admin(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- A project-row lock ensures only one member can claim an empty admin slot at a time.
  perform 1 from public.shared_projects as p where p.id = p_project_id for update;
  if not found then
    raise exception 'Shared project not found' using errcode = '22023';
  end if;

  select m.role into v_role
  from public.shared_project_members as m
  where m.project_id = p_project_id and m.user_id = v_actor_id
  for update;
  if not found or v_role <> 'member' then
    raise exception 'Only a current project member can claim admin; guests and viewers cannot' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shared_project_members as m
    where m.project_id = p_project_id and m.role = 'admin'
  ) then
    raise exception 'A project admin is already assigned. Refresh before retrying' using errcode = '42501';
  end if;

  update public.shared_project_members
     set role = 'admin'
   where project_id = p_project_id and user_id = v_actor_id;
end;
$$;

revoke all on function public.shared_update_project_status(uuid, text) from public, anon, authenticated;
revoke all on function public.shared_claim_project_admin(uuid) from public, anon, authenticated;
revoke all on function public.shared_set_project_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.shared_remove_project_member(uuid, uuid) from public, anon;
grant execute on function public.shared_update_project_status(uuid, text) to authenticated;
grant execute on function public.shared_claim_project_admin(uuid) to authenticated;
grant execute on function public.shared_set_project_member_role(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
grant execute on function public.shared_remove_project_member(uuid, uuid) to authenticated;
