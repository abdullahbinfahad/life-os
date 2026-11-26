import { translate as tr } from '../../../lib/locales';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, GripVertical, LayoutGrid, Link2, List, LockKeyhole, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addDays, cx, fmtDate, localeForLanguage, today } from '../../../lib/utils';
import { addPrivateTaskLink, addSharedDependency, deleteSharedTask, removePrivateTaskLink, removeSharedDependency, type PrivateTaskLink, type SharedMember, type SharedTask, type SharedTaskStatus, type SharedWorkspaceSnapshot } from '../../../lib/sharedProjects';
import { Avatar, ROLE_LABEL, TASK_STATUS, isOpen, isOverdue, memberLabel, memberName, relativeDay, taskStatusMeta, type RunAction } from './shared';

type Filter = 'all' | 'mine' | 'open' | 'overdue' | 'done';
type View = 'list' | 'board' | 'calendar';

export interface TaskContext {
  projectId: string; members: SharedMember[]; currentUserId: string; canWork: boolean; canManage: boolean; language: string;
  allTasks: SharedTask[]; dependencies: SharedWorkspaceSnapshot['dependencies']; privateLinks: PrivateTaskLink[]; privateLabels: Record<string, string>;
  goals: Array<{ id: string; title: string }>; habits: Array<{ id: string; title: string }>;
  runAction: RunAction; updateTask: (taskId: string, patch: Partial<SharedTask>) => Promise<boolean>;
}

function DueChip({ task, language }: { task: SharedTask; language: string }) {
  if (!task.due_date) return null;
  const late = isOverdue(task);
  const soon = !late && isOpen(task) && task.due_date <= addDays(today(), 2);
  return <span className={cx('tw-meta', late && 'is-late', soon && 'is-soon')}><CalendarDays size={12} />{relativeDay(task.due_date, localeForLanguage(language))}</span>;
}

export function TaskCheck({ task, canWork, onToggle, size = 20 }: { task: SharedTask; canWork: boolean; onToggle: () => void; size?: number }) {
  const done = task.status === 'done';
  return <button type="button" role="checkbox" aria-checked={done} disabled={!canWork} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={tr(done ? 'Reopen task' : 'Mark task done')} className={cx('tap-check tw-check', done && 'is-done')}>
    {done ? <CheckCircle2 size={size} /> : <Circle size={size} />}
  </button>;
}

