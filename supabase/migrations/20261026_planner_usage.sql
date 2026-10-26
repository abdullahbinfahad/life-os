-- Minimal planner quota accounting only: no prompt, response, or chat content is stored.
create table if not exists public.planner_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_day date not null,
  request_count integer not null default 0 check (request_count >= 0 and request_count <= 20),
  primary key (user_id, request_day)
);

alter table public.planner_usage enable row level security;
alter table public.planner_usage force row level security;
revoke all on public.planner_usage from public, anon, authenticated;

create or replace function public.consume_planner_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  day_key date := (pg_catalog.now() at time zone 'UTC')::date;
  current_count integer;
begin
  if caller is null then
    return false;
  end if;

  -- Retain only one daily counter per active user; no prompt or history is stored.
  delete from public.planner_usage
   where user_id = caller and request_day < day_key;

  -- Serialize same-user requests for the same day, so concurrent requests cannot exceed 20.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text || ':' || day_key::text, 0));
  select request_count into current_count
    from public.planner_usage
   where user_id = caller and request_day = day_key
   for update;

  if current_count is null then
    insert into public.planner_usage (user_id, request_day, request_count)
    values (caller, day_key, 1)
    on conflict (user_id, request_day) do nothing;
    select request_count into current_count
      from public.planner_usage
     where user_id = caller and request_day = day_key
     for update;
    if current_count = 1 then return true; end if;
  end if;

  if current_count >= 20 then
    return false;
  end if;
  update public.planner_usage
     set request_count = request_count + 1
   where user_id = caller and request_day = day_key;
  return true;
end;
$$;

revoke all on function public.consume_planner_request() from public, anon;
grant execute on function public.consume_planner_request() to authenticated;
