import { translate as tr } from '../../../lib/locales';
import { useDragSensors } from '../../../lib/dnd';
import { DndContext, closestCenter, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Circle, CircleDashed, ClipboardList, LayoutGrid, Link2, List, Lock, Pencil, Plus, Search, Share2, Target, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, Goal, Project, Task } from '../../../lib/types';
import { addDays, cx, localeForLanguage, pct, today } from '../../../lib/utils';
import { PillSelect, ProgressRing, relativeDay } from '../team/shared';
import '../team/TeamWorkspace.css';

export const PROJECT_STATUS: { id: Project['status']; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#94a3b8' },
  { id: 'active', label: 'Active', color: '#22c55e' },
  { id: 'on-hold', label: 'On hold', color: '#f59e0b' },
  { id: 'done', label: 'Done', color: '#8b5cf6' },
];
const STATUS_OPTIONS = () => PROJECT_STATUS.map((item) => ({ value: item.id, label: tr(item.label) }));
const meta = (id: Project['status']) => PROJECT_STATUS.find((item) => item.id === id) ?? PROJECT_STATUS[0];
const isBlocked = (project: Project, task: Task) => !task.done && task.dependsOn.some((id) => !project.tasks.find((other) => other.id === id)?.done);
const taskLate = (task: Task) => Boolean(!task.done && task.dueDate && task.dueDate < today());
const projectLate = (project: Project) => Boolean(project.dueDate && project.status !== 'done' && project.dueDate < today());
type Filter = Project['status'] | 'all';
type Sort = 'recent' | 'due' | 'progress' | 'name';

function DueChip({ date, late, language, prefix }: { date?: string; late?: boolean; language: string; prefix?: boolean }) {
  if (!date) return null;
  const soon = !late && date <= addDays(today(), 2);
  return <span className={cx('tw-meta', late && 'is-late', soon && 'is-soon')}><CalendarDays size={12} />{prefix ? `${tr('Due')} ` : ''}{relativeDay(date, localeForLanguage(language))}</span>;
}

/* ============================== LIST ============================== */

function StatusDrop({ id, label, color, count, selected, onSelect }: { id: Filter; label: string; color?: string; count: number; selected: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `private-status:${id}`, data: { status: id }, disabled: id === 'all' });
  return <button ref={setNodeRef} type="button" role="tab" aria-selected={selected} onClick={onSelect} className={cx('tw-chip', selected && 'is-on', isOver && 'is-drop')}>{color && <span className="tw-dot" style={{ background: color }} />}{tr(label)}<b>{count}</b></button>;
}

