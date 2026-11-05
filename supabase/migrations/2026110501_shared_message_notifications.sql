-- Deliver unread notifications for every new shared-project discussion message.
-- Mentioned members keep the existing comment.mentioned kind; other members receive
-- comment.new_message. The trusted existing writer validates membership, prevents
-- self-notifications, and remains the only code path that inserts notifications.

alter table public.shared_project_notifications
  drop constraint if exists shared_project_notifications_kind_check;

alter table public.shared_project_notifications
  add constraint shared_project_notifications_kind_check
  check (kind in (
    'task.assigned',
    'task.blocked',
    'task.due_date_changed',
    'task.blocker_added',
    'comment.mentioned',
    'comment.new_message'
  ));

create or replace function public.shared_comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_actor_id uuid := auth.uid();
  v_kind text;
begin
  perform public.shared_write_activity(
    new.project_id, v_actor_id, 'comment', new.id, 'comment.created',
    jsonb_build_object('task_id', new.task_id)
  );

  for v_recipient_id in
    select m.user_id
    from public.shared_project_members as m
    where m.project_id = new.project_id
      and m.user_id is distinct from v_actor_id
  loop
    v_kind := case
      when v_recipient_id = any(coalesce(new.mentioned_user_ids, '{}'::uuid[]))
        then 'comment.mentioned'
      else 'comment.new_message'
    end;

    perform public.shared_deliver_notification(
      new.project_id,
      v_recipient_id,
      v_actor_id,
      v_kind,
      jsonb_build_object(
        'comment_id', new.id,
        'task_id', new.task_id,
        'message_preview', left(btrim(new.body), 240)
      )
    );
  end loop;

  return null;
end;
$$;
