import { translate as tr } from '../../../lib/locales';
import { ArrowLeft, CheckCircle2, Circle, FileText, FolderKanban, ListChecks, MessageCircle, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { cx, localeForLanguage, today } from '../../../lib/utils';
import { addProjectToPortfolio, createSharedPortfolio, removeProjectFromPortfolio, type SharedActivity, type SharedMember, type SharedTask, type SharedWorkspaceSnapshot } from '../../../lib/sharedProjects';
import { Avatar, STATUS, isOverdue, memberLabel, memberName, relativeDay, statusMeta, taskStatusMeta, timeAgo, type RunAction } from './shared';

export function TeamTimeline({ tasks, members, currentUserId, language, canWork, onChange }: { tasks: SharedTask[]; members: SharedMember[]; currentUserId: string; language: string; canWork: boolean; onChange: (taskId: string, patch: Partial<SharedTask>) => Promise<boolean> }) {
  const scheduled = tasks.filter((task) => task.due_date).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const unscheduled = tasks.filter((task) => !task.due_date);
  const months = new Map<string, SharedTask[]>();
  for (const task of scheduled) { const key = task.due_date!.slice(0, 7); months.set(key, [...(months.get(key) ?? []), task]); }
  const locale = localeForLanguage(language);
  const todayIso = today();
  return <section className="tw-panel">
    <header><h3>{tr('Roadmap')}</h3><span className="text-xs muted">{scheduled.length} {tr('scheduled')} · {unscheduled.length} {tr('unscheduled')}</span></header>
    {!tasks.length && <p className="tw-empty-sm">{tr('Add a task with a due date to start the roadmap.')}</p>}
    {[...months.entries()].map(([month, items]) => <div key={month} className="tw-tl-month">
      <h4>{new Date(`${month}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h4>
      <ol className="tw-tl">{items.map((task) => { const meta = taskStatusMeta(task.status); const done = task.status === 'done'; return <li key={task.id} className={cx('tw-tl-item', done && 'is-done', isOverdue(task) && 'is-late', task.due_date === todayIso && 'is-today')} style={{ ['--tone' as string]: meta.color }}>
        <span className="tw-tl-date"><b>{Number(task.due_date!.slice(8))}</b>{new Date(`${task.due_date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })}</span>
        <div className="tw-tl-card">
          <button type="button" disabled={!canWork} role="checkbox" aria-checked={done} aria-label={tr(done ? 'Reopen task' : 'Mark task done')} className={cx('tap-check', done && 'is-done')} onClick={() => void onChange(task.id, { status: done ? 'todo' : 'done' })}>{done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</button>
          <div className="min-w-0 flex-1"><p className="tw-task-title">{task.title}</p><p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs muted"><span style={{ color: meta.color }}>{tr(meta.label)}</span>{isOverdue(task) && <span className="text-rose-400">{tr('Overdue')}</span>}</p></div>
          {task.assignee_id ? <Avatar id={task.assignee_id} name={memberName(task.assignee_id, members)} size={24} /> : <span className="tw-avatar-empty"><UserRound size={12} /></span>}
        </div>
      </li>; })}</ol>
    </div>)}
    {unscheduled.length > 0 && <div className="tw-tl-month"><h4>{tr('No date yet')}</h4><ul className="space-y-1">{unscheduled.map((task) => <li key={task.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm"><span className="tw-dot" style={{ background: taskStatusMeta(task.status).color }} /><span className="min-w-0 flex-1 truncate">{task.title}</span></li>)}</ul></div>}
  </section>;
}

const ICONS: Record<string, typeof FileText> = { task: ListChecks, comment: MessageCircle, note: FileText, project: FolderKanban };

export function TeamActivity({ activity, members, currentUserId, language }: { activity: SharedActivity[]; members: SharedMember[]; currentUserId: string; language: string }) {
  const locale = localeForLanguage(language);
  const days = new Map<string, SharedActivity[]>();
  for (const event of activity.slice(0, 150)) { const key = event.created_at.slice(0, 10); days.set(key, [...(days.get(key) ?? []), event]); }
  return <section className="tw-panel">
    <header><h3>{tr('Activity')}</h3></header>
    {!activity.length && <p className="tw-empty-sm">{tr('Team changes will appear here.')}</p>}
    {[...days.entries()].map(([day, events]) => <div key={day} className="tw-tl-month"><h4>{relativeDay(day, locale)}</h4>
      <ul className="tw-feed">{events.map((event) => { const Icon = ICONS[event.entity_type] ?? FileText; return <li key={event.id}>
        <span className="relative"><Avatar id={event.actor_id} name={memberName(event.actor_id, members)} size={30} /><span className="tw-feed-badge"><Icon size={10} /></span></span>
        <p className="min-w-0 flex-1 text-sm leading-5"><b>{memberLabel(event.actor_id, members, currentUserId)}</b> {tr(event.event_type.split('.').join(' '))}{typeof event.payload.title === 'string' ? <> · <span className="muted">{event.payload.title}</span></> : null}<span className="block text-xs muted">{timeAgo(event.created_at, locale)}</span></p>
      </li>; })}</ul>
    </div>)}
  </section>;
}

export function PortfolioSection({ snapshot, currentUserId, runAction }: { snapshot: SharedWorkspaceSnapshot; currentUserId: string; runAction: RunAction }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const portfolio = snapshot.portfolios.find((item) => item.id === activeId);
  const linkedIds = snapshot.portfolioProjects.filter((link) => link.portfolio_id === portfolio?.id).map((link) => link.project_id);
  const linked = snapshot.projects.filter((project) => linkedIds.includes(project.id));
  const role = snapshot.portfolioMembers.find((member) => member.portfolio_id === portfolio?.id && member.user_id === currentUserId)?.role;
  const canManage = role === 'lead' || role === 'admin';
  if (portfolio) return <div className="min-w-0 space-y-3">
    <button type="button" className="btn-ghost -ml-2" onClick={() => setActiveId(null)}><ArrowLeft size={16} />{tr('All portfolios')}</button>
    <section className="tw-panel"><header><h3>{portfolio.title}</h3></header>{portfolio.description && <p className="text-sm muted">{portfolio.description}</p>}
      {canManage ? <form className="mt-3 flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); if (addId) void runAction(() => addProjectToPortfolio(portfolio.id, addId, currentUserId)).then(() => setAddId('')); }}><select className="input min-w-0 flex-1" value={addId} onChange={(event) => setAddId(event.target.value)}><option value="">{tr('Add a shared project…')}</option>{snapshot.projects.filter((project) => !linkedIds.includes(project.id)).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><button className="btn-outline" disabled={!addId}><Plus size={15} />{tr('Add')}</button></form> : <p className="mt-3 text-xs muted">{tr('Portfolio links can be managed by portfolio leads and admins.')}</p>}
      <ul className="mt-3 space-y-2">{linked.map((project) => { const tasks = snapshot.tasks.filter((task) => task.project_id === project.id); const done = tasks.filter((task) => task.status === 'done').length; return <li key={project.id} className="tw-invite-row !py-2.5"><span className="tw-dot" style={{ background: statusMeta(project.status).color }} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{project.title}</span><span className="text-xs tabular-nums muted">{done}/{tasks.length}</span>{canManage && <button type="button" className="tap-action !h-8 !w-8 text-rose-500" aria-label={tr('Remove from portfolio')} onClick={() => void runAction(() => removeProjectFromPortfolio(portfolio.id, project.id))}><Trash2 size={14} /></button>}</li>; })}</ul>
      {!linked.length && <p className="tw-empty-sm">{tr('No projects in this portfolio yet.')}</p>}
    </section>
  </div>;
  return <div className="min-w-0 space-y-3">
    <form className="tw-panel grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); if (title.trim()) void runAction(async () => { await createSharedPortfolio(title.trim(), description.trim()); setTitle(''); setDescription(''); }); }}>
      <label className="min-w-0"><span className="label">{tr('Portfolio name')}</span><input className="input min-w-0" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} /></label>
      <label className="min-w-0"><span className="label">{tr('Description')}</span><input className="input min-w-0" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></label>
      <button className="btn-primary" type="submit"><Plus size={16} />{tr('Create')}</button>
    </form>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {snapshot.portfolios.map((item) => { const ids = snapshot.portfolioProjects.filter((link) => link.portfolio_id === item.id).map((link) => link.project_id); return <button key={item.id} type="button" className="tw-project-card text-left" onClick={() => setActiveId(item.id)}><h3 className="font-semibold">{item.title}</h3>{item.description && <p className="mt-1 line-clamp-2 text-sm muted">{item.description}</p>}<p className="mt-3 flex flex-wrap gap-1.5">{STATUS.map((status) => { const count = snapshot.projects.filter((project) => ids.includes(project.id) && project.status === status.id).length; return count ? <span key={status.id} className="tw-meta"><span className="tw-dot" style={{ background: status.color }} />{count} {tr(status.label)}</span> : null; })}<span className="tw-meta">{ids.length} {tr('projects')}</span></p></button>; })}
      {!snapshot.portfolios.length && <div className="tw-empty sm:col-span-2 xl:col-span-3"><span>🗂️</span><p className="font-semibold">{tr('Group projects into portfolios')}</p><p className="text-sm muted">{tr('Linking a project never grants access to it.')}</p></div>}
    </div>
  </div>;
}

