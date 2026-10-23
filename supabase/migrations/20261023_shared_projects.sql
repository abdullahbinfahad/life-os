-- Life OS shared projects and privacy-safe collaboration foundation.
-- Additive and rerunnable: this migration does not alter life_data, public_journals,
-- or any existing owner-admin policy. Run through the normal Supabase migration flow;
-- do not run application test writes against production accounts.

-- pgcrypto supplies 256-bit invitation entropy and SHA-256 token hashing. Keeping this
-- conditional makes a fresh project and a project where pgcrypto is already installed safe.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Relational shared work. created_by is immutable audit attribution only: it is
-- nullable, not named owner_id, and no constraint requires a sole lead or owner.
-- -----------------------------------------------------------------------------
create table if not exists public.shared_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  status text not null default 'planning'
    check (status in ('planning', 'active', 'on-hold', 'done')),
  due_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_projects add column if not exists due_date date;

create table if not exists public.shared_project_members (
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('lead', 'admin', 'member', 'guest', 'viewer')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.shared_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  details text not null default '' check (char_length(details) <= 50000),
  status text not null default 'todo'
    check (status in ('todo', 'in-progress', 'blocked', 'done', 'cancelled')),
  due_date date,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes between 0 and 100000),
  assignee_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_project_tasks_project_id_id_key unique (project_id, id),
  constraint shared_project_tasks_assignee_is_member_fkey
    foreign key (project_id, assignee_id)
    references public.shared_project_members (project_id, user_id)
    on delete set null (assignee_id)
);

-- A dependency is project-scoped twice: both task references use the same project_id.
-- The two composite foreign keys make cross-project dependency links impossible.
create table if not exists public.shared_task_dependencies (
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  task_id uuid not null,
  depends_on_task_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  constraint shared_task_dependencies_task_fkey
    foreign key (project_id, task_id)
    references public.shared_project_tasks (project_id, id) on delete cascade,
  constraint shared_task_dependencies_depends_on_task_fkey
    foreign key (project_id, depends_on_task_id)
    references public.shared_project_tasks (project_id, id) on delete cascade
);

-- A comment may be project-level (task_id null) or attached to a task. Mention IDs
-- are validated by a trusted trigger; no email addresses are stored or exposed.
create table if not exists public.shared_project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  task_id uuid,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  mentioned_user_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(mentioned_user_ids) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_project_comments_task_in_project_fkey
    foreign key (project_id, task_id)
    references public.shared_project_tasks (project_id, id) on delete cascade
);

-- Decisions, meeting records, and milestones reuse the project record; they never
-- duplicate project/task history into a second project model.
create table if not exists public.shared_project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  note_type text not null check (note_type in ('decision', 'meeting', 'milestone')),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  body text not null default '' check (char_length(body) <= 50000),
  occurred_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- This is append-only for clients. Only security-definer trigger/RPC code below can
-- write it, so activity is useful for auditing without granting client insert access.
create table if not exists public.shared_project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null check (entity_type in ('project', 'member', 'task', 'dependency', 'comment', 'note')),
  entity_id uuid,
  event_type text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

-- Bearer tokens are deliberately absent. The table keeps only a SHA-256 digest, and
-- column grants below ensure even project managers cannot select token_hash directly.
create table if not exists public.shared_project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  role text not null check (role in ('member', 'guest', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_at >= created_at)
);

-- This table intentionally has no foreign key to life_data or its JSON contents.
-- A user may attach their own goal/habit identifier to a team task, but only that user
-- can ever read the association.
create table if not exists public.shared_task_private_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.shared_project_tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  personal_item_type text not null check (personal_item_type in ('goal', 'habit')),
  personal_item_id text not null check (char_length(btrim(personal_item_id)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint shared_task_private_links_unique unique (task_id, user_id, personal_item_type, personal_item_id)
);

create table if not exists public.shared_project_notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  recipient_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('task.assigned', 'task.blocked', 'task.due_date_changed', 'task.blocker_added', 'comment.mentioned')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shared_project_notifications_recipient_is_member_fkey
    foreign key (project_id, recipient_id)
    references public.shared_project_members (project_id, user_id) on delete cascade
);