function TaskDetails({ task, ctx }: { task: SharedTask; ctx: TaskContext }) {
  const { projectId, members, currentUserId, canWork, canManage, allTasks, dependencies, privateLinks, privateLabels, goals, habits, runAction, updateTask } = ctx;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [dependsOn, setDependsOn] = useState('');
  const [privateLinkValue, setPrivateLinkValue] = useState('');
  const taskDeps = dependencies.filter((dep) => dep.task_id === task.id);
  const taskLinks = privateLinks.filter((link) => link.task_id === task.id);
  const save = (patch: Partial<SharedTask>) => void updateTask(task.id, patch);
  return <div className="tw-task-details">
    {editingTitle ? <form className="flex min-w-0 gap-1.5" onSubmit={(event) => { event.preventDefault(); const next = titleDraft.trim(); if (!next) return; if (next === task.title) { setEditingTitle(false); return; } void updateTask(task.id, { title: next }).then((saved) => { if (saved) setEditingTitle(false); }); }}>
      <input autoFocus className="input min-w-0 !py-1.5 text-sm" value={titleDraft} maxLength={500} onChange={(event) => setTitleDraft(event.target.value)} aria-label={tr('Task title')} />
      <button className="btn-primary !min-h-9 !px-2.5" type="submit" aria-label={tr('Save title')}><Check size={15} /></button>
      <button className="btn-ghost !min-h-9 !px-2.5" type="button" onClick={() => { setTitleDraft(task.title); setEditingTitle(false); }} aria-label={tr('Cancel')}><X size={15} /></button>
    </form> : canWork && <button type="button" className="tw-link-btn" onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}><Pencil size={13} />{tr('Rename task')}</button>}
    <div className="tw-status-pills" role="radiogroup" aria-label={tr('Task status')}>
      {TASK_STATUS.map((status) => <button key={status.id} type="button" role="radio" aria-checked={task.status === status.id} disabled={!canWork} onClick={() => task.status !== status.id && save({ status: status.id })} className={cx('tw-status-pill', task.status === status.id && 'is-on')} style={{ ['--pill' as string]: status.color }}><span />{tr(status.label)}</button>)}
    </div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
      <label className="min-w-0"><span className="label">{tr('Due date')}</span><input disabled={!canWork} type="date" className="input min-w-0 !py-2" value={task.due_date ?? ''} onChange={(event) => save({ due_date: event.target.value || null })} /></label>
      <label className="min-w-0"><span className="label">{tr('Assignee')}</span><select disabled={!canWork} className="input min-w-0 !py-2" value={task.assignee_id ?? ''} onChange={(event) => save({ assignee_id: event.target.value || null })}><option value="">{tr('Unassigned')}</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel(member.user_id, members, currentUserId)} · {tr(ROLE_LABEL[member.role])}</option>)}</select></label>
      <label className="min-w-0"><span className="label">{tr('Estimate (minutes)')}</span><input disabled={!canWork} type="number" min="0" max="100000" inputMode="numeric" className="input min-w-0 !py-2" defaultValue={task.estimate_minutes ?? ''} onBlur={(event) => { const value = event.currentTarget.value ? Number(event.currentTarget.value) : null; if (value !== task.estimate_minutes) save({ estimate_minutes: value }); }} /></label>
    </div>
    <label className="block min-w-0"><span className="label">{tr('Task details')}</span><textarea disabled={!canWork} className="input min-h-20 min-w-0 resize-y" placeholder={tr('Add context, links or acceptance criteria…')} defaultValue={task.details} onBlur={(event) => { if (event.currentTarget.value !== task.details) save({ details: event.currentTarget.value }); }} /></label>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <div className="tw-sub-card">
        <p className="tw-sub-title"><Link2 size={13} />{tr('Waiting on')}</p>
        {taskDeps.map((dep) => { const other = allTasks.find((candidate) => candidate.id === dep.depends_on_task_id); return <div key={dep.depends_on_task_id} className="flex min-w-0 items-center gap-2 py-1 text-xs"><span className={cx('min-w-0 flex-1 break-words', other?.status === 'done' && 'line-through muted')}>{other?.title ?? tr('Task')}</span>{canWork && <button type="button" className="tap-action !h-7 !w-7 text-rose-500" aria-label={tr('Remove dependency')} onClick={() => void runAction(() => removeSharedDependency(projectId, task.id, dep.depends_on_task_id))}><X size={13} /></button>}</div>; })}
        {canWork && <div className="mt-1 flex min-w-0 gap-1.5"><select className="input min-w-0 flex-1 !py-1.5 text-xs" value={dependsOn} onChange={(event) => setDependsOn(event.target.value)}><option value="">{tr('Depends on…')}</option>{allTasks.filter((candidate) => candidate.id !== task.id && !taskDeps.some((dep) => dep.depends_on_task_id === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button type="button" disabled={!dependsOn} className="btn-outline !min-h-9 !px-2" aria-label={tr('Add dependency')} onClick={() => { if (dependsOn) void runAction(() => addSharedDependency(projectId, task.id, dependsOn, currentUserId)).then(() => setDependsOn('')); }}><Plus size={14} /></button></div>}
      </div>
      <div className="tw-sub-card is-private">
        <p className="tw-sub-title"><LockKeyhole size={13} />{tr('Private link to my goal or habit')}</p>
        <p className="mb-1 text-[11px] leading-4 muted">{tr('Only you can see this connection.')}</p>
        {taskLinks.map((link) => <div key={link.id} className="flex items-center gap-2 py-1 text-xs"><span className="min-w-0 flex-1 break-words">{privateLabels[`${link.personal_item_type}:${link.personal_item_id}`] ?? tr('Personal item')}</span><button type="button" className="tap-action !h-7 !w-7 text-rose-500" aria-label={tr('Remove private link')} onClick={() => void runAction(() => removePrivateTaskLink(link.id))}><X size={13} /></button></div>)}
        {canWork && <div className="mt-1 flex min-w-0 gap-1.5"><select className="input min-w-0 flex-1 !py-1.5 text-xs" value={privateLinkValue} onChange={(event) => setPrivateLinkValue(event.target.value)}><option value="">{tr('Link a personal outcome…')}</option>{goals.map((item) => <option key={`goal:${item.id}`} value={`goal:${item.id}`}>🎯 {item.title}</option>)}{habits.map((item) => <option key={`habit:${item.id}`} value={`habit:${item.id}`}>↻ {item.title}</option>)}</select><button type="button" disabled={!privateLinkValue} className="btn-outline !min-h-9 !px-2" aria-label={tr('Add private link')} onClick={() => { const [type, id] = privateLinkValue.split(':'); if (id && (type === 'goal' || type === 'habit')) void runAction(() => addPrivateTaskLink(task.id, currentUserId, type, id)).then(() => setPrivateLinkValue('')); }}><Plus size={14} /></button></div>}
      </div>
    </div>
    {(canManage || task.created_by === currentUserId) && <div className="flex justify-end"><button type="button" className="tw-link-btn text-rose-500" onClick={() => { if (confirm(tr('Delete this task for everyone?'))) void runAction(() => deleteSharedTask(task.id)); }}><Trash2 size={13} />{tr('Delete task')}</button></div>}
  </div>;
}

export function TaskRow({ task, ctx, open, onOpen }: { task: SharedTask; ctx: TaskContext; open: boolean; onOpen: () => void }) {
  const { members, currentUserId, canWork, dependencies, allTasks, language, updateTask } = ctx;
  const waiting = dependencies.filter((dep) => dep.task_id === task.id).map((dep) => allTasks.find((other) => other.id === dep.depends_on_task_id)).filter((other) => other && isOpen(other)).length;
  const meta = taskStatusMeta(task.status);
  const assignee = task.assignee_id ? memberName(task.assignee_id, members) : '';
  return <article className={cx('tw-task-row', open && 'is-open', task.status === 'done' && 'is-done')}>
    <div className="tw-task-main">
      <TaskCheck task={task} canWork={canWork} onToggle={() => void updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })} />
      <button type="button" className="tw-task-body" aria-expanded={open} onClick={onOpen}>
        <span className="tw-task-title">{task.title}</span>
        <span className="tw-task-meta">
          {task.status !== 'todo' && task.status !== 'done' && <span className="tw-meta" style={{ color: meta.color }}><span className="tw-dot" style={{ background: meta.color }} />{tr(meta.label)}</span>}
          <DueChip task={task} language={language} />
          {waiting > 0 && <span className="tw-meta is-soon"><Link2 size={12} />{tr('Waiting')} {waiting}</span>}
          {task.estimate_minutes ? <span className="tw-meta"><Clock size={12} />{task.estimate_minutes}m</span> : null}
        </span>
      </button>
      {task.assignee_id ? <Avatar id={task.assignee_id} name={assignee} size={26} className="shrink-0" /> : <span className="tw-avatar-empty" title={tr('Unassigned')}><UserRound size={13} /></span>}
      <button type="button" className="tap-action tw-chevron" aria-label={tr(open ? 'Hide details' : 'Details')} onClick={onOpen}><ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} /></button>
    </div>
    {open && <TaskDetails task={task} ctx={ctx} />}
  </article>;
}

