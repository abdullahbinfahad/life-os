-- Do not expose stable auth user IDs while rendering publicly readable comments.
-- The app receives only IDs of comments the current user may delete, via a scoped RPC.
revoke select (author_id) on table public.public_journal_comments from authenticated;

create or replace function public.lifeos_deletable_public_comment_ids(p_journal_slug text)
returns table (comment_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.public_journal_comments c
  where c.journal_slug = p_journal_slug
    and auth.uid() is not null
    and (
      c.author_id = auth.uid()
      or exists (
        select 1
        from public.public_journals j
        where j.slug = c.journal_slug
          and j.owner_id = auth.uid()
      )
      or public.lifeos_is_owner_admin()
    );
$$;

revoke all on function public.lifeos_deletable_public_comment_ids(text) from public, anon;
grant execute on function public.lifeos_deletable_public_comment_ids(text) to authenticated;
