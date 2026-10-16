-- Life Circle — database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Each user's whole Life Circle lives in one JSON document, keyed by their
-- auth user id. Row Level Security guarantees a signed-in user can only
-- see, create, change or delete THEIR OWN row — nobody else's, ever.

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
