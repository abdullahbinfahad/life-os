import { translate as tr } from '../../../lib/locales';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Flame, MessageCircle, Pin, Timer } from 'lucide-react';
import { useState } from 'react';
import { addDays, cx, localeForLanguage, today } from '../../../lib/utils';
import type { SharedActivity, SharedComment, SharedNote, SharedTask } from '../../../lib/sharedProjects';
import { Avatar, isOpen, isOverdue, memberLabel, memberName, timeAgo } from './shared';
import { TaskRow, type TaskContext } from './TeamTasks';

export type GoTab = (tab: 'tasks' | 'discussion' | 'notes' | 'people' | 'activity') => void;

export default function TeamOverview({ tasks, ctx, notes, comments, activity, onGo }: { tasks: SharedTask[]; ctx: TaskContext; notes: SharedNote[]; comments: SharedComment[]; activity: SharedActivity[]; onGo: GoTab }) {
  const { members, currentUserId, language } = ctx;
  const locale = localeForLanguage(language);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tasks.filter(isOpen);
  const stats = [
    { label: 'Open', value: open.length, icon: CircleDashed, tone: '#6366f1' },
    { label: 'In progress', value: tasks.filter((task) => task.status === 'in-progress').length, icon: Timer, tone: '#06b6d4' },
    { label: 'Overdue', value: tasks.filter(isOverdue).length, icon: AlertTriangle, tone: '#f43f5e' },
    { label: 'Done', value: tasks.filter((task) => task.status === 'done').length, icon: CheckCircle2, tone: '#22c55e' },
  ];
  const mine = open.filter((task) => task.assignee_id === currentUserId).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')).slice(0, 5);
  const weekEnd = addDays(today(), 7);
  const dueSoon = open.filter((task) => task.due_date && task.due_date <= weekEnd && task.assignee_id !== currentUserId).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')).slice(0, 5);
  const workload = members.map((member) => ({ member, open: open.filter((task) => task.assignee_id === member.user_id).length, done: tasks.filter((task) => task.assignee_id === member.user_id && task.status === 'done').length })).sort((a, b) => b.open - a.open);
  const maxLoad = Math.max(1, ...workload.map((row) => row.open + row.done));
  const unassigned = open.filter((task) => !task.assignee_id).length;
  const latest = [...comments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const pinned = notes.filter((note) => note.is_pinned).slice(0, 2);
  const weekAgo = Date.now() - 7 * 86400000;
  const doneThisWeek = activity.filter((event) => /complet|done/i.test(event.event_type) && Date.parse(event.created_at) > weekAgo).length;

  return <div className="min-w-0 space-y-3">
    <div className="tw-stats">
      {stats.map(({ label, value, icon: Icon, tone }) => <button key={label} type="button" className="tw-stat" style={{ ['--tone' as string]: tone }} onClick={() => onGo('tasks')}>
        <span className="tw-stat-icon"><Icon size={16} /></span><b>{value}</b><span>{tr(label)}</span>
      </button>)}
    </div>

    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <section className="tw-panel">
          <header><h3>{tr('My next tasks')}</h3><button type="button" className="tw-more" onClick={() => onGo('tasks')}>{tr('All tasks')}<ArrowRight size={13} /></button></header>
          {mine.length ? <div className="tw-list">{mine.map((task) => <TaskRow key={task.id} task={task} ctx={ctx} open={openId === task.id} onOpen={() => setOpenId(openId === task.id ? null : task.id)} />)}</div> : <p className="tw-empty-sm">🎉 {tr('Nothing assigned to you right now.')}</p>}
        </section>
        {dueSoon.length > 0 && <section className="tw-panel">
          <header><h3>{tr('Due this week')}</h3></header>
          <div className="tw-list">{dueSoon.map((task) => <TaskRow key={task.id} task={task} ctx={ctx} open={openId === task.id} onOpen={() => setOpenId(openId === task.id ? null : task.id)} />)}</div>
        </section>}
        <section className="tw-panel">
          <header><h3>{tr('Latest messages')}</h3><button type="button" className="tw-more" onClick={() => onGo('discussion')}>{tr('Open chat')}<ArrowRight size={13} /></button></header>
          {latest.length ? <ul className="tw-feed">{latest.map((comment) => <li key={comment.id}><Avatar id={comment.author_id} name={memberName(comment.author_id, members)} size={28} /><div className="min-w-0 flex-1"><p className="text-xs"><b>{memberLabel(comment.author_id, members, currentUserId)}</b> <span className="muted">· {timeAgo(comment.created_at, locale)}</span></p><p className="line-clamp-2 break-words text-sm">{comment.body}</p></div></li>)}</ul> : <button type="button" className="tw-empty-sm w-full" onClick={() => onGo('discussion')}><MessageCircle size={15} className="inline" /> {tr('Say hi to your team')}</button>}
        </section>
      </div>
      <div className="min-w-0 space-y-3">
        <section className="tw-panel">
          <header><h3>{tr('Team workload')}</h3><button type="button" className="tw-more" onClick={() => onGo('people')}>{tr('People')}<ArrowRight size={13} /></button></header>
          <ul className="space-y-2.5">{workload.map(({ member, open: count, done }) => <li key={member.user_id} className="flex min-w-0 items-center gap-2.5">
            <Avatar id={member.user_id} name={memberName(member.user_id, members)} size={28} />
            <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-medium">{memberLabel(member.user_id, members, currentUserId)}</span><span className="shrink-0 tabular-nums muted">{count} {tr('open')} · {done} {tr('done')}</span></div>
              <div className="tw-load"><span className="is-done" style={{ width: `${done / maxLoad * 100}%` }} /><span style={{ width: `${count / maxLoad * 100}%` }} /></div></div>
          </li>)}</ul>
          {unassigned > 0 && <p className="mt-3 text-xs muted">{unassigned} {tr('open tasks have no owner yet.')}</p>}
        </section>
        <section className="tw-panel tw-streak"><Flame size={20} /><div><b>{doneThisWeek}</b><p className="text-xs muted">{tr('tasks completed by the team in the last 7 days')}</p></div></section>
        {pinned.length > 0 && <section className="tw-panel">
          <header><h3>{tr('Pinned notes')}</h3><button type="button" className="tw-more" onClick={() => onGo('notes')}>{tr('Notes')}<ArrowRight size={13} /></button></header>
          <div className="space-y-2">{pinned.map((note) => <article key={note.id} className={cx('tw-note-mini', `tone-${note.color}`)}><p className="flex items-center gap-1.5 text-sm font-semibold"><Pin size={12} />{note.title}</p>{note.body && <p className="mt-0.5 line-clamp-2 text-xs muted">{note.body}</p>}</article>)}</div>
        </section>}
        {activity.length > 0 && <section className="tw-panel">
          <header><h3>{tr('Recent activity')}</h3><button type="button" className="tw-more" onClick={() => onGo('activity')}>{tr('All')}<ArrowRight size={13} /></button></header>
          <ul className="tw-feed">{activity.slice(0, 4).map((event) => <li key={event.id}><Avatar id={event.actor_id} name={memberName(event.actor_id, members)} size={24} /><p className="min-w-0 flex-1 text-xs leading-5"><b>{memberLabel(event.actor_id, members, currentUserId)}</b> {tr(event.event_type.split('.').join(' '))}{typeof event.payload.title === 'string' ? <> · <span className="muted">{event.payload.title}</span></> : null}<span className="block muted">{timeAgo(event.created_at, locale)}</span></p></li>)}</ul>
        </section>}
      </div>
    </div>
  </div>;
}
