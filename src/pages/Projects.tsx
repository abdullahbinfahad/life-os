import { translate as tr } from '../lib/locales';
import { AlarmClock, CalendarClock, FolderKanban, Lock, Plus, Users, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { CountUp, Modal, Ring } from '../components/ui';
import './Projects.css';
import { useStore } from '../lib/store';
import type { Project } from '../lib/types';
import { cx, pct, today } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import { PrivateProjectDetail, PrivateProjectList } from '../components/projects/private/PrivateProjects';
import { addSharedDependency, createSharedProject, createSharedTask, fetchSharedProjectOverview, updateSharedProject, updateSharedTask } from '../lib/sharedProjects';
const SharedProjectsWorkspace = lazy(() => import('../components/projects/SharedProjectsWorkspace'));

const COLS: { id: Project['status']; label: string; color: string; tone: string }[] = [
  { id: 'planning', label: 'Planning', color: '#64748b', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200' },
  { id: 'active', label: 'Active', color: '#16a34a', tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { id: 'on-hold', label: 'On hold', color: '#d97706', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  { id: 'done', label: 'Done', color: '#4f46e5', tone: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300' },
];

function ProjectsHero({ projects, sharedTotal, sharedLoading, actions }: { projects: Project[]; sharedTotal: number; sharedLoading: boolean; actions: ReactNode }) {
  const tasks = projects.flatMap((p) => p.tasks);
  const done = tasks.filter((t) => t.done).length;
  const t = today();
  const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);
  const weekIso = weekAhead.toISOString().slice(0, 10);
  const overdue = projects.filter((p) => p.dueDate && p.dueDate < t && p.status !== 'done').length + tasks.filter((x) => !x.done && x.dueDate && x.dueDate < t).length;
  const dueSoon = tasks.filter((x) => !x.done && x.dueDate && x.dueDate >= t && x.dueDate <= weekIso).length;
  const total = projects.length || 1;
  return <section className="projects-hero">
    <div className="projects-hero-grid" aria-hidden="true" />
    <div className="relative flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><span className="projects-eyebrow"><FolderKanban size={13} /> {tr('Plans, tasks, and dependencies')}</span><h1 className="projects-title">{tr('Projects')}</h1></div>
      <div className="projects-hero-actions">{actions}</div>
    </div>
    <div className="projects-hero-body">
      <div className="projects-ring"><Ring value={pct(done, tasks.length)} size={104} stroke={10} color="#a78bfa"><div className="text-center"><div className="text-xl font-bold tabular-nums"><CountUp value={pct(done, tasks.length)} />%</div><div className="text-[10px] opacity-70">{done}/{tasks.length} {tr('tasks')}</div></div></Ring></div>
      <div className="projects-kpis">
        <div><span><Lock size={13} /> {tr('Private')}</span><b><CountUp value={projects.length} /></b></div>
        <div><span><Users size={13} /> {tr('Shared')}</span><b>{sharedLoading ? '…' : <CountUp value={sharedTotal} />}</b></div>
        <div className={overdue ? 'is-alert' : ''}><span><AlarmClock size={13} /> {tr('Overdue')}</span><b><CountUp value={overdue} /></b></div>
        <div><span><CalendarClock size={13} /> {tr('Due this week')}</span><b><CountUp value={dueSoon} /></b></div>
      </div>
    </div>
    <div className="projects-dist">
      <div className="projects-dist-bar" role="img" aria-label={COLS.map((c) => `${tr(c.label)} ${projects.filter((p) => p.status === c.id).length}`).join(', ')}>
        {COLS.map((c) => { const n = projects.filter((p) => p.status === c.id).length; return n ? <i key={c.id} style={{ width: `${(n / total) * 100}%`, background: c.color }} /> : null; })}
      </div>
      <ul className="projects-dist-legend">{COLS.map((c) => <li key={c.id}><i style={{ background: c.color }} />{tr(c.label)} <b>{projects.filter((p) => p.status === c.id).length}</b></li>)}</ul>
    </div>
  </section>;
}

export default function Projects() {
  const { projects, goals, categories, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask } = useStore();
  const language = useStore((state) => state.settings.language ?? 'en');
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const routeParams = new URLSearchParams(location.search);
  const notificationProjectId = routeParams.get('sharedProject');
  const notificationTab = routeParams.get('section') === 'discussion' ? 'discussion' as const : undefined;
  const [workspaceMode, setWorkspaceMode] = useState<'private' | 'shared'>(() => notificationProjectId ? 'shared' : 'private');
  const [sharedDetailOpen, setSharedDetailOpen] = useState(false);
  const [sharedOverview, setSharedOverview] = useState<Awaited<ReturnType<typeof fetchSharedProjectOverview>>>({ projects: [], total: 0 });
  const [sharedOverviewLoading, setSharedOverviewLoading] = useState(false);
  const [sharedOverviewTarget, setSharedOverviewTarget] = useState<string | null>(notificationProjectId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
  const [sharePreview, setSharePreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const [movePrivateToTrash, setMovePrivateToTrash] = useState(false);
  const open = projects.find((project) => project.id === openId) ?? null;

  useEffect(() => {
    if (!notificationProjectId) return;
    setSharedOverviewTarget(notificationProjectId);
    setWorkspaceMode('shared');
  }, [notificationProjectId]);

  useEffect(() => {
    if (workspaceMode !== 'private' || !user?.id || !cloudEnabled) return;
    let cancelled = false;
    setSharedOverviewLoading(true);
    void fetchSharedProjectOverview().then((items) => { if (!cancelled) setSharedOverview(items); }).catch(() => { if (!cancelled) setSharedOverview({ projects: [], total: 0 }); }).finally(() => { if (!cancelled) setSharedOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceMode, user?.id]);

  const create = () => {
    if (!form.title.trim()) return;
    const id = addProject({ ...form, goalId: form.goalId || undefined, dueDate: form.dueDate || undefined });
    setCreating(false);
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
    setOpenId(id);
  };

  const copyToShared = async () => {
    if (!open || !user?.id || !cloudEnabled || sharing) return;
    setSharing(true); setShareFeedback('');
    let sharedId: string | null = null;
    let copied = 0;
    let hadCopyFailure = false;
    try {
      sharedId = await createSharedProject(open.title, open.description, open.status);
      if (open.dueDate) {
        try { await updateSharedProject(sharedId, { due_date: open.dueDate }); }
        catch { hadCopyFailure = true; }
      }
      const copiedTaskIds = new Map<string, string>();
      for (const task of open.tasks) {
        try {
          const taskId = await createSharedTask(sharedId, user.id, task.title, task.dueDate);
          copiedTaskIds.set(task.id, taskId);
          copied += 1;
          if (task.done) {
            try { await updateSharedTask(taskId, { status: 'done' }); }
            catch { hadCopyFailure = true; }
          }
        } catch { hadCopyFailure = true; /* Continue copying other tasks and report the count. */ }
      }
      for (const task of open.tasks) {
        const newTaskId = copiedTaskIds.get(task.id);
        if (!newTaskId) continue;
        for (const dependencyId of task.dependsOn) {
          const newDependencyId = copiedTaskIds.get(dependencyId);
          if (!newDependencyId) { hadCopyFailure = true; continue; }
          try { await addSharedDependency(sharedId, newTaskId, newDependencyId, user.id); }
          catch { hadCopyFailure = true; }
        }
      }
      const complete = copied === open.tasks.length && !hadCopyFailure;
      if (complete && movePrivateToTrash) deleteProject(open.id);
      const message = complete
        ? movePrivateToTrash ? tr('Shared project created; private original moved to Trash.') : tr('Shared project created; your private original is unchanged.')
        : copied < open.tasks.length
          ? tr('Shared project created with some tasks missing; your private original is unchanged.')
          : tr('Shared project created with some details missing; your private original is unchanged.');
      setShareFeedback(`${message} ${tr('Copied')} ${copied}/${open.tasks.length} ${tr('tasks')}.`);
      setSharePreview(false); setMovePrivateToTrash(false); setOpenId(null); setWorkspaceMode('shared');
    } catch (error) {
      if (sharedId) {
        setShareFeedback(`${tr('Shared project created with some tasks missing; your private original is unchanged.')} ${tr('Copied')} ${copied}/${open.tasks.length} ${tr('tasks')}.`);
        setSharePreview(false); setMovePrivateToTrash(false); setOpenId(null); setWorkspaceMode('shared');
      } else {
        setShareFeedback(error instanceof Error ? error.message : tr('Could not create the shared project. Your private original is unchanged.'));
      }
    } finally { setSharing(false); }
  };

  const modeActions = <div className="flex min-w-0 flex-wrap items-center gap-2">
    <div className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[.04]" role="tablist" aria-label={tr('Project workspaces')}>
      <button type="button" role="tab" aria-selected={workspaceMode === 'private'} className={cx('min-h-9 rounded-lg px-3 text-sm font-medium', workspaceMode === 'private' ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'muted')} onClick={() => setWorkspaceMode('private')}><Lock size={14} className="mr-1 inline" />{tr('Private')}</button>
      <button type="button" role="tab" aria-selected={workspaceMode === 'shared'} className={cx('min-h-9 rounded-lg px-3 text-sm font-medium', workspaceMode === 'shared' ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'muted')} onClick={() => { setSharedOverviewTarget(null); setWorkspaceMode('shared'); }}><Users size={14} className="mr-1 inline" />{tr('Shared')}</button>
    </div>
    {workspaceMode === 'private' && <button className="btn-primary shrink-0" onClick={() => setCreating(true)}><Plus size={16} /> {tr('New project')}</button>}
  </div>;

  if (workspaceMode === 'shared') return <div className="min-w-0">{shareFeedback && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200" role="status">{shareFeedback}</p>}{!sharedDetailOpen && <ProjectsHero projects={projects} sharedTotal={sharedOverview.total} sharedLoading={sharedOverviewLoading} actions={modeActions} />}<Suspense fallback={<div className="card mt-4 p-5 text-sm muted" role="status">{tr('Opening shared workspace…')}</div>}><SharedProjectsWorkspace initialProjectId={sharedOverviewTarget} initialTab={notificationTab} onSelectedChange={setSharedDetailOpen} onSwitchToPrivate={() => { setSharedOverviewTarget(null); setSharedDetailOpen(false); setWorkspaceMode('private'); }} /></Suspense></div>;

  const openGoal = () => navigate('/goals');
  return (
    <div className="min-w-0">
      {!open && <ProjectsHero projects={projects} sharedTotal={sharedOverview.total} sharedLoading={sharedOverviewLoading} actions={modeActions} />}
      {!open && <PrivateProjectList projects={projects} categories={categories} goals={goals} language={language} shared={sharedOverview.projects} sharedLoading={sharedOverviewLoading}
        onOpen={(id) => setOpenId(id)} onCreate={() => setCreating(true)} onStatus={(id, status) => updateProject(id, { status })}
        onOpenShared={(id) => { setSharedOverviewTarget(id); setWorkspaceMode('shared'); }} />}
      {open && <PrivateProjectDetail project={open} categories={categories} goals={goals} language={language} canShare={Boolean(cloudEnabled && user)}
        onBack={() => setOpenId(null)} onUpdate={(patch) => updateProject(open.id, patch)}
        onDelete={() => { if (confirm(tr('Delete project?'))) { deleteProject(open.id); setOpenId(null); } }}
        onShare={() => { setShareFeedback(''); setSharePreview(true); }}
        onAddTask={(title, due) => addTask(open.id, title, due)} onUpdateTask={(taskId, patch) => updateTask(open.id, taskId, patch)} onDeleteTask={(taskId) => deleteTask(open.id, taskId)}
        onOpenGoal={openGoal} />}

      {creating && <div className="tw-root"><div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}>
        <section className="tw-modal-card" role="dialog" aria-modal="true" aria-labelledby="new-private-project-title">
          <div className="flex items-start gap-3"><span className="tw-modal-icon"><FolderKanban size={20} /></span><div className="min-w-0 flex-1"><h2 id="new-private-project-title" className="text-lg font-semibold">{tr('New private project')}</h2><p className="mt-0.5 text-sm muted">{tr('Only you can see it. Add tasks right after.')}</p></div><button type="button" className="tw-icon-btn" onClick={() => setCreating(false)} aria-label={tr('Close')}><X size={16} /></button></div>
          <form className="mt-4 grid min-w-0 gap-3" onSubmit={(event) => { event.preventDefault(); create(); }}>
            <input id="project-name" autoFocus className="input min-w-0 text-base font-semibold" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} placeholder={tr('Project name')} aria-label={tr('Project name')} required />
            <textarea id="project-description" className="input min-h-20 min-w-0 resize-y" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={tr('What does done look like? (optional)')} aria-label={tr('Description')} />
            <div><span className="label">{tr('Category')}</span><div className="tw-chip-row !pb-0">{categories.map((category) => <button key={category.id} type="button" className={cx('tw-chip', form.categoryId === category.id && 'is-on')} onClick={() => setForm({ ...form, categoryId: category.id })}>{category.icon} {category.name}</button>)}</div></div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="min-w-0"><span className="label">{tr('Due date')}</span><input id="project-due-date" type="date" className="input min-w-0" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
              <label className="min-w-0"><span className="label">{tr('Supports goal')}</span><select id="project-goal" className="input min-w-0" value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}><option value="">{tr('— None —')}</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>🎯 {goal.title}</option>)}</select></label>
            </div>
            <p className="tw-hint"><Lock size={15} />{tr('Private projects stay on your account. You can copy one to a team project later.')}</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{tr('Cancel')}</button><button type="submit" className="btn-primary" disabled={!form.title.trim()}><Plus size={15} />{tr('Create project')}</button></div>
          </form>
        </section>
      </div></div>}

      <Modal open={sharePreview} onClose={() => { if (!sharing) { setSharePreview(false); setMovePrivateToTrash(false); } }} title={tr('Copy private project to Shared Projects')}>
        {open && <div className="space-y-4"><p className="text-sm muted">{tr('By default this creates a shared copy and keeps your private project. You can optionally move the original to Trash after every task and dependency copies successfully.')}</p><div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><p className="font-semibold">{open.title}</p><p className="mt-1 text-sm muted">{open.tasks.length} {tr('tasks')}</p></div><p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">{tr('Warning: the copied title, description, and tasks will be visible to future members of this shared project.')}</p><label className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" checked={movePrivateToTrash} disabled={sharing} onChange={(event) => setMovePrivateToTrash(event.target.checked)} /><span>{tr('Move the private original to Trash after a complete copy (restorable).')}</span></label>{shareFeedback && <p className="text-sm text-rose-600" role="alert">{shareFeedback}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={sharing} onClick={() => { setSharePreview(false); setMovePrivateToTrash(false); }}>{tr('Cancel')}</button><button type="button" className="btn-primary" disabled={sharing || !cloudEnabled || !user} onClick={copyToShared}>{sharing ? tr('Copying…') : tr('Confirm and copy')}</button></div></div>}
      </Modal>

    </div>
  );
}
