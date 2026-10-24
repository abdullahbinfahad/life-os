import { translate as tr } from '../lib/locales';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CheckCircle2, Circle, FolderKanban, GripVertical, Link2, Lock, Plus, Trash2, Users } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader, Progress } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Project } from '../lib/types';
import { cx, fmtDate, pct, today } from '../lib/utils';
const SharedProjectsWorkspace = lazy(() => import('../components/projects/SharedProjectsWorkspace'));

const COLS: { id: Project['status']; label: string; color: string; tone: string }[] = [
  { id: 'planning', label: 'Planning', color: '#64748b', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200' },
  { id: 'active', label: 'Active', color: '#16a34a', tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { id: 'on-hold', label: 'On hold', color: '#d97706', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  { id: 'done', label: 'Done', color: '#4f46e5', tone: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300' },
];

function StatusTab({ status, label, count, selected, onSelect, color }: {
  status: Project['status']; label: string; count: number; selected: boolean; onSelect: () => void; color: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}`, data: { status } });
  return (
    <button ref={setNodeRef} type="button" aria-pressed={selected} onClick={onSelect}
      className={cx('project-status-tab group flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition',
        selected ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-white/[.035] dark:text-slate-200',
        isOver && 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-[#0b0d12]')}
      style={!selected ? { borderInlineStartColor: color } : undefined}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected ? 'currentColor' : color }} />
      {label}
      <span className={cx('rounded-full px-1.5 py-0.5 text-xs tabular-nums', selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>{count}</span>
    </button>
  );
}

function ProjectCard({ project, category, onOpen }: { project: Project; category?: { name: string; color: string; icon: string }; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `private:${project.id}`, data: { type: 'private-project', projectId: project.id } });
  const done = project.tasks.filter((task) => task.done).length;
  const progress = pct(done, project.tasks.length);
  const overdue = Boolean(project.dueDate && project.dueDate < today() && project.status !== 'done');
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const status = COLS.find((item) => item.id === project.status)!;
  return (
    <article ref={setNodeRef} style={style} className={cx('project-card card group relative grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] gap-2 p-3.5 transition sm:p-4', isDragging && 'z-20 opacity-55 shadow-xl')}>
      <button type="button" onClick={onOpen} className="min-w-0 text-left focus-visible:rounded-lg">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cx('h-2 w-2 shrink-0 rounded-full', status.tone)} style={{ backgroundColor: status.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-5 text-slate-900 dark:text-slate-100">{project.title}</span>
        </div>
        {project.description && <p className="mt-1.5 line-clamp-2 break-words text-sm leading-5 muted">{project.description}</p>}
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
          <CatBadge cat={category as any} />
          {project.dueDate && <span className={cx('chip max-w-full', overdue ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-white/[.07] dark:text-slate-300')}>{tr('Due')} · {fmtDate(project.dueDate)}</span>}
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs muted"><Progress value={progress} color={status.color} /><span className="shrink-0 tabular-nums">{done}/{project.tasks.length}</span></div>
      </button>
      <button type="button" aria-label={`${tr('Move project')}: ${project.title}`} title={tr('Drag to move between statuses')} {...attributes} {...listeners}
        className="grid h-9 w-9 touch-none place-items-center self-start rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 focus-visible:text-indigo-700 dark:hover:bg-white/10 dark:hover:text-indigo-300">
        <GripVertical size={18} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function Projects() {
  const { projects, goals, categories, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask } = useStore();
  const catMap = useCategoryMap();
  const [selectedStatus, setSelectedStatus] = useState<Project['status']>('active');
  const [workspaceMode, setWorkspaceMode] = useState<'private' | 'shared'>('private');
  const [sharedDetailOpen, setSharedDetailOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
  const [taskText, setTaskText] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [dragNotice, setDragNotice] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 190, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const open = projects.find((project) => project.id === openId) ?? null;
  const visibleProjects = projects.filter((project) => project.status === selectedStatus);
  const selectedMeta = COLS.find((column) => column.id === selectedStatus)!;

  const create = () => {
    if (!form.title.trim()) return;
    const id = addProject({ ...form, goalId: form.goalId || undefined, dueDate: form.dueDate || undefined });
    setSelectedStatus('planning');
    setCreating(false);
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
    setOpenId(id);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const target = event.over?.data.current?.status as Project['status'] | undefined;
    const data = event.active.data.current;
    if (data?.type === 'private-project' && target && COLS.some((column) => column.id === target)) {
      const projectId = data.projectId as string;
      const project = projects.find((item) => item.id === projectId);
      if (project && project.status !== target) {
        updateProject(projectId, { status: target });
        setDragNotice(`${tr('Moved')} “${project.title}” ${tr('to')} ${tr(COLS.find((column) => column.id === target)!.label)}.`);
      }
    }
  };
  const blocked = (project: Project, depIds: string[]) => depIds.some((depId) => !project.tasks.find((task) => task.id === depId)?.done);

  const modeActions = <div className="flex min-w-0 flex-wrap items-center gap-2">
    <div className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[.04]" role="tablist" aria-label={tr('Project workspaces')}>
      <button type="button" role="tab" aria-selected={workspaceMode === 'private'} className={cx('min-h-9 rounded-lg px-3 text-sm font-medium', workspaceMode === 'private' ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'muted')} onClick={() => setWorkspaceMode('private')}><Lock size={14} className="mr-1 inline" />{tr('Private')}</button>
      <button type="button" role="tab" aria-selected={workspaceMode === 'shared'} className={cx('min-h-9 rounded-lg px-3 text-sm font-medium', workspaceMode === 'shared' ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'muted')} onClick={() => setWorkspaceMode('shared')}><Users size={14} className="mr-1 inline" />{tr('Shared')}</button>
    </div>
    {workspaceMode === 'private' && <button className="btn-primary shrink-0" onClick={() => setCreating(true)}><Plus size={16} /> {tr('New project')}</button>}
  </div>;

  if (workspaceMode === 'shared') return <div className="min-w-0">{!sharedDetailOpen && <PageHeader title={tr('Projects')} subtitle={tr('Plans, tasks, and dependencies')} actions={modeActions} />}<Suspense fallback={<div className="card mt-4 p-5 text-sm muted" role="status">{tr('Opening shared workspace…')}</div>}><SharedProjectsWorkspace onSelectedChange={setSharedDetailOpen} onSwitchToPrivate={() => { setSharedDetailOpen(false); setWorkspaceMode('private'); }} /></Suspense></div>;

  return (
    <div className="min-w-0">
      {!open && <PageHeader title={tr('Projects')} subtitle={tr('Plans, tasks, and dependencies')} actions={modeActions} />}
      {!open && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <section aria-label={tr('Project status views')} className="card mb-5 min-w-0 p-3 sm:p-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-2">
            <div className="min-w-0"><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tr('Work view')}</h2><p className="mt-0.5 text-xs muted">{tr('Choose one status. Drag a project handle onto another status to move it.')}</p></div>
            <span className="rounded-lg px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${selectedMeta.color}16`, color: selectedMeta.color }}>{tr(selectedMeta.label)} · {projects.filter((project) => project.status === selectedStatus).length}</span>
          </div>
          <div className="project-status-rail" role="tablist" aria-label={tr('Project statuses')}>
            {COLS.map((column) => <StatusTab key={column.id} status={column.id} label={tr(column.label)} count={projects.filter((project) => project.status === column.id).length} selected={selectedStatus === column.id} onSelect={() => setSelectedStatus(column.id)} color={column.color} />)}
          </div>
          {dragNotice && <p className="sr-only" role="status" aria-live="polite">{dragNotice}</p>}
        </section>
        <section aria-labelledby="selected-project-status" className="min-w-0">
          <div className="mb-3 flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedMeta.color }} />
            <h2 id="selected-project-status" className="min-w-0 break-words text-lg font-semibold">{tr(selectedMeta.label)} <span className="text-sm font-normal muted">{projects.filter((project) => project.status === selectedStatus).length}</span></h2>
          </div>
          {visibleProjects.length === 0 ? (
            <Empty icon={<FolderKanban size={28} />} title={selectedStatus === 'planning' ? tr('No planned projects yet') : tr(`No ${selectedMeta.label.toLowerCase()} projects`)} text={tr('Projects turn goals into action. Add tasks, due dates, and dependencies as you plan.')}
              action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {tr(selectedStatus === 'planning' ? 'Create your first project' : `Create ${selectedMeta.label.toLowerCase()} project`)}</button>} />
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} category={catMap[project.categoryId]} onOpen={() => { setOpenId(project.id); setTaskText(''); setTaskDue(''); }} />)}
            </div>
          )}
        </section>
      </DndContext>}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr('New private project')} wide>
        <form className="grid min-w-0 gap-4" onSubmit={(event) => { event.preventDefault(); create(); }}>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0"><label className="label" htmlFor="project-name">{tr('Project name')}</label><input id="project-name" autoFocus className="input min-w-0" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div>
            <div className="min-w-0"><label className="label" htmlFor="project-due-date">{tr('Due date')}</label><input id="project-due-date" type="date" className="input min-w-0" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div>
            <div className="min-w-0"><label className="label" htmlFor="project-category">{tr('Category')}</label><select id="project-category" className="input min-w-0" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></div>
            <div className="min-w-0"><label className="label" htmlFor="project-goal">{tr('Supports goal')}</label><select id="project-goal" className="input min-w-0" value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}><option value="">{tr('— None —')}</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></div>
          </div>
          <div className="min-w-0"><label className="label" htmlFor="project-description">{tr('Description')}</label><textarea id="project-description" className="input min-h-24 min-w-0 resize-y" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10"><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{tr('Cancel')}</button><button type="submit" className="btn-primary"><Plus size={16} /> {tr('Create private project')}</button></div>
        </form>
      </Modal>

      {open && <section className="project-fullpage card min-w-0 p-4 sm:p-6" aria-label={tr('Project details')}>
        {open && (
          <div className="project-detail min-w-0 space-y-5">
            <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10"><div className="min-w-0"><button type="button" className="btn-ghost -ml-2 mb-2" onClick={() => setOpenId(null)}><Link2 size={15} />{tr('Back to projects')}</button><h2 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{open.title}</h2><p className="mt-1 text-sm muted">{tr('Project details')} · {tr(COLS.find((column) => column.id === open.status)?.label ?? open.status)}</p></div><button type="button" className="btn-ghost text-rose-600" onClick={() => { if (confirm(tr('Delete project?'))) { deleteProject(open.id); setOpenId(null); } }}><Trash2 size={15} />{tr('Delete project')}</button></header>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="min-w-0"><span className="label">{tr('Status')}</span><select className="input min-w-0" value={open.status} onChange={(event) => updateProject(open.id, { status: event.target.value as Project['status'] })}>{COLS.map((column) => <option key={column.id} value={column.id}>{tr(column.label)}</option>)}</select></label>
              <label className="min-w-0"><span className="label">{tr('Due date')}</span><input type="date" className="input min-w-0" value={open.dueDate ?? ''} onChange={(event) => updateProject(open.id, { dueDate: event.target.value || undefined })} /></label>
              <label className="min-w-0 sm:col-span-2"><span className="label">{tr('Supports goal')}</span><select className="input min-w-0" value={open.goalId ?? ''} onChange={(event) => updateProject(open.id, { goalId: event.target.value || undefined })}><option value="">{tr('No goal')}</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>🎯 {goal.title}</option>)}</select></label>
              <label className="min-w-0 sm:col-span-2"><span className="label">{tr('Description / plan…')}</span><textarea className="input min-h-24 min-w-0 resize-y" value={open.description} onChange={(event) => updateProject(open.id, { description: event.target.value })} /></label>
            </div>
            <section className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4 dark:border-white/10" aria-label={tr('Project tasks')}>
              <div className="mb-3 flex min-w-0 items-center gap-3"><h3 className="shrink-0 text-sm font-semibold">{tr('Tasks')}</h3><Progress value={pct(open.tasks.filter((task) => task.done).length, open.tasks.length)} /><span className="shrink-0 text-xs tabular-nums muted">{pct(open.tasks.filter((task) => task.done).length, open.tasks.length)}%</span></div>
              {open.tasks.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm muted dark:bg-white/[.03]">{tr('No tasks yet. Add one small next step to begin.')}</p> : <div className="space-y-2">
                {open.tasks.map((task) => {
                  const isBlocked = !task.done && blocked(open, task.dependsOn);
                  const dependencyNames = task.dependsOn.map((id) => open.tasks.find((other) => other.id === id)?.title).filter(Boolean).join(', ');
                  return (
                    <article key={task.id} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2 gap-y-3 rounded-xl border border-slate-200 bg-white/70 p-3 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[.025] dark:hover:bg-white/[.045] sm:gap-x-3">
                      <button type="button" disabled={isBlocked} aria-label={task.done ? tr('Mark task active') : tr('Mark task done')} onClick={() => updateTask(open.id, task.id, { done: !task.done })} className={cx('mt-1', task.done ? 'text-emerald-600' : 'muted', isBlocked && 'text-amber-500')}>
                        {isBlocked ? <Lock size={18} /> : task.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <div className="min-w-0">
                        <span className={cx('block break-words text-sm leading-5', task.done && 'line-through muted')}>{task.title}</span>
                        {dependencyNames && <span className="mt-1 inline-flex max-w-full items-center gap-1 break-words text-xs text-amber-700 dark:text-amber-300"><Link2 size={12} className="shrink-0" />{tr('After')} {dependencyNames}</span>}
                      </div>
                      <div className="col-start-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2.5rem] sm:items-end">
                        <label className="min-w-0"><span className="label">{tr('Due date')}</span><input aria-label={`${tr('Due date')}: ${task.title}`} type="date" className="input min-w-0 !py-1.5" value={task.dueDate ?? ''} onChange={(event) => updateTask(open.id, task.id, { dueDate: event.target.value || undefined })} /></label>
                        <select className="input min-w-0 !py-1.5 text-xs" value="" aria-label={`${tr('Add dependency')}: ${task.title}`} onChange={(event) => { const id = event.target.value; if (id) updateTask(open.id, task.id, { dependsOn: task.dependsOn.includes(id) ? task.dependsOn.filter((dependency) => dependency !== id) : [...task.dependsOn, id] }); }}>
                          <option value="">{tr('+ depends on…')}</option>{open.tasks.filter((other) => other.id !== task.id).map((other) => <option key={other.id} value={other.id}>{task.dependsOn.includes(other.id) ? '✓ ' : ''}{other.title}</option>)}
                        </select>
                        <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10" aria-label={`${tr('Delete task')}: ${task.title}`} onClick={() => deleteTask(open.id, task.id)}><Trash2 size={15} /></button>
                      </div>
                    </article>
                  );
                })}
              </div>}
              <form className="mt-4 grid min-w-0 gap-2 border-t border-slate-200 pt-3 dark:border-white/10 sm:grid-cols-[minmax(0,1fr)_10rem_2.5rem]" onSubmit={(event) => { event.preventDefault(); if (taskText.trim()) { addTask(open.id, taskText.trim(), taskDue || undefined); setTaskText(''); setTaskDue(''); } }}>
                <input className="input min-w-0" placeholder={tr('Add a task…')} value={taskText} onChange={(event) => setTaskText(event.target.value)} />
                <input aria-label={tr('Task due date')} type="date" className="input min-w-0" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} />
                <button type="submit" className="btn-primary min-w-10" aria-label={tr('Add task')}><Plus size={16} /></button>
              </form>
            </section>
            <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-white/10"><button type="button" className="btn-ghost text-rose-600 dark:text-rose-300" onClick={() => { if (confirm(tr('Delete project?'))) { deleteProject(open.id); setOpenId(null); } }}><Trash2 size={15} /> {tr('Delete project')}</button></div>
          </div>
        )}
      </section>}
    </div>
  );
}