-- Portfolios associate existing shared project IDs. Membership and access remain
-- independent: adding a link never grants access to its project.
create table if not exists public.shared_portfolios (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_portfolio_members (
  portfolio_id uuid not null references public.shared_portfolios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('lead', 'admin', 'member', 'viewer')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (portfolio_id, user_id)
);

create table if not exists public.shared_portfolio_projects (
  portfolio_id uuid not null references public.shared_portfolios (id) on delete cascade,
  project_id uuid not null references public.shared_projects (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, project_id)
);

-- Query paths used by project lists, task views, calendars, notification inboxes,
-- role checks, and RLS membership predicates.
create index if not exists shared_projects_status_updated_idx
  on public.shared_projects (status, updated_at desc);
create index if not exists shared_projects_status_due_idx
  on public.shared_projects (status, due_date);
create index if not exists shared_project_members_user_project_idx
  on public.shared_project_members (user_id, project_id);
create index if not exists shared_project_tasks_project_status_due_idx
  on public.shared_project_tasks (project_id, status, due_date);
create index if not exists shared_project_tasks_assignee_status_due_idx
  on public.shared_project_tasks (assignee_id, status, due_date)
  where assignee_id is not null;
create index if not exists shared_task_dependencies_depends_on_idx
  on public.shared_task_dependencies (project_id, depends_on_task_id);
create index if not exists shared_project_comments_project_created_idx
  on public.shared_project_comments (project_id, created_at desc);
create index if not exists shared_project_comments_task_created_idx
  on public.shared_project_comments (task_id, created_at desc)
  where task_id is not null;
create index if not exists shared_project_notes_project_type_date_idx
  on public.shared_project_notes (project_id, note_type, occurred_on desc);
create index if not exists shared_project_activity_project_created_idx
  on public.shared_project_activity (project_id, created_at desc);
create index if not exists shared_project_invitations_active_project_idx
  on
 public.shared_project_invitations (project_id, expires_at)
  where revoked_at is null and accepted_at is null;
create index if not exists shared_task_private_links_user_task_idx
  on public.shared_task_private_links (user_id, task_id);
create index if not exists shared_project_notifications_recipient_unread_idx
  on public.shared_project_notifications (recipient_id, read_at, created_at desc);
create index if not exists shared_portfolios_updated_idx
  on public.shared_portfolios (updated_at desc);
create index if not exists shared_portfolio_members_user_portfolio_idx
  on public.shared_portfolio_members (user_id, portfolio_id);
create index if not exists shared_portfolio_projects_project_idx
  on public.shared_portfolio_projects (project_id, portfolio_id);

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER membership helpers. Empty search_path and fully-qualified
-- relation references prevent caller-controlled object lookup and avoid RLS
-- recursion while evaluating policies on membership tables themselves.
-- -----------------------------------------------------------------------------
create or replace function public.shared_project_role(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.shared_project_members as m
  where m.project_id = p_project_id
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.shared_is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shared_project_members as m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
  )
$$;

create or replace function public.shared_is_project_lead(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.shared_project_role(p_project_id) = 'lead', false)
$$;

create or replace function public.shared_can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.shared_project_role(p_project_id) in ('lead', 'admin'), false)
$$;

create or replace function public.shared_can_work_on_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.shared_project_role(p_project_id) in ('lead', 'admin', 'member', 'guest'), false)
$$;

create or replace function public.shared_can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shared_project_tasks as t
    where t.id = p_task_id
      and public.shared_is_project_member(t.project_id)
  )
$$;

create or replace function public.shared_portfolio_role(p_portfolio_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.shared_portfolio_members as m
  where m.portfolio_id = p_portfolio_id
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.shared_is_portfolio_member(p_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shared_portfolio_members as m
    where m.portfolio_id = p_portfolio_id
      and m.user_id = auth.uid()
  )
$$;

create or replace function public.shared_is_portfolio_lead(p_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.shared_portfolio_role(p_portfolio_id) = 'lead', false)
$$;

create or replace function public.shared_can_manage_portfolio(p_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.shared_portfolio_role(p_portfolio_id) in ('lead', 'admin'), false)
$$;

-- The pgcrypto extension can already exist in a non-default schema in older
-- Supabase projects. Resolve its installed schema from pg_catalog instead of
-- assuming a caller search_path, while still keeping the extension setup above
-- idempotent for fresh projects.
create or replace function public.shared_invitation_token_hash(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_extension_schema name;
  v_hash text;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'Invalid invitation token' using errcode = '22023';
  end if;

  select n.nspname
    into v_extension_schema
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_extension_schema is null then
    raise exception 'pgcrypto is required for shared invitations' using errcode = '55000';
  end if;

  execute pg_catalog.format(
    'select pg_catalog.encode(%I.digest($1, ''sha256''), ''hex'')',
    v_extension_schema
  ) into v_hash using p_token;

  return v_hash;
end;
$$;

create or replace function public.shared_new_invitation_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_extension_schema name;
  v_token text;
begin
  select n.nspname
    into v_extension_schema
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_extension_schema is null then
    raise exception 'pgcrypto is required for shared invitations' using errcode = '55000';
  end if;

  execute pg_catalog.format(
    'select pg_catalog.encode(%I.gen_random_bytes(32), ''hex'')',
    v_extension_schema
  ) into v_token;

  return v_token;
end;
$$;

-- This ungranted helper is the only privileged path used by project creation and
-- invitation acceptance to join a user. It validates the invoking JWT identity,
-- has no owner semantics, and cannot be invoked directly by application roles.
create or replace function public.shared_join_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_role text,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then
    raise exception 'Authenticated actor required' using errcode = '42501';
  end if;

  if p_project_id is null or p_user_id is null
     or p_role not in ('lead', 'admin', 'member', 'guest', 'viewer') then
    raise exception 'Invalid project membership' using errcode = '22023';
  end if;

  -- Only the creator bootstrap can use this internal helper for an elevated role.
  -- Acceptance paths are further constrained by the invitation table to member,
  -- guest, or viewer, so invitation tokens cannot mint admins or leads.
  if p_role in ('lead', 'admin') and p_user_id is distinct from p_actor_id then
    raise exception 'Unsafe elevated membership' using errcode = '42501';
  end if;

  perform 1 from public.shared_projects as p where p.id = p_project_id;
  if not found then
    raise exception 'Project not found' using errcode = '23503';
  end if;

  insert into public.shared_project_members (project_id, user_id, role, created_by)
  values (p_project_id, p_user_id, p_role, p_actor_id)
  on conflict (project_id, user_id) do nothing;

  return found;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trusted timestamp/audit guards and server-side activity/notification writers.
-- No application role receives INSERT/UPDATE/DELETE privileges on activity.
-- -----------------------------------------------------------------------------
create or replace function public.shared_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.shared_guard_project_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Project audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_membership_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.user_id is distinct from old.user_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Membership identity and audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_task_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Task project and audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_comment_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.task_id is distinct from old.task_id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Comment identity and audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_note_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Note project and audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_portfolio_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Portfolio audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_portfolio_membership_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.portfolio_id is distinct from old.portfolio_id
     or new.user_id is distinct from old.user_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Portfolio membership identity and audit fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_guard_notification_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.recipient_id is distinct from old.recipient_id
     or new.actor_id is distinct from old.actor_id
     or new.kind is distinct from old.kind
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state may change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.shared_validate_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.mentioned_user_ids) as mentioned(user_id)
    left join public.shared_project_members as m
      on m.project_id = new.project_id and m.user_id = mentioned.user_id
    where mentioned.user_id is null or m.user_id is null
  ) then
    raise exception 'Every mentioned user must be a current project member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.shared_write_activity(
  p_project_id uuid,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_id;
