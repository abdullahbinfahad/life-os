begin;

-- Names are deliberately stored separately from auth.users. Only a short public
-- display name is persisted; email, phone, and provider metadata are never exposed.
create table if not exists public.shared_member_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  updated_at timestamptz not null default now()
);

create or replace function public.shared_can_view_member_name(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() = p_user_id
    or exists (
      select 1
      from public.shared_project_members as mine
      join public.shared_project_members as theirs using (project_id)
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user_id
    );
$$;

revoke all on function public.shared_can_view_member_name(uuid) from public, anon;
grant execute on function public.shared_can_view_member_name(uuid) to authenticated;

alter table public.shared_member_profiles enable row level security;
alter table public.shared_member_profiles force row level security;
drop policy if exists shared_member_profiles_visible_to_project_peers on public.shared_member_profiles;
drop policy if exists shared_member_profiles_insert_self on public.shared_member_profiles;
drop policy if exists shared_member_profiles_update_self on public.shared_member_profiles;
create policy shared_member_profiles_visible_to_project_peers on public.shared_member_profiles
  for select to authenticated using (public.shared_can_view_member_name(user_id));
create policy shared_member_profiles_insert_self on public.shared_member_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy shared_member_profiles_update_self on public.shared_member_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on table public.shared_member_profiles from public, anon, authenticated;
grant select, insert, update (display_name, updated_at) on table public.shared_member_profiles to authenticated;

-- A receipt contains only a comment ID, the authenticated member ID, and timestamp.
-- It never stores message content or profile/email data.
create table if not exists public.shared_project_comment_receipts (
  comment_id uuid not null references public.shared_project_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists shared_project_comment_receipts_user_idx
  on public.shared_project_comment_receipts (user_id, seen_at desc);

alter table public.shared_project_comment_receipts enable row level security;
alter table public.shared_project_comment_receipts force row level security;
drop policy if exists shared_project_comment_receipts_project_read on public.shared_project_comment_receipts;
drop policy if exists shared_project_comment_receipts_self_insert on public.shared_project_comment_receipts;
drop policy if exists shared_project_comment_receipts_self_update on public.shared_project_comment_receipts;
drop policy if exists shared_project_comment_receipts_self_delete on public.shared_project_comment_receipts;
create policy shared_project_comment_receipts_project_read on public.shared_project_comment_receipts
  for select to authenticated using (
    exists (select 1 from public.shared_project_comments c
      where c.id = comment_id and public.shared_is_project_member(c.project_id))
  );
create policy shared_project_comment_receipts_self_insert on public.shared_project_comment_receipts
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.shared_project_comments c
      where c.id = comment_id and public.shared_is_project_member(c.project_id))
  );
create policy shared_project_comment_receipts_self_update on public.shared_project_comment_receipts
  for update to authenticated using (
    user_id = auth.uid()
    and exists (select 1 from public.shared_project_comments c
      where c.id = comment_id and public.shared_is_project_member(c.project_id))
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.shared_project_comments c
      where c.id = comment_id and public.shared_is_project_member(c.project_id))
  );
create policy shared_project_comment_receipts_self_delete on public.shared_project_comment_receipts
  for delete to authenticated using (user_id = auth.uid());
revoke all on table public.shared_project_comment_receipts from public, anon, authenticated;
grant select, insert, delete on table public.shared_project_comment_receipts to authenticated;
grant update (seen_at) on table public.shared_project_comment_receipts to authenticated;

-- Sticky notes are still the same project note records, with a small allow-listed
-- palette and pin state so notes remain easy to scan and sort.
alter table public.shared_project_notes
  add column if not exists color text not null default 'paper';
alter table public.shared_project_notes
  add column if not exists is_pinned boolean not null default false;
alter table public.shared_project_notes
  drop constraint if exists shared_project_notes_note_type_check;
alter table public.shared_project_notes
  add constraint shared_project_notes_note_type_check
  check (note_type in ('decision', 'meeting', 'milestone', 'sticky'));
alter table public.shared_project_notes
  drop constraint if exists shared_project_notes_color_check;
alter table public.shared_project_notes
  add constraint shared_project_notes_color_check
  check (color in ('paper', 'lavender', 'mint', 'sky'));

-- A portfolio lead may group a project they can already access. This changes no
-- project membership and grants no project access to other portfolio members.
drop policy if exists shared_portfolio_projects_both_manager_insert on public.shared_portfolio_projects;
create policy shared_portfolio_projects_manager_project_member_insert on public.shared_portfolio_projects
  for insert to authenticated with check (
    public.shared_can_manage_portfolio(portfolio_id)
    and public.shared_is_project_member(project_id)
    and added_by = auth.uid()
  );

commit;
