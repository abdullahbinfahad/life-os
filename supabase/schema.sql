-- Life Circle — database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Each user's whole Life Circle lives in one JSON document, keyed by their
-- auth user id. Ordinary signed-in users can only see and change their own row.
-- The optional owner-admin migration adds separately verified, audited
-- cross-account administrative access; it never exposes auth secrets.

create table if not exists public.life_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.life_data enable row level security;
alter table public.life_data force row level security;

drop policy if exists "read own data"   on public.life_data;
drop policy if exists "insert own data" on public.life_data;
drop policy if exists "update own data" on public.life_data;
drop policy if exists "delete own data" on public.life_data;

create policy "read own data"   on public.life_data for select to authenticated using (auth.uid() = user_id);
create policy "insert own data" on public.life_data for insert to authenticated with check (auth.uid() = user_id);
create policy "update own data" on public.life_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.life_data for delete to authenticated using (auth.uid() = user_id);

-- No access at all for signed-out visitors.
revoke all on public.life_data from anon;
grant select, insert, update, delete on public.life_data to authenticated;

-- Let users permanently delete their own account (and, via cascade, their data).
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Optional public journal publishing. Only explicitly published entries are public;
-- private Life Circle data remains protected by the life_data policies above.
create table if not exists public.public_journals (
  slug text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  excerpt text not null default '',
  content text not null default '',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.public_journals enable row level security;
alter table public.public_journals force row level security;
drop policy if exists "anyone can read public journals" on public.public_journals;
drop policy if exists "owners manage public journals" on public.public_journals;
create policy "anyone can read public journals" on public.public_journals for select using (true);
create policy "owners manage public journals" on public.public_journals for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
revoke all on public.public_journals from anon;
grant select on public.public_journals to anon, authenticated;
grant insert, update, delete on public.public_journals to authenticated;

-- Public journal discussion. Readers may view comments; only authenticated
-- readers can post, and only the author or journal owner can remove a comment.
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

-- Enable realtime comment inserts where Supabase Realtime is installed.
do $$ begin
  alter publication supabase_realtime add table public.public_journal_comments;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.public_journals;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- Private media for profile photos and album memories. The browser stores only
-- these object paths in life_data; it requests short-lived signed URLs to view
-- them. File names must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'life-media',
  'life-media',
  false,
  5242880, -- 5 MiB (the client compresses to <= 4.5 MiB)
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

-- Policies are intentionally limited to the life-media bucket and the first
-- folder in an object name, e.g. <auth.uid()>/avatars/<uuid>.webp.
drop policy if exists "life-media users read own objects" on storage.objects;
drop policy if exists "life-media users insert own objects" on storage.objects;
drop policy if exists "life-media users update own objects" on storage.objects;
drop policy if exists "life-media users delete own objects" on storage.objects;

create policy "life-media users read own objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'life-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "life-media users insert own objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'life-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "life-media users update own objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'life-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'life-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "life-media users delete own objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'life-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