function BoardCard({ task, ctx, onOpen }: { task: SharedTask; ctx: TaskContext; onOpen: () => void }) {
  const { members, currentUserId, canWork, language, updateTask } = ctx;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `shared-task:${task.id}`, data: { type: 'shared-task', taskId: task.id }, disabled: !canWork });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(1.5deg)` } : undefined;
  return <article ref={setNodeRef} style={style} className={cx('tw-board-card', isDragging && 'is-dragging', task.status === 'done' && 'is-done')}>
    <div className="flex min-w-0 items-start gap-1">
      <TaskCheck task={task} canWork={canWork} size={18} onToggle={() => void updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })} />
      <button type="button" className="min-w-0 flex-1 pt-1.5 text-left" onClick={onOpen}><span className="tw-task-title">{task.title}</span></button>
      {canWork && <button type="button" aria-label={`${tr('Drag to change task status')}: ${task.title}`} {...attributes} {...listeners} className="tw-grip"><GripVertical size={15} /></button>}
    </div>
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 ps-1">
      <DueChip task={task} language={language} />
      <span className="flex-1" />
      {task.assignee_id && <Avatar id={task.assignee_id} name={memberName(task.assignee_id, members)} size={22} />}
    </div>
  </article>;
}

function BoardColumn({ status, count, children }: { status: SharedTaskStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `shared-task-status:${status}`, data: { status } });
  const meta = taskStatusMeta(status);
  return <section ref={setNodeRef} aria-label={`${tr(meta.label)} · ${count}`} className={cx('tw-board-col', isOver && 'is-over')} style={{ ['--col' as string]: meta.color }}>
    <h4 className="tw-board-head"><span className="tw-dot" style={{ background: meta.color }} />{tr(meta.label)}<span className="tw-count">{count}</span></h4>
    <div className="tw-board-list">{children}{count === 0 && <p className="tw-board-empty">{tr('Drop tasks here')}</p>}</div>
  </section>;
}

export default function TeamTasks({ tasks, ctx, busy, onAdd }: { tasks: SharedTask[]; ctx: TaskContext; busy: boolean; onAdd: (title: string, due: string, assignee: string) => Promise<boolean> }) {
  const { members, currentUserId, canWork, language, updateTask } = ctx;
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', due: '', assignee: '' });
  const [showExtras, setShowExtras] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [day, setDay] = useState(today());
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor));

  const counts = useMemo(() => ({
    all: tasks.length,
    mine: tasks.filter((task) => task.assignee_id === currentUserId && isOpen(task)).length,
    open: tasks.filter(isOpen).length,
    overdue: tasks.filter(isOverdue).length,
    done: tasks.filter((task) => task.status === 'done').length,
  }), [tasks, currentUserId]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (q && !`${task.title} ${task.details}`.toLowerCase().includes(q)) return false;
      if (filter === 'mine') return task.assignee_id === currentUserId && isOpen(task);
      if (filter === 'open') return isOpen(task);
      if (filter === 'overdue') return isOverdue(task);
      if (filter === 'done') return task.status === 'done';
      return true;
    }).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.created_at.localeCompare(a.created_at));
  }, [tasks, query, filter, currentUserId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    const saved = await onAdd(title, draft.due, draft.assignee);
    if (saved) setDraft({ title: '', due: draft.due, assignee: draft.assignee });
  };
  const onDragEnd = (event: DragEndEvent) => {
    const active = event.active.data.current; const target = event.over?.data.current?.status as SharedTaskStatus | undefined;
    const task = tasks.find((item) => item.id === active?.taskId);
    if (task && target && task.status !== target) void updateTask(task.id, { status: target });
  };
  const toggleOpen = (id: string) => setOpenId((current) => current === id ? null : id);

  const groups = (['in-progress', 'blocked', 'todo'] as SharedTaskStatus[]).map((status) => ({ status, items: visible.filter((task) => task.status === status) })).filter((group) => group.items.length);
  const doneItems = visible.filter((task) => task.status === 'done' || task.status === 'cancelled');

  const firstDay = `${month}-01`;
  const offset = (new Date(`${firstDay}T12:00:00`).getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => addDays(firstDay, index - offset));
  const byDate = new Map<string, SharedTask[]>();
  for (const task of visible) if (task.due_date) byDate.set(task.due_date, [...(byDate.get(task.due_date) ?? []), task]);
  const locale = localeForLanguage(language);
  const shiftMonth = (delta: number) => { const date = new Date(`${firstDay}T12:00:00`); date.setMonth(date.getMonth() + delta); const next = date.toISOString().slice(0, 7); setMonth(next); setDay(`${next}-01`); };

  return <section className="min-w-0 space-y-3" aria-label={tr('Shared project tasks')}>
    {canWork ? <form className="tw-quick-add" onSubmit={(event) => void submit(event)}>
      <div className="flex min-w-0 items-center gap-2">
        <Plus size={18} className="shrink-0 text-[color:var(--accent)]" />
        <input className="tw-quick-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} onFocus={() => setShowExtras(true)} maxLength={500} placeholder={tr('Add a task for the team…')} aria-label={tr('New shared task')} />
        <button className="btn-primary !min-h-9 shrink-0 !px-3" disabled={busy || !draft.title.trim()}>{tr('Add')}</button>
      </div>
      {showExtras && <div className="tw-quick-extras">
        <label className="tw-mini-field"><CalendarDays size={14} /><input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} aria-label={tr('Due date')} /></label>
        <label className="tw-mini-field"><UserRound size={14} /><select value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} aria-label={tr('Assign to')}><option value="">{tr('No assignee')}</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel(member.user_id, members, currentUserId)}</option>)}</select></label>
        {[['Today', today()], ['Tomorrow', addDays(today(), 1)], ['Next week', addDays(today(), 7)]].map(([label, value]) => <button key={label} type="button" className={cx('tw-chip', draft.due === value && 'is-on')} onClick={() => setDraft({ ...draft, due: draft.due === value ? '' : value })}>{tr(label)}</button>)}
        <button type="button" className={cx('tw-chip', draft.assignee === currentUserId && 'is-on')} onClick={() => setDraft({ ...draft, assignee: draft.assignee === currentUserId ? '' : currentUserId })}>{tr('Assign to me')}</button>
      </div>}
    </form> : <p className="tw-readonly">{tr('Viewer access is read-only.')}</p>}

    <div className="tw-toolbar">
      <div className="tw-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search tasks')} aria-label={tr('Search tasks')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={tr('Clear')}><X size={14} /></button>}</div>
      <div className="tw-seg" role="tablist" aria-label={tr('Task view')}>
        {([['list', List, 'List'], ['board', LayoutGrid, 'Board'], ['calendar', CalendarDays, 'Calendar']] as const).map(([id, Icon, label]) => <button key={id} type="button" role="tab" aria-label={tr(label)} aria-selected={view === id} className={cx(view === id && 'is-on')} onClick={() => setView(id)}><Icon size={15} /><span>{tr(label)}</span></button>)}
      </div>
    </div>
    <div className="tw-chip-row" role="tablist" aria-label={tr('Filter tasks')}>
      {([['all', 'All'], ['mine', 'Mine'], ['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Done']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={cx('tw-chip', filter === id && 'is-on', id === 'overdue' && counts.overdue > 0 && 'is-alert')} onClick={() => setFilter(id)}>{tr(label)}<b>{counts[id]}</b></button>)}
    </div>

    {tasks.length === 0 ? <div className="tw-empty"><span>✨</span><p className="font-semibold">{tr('No shared tasks yet')}</p><p className="text-sm muted">{tr('Add the first next step so everyone can see the same work.')}</p></div>
      : view === 'list' ? <div className="min-w-0 space-y-3">
        {visible.length === 0 && <p className="tw-empty-sm">{tr('No tasks match this filter.')}</p>}
        {groups.map((group) => { const meta = taskStatusMeta(group.status); return <div key={group.status} className="tw-group">
          <h4 className="tw-group-head"><span className="tw-dot" style={{ background: meta.color }} />{tr(meta.label)}<span className="tw-count">{group.items.length}</span></h4>
          <div className="tw-list">{group.items.map((task) => <TaskRow key={task.id} task={task} ctx={ctx} open={openId === task.id} onOpen={() => toggleOpen(task.id)} />)}</div>
        </div>; })}
        {doneItems.length > 0 && <div className="tw-group">
          <button type="button" className="tw-group-head w-full" aria-expanded={showDone || filter === 'done'} onClick={() => setShowDone((value) => !value)}><span className="tw-dot" style={{ background: '#22c55e' }} />{tr('Completed')}<span className="tw-count">{doneItems.length}</span><ChevronDown size={15} className={cx('ms-auto transition-transform', (showDone || filter === 'done') && 'rotate-180')} /></button>
          {(showDone || filter === 'done') && <div className="tw-list">{doneItems.map((task) => <TaskRow key={task.id} task={task} ctx={ctx} open={openId === task.id} onOpen={() => toggleOpen(task.id)} />)}</div>}
        </div>}
      </div>
      : view === 'board' ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="tw-board">{TASK_STATUS.filter((status) => status.id !== 'cancelled' || visible.some((task) => task.status === 'cancelled')).map((status) => { const items = visible.filter((task) => task.status === status.id); return <BoardColumn key={status.id} status={status.id} count={items.length}>{items.map((task) => <BoardCard key={task.id} task={task} ctx={ctx} onOpen={() => { setView('list'); setFilter('all'); setOpenId(task.id); }} />)}</BoardColumn>; })}</div>
        {canWork && <p className="text-center text-xs muted">{tr('Drag a card by its handle to move it between columns.')}</p>}
      </DndContext>
      : <div className="tw-cal card">
        <div className="tw-cal-head"><button type="button" className="tap-action !opacity-100" onClick={() => shiftMonth(-1)} aria-label={tr('Previous month')}><ChevronLeft size={17} /></button><h4>{new Date(`${firstDay}T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h4><button type="button" className="tap-action !opacity-100" onClick={() => shiftMonth(1)} aria-label={tr('Next month')}><ChevronRight size={17} /></button></div>
        <div className="tw-cal-grid">
          {Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' })).map((label, index) => <span key={index} className="tw-cal-wd">{label}</span>)}
          {days.map((date) => { const list = byDate.get(date) ?? []; const late = list.some(isOverdue); return <button key={date} type="button" aria-pressed={day === date} onClick={() => setDay(date)} className={cx('tw-cal-day', date.slice(0, 7) !== month && 'is-out', day === date && 'is-on', date === today() && 'is-today')}>
            <span>{Number(date.slice(8))}</span>{list.length > 0 && <i className={cx(late && 'is-late')}>{list.length > 3 ? '•••' : '•'.repeat(list.length)}</i>}
          </button>; })}
        </div>
        <p className="mt-3 text-xs font-semibold muted">{fmtDate(day, language)}</p>
        <div className="tw-list mt-2">{(byDate.get(day) ?? []).map((task) => <TaskRow key={task.id} task={task} ctx={ctx} open={openId === task.id} onOpen={() => toggleOpen(task.id)} />)}</div>
        {!(byDate.get(day) ?? []).length && <p className="tw-empty-sm">{tr('No tasks due on this date')}</p>}
      </div>}
  </section>;
}