begin
  -- A project cascade removes this project's activity. Do not attempt to add a
  -- final child event after its parent is already deletion-invisible.
  if not exists (select 1 from public.shared_projects as p where p.id = p_project_id) then
    return;
  end if;

  -- auth.users may be in the middle of a cascading account deletion. Preserve
  -- the surviving shared-record event without leaving an invalid actor FK.
  if v_actor_id is not null and not exists (
    select 1 from auth.users as u where u.id = v_actor_id
  ) then
    v_actor_id := null;
  end if;

  insert into public.shared_project_activity
    (project_id, actor_id, entity_type, entity_id, event_type, payload)
  values
    (p_project_id, v_actor_id, p_entity_type, p_entity_id, p_event_type,
     coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.shared_deliver_notification(
  p_project_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_id;
begin
  -- Do not create a self-notification, and do not retain an event for a user who
  -- is no longer a project member at the time of delivery.
  if p_recipient_id is null or p_recipient_id is not distinct from p_actor_id then
    return;
  end if;

  if not exists (
    select 1 from public.shared_project_members as m
    where m.project_id = p_project_id and m.user_id = p_recipient_id
  ) then
    return;
  end if;

  if v_actor_id is not null and not exists (
    select 1 from auth.users as u where u.id = v_actor_id
  ) then
    v_actor_id := null;
  end if;

  insert into public.shared_project_notifications
    (project_id, recipient_id, actor_id, kind, payload)
  values
    (p_project_id, p_recipient_id, v_actor_id, p_kind,
     coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.shared_projects_after_insert_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.shared_write_activity(
    new.id, auth.uid(), 'project', new.id, 'project.created',
    jsonb_build_object('title', new.title, 'status', new.status)
  );
  return null;
end;
$$;

create or replace function public.shared_projects_after_update_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.shared_write_activity(
    new.id, auth.uid(), 'project', new.id, 'project.updated',
    jsonb_build_object('status', new.status)
  );
  return null;
end;
$$;

create or replace function public.shared_members_after_change_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'member', new.user_id, 'member.added',
      jsonb_build_object('member_id', new.user_id, 'role', new.role)
    );
  elsif tg_op = 'UPDATE' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'member', new.user_id, 'member.role_changed',
      jsonb_build_object('member_id', new.user_id, 'role', new.role)
    );
  else
    perform public.shared_write_activity(
      old.project_id, auth.uid(), 'member', old.user_id, 'member.removed',
      jsonb_build_object('member_id', old.user_id, 'role', old.role)
    );
  end if;
  return null;
end;
$$;

create or replace function public.shared_tasks_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'task', new.id, 'task.created',
      jsonb_build_object('title', new.title, 'status', new.status)
    );
    if new.assignee_id is not null then
      perform public.shared_deliver_notification(
        new.project_id, new.assignee_id, auth.uid(), 'task.assigned',
        jsonb_build_object('task_id', new.id, 'title', new.title)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'task', new.id, 'task.updated',
      jsonb_build_object('status', new.status, 'assignee_id', new.assignee_id)
    );
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
      perform public.shared_deliver_notification(
        new.project_id, new.assignee_id, auth.uid(), 'task.assigned',
        jsonb_build_object('task_id', new.id, 'title', new.title)
      );
    end if;
    if new.status is distinct from old.status and new.status = 'blocked' and new.assignee_id is not null then
      perform public.shared_deliver_notification(
        new.project_id, new.assignee_id, auth.uid(), 'task.blocked',
        jsonb_build_object('task_id', new.id, 'title', new.title)
      );
    end if;
    if new.due_date is distinct from old.due_date and new.assignee_id is not null then
      perform public.shared_deliver_notification(
        new.project_id, new.assignee_id, auth.uid(), 'task.due_date_changed',
        jsonb_build_object('task_id', new.id, 'title', new.title, 'due_date', new.due_date)
      );
    end if;
  else
    perform public.shared_write_activity(
      old.project_id, auth.uid(), 'task', old.id, 'task.deleted',
      jsonb_build_object('title', old.title)
    );
  end if;
  return null;
end;
$$;

create or replace function public.shared_dependencies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignee_id uuid;
  v_task_title text;