function ProjectCard({ project, category, goal, language, layout, onOpen, onStatus }: { project: Project; category?: Category; goal?: Goal; language: string; layout: 'grid' | 'list'; onOpen: () => void; onStatus: (status: Project['status']) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `private:${project.id}`, data: { type: 'private-project', projectId: project.id } });
  const done = project.tasks.filter((task) => task.done).length;
  const progress = pct(done, project.tasks.length);
  const late = project.tasks.filter(taskLate).length;
  const next = project.tasks.find((task) => !task.done && !isBlocked(project, task));
  const status = meta(project.status);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(1deg)` } : undefined;
  const statusSelect = <PillSelect className="tw-status-select" style={{ ['--tone' as string]: status.color }} icon={<span className="tw-dot" style={{ background: status.color }} />} value={project.status} ariaLabel={`${tr('Project status')}: ${project.title}`} onChange={onStatus} options={STATUS_OPTIONS()} />;
  const stopInteractiveDrag = (event: React.SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [contenteditable="true"]')) event.stopPropagation();
  };

  if (layout === 'list') return <article ref={setNodeRef} {...attributes} {...listeners} onPointerDownCapture={stopInteractiveDrag} onTouchStartCapture={stopInteractiveDrag} aria-label={`${tr('Move project')}: ${project.title}`} style={style} className={cx('pp-row cursor-grab active:cursor-grabbing', isDragging && 'is-dragging')}>
    <ProgressRing value={progress} size={40} stroke={4} />
    <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
      <span className="block truncate text-sm font-semibold">{project.title}</span>
      <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {category && <span className="tw-meta">{category.icon} {category.name}</span>}
        <span className="tw-meta"><ClipboardList size={12} />{done}/{project.tasks.length}</span>
        {late > 0 && <span className="tw-meta is-late">{late} {tr('late')}</span>}
        <DueChip date={project.dueDate} late={projectLate(project)} language={language} />
      </span>
    </button>
    <span className="hidden sm:inline-flex">{statusSelect}</span>
  </article>;

  return <article ref={setNodeRef} {...attributes} {...listeners} onPointerDownCapture={stopInteractiveDrag} onTouchStartCapture={stopInteractiveDrag} style={style} className={cx('tw-project-card cursor-grab active:cursor-grabbing', isDragging && 'is-dragging')} aria-label={`${tr('Private project')}: ${project.title}`}>
    <span className="tw-project-glow" style={{ background: category?.color ?? status.color }} aria-hidden="true" />
    <div className="flex min-w-0 items-center gap-2">
      {statusSelect}
      {category && <span className="pp-cat" style={{ ['--cat' as string]: category.color }}>{category.icon} {category.name}</span>}
      <span className="flex-1" />
    </div>
    <button type="button" className="mt-3 flex w-full min-w-0 items-start gap-3 text-left" onClick={onOpen}>
      <span className="min-w-0 flex-1"><span className="block break-words text-[15px] font-semibold leading-snug">{project.title}</span>{project.description && <span className="mt-1 line-clamp-2 block break-words text-sm leading-5 muted">{project.description}</span>}</span>
      <ProgressRing value={progress} size={46} />
    </button>
    {next ? <button type="button" className="tw-next" onClick={onOpen}><span className="muted">{tr('Next')}:</span><span className="min-w-0 flex-1 truncate">{next.title}</span>{next.dueDate && <span className={cx('shrink-0', taskLate(next) ? 'text-rose-400' : 'muted')}>{relativeDay(next.dueDate, localeForLanguage(language))}</span>}</button>
      : project.tasks.length === 0 ? <button type="button" className="tw-next" onClick={onOpen}><Plus size={13} className="muted" /><span className="muted">{tr('Add the first task')}</span></button> : null}
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      {goal && <span className="tw-meta min-w-0 max-w-[60%]"><Target size={12} className="shrink-0" /><span className="truncate">{goal.title}</span></span>}
      <span className="flex-1" />
      <span className="tw-meta"><ClipboardList size={12} />{done}/{project.tasks.length}</span>
      {late > 0 && <span className="tw-meta is-late">{late} {tr('late')}</span>}
      <DueChip date={project.dueDate} late={projectLate(project)} language={language} />
    </div>
  </article>;
}

export function PrivateProjectList({ projects, categories, goals, language, shared, sharedLoading, onOpen, onCreate, onStatus, onOpenShared }: {
  projects: Project[]; categories: Category[]; goals: Goal[]; language: string; shared: { id: string; title: string; status: string }[]; sharedLoading: boolean;
  onOpen: (id: string) => void; onCreate: () => void; onStatus: (id: string, status: Project['status']) => void; onOpenShared: (id: string | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>(() => { try { return (localStorage.getItem('lifeos:pp-filter') as Filter) || 'all'; } catch { return 'all'; } });
  const [layout, setLayout] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem('lifeos:pp-layout') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { try { localStorage.setItem('lifeos:pp-filter', filter); localStorage.setItem('lifeos:pp-layout', layout); } catch { /* storage blocked */ } }, [filter, layout]);
  const sensors = useDragSensors('row');
  const catMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])), [categories]);
  const goalMap = useMemo(() => Object.fromEntries(goals.map((goal) => [goal.id, goal])), [goals]);
  const counts = PROJECT_STATUS.reduce((acc, item) => ({ ...acc, [item.id]: projects.filter((project) => project.status === item.id).length }), { all: projects.length } as Record<Filter, number>);
  const q = query.trim().toLowerCase();
  const shown = projects
    .filter((project) => (filter === 'all' || project.status === filter) && (!q || `${project.title} ${project.description} ${project.tasks.map((task) => task.title).join(' ')}`.toLowerCase().includes(q)))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title)
      : sort === 'due' ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      : sort === 'progress' ? pct(b.tasks.filter((t) => t.done).length, b.tasks.length) - pct(a.tasks.filter((t) => t.done).length, a.tasks.length)
      : b.createdAt.localeCompare(a.createdAt));
  const onDragEnd = (event: DragEndEvent) => {
    const target = event.over?.data.current?.status as Filter | undefined;
    const id = event.active.data.current?.projectId as string | undefined;
    const project = projects.find((item) => item.id === id);
    if (!project || !target || target === 'all' || project.status === target) return;
    onStatus(project.id, target);
    setNotice(`${tr('Moved')} “${project.title}” ${tr('to')} ${tr(meta(target).label)}.`);
    setTimeout(() => setNotice(''), 2600);
  };
  const empty = projects.length === 0;

  return <div className="tw-root min-w-0 space-y-3 tw-enter">
    {(shared.length > 0 || sharedLoading) && <div className="pp-shared">
      <span className="pp-shared-label"><Users size={14} />{tr('Team')}</span>
      <div className="tw-chip-row !pb-0 min-w-0 flex-1">{sharedLoading ? <span className="tw-chip tw-skel !min-h-8 w-32" /> : shared.slice(0, 8).map((project) => <button key={project.id} type="button" className="tw-chip" onClick={() => onOpenShared(project.id)}><span className="tw-dot" style={{ background: meta(project.status as Project['status']).color }} /><span className="max-w-[11rem] truncate">{project.title}</span></button>)}</div>
      <button type="button" className="tw-more shrink-0" onClick={() => onOpenShared(null)}>{tr('All')} →</button>
    </div>}

    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="tw-toolbar">
        <div className="tw-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search projects and tasks')} aria-label={tr('Search projects')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={tr('Clear')}><X size={14} /></button>}</div>
        <PillSelect className="pp-sort" value={sort} ariaLabel={tr('Sort projects')} onChange={setSort} options={[{ value: 'recent', label: tr('Newest') }, { value: 'due', label: tr('Due date') }, { value: 'progress', label: tr('Progress') }, { value: 'name', label: tr('Name') }]} />
        <div className="tw-seg" role="tablist" aria-label={tr('Layout')}>
          <button type="button" role="tab" aria-label={tr('Cards')} aria-selected={layout === 'grid'} className={cx(layout === 'grid' && 'is-on')} onClick={() => setLayout('grid')}><LayoutGrid size={15} /></button>
          <button type="button" role="tab" aria-label={tr('List')} aria-selected={layout === 'list'} className={cx(layout === 'list' && 'is-on')} onClick={() => setLayout('list')}><List size={15} /></button>
        </div>
      </div>
      <div className="tw-chip-row" role="tablist" aria-label={tr('Project statuses')}>
        <StatusDrop id="all" label="All" count={counts.all} selected={filter === 'all'} onSelect={() => setFilter('all')} />
        {PROJECT_STATUS.map((item) => <StatusDrop key={item.id} id={item.id} label={item.label} color={item.color} count={counts[item.id]} selected={filter === item.id} onSelect={() => setFilter(item.id)} />)}
      </div>
      {notice && <div className="tw-notice" role="status">{notice}</div>}
      {empty ? <div className="tw-empty"><span>🚀</span><p className="font-semibold">{tr('Start your first project')}</p><p className="max-w-sm text-sm muted">{tr('Projects turn goals into action. Break work into tasks, set dates and see your progress grow.')}</p><button type="button" className="btn-primary mt-3" onClick={onCreate}><Plus size={16} />{tr('Create a project')}</button></div>
        : shown.length === 0 ? <div className="tw-empty"><span>🔍</span><p className="font-semibold">{tr('No projects match')}</p><button type="button" className="tw-link-btn" onClick={() => { setFilter('all'); setQuery(''); }}>{tr('Show all projects')}</button></div>
        : layout === 'grid' ? <div className="tw-project-grid">
          {shown.map((project) => <ProjectCard key={project.id} project={project} category={catMap[project.categoryId]} goal={project.goalId ? goalMap[project.goalId] : undefined} language={language} layout="grid" onOpen={() => onOpen(project.id)} onStatus={(status) => onStatus(project.id, status)} />)}
          <button type="button" className="pp-add-card" onClick={onCreate}><Plus size={20} /><span>{tr('New project')}</span></button>
        </div>
        : <div className="tw-list">{shown.map((project) => <ProjectCard key={project.id} project={project} category={catMap[project.categoryId]} language={language} layout="list" onOpen={() => onOpen(project.id)} onStatus={(status) => onStatus(project.id, status)} />)}</div>}
      {!empty && <p className="text-center text-xs muted">{tr('Tip: drag a project onto a status to move it.')}</p>}
    </DndContext>
  </div>;
}

/* ============================== DETAIL ============================== */

function SortableTask({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const stopInteractiveDrag = (event: React.SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [contenteditable="true"]')) event.stopPropagation();
  };
  return <div ref={setNodeRef} {...attributes} {...listeners} onPointerDownCapture={stopInteractiveDrag} onTouchStartCapture={stopInteractiveDrag} aria-label={tr('Reorder task')} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('tw-task-row cursor-grab active:cursor-grabbing', isDragging && 'pp-dragging')}>{children}</div>;
}

export function PrivateProjectDetail({ project, categories, goals, language, canShare, onBack, onUpdate, onDelete, onShare, onAddTask, onUpdateTask, onDeleteTask, onOpenGoal }: {
  project: Project; categories: Category[]; goals: Goal[]; language: string; canShare: boolean;
  onBack: () => void; onUpdate: (patch: Partial<Project>) => void; onDelete: () => void; onShare: () => void;
  onAddTask: (title: string, due?: string) => void; onUpdateTask: (taskId: string, patch: Partial<Task>) => void; onDeleteTask: (taskId: string) => void; onOpenGoal: (goalId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'open' | 'blocked' | 'done'>('all');
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', due: '' });
  const [extras, setExtras] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [descOpen, setDescOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const desc = useRef<HTMLTextAreaElement>(null);
  const sensors = useDragSensors('row');
  useEffect(() => { setTitleDraft(project.title); setEditTitle(false); setOpenTask(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [project.id]);
  useEffect(() => { const el = desc.current; if (el && descOpen) { el.style.height = 'auto'; el.style.height = `${Math.max(96, el.scrollHeight)}px`; } }, [descOpen, project.description]);

  const status = meta(project.status);
  const category = categories.find((item) => item.id === project.categoryId);
  const goal = goals.find((item) => item.id === project.goalId);
  const done = project.tasks.filter((task) => task.done).length;
  const progress = pct(done, project.tasks.length);
  const blockedCount = project.tasks.filter((task) => isBlocked(project, task)).length;
  const lateCount = project.tasks.filter(taskLate).length;
  const openCount = project.tasks.length - done;
  const stats = [
    { label: 'Open', value: openCount, icon: CircleDashed, tone: '#6366f1', go: 'open' as const },
    { label: 'Blocked', value: blockedCount, icon: Lock, tone: '#f59e0b', go: 'blocked' as const },
    { label: 'Overdue', value: lateCount, icon: AlertTriangle, tone: '#f43f5e', go: 'open' as const },
    { label: 'Done', value: done, icon: CheckCircle2, tone: '#22c55e', go: 'done' as const },
  ];
  const visible = project.tasks.filter((task) => filter === 'all' ? true : filter === 'done' ? task.done : filter === 'blocked' ? isBlocked(project, task) : !task.done);
  const active = visible.filter((task) => !task.done);
  const completed = visible.filter((task) => task.done);
  const add = () => { const title = draft.title.trim(); if (!title) return; onAddTask(title, draft.due || undefined); setDraft({ title: '', due: draft.due }); };
  const onDragEnd = (event: DragEndEvent) => {
    const from = project.tasks.findIndex((task) => task.id === event.active.id);
    const to = project.tasks.findIndex((task) => task.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    onUpdate({ tasks: arrayMove(project.tasks, from, to) });
  };
  const scheduled = project.tasks.filter((task) => task.dueDate).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const locale = localeForLanguage(language);

  const taskRow = (task: Task) => {
    const blockedNow = isBlocked(project, task);
    const after = task.dependsOn.map((id) => project.tasks.find((other) => other.id === id)).filter(Boolean) as Task[];
    const expanded = openTask === task.id;
    return <>
      <div className={cx('tw-task-main', task.done && 'pp-done')}>
        <button type="button" role="checkbox" aria-checked={task.done} disabled={blockedNow} title={blockedNow ? tr('Finish the tasks this depends on first') : undefined} aria-label={tr(task.done ? 'Mark task active' : 'Mark task done')} onClick={() => onUpdateTask(task.id, { done: !task.done })} className={cx('tap-check tw-check', task.done && 'is-done', blockedNow && '!text-amber-500')}>
          {blockedNow ? <Lock size={18} /> : task.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
        <button type="button" className="tw-task-body" aria-expanded={expanded} onClick={() => setOpenTask(expanded ? null : task.id)}>
          <span className={cx('tw-task-title', task.done && 'line-through muted')}>{task.title}</span>
          <span className="tw-task-meta">
            <DueChip date={task.dueDate} late={taskLate(task)} language={language} />
            {after.length > 0 && <span className={cx('tw-meta', blockedNow && 'is-soon')}><Link2 size={12} />{tr('After')} {after.map((item) => item.title).join(', ')}</span>}
          </span>
        </button>
        <button type="button" className="tap-action tw-chevron" aria-label={tr(expanded ? 'Hide details' : 'Details')} onClick={() => setOpenTask(expanded ? null : task.id)}><ChevronDown size={16} className={cx('transition-transform', expanded && 'rotate-180')} /></button>
      </div>
      {expanded && <div className="tw-task-details">
        <label className="min-w-0"><span className="label">{tr('Task')}</span><input className="input min-w-0" defaultValue={task.title} maxLength={500} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && value !== task.title) onUpdateTask(task.id, { title: value }); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="min-w-0"><span className="label">{tr('Due date')}</span><input type="date" className="input min-w-0 !py-2" value={task.dueDate ?? ''} onChange={(event) => onUpdateTask(task.id, { dueDate: event.target.value || undefined })} /></label>
          {[['Today', today()], ['Tomorrow', addDays(today(), 1)], ['Next week', addDays(today(), 7)]].map(([label, value]) => <button key={label} type="button" className={cx('tw-chip', task.dueDate === value && 'is-on')} onClick={() => onUpdateTask(task.id, { dueDate: task.dueDate === value ? undefined : value })}>{tr(label)}</button>)}
        </div>
        {project.tasks.length > 1 && <div className="tw-sub-card"><p className="tw-sub-title"><Link2 size={13} />{tr('Do this after')}</p><div className="flex min-w-0 flex-wrap gap-1.5">{project.tasks.filter((other) => other.id !== task.id).map((other) => { const on = task.dependsOn.includes(other.id); return <button key={other.id} type="button" aria-pressed={on} className={cx('tw-chip !min-h-8 max-w-full', on && 'is-on')} onClick={() => onUpdateTask(task.id, { dependsOn: on ? task.dependsOn.filter((id) => id !== other.id) : [...task.dependsOn, other.id] })}><span className="truncate">{other.title}</span></button>; })}</div></div>}
        <div className="flex justify-end"><button type="button" className="tw-link-btn text-rose-500" onClick={() => onDeleteTask(task.id)}><Trash2 size={13} />{tr('Delete task')}</button></div>
      </div>}
    </>;
  };

  return <div className="tw-root min-w-0 space-y-3 tw-enter">
    <div className="flex min-w-0 items-center gap-1">
      <button type="button" className="btn-ghost -ml-2 !min-h-10" onClick={onBack}><ArrowLeft size={17} />{tr('Projects')}</button>
      <span className="flex-1" />
      <span className="pp-private-tag"><Lock size={12} />{tr('Private')}</span>
      {canShare && <button type="button" className="tw-icon-btn" title={tr('Copy to a team project')} aria-label={tr('Copy to a team project')} onClick={onShare}><Share2 size={16} /></button>}
      <button type="button" className="tw-icon-btn hover:!text-rose-500" title={tr('Delete project')} aria-label={tr('Delete project')} onClick={onDelete}><Trash2 size={16} /></button>
    </div>

    <header className="tw-hero">
      <span className="tw-hero-orb" aria-hidden="true" />
      <div className="relative flex min-w-0 items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PillSelect className="tw-status-select" style={{ ['--tone' as string]: status.color }} icon={<span className="tw-dot" style={{ background: status.color }} />} value={project.status} ariaLabel={tr('Project status')} onChange={(value) => onUpdate({ status: value })} options={STATUS_OPTIONS()} />
            <PillSelect className="pp-cat" style={{ ['--cat' as string]: category?.color ?? '#64748b' }} value={project.categoryId} ariaLabel={tr('Category')} onChange={(value) => onUpdate({ categoryId: value })} options={categories.map((item) => ({ value: item.id, label: `${item.icon} ${item.name}` }))} />
            <label className={cx('tw-meta pp-date', projectLate(project) && 'is-late')}><CalendarDays size={12} /><span>{project.dueDate ? `${tr('Due')} ${relativeDay(project.dueDate, locale)}` : tr('Set due date')}</span><input type="date" value={project.dueDate ?? ''} aria-label={tr('Project due date')} onChange={(event) => onUpdate({ dueDate: event.target.value || undefined })} /></label>
          </div>
          {editTitle ? <form className="mt-2 flex min-w-0 gap-1.5" onSubmit={(event) => { event.preventDefault(); const value = titleDraft.trim(); if (value) { onUpdate({ title: value }); setEditTitle(false); } }}>
            <input autoFocus className="input min-w-0 text-lg font-bold" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={200} aria-label={tr('Project name')} onBlur={() => { const value = titleDraft.trim(); if (value && value !== project.title) onUpdate({ title: value }); setEditTitle(false); }} />
          </form> : <button type="button" className="group mt-2 flex min-w-0 items-start gap-2 text-left" onClick={() => { setTitleDraft(project.title); setEditTitle(true); }} title={tr('Rename project')}>
            <h2 className="min-w-0 break-words text-xl font-bold leading-tight tracking-tight sm:text-2xl">{project.title}</h2><Pencil size={14} className="mt-1.5 shrink-0 opacity-40 transition group-hover:opacity-100" />
          </button>}
          {descOpen ? <textarea ref={desc} autoFocus className="input mt-2 min-w-0 resize-none text-sm leading-6" value={project.description} placeholder={tr('Plan, scope, links, notes…')} onChange={(event) => onUpdate({ description: event.target.value })} onBlur={() => setDescOpen(false)} aria-label={tr('Description / plan')} />
            : <button type="button" className="mt-1.5 block w-full min-w-0 text-left" onClick={() => setDescOpen(true)}>{project.description ? <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 muted">{project.description}</p> : <p className="text-sm muted opacity-70">+ {tr('Add a plan or description')}</p>}</button>}
        </div>
        <ProgressRing value={progress} size={64} stroke={5} label={`${progress}% ${tr('complete')}`} />
      </div>
      <div className="relative mt-3 flex min-w-0 flex-wrap items-center gap-2">
        <PillSelect className={cx('pp-goal', goal && 'is-set')} icon={<Target size={13} className="shrink-0" />} value={project.goalId ?? ''} ariaLabel={tr('Supports goal')} onChange={(value) => onUpdate({ goalId: value || undefined })} options={[{ value: '', label: tr(goal ? 'No goal' : 'Link to a goal') }, ...goals.map((item) => ({ value: item.id, label: item.title }))]} />
        {goal && <button type="button" className="tw-link-btn" onClick={() => onOpenGoal(goal.id)}>{tr('Open goal')} →</button>}
        <span className="flex-1" />
        <span className="text-xs muted">{done}/{project.tasks.length} {tr('tasks done')}</span>
      </div>
    </header>

    <div className="tw-stats">{stats.map(({ label, value, icon: Icon, tone, go }) => <button key={label} type="button" className="tw-stat" style={{ ['--tone' as string]: tone }} onClick={() => setFilter(go)}><span className="tw-stat-icon"><Icon size={16} /></span><b>{value}</b><span>{tr(label)}</span></button>)}</div>

    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3" aria-label={tr('Project tasks')}>
        <form className="tw-quick-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
          <div className="flex min-w-0 items-center gap-2">
            <Plus size={18} className="shrink-0 text-[color:var(--accent)]" />
            <input className="tw-quick-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} onFocus={() => setExtras(true)} maxLength={500} placeholder={tr('Add a task…')} aria-label={tr('New task')} />
            <button className="btn-primary !min-h-9 shrink-0 !px-3" disabled={!draft.title.trim()}>{tr('Add')}</button>
          </div>
          {extras && <div className="tw-quick-extras">
            <label className="tw-mini-field"><CalendarDays size={14} /><input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} aria-label={tr('Due date')} /></label>
            {[['Today', today()], ['Tomorrow', addDays(today(), 1)], ['Next week', addDays(today(), 7)]].map(([label, value]) => <button key={label} type="button" className={cx('tw-chip', draft.due === value && 'is-on')} onClick={() => setDraft({ ...draft, due: draft.due === value ? '' : value })}>{tr(label)}</button>)}
          </div>}
        </form>
        <div className="tw-chip-row" role="tablist" aria-label={tr('Filter tasks')}>
          {([['all', 'All', project.tasks.length], ['open', 'Open', openCount], ['blocked', 'Blocked', blockedCount], ['done', 'Done', done]] as const).map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={cx('tw-chip', filter === id && 'is-on')} onClick={() => setFilter(id)}>{tr(label)}<b>{count}</b></button>)}
        </div>
        {project.tasks.length === 0 ? <div className="tw-empty"><span>✨</span><p className="font-semibold">{tr('No tasks yet')}</p><p className="text-sm muted">{tr('Add one small next step to begin.')}</p></div>
          : visible.length === 0 ? <p className="tw-empty-sm">{tr('No tasks match this filter.')}</p>
          : <>
            {active.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={active.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                <div className="tw-list">{active.map((task) => <SortableTask key={task.id} id={task.id}>{taskRow(task)}</SortableTask>)}</div>
              </SortableContext>
            </DndContext>}
            {completed.length > 0 && <div className="tw-group">
              <button type="button" className="tw-group-head w-full" aria-expanded={showDone || filter === 'done'} onClick={() => setShowDone((value) => !value)}><span className="tw-dot" style={{ background: '#22c55e' }} />{tr('Completed')}<span className="tw-count">{completed.length}</span><ChevronDown size={15} className={cx('ms-auto transition-transform', (showDone || filter === 'done') && 'rotate-180')} /></button>
              {(showDone || filter === 'done') && <div className="tw-list">{completed.map((task) => <div key={task.id} className="tw-task-row">{taskRow(task)}</div>)}</div>}
            </div>}
          </>}
      </section>

      <aside className="min-w-0 space-y-3">
        <section className="tw-panel">
          <header><h3>{tr('Roadmap')}</h3><span className="text-xs muted">{scheduled.length} {tr('scheduled')}</span></header>
          {scheduled.length ? <ol className="tw-tl">{scheduled.slice(0, 8).map((task) => <li key={task.id} className={cx('tw-tl-item', task.done && 'is-done', taskLate(task) && 'is-late', task.dueDate === today() && 'is-today')} style={{ ['--tone' as string]: task.done ? '#22c55e' : taskLate(task) ? '#f43f5e' : status.color }}>
            <span className="tw-tl-date"><b>{Number(task.dueDate!.slice(8))}</b>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString(locale, { month: 'short' })}</span>
            <div className="tw-tl-card !py-2 !pl-3"><p className={cx('tw-task-title', task.done && 'line-through muted')}>{task.title}</p></div>
          </li>)}</ol> : <p className="tw-empty-sm">{tr('Give tasks a due date to see them on the roadmap.')}</p>}
        </section>
        {canShare && <button type="button" className="pp-share-card" onClick={onShare}><Users size={18} /><span className="min-w-0 flex-1 text-left"><b className="block text-sm">{tr('Work on this with others?')}</b><span className="text-xs muted">{tr('Copy it to a team project. Your private version stays.')}</span></span><Share2 size={15} /></button>}
      </aside>
    </div>
  </div>;
}
