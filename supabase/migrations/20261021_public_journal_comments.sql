-- Life OS public-journal comments (additive; no existing rows are changed).
create table if not exists public.public_journal_comments (
  id uuid primary key default gen_random_uuid(),
  journal_slug text not null references public.public_journals (slug) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists public_journal_comments_slug_created_idx
  on public.public_journal_comments (journal_slug, created_at);
alter table public.public_journal_comments enable row level security;
alter table public.public_journal_comments force row level security;
drop policy if exists "anyone can read public journal comments" on public.public_journal_comments;
drop policy if exists "signed-in readers post as themselves" on public.public_journal_comments;
drop policy if exists "authors or journal owners delete comments" on public.public_journal_comments;
create policy "anyone can read public journal comments"
  on public.public_journal_comments for select to anon, authenticated using (true);
create policy "signed-in readers post as themselves"
  on public.public_journal_comments for insert to authenticated
  with check (
    auth.uid() = author_id
    and author_name = left(coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name', ''), nullif(auth.jwt()->'user_metadata'->>'name', ''), 'Reader'), 80)
    and exists (select 1 from public.public_journals j where j.slug = journal_slug)
  );
create policy "authors or journal owners delete comments"
  on public.public_journal_comments for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.public_journals j where j.slug = journal_slug and j.owner_id = auth.uid())
  );
revoke all on public.public_journal_comments from public, anon, authenticated;
grant select (id, journal_slug, author_name, content, created_at) on public.public_journal_comments to anon, authenticated;
grant select (author_id) on public.public_journal_comments to authenticated;
grant insert (journal_slug, author_id, author_name, content) on public.public_journal_comments to authenticated;
grant delete on public.public_journal_comments to authenticated;
create or replace function public.lifeos_is_owner_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and md5(lower(u.email)) = '93f8329f5eda71e6be5ddfb6916ab921'
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.lifeos_is_owner_admin() from public, anon;
grant execute on function public.lifeos_is_owner_admin() to authenticated;
create or replace function public.lifeos_owner_system_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.lifeos_is_owner_admin() then
    raise insufficient_privilege using message = 'Owner authorization required';
  end if;
  return jsonb_build_object(
    'registered_accounts', (select count(*) from auth.users),
    'cloud_snapshots', (select count(*) from public.life_data),
    'published_journals', (select count(*) from public.public_journals),
    'public_comments', (select count(*) from public.public_journal_comments),
    'checked_at', now()
  );
end;
$$;
revoke all on function public.lifeos_owner_system_metrics() from public, anon;
grant execute on function public.lifeos_owner_system_metrics() to authenticated;
drop policy if exists "verified owner may moderate public comments" on public.public_journal_comments;
create policy "verified owner may moderate public comments"
  on public.public_journal_comments for delete to authenticated
  using ((select public.lifeos_is_owner_admin()));
do $$ begin
  alter publication supabase_realtime add table public.public_journal_comments;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