begin
  if tg_op = 'INSERT' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'dependency', new.task_id, 'dependency.added',
      jsonb_build_object('task_id', new.task_id, 'depends_on_task_id', new.depends_on_task_id)
    );
    select t.assignee_id, t.title
      into v_assignee_id, v_task_title
    from public.shared_project_tasks as t
    where t.project_id = new.project_id and t.id = new.task_id;
    if v_assignee_id is not null then
      perform public.shared_deliver_notification(
        new.project_id, v_assignee_id, auth.uid(), 'task.blocker_added',
        jsonb_build_object('task_id', new.task_id, 'title', v_task_title,
                           'depends_on_task_id', new.depends_on_task_id)
      );
    end if;
  else
    perform public.shared_write_activity(
      old.project_id, auth.uid(), 'dependency', old.task_id, 'dependency.removed',
      jsonb_build_object('task_id', old.task_id, 'depends_on_task_id', old.depends_on_task_id)
    );
  end if;
  return null;
end;
$$;

create or replace function public.shared_comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mentioned_id uuid;
begin
  perform public.shared_write_activity(
    new.project_id, auth.uid(), 'comment', new.id, 'comment.created',
    jsonb_build_object('task_id', new.task_id)
  );

  for v_mentioned_id in
    select distinct mentioned.user_id
    from unnest(new.mentioned_user_ids) as mentioned(user_id)
  loop
    perform public.shared_deliver_notification(
      new.project_id, v_mentioned_id, auth.uid(), 'comment.mentioned',
      jsonb_build_object('comment_id', new.id, 'task_id', new.task_id)
    );
  end loop;
  return null;
end;
$$;

create or replace function public.shared_notes_after_change_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'note', new.id, 'note.created',
      jsonb_build_object('note_type', new.note_type, 'title', new.title)
    );
  else
    perform public.shared_write_activity(
      new.project_id, auth.uid(), 'note', new.id, 'note.updated',
      jsonb_build_object('note_type', new.note_type, 'title', new.title)
    );
  end if;
  return null;
end;
$$;

-- Trigger names are unique and creation is guarded so rerunning this migration
-- does not replace or duplicate an existing trigger.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_projects_set_updated_at') then
    create trigger shared_projects_set_updated_at before update on public.shared_projects
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_projects_guard_audit') then
    create trigger shared_projects_guard_audit before update on public.shared_projects
      for each row execute function public.shared_guard_project_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_projects_after_insert_activity') then
    create trigger shared_projects_after_insert_activity after insert on public.shared_projects
      for each row execute function public.shared_projects_after_insert_activity();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_projects_after_update_activity') then
    create trigger shared_projects_after_update_activity after update on public.shared_projects
      for each row execute function public.shared_projects_after_update_activity();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_members_set_updated_at') then
    create trigger shared_project_members_set_updated_at before update on public.shared_project_members
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_members_guard_audit') then
    create trigger shared_project_members_guard_audit before update on public.shared_project_members
      for each row execute function public.shared_guard_membership_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_members_after_change_activity') then
    create trigger shared_project_members_after_change_activity after insert or update or delete on public.shared_project_members
      for each row execute function public.shared_members_after_change_activity();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_tasks_set_updated_at') then
    create trigger shared_project_tasks_set_updated_at before update on public.shared_project_tasks
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_tasks_guard_audit') then
    create trigger shared_project_tasks_guard_audit before update on public.shared_project_tasks
      for each row execute function public.shared_guard_task_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_tasks_after_change') then
    create trigger shared_project_tasks_after_change after insert or update or delete on public.shared_project_tasks
      for each row execute function public.shared_tasks_after_change();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_task_dependencies_after_change') then
    create trigger shared_task_dependencies_after_change after insert or delete on public.shared_task_dependencies
      for each row execute function public.shared_dependencies_after_change();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_comments_set_updated_at') then
    create trigger shared_project_comments_set_updated_at before update on public.shared_project_comments
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_comments_guard_audit') then
    create trigger shared_project_comments_guard_audit before update on public.shared_project_comments
      for each row execute function public.shared_guard_comment_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_comments_validate_mentions') then
    create trigger shared_project_comments_validate_mentions before insert or update on public.shared_project_comments
      for each row execute function public.shared_validate_comment_mentions();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_comments_after_insert') then
    create trigger shared_project_comments_after_insert after insert on public.shared_project_comments
      for each row execute function public.shared_comments_after_insert();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_notes_set_updated_at') then
    create trigger shared_project_notes_set_updated_at before update on public.shared_project_notes
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_notes_guard_audit') then
    create trigger shared_project_notes_guard_audit before update on public.shared_project_notes
      for each row execute function public.shared_guard_note_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_project_notes_after_change_activity') then
    create trigger shared_project_notes_after_change_activity after insert or update on public.shared_project_notes
      for each row execute function public.shared_notes_after_change_activity();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_notifications_guard_fields') then
    create trigger shared_notifications_guard_fields before update on public.shared_project_notifications
      for each row execute function public.shared_guard_notification_fields();
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_portfolios_set_updated_at') then
    create trigger shared_portfolios_set_updated_at before update on public.shared_portfolios
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_portfolios_guard_audit') then
    create trigger shared_portfolios_guard_audit before update on public.shared_portfolios
      for each row execute function public.shared_guard_portfolio_audit();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_portfolio_members_set_updated_at') then
    create trigger shared_portfolio_members_set_updated_at before update on public.shared_portfolio_members
      for each row execute function public.shared_set_updated_at();
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'shared_portfolio_members_guard_audit') then
    create trigger shared_portfolio_members_guard_audit before update on public.shared_portfolio_members
      for each row execute function public.shared_guard_portfolio_membership_audit();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Application RPCs. These are the write path for creation, member management,
-- and bearer invitations; no client is granted direct project/member inserts.
-- -----------------------------------------------------------------------------
create or replace function public.shared_create_project(
  p_title text,
  p_description text default '',
  p_status text default 'planning'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200
     or char_length(coalesce(p_description, '')) > 20000
     or p_status not in ('planning', 'active', 'on-hold', 'done') then
    raise exception 'Invalid project fields' using errcode = '22023';
  end if;

  insert into public.shared_projects (title, description, status, created_by)
  values (btrim(p_title), coalesce(p_description, ''), p_status, v_actor_id)
  returning id into v_project_id;

  -- Bootstrap only. This initial lead can later be changed or removed; it is not
  -- an immutable owner and a project is not required to retain one sole lead.
  perform public.shared_join_project_member(v_project_id, v_actor_id, 'lead', v_actor_id);
  return v_project_id;
end;
$$;

create or replace function public.shared_issue_project_invitation(
  p_project_id uuid,
  p_role text,
  p_expires_at timestamptz default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_token text;
  v_expiry timestamptz;
  v_invitation_id uuid;
begin
  if v_actor_id is null or not (
    public.shared_can_manage_project(p_project_id)
    or (
      public.shared_is_project_member(p_project_id)
      and not exists (
        select 1 from public.shared_project_members as m
        where m.project_id = p_project_id and m.role in ('lead', 'admin')
      )
    )
  ) then
    raise exception 'Lead or admin authorization required' using errcode = '42501';
  end if;
  if p_role not in ('member', 'guest', 'viewer') then
    raise exception 'Invitation role must be member, guest, or viewer' using errcode = '22023';
  end if;

  v_expiry := coalesce(p_expires_at, now() + interval '7 days');
  if v_expiry <= now() or v_expiry > now() + interval '90 days' then
    raise exception 'Invitation expiry must be within 90 days' using errcode = '22023';
  end if;

  v_token := public.shared_new_invitation_token();
  insert into public.shared_project_invitations as i
    (project_id, role, token_hash, invited_by, expires_at)
  values
    (p_project_id, p_role, public.shared_invitation_token_hash(v_token), v_actor_id, v_expiry)
  returning i.id into v_invitation_id;

  perform public.shared_write_activity(
    p_project_id, v_actor_id, 'project', p_project_id, 'project.invitation_issued',
    jsonb_build_object('invitation_id', v_invitation_id, 'role', p_role, 'expires_at', v_expiry)
  );

  -- token is intentionally returned only in this RPC response; it is never
  -- persisted in a table, activity payload, notification, or realtime record.
  invitation_id := v_invitation_id;
  token := v_token;
  expires_at := v_expiry;
  role := p_role;
  return next;
end;
$$;

create or replace function public.shared_accept_project_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_invitation public.shared_project_invitations%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select i.*
    into v_invitation
  from public.shared_project_invitations as i
  where i.token_hash = public.shared_invitation_token_hash(p_token)
  for update;

  if not found
     or v_invitation.revoked_at is not null
     or v_invitation.accepted_at is not null
     or v_invitation.expires_at <= now() then
    -- Keep failures intentionally non-enumerable; a bearer token discloses no
    -- project/member metadata until it is valid and accepted by an authenticated user.
    raise exception 'Invitation is invalid, expired, revoked, or already used' using errcode = '22023';
  end if;

  perform public.shared_join_project_member(
    v_invitation.project_id, v_actor_id, v_invitation.role, v_actor_id
  );

  update public.shared_project_invitations
     set accepted_at = now(), accepted_by = v_actor_id
   where id = v_invitation.id;

  return v_invitation.project_id;
end;
$$;

create or replace function public.shared_revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select i.project_id into v_project_id
  from public.shared_project_invitations as i
  where i.id = p_invitation_id
  for update;

  if not found or not (
    public.shared_can_manage_project(v_project_id)
    or (
      public.shared_is_project_member(v_project_id)
      and not exists (
        select 1 from public.shared_project_members as m
        where m.project_id = v_project_id and m.role in ('lead', 'admin')
      )
    )
  ) then
    raise exception 'Lead or admin authorization required' using errcode = '42501';
  end if;

  update public.shared_project_invitations
     set revoked_at = coalesce(revoked_at, now())
   where id = p_invitation_id;

  perform public.shared_write_activity(
    v_project_id, auth.uid(), 'project', v_project_id, 'project.invitation_revoked',
    jsonb_build_object('invitation_id', p_invitation_id)
  );
end;
$$;

-- Leads may promote/demote any role. Admins can manage non-leads but cannot
-- create, modify, or remove a lead, preventing admin self-escalation to lead.
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
  if auth.uid() is null or not public.shared_can_manage_project(p_project_id) then
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

  -- Leadership is transferable; a project can intentionally be an all-member
  -- working group. Keep at least one member so shared work never becomes orphaned.
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

create or replace function public.shared_create_portfolio(
  p_title text,
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_portfolio_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200
     or char_length(coalesce(p_description, '')) > 20000 then
    raise exception 'Invalid portfolio fields' using errcode = '22023';
  end if;

  insert into public.shared_portfolios (title, description, created_by)
  values (btrim(p_title), coalesce(p_description, ''), v_actor_id)
  returning id into v_portfolio_id;

  insert into public.shared_portfolio_members (portfolio_id, user_id, role, created_by)
  values (v_portfolio_id, v_actor_id, 'lead', v_actor_id);
  return v_portfolio_id;
end;
$$;

create or replace function public.shared_set_portfolio_member_role(
  p_portfolio_id uuid,
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
  if auth.uid() is null or not public.shared_can_manage_portfolio(p_portfolio_id) then
    raise exception 'Portfolio lead or admin authorization required' using errcode = '42501';
  end if;
  if p_user_id is null or p_role not in ('lead', 'admin', 'member', 'viewer') then
    raise exception 'Invalid portfolio membership' using errcode = '22023';
  end if;

  v_current_role := public.shared_portfolio_role(p_portfolio_id);
  select m.role into v_target_role
  from public.shared_portfolio_members as m
  where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id
  for update;
  v_target_exists := found;

  if v_current_role <> 'lead' and (p_role = 'lead' or v_target_role = 'lead') then
    raise exception 'Only a portfolio lead may manage leads' using errcode = '42501';
  end if;

  if v_target_role = 'lead' and p_role <> 'lead' and not exists (
    select 1 from public.shared_portfolio_members as m
    where m.portfolio_id = p_portfolio_id and m.role = 'lead' and m.user_id <> p_user_id
  ) then
    raise exception 'Assign another portfolio lead before demoting the final lead' using errcode = '23514';
  end if;

  if v_target_exists then
    update public.shared_portfolio_members
       set role = p_role
     where portfolio_id = p_portfolio_id and user_id = p_user_id;
  else
    insert into public.shared_portfolio_members (portfolio_id, user_id, role, created_by)
    values (p_portfolio_id, p_user_id, p_role, auth.uid());
  end if;
end;
$$;

create or replace function public.shared_remove_portfolio_member(
  p_portfolio_id uuid,
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

  select m.role into v_target_role
  from public.shared_portfolio_members as m
  where m.portfolio_id = p_portfolio_id and m.user_id = p_user_id
  for update;
  if not found then
    raise exception 'Portfolio membership not found' using errcode = '22023';
  end if;

  if p_user_id is distinct from auth.uid() then
    if not public.shared_can_manage_portfolio(p_portfolio_id) then
      raise exception 'Portfolio lead or admin authorization required' using errcode = '42501';
    end if;
    v_current_role := public.shared_portfolio_role(p_portfolio_id);
    if v_current_role <> 'lead' and v_target_role = 'lead' then
      raise exception 'Only a portfolio lead may remove a lead' using errcode = '42501';
    end if;
  end if;

  if v_target_role = 'lead' and not exists (
    select 1 from public.shared_portfolio_members as m
    where m.portfolio_id = p_portfolio_id and m.role = 'lead' and m.user_id <> p_user_id
  ) then
    raise exception 'Assign another portfolio lead before removing the final lead' using errcode = '23514';
  end if;

  delete from public.shared_portfolio_members
  where portfolio_id = p_portfolio_id and user_id = p_user_id;
end;
$$;

-- Every collaboration table is RLS-protected, including audit and join tables.
alter table public.shared_projects enable row level security;
alter table public.shared_projects force row level security;
alter table public.shared_project_members enable row level security;
alter table public.shared_project_members force row level security;
alter table public.shared_project_tasks enable row level security;
alter table public.shared_project_tasks force row level security;
alter table public.shared_task_dependencies enable row level security;
alter table public.shared_task_dependencies force row level security;
alter table public.shared_project_comments enable row level security;
alter table public.shared_project_comments force row level security;
alter table public.shared_project_notes enable row level security;
alter table public.shared_project_notes force row level security;
alter table public.shared_project_activity enable row level security;
alter table public.shared_project_activity force row level security;
alter table public.shared_project_invitations enable row level security;
alter table public.shared_project_invitations force row level security;
alter table public.shared_task_private_links enable row level security;
alter table public.shared_task_private_links force row level security;
alter table public.shared_project_notifications enable row level security;
alter table public.shared_project_notifications force row level security;
alter table public.shared_portfolios enable row level security;
alter table public.shared_portfolios force row level security;
alter table public.shared_portfolio_members enable row level security;
alter table public.shared_portfolio_members force row level security;
alter table public.shared_portfolio_projects enable row level security;
alter table public.shared_portfolio_projects force row level security;

-- Policies are created without DROP statements. Re-running the migration leaves
-- the existing same-named policy in place; a schema change should use a new,
-- explicitly reviewed migration rather than silently weakening a live policy.
do $$
begin
  begin
    create policy shared_projects_member_select on public.shared_projects
      for select to authenticated using (public.shared_is_project_member(id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_projects_manager_update on public.shared_projects
      for update to authenticated
      using (public.shared_can_manage_project(id))
      with check (public.shared_can_manage_project(id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_projects_manager_delete on public.shared_projects
      for delete to authenticated using (public.shared_can_manage_project(id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_members_member_select on public.shared_project_members
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_tasks_member_select on public.shared_project_tasks
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_tasks_member_insert on public.shared_project_tasks
      for insert to authenticated
      with check (public.shared_can_work_on_project(project_id) and created_by = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_tasks_member_update on public.shared_project_tasks
      for update to authenticated
      using (public.shared_can_work_on_project(project_id))
      with check (public.shared_can_work_on_project(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_tasks_member_delete on public.shared_project_tasks
      for delete to authenticated using (public.shared_can_work_on_project(project_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_task_dependencies_member_select on public.shared_task_dependencies
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_task_dependencies_member_insert on public.shared_task_dependencies
      for insert to authenticated
      with check (public.shared_can_work_on_project(project_id) and created_by = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_task_dependencies_member_delete on public.shared_task_dependencies
      for delete to authenticated using (public.shared_can_work_on_project(project_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_comments_member_select on public.shared_project_comments
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_comments_member_insert on public.shared_project_comments
      for insert to authenticated
      with check (public.shared_can_work_on_project(project_id) and author_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_comments_author_update on public.shared_project_comments
      for update to authenticated
      using (public.shared_can_work_on_project(project_id) and author_id = auth.uid())
      with check (public.shared_can_work_on_project(project_id) and author_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_comments_author_or_manager_delete on public.shared_project_comments
      for delete to authenticated
      using (
        public.shared_can_work_on_project(project_id)
        and (author_id = auth.uid() or public.shared_can_manage_project(project_id))
      );
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_notes_member_select on public.shared_project_notes
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_notes_member_insert on public.shared_project_notes
      for insert to authenticated
      with check (public.shared_can_work_on_project(project_id) and created_by = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_notes_member_update on public.shared_project_notes
      for update to authenticated
      using (public.shared_can_work_on_project(project_id))
      with check (public.shared_can_work_on_project(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_notes_member_delete on public.shared_project_notes
      for delete to authenticated using (public.shared_can_work_on_project(project_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_activity_member_select on public.shared_project_activity
      for select to authenticated using (public.shared_is_project_member(project_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_invitations_manager_select on public.shared_project_invitations
      for select to authenticated using (public.shared_can_manage_project(project_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_invitations_open_members_select on public.shared_project_invitations
      for select to authenticated using (
        public.shared_is_project_member(project_id)
        and not exists (
          select 1 from public.shared_project_members as m
          where m.project_id = shared_project_invitations.project_id and m.role in ('lead', 'admin')
        )
      );
  exception when duplicate_object then null; end;

  begin
    create policy shared_task_private_links_owner_select on public.shared_task_private_links
      for select to authenticated using (user_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_task_private_links_owner_insert on public.shared_task_private_links
      for insert to authenticated
      with check (user_id = auth.uid() and public.shared_can_access_task(task_id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_task_private_links_owner_update on public.shared_task_private_links
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_task_private_links_owner_delete on public.shared_task_private_links
      for delete to authenticated using (user_id = auth.uid());
  exception when duplicate_object then null; end;

  begin
    create policy shared_project_notifications_recipient_select on public.shared_project_notifications
      for select to authenticated using (recipient_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_notifications_recipient_update on public.shared_project_notifications
      for update to authenticated
      using (recipient_id = auth.uid())
      with check (recipient_id = auth.uid());
  exception when duplicate_object then null; end;
  begin
    create policy shared_project_notifications_recipient_delete on public.shared_project_notifications
      for delete to authenticated using (recipient_id = auth.uid());
  exception when duplicate_object then null; end;

  begin
    create policy shared_portfolios_member_select on public.shared_portfolios
      for select to authenticated using (public.shared_is_portfolio_member(id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_portfolios_manager_update on public.shared_portfolios
      for update to authenticated
      using (public.shared_can_manage_portfolio(id))
      with check (public.shared_can_manage_portfolio(id));
  exception when duplicate_object then null; end;
  begin
    create policy shared_portfolios_manager_delete on public.shared_portfolios
      for delete to authenticated using (public.shared_can_manage_portfolio(id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_portfolio_members_member_select on public.shared_portfolio_members
      for select to authenticated using (public.shared_is_portfolio_member(portfolio_id));
  exception when duplicate_object then null; end;

  begin
    create policy shared_portfolio_projects_both_member_select on public.shared_portfolio_projects
      for select to authenticated
      using (
        public.shared_is_portfolio_member(portfolio_id)
        and public.shared_is_project_member(project_id)
      );
  exception when duplicate_object then null; end;
  begin
    create policy shared_portfolio_projects_both_manager_insert on public.shared_portfolio_projects
      for insert to authenticated
      with check (
        public.shared_can_manage_portfolio(portfolio_id)
        and public.shared_can_manage_project(project_id)
        and added_by = auth.uid()
      );
  exception when duplicate_object then null; end;
  begin
    create policy shared_portfolio_projects_both_manager_delete on public.shared_portfolio_projects
      for delete to authenticated
      using (
        public.shared_can_manage_portfolio(portfolio_id)
        and public.shared_can_manage_project(project_id)
      );
  exception when duplicate_object then null; end;
end;
$$;

-- Least-privilege table grants. New tables never grant anon access. Column grants
-- intentionally keep invitation token_hash non-selectable and notification updates
-- limited to read_at; RLS still applies to every listed privilege.
revoke all on table public.shared_projects from public, anon, authenticated;
revoke all on table public.shared_project_members from public, anon, authenticated;
revoke all on table public.shared_project_tasks from public, anon, authenticated;
revoke all on table public.shared_task_dependencies from public, anon, authenticated;
revoke all on table public.shared_project_comments from public, anon, authenticated;
revoke all on table public.shared_project_notes from public, anon, authenticated;
revoke all on table public.shared_project_activity from public, anon, authenticated;
revoke all on table public.shared_project_invitations from public, anon, authenticated;
revoke all on table public.shared_task_private_links from public, anon, authenticated;
revoke all on table public.shared_project_notifications from public, anon, authenticated;
revoke all on table public.shared_portfolios from public, anon, authenticated;
revoke all on table public.shared_portfolio_members from public, anon, authenticated;
revoke all on table public.shared_portfolio_projects from public, anon, authenticated;

grant select, update, delete on table public.shared_projects to authenticated;
grant select on table public.shared_project_members to authenticated;
grant select, insert, update, delete on table public.shared_project_tasks to authenticated;
grant select, insert, delete on table public.shared_task_dependencies to authenticated;
grant select, insert, update, delete on table public.shared_project_comments to authenticated;
grant select, insert, update, delete on table public.shared_project_notes to authenticated;
grant select on table public.shared_project_activity to authenticated;
grant select (id, project_id, role, invited_by, expires_at, revoked_at, accepted_at, accepted_by, created_at)
  on table public.shared_project_invitations to authenticated;
grant select, insert, delete on table public.shared_task_private_links to authenticated;
grant update (personal_item_type, personal_item_id) on table public.shared_task_private_links to authenticated;
grant select, delete on table public.shared_project_notifications to authenticated;
grant update (read_at) on table public.shared_project_notifications to authenticated;
grant select, update, delete on table public.shared_portfolios to authenticated;
grant select on table public.shared_portfolio_members to authenticated;
grant select, insert, delete on table public.shared_portfolio_projects to authenticated;

-- Helpers used in RLS are safe to execute only against the caller's auth.uid().
-- All privileged writers and trigger functions remain uncallable by app roles.
revoke all on function public.shared_project_role(uuid) from public, anon;
revoke all on function public.shared_is_project_member(uuid) from public, anon;
revoke all on function public.shared_is_project_lead(uuid) from public, anon;
revoke all on function public.shared_can_manage_project(uuid) from public, anon;
revoke all on function public.shared_can_work_on_project(uuid) from public, anon;
revoke all on function public.shared_can_access_task(uuid) from public, anon;
revoke all on function public.shared_portfolio_role(uuid) from public, anon;
revoke all on function public.shared_is_portfolio_member(uuid) from public, anon;
revoke all on function public.shared_is_portfolio_lead(uuid) from public, anon;
revoke all on function public.shared_can_manage_portfolio(uuid) from public, anon;
grant execute on function public.shared_project_role(uuid) to authenticated;
grant execute on function public.shared_is_project_member(uuid) to authenticated;
grant execute on function public.shared_is_project_lead(uuid) to authenticated;
grant execute on function public.shared_can_manage_project(uuid) to authenticated;
grant execute on function public.shared_can_work_on_project(uuid) to authenticated;
grant execute on function public.shared_can_access_task(uuid) to authenticated;
grant execute on function public.shared_portfolio_role(uuid) to authenticated;
grant execute on function public.shared_is_portfolio_member(uuid) to authenticated;
grant execute on function public.shared_is_portfolio_lead(uuid) to authenticated;
grant execute on function public.shared_can_manage_portfolio(uuid) to authenticated;

revoke all on function public.shared_invitation_token_hash(text) from public, anon, authenticated;
revoke all on function public.shared_new_invitation_token() from public, anon, authenticated;
revoke all on function public.shared_join_project_member(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.shared_set_updated_at() from public, anon, authenticated;
revoke all on function public.shared_guard_project_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_membership_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_task_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_comment_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_note_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_portfolio_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_portfolio_membership_audit() from public, anon, authenticated;
revoke all on function public.shared_guard_notification_fields() from public, anon, authenticated;
revoke all on function public.shared_validate_comment_mentions() from public, anon, authenticated;
revoke all on function public.shared_write_activity(uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.shared_deliver_notification(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.shared_projects_after_insert_activity() from public, anon, authenticated;
revoke all on function public.shared_projects_after_update_activity() from public, anon, authenticated;
revoke all on function public.shared_members_after_change_activity() from public, anon, authenticated;
revoke all on function public.shared_tasks_after_change() from public, anon, authenticated;
revoke all on function public.shared_dependencies_after_change() from public, anon, authenticated;
revoke all on function public.shared_comments_after_insert() from public, anon, authenticated;
revoke all on function public.shared_notes_after_change_activity() from public, anon, authenticated;

revoke all on function public.shared_create_project(text, text, text) from public, anon;
revoke all on function public.shared_issue_project_invitation(uuid, text, timestamptz) from public, anon;
revoke all on function public.shared_accept_project_invitation(text) from public, anon;
revoke all on function public.shared_revoke_project_invitation(uuid) from public, anon;
revoke all on function public.shared_set_project_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.shared_remove_project_member(uuid, uuid) from public, anon;
revoke all on function public.shared_create_portfolio(text, text) from public, anon;
revoke all on function public.shared_set_portfolio_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.shared_remove_portfolio_member(uuid, uuid) from public, anon;
grant execute on function public.shared_create_project(text, text, text) to authenticated;
grant execute on function public.shared_issue_project_invitation(uuid, text, timestamptz) to authenticated;
grant execute on function public.shared_accept_project_invitation(text) to authenticated;
grant execute on function public.shared_revoke_project_invitation(uuid) to authenticated;
grant execute on function public.shared_set_project_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.shared_remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.shared_create_portfolio(text, text) to authenticated;
grant execute on function public.shared_set_portfolio_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.shared_remove_portfolio_member(uuid, uuid) to authenticated;

-- Realtime subscriptions evaluate the same RLS policies. Invitations and private
-- links are intentionally excluded: invite hashes and personal references never
-- need to be published. Each add is isolated for idempotency and for projects
-- where the supabase_realtime publication has not been installed.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shared_projects',
    'shared_project_members',
    'shared_project_tasks',
    'shared_task_dependencies',
    'shared_project_comments',
    'shared_project_notes',
    'shared_project_activity',
    'shared_project_notifications',
    'shared_portfolios',
    'shared_portfolio_members',
    'shared_portfolio_projects'
  ]
  loop
    begin
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;
