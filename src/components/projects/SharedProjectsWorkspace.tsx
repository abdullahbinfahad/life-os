import { translate as tr } from '../../lib/locales';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ArrowLeft, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, Circle, ClipboardList, Copy, Eye, EyeOff, FileText, Flag, GripVertical, Link2, LockKeyhole, MessageCircle, Pin, Plus, RefreshCw, Send, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useStore } from '../../lib/store';
import { cloudEnabled } from '../../lib/supabase';
import { addDays, cx, fmtDate, localeForLanguage, today } from '../../lib/utils';
import {
  acceptSharedInvitation, addPrivateTaskLink, addProjectToPortfolio, addSharedComment, addSharedDependency,
  addSharedNote, createSharedInvitation, createSharedPortfolio, createSharedProject, createSharedTask, markSharedCommentsRead, setSharedCommentReadState, updateSharedNote,
  fetchMyPrivateTaskLinks, fetchSharedWorkspace, removePrivateTaskLink,
  removeProjectFromPortfolio, removeSharedDependency, removeSharedMember, revokeSharedInvitation,
  setSharedMemberRole, sharedServiceError, subscribeToSharedWorkspace, updateSharedProject, updateSharedTask,
  type SharedComment, type SharedCommentReceipt, type SharedMember, type SharedNoteType, type SharedProject,
  type SharedRole, type SharedStatus, type SharedTask, type SharedTaskStatus, type SharedWorkspaceSnapshot,
  type PrivateTaskLink,
} from '../../lib/sharedProjects';

const STATUS: { id: SharedStatus; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#64748b' },
  { id: 'active', label: 'Active', color: '#16a34a' },
  { id: 'on-hold', label: 'On hold', color: '#d97706' },
  { id: 'done', label: 'Done', color: '#635bff' },
];
const TASK_STATUS: { id: SharedTaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'To do', color: '#64748b' },
  { id: 'in-progress', label: 'In progress', color: '#635bff' },
  { id: 'blocked', label: 'Blocked', color: '#e11d48' },
  { id: 'done', label: 'Done', color: '#16a34a' },
  { id: 'cancelled', label: 'Cancelled', color: '#94a3b8' },
];
const ROLE_LABEL: Record<SharedRole, string> = { lead: 'Lead', admin: 'Admin', member: 'Member', guest: 'Guest', viewer: 'Viewer' };
const memberLabel = (id: string | null | undefined, members: SharedMember[], currentUserId: string) => id === currentUserId ? tr('You') : members.find((member) => member.user_id === id)?.display_name?.trim() || tr(id ? 'Member' : 'Former member');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'M';
const NOTE_TONES = { paper: 'bg-amber-50/90 dark:bg-amber-500/[.08]', lavender: 'bg-violet-50/90 dark:bg-violet-500/[.08]', mint: 'bg-emerald-50/90 dark:bg-emerald-500/[.08]', sky: 'bg-sky-50/90 dark:bg-sky-500/[.08]' } as const;
const roleCanWork = (role?: SharedRole) => Boolean(role && ['lead', 'admin', 'member', 'guest'].includes(role));

type Tab = 'tasks' | 'people' | 'discussion' | 'notes' | 'timeline' | 'activity';

function StatusRail({ value, counts, onChange }: { value: SharedStatus; counts: Record<SharedStatus, number>; onChange: (value: SharedStatus) => void }) {
  return <div className="project-status-rail" role="tablist" aria-label={tr('Shared project statuses')}>
    {STATUS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)} className={cx('project-status-tab flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition', value === item.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-white/[.035] dark:text-slate-200')}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{tr(item.label)}<span className={cx('rounded-full px-1.5 py-0.5 text-xs tabular-nums', value === item.id ? 'bg-white/15' : 'bg-slate-100 dark:bg-white/10')}>{counts[item.id]}</span></button>)}
  </div>;
}

function TeamMember({ member, currentUserId, canManage, isLead, onRole, onRemove }: {
  member: SharedMember; currentUserId: string; canManage: boolean; isLead: boolean;
  onRole: (role: SharedRole) => void; onRemove: () => void;
}) {
  const self = member.user_id === currentUserId;
  const label = memberLabel(member.user_id, [member], currentUserId);
  const choices: SharedRole[] = isLead ? ['lead', 'admin', 'member', 'guest', 'viewer'] : ['admin', 'member', 'guest', 'viewer'];
  return <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[.025]">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300">{initials(label)}</span>
    <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{label}</p><p className="text-xs muted">{tr(ROLE_LABEL[member.role])}{member.role === 'lead' ? ` · ${tr('Team lead')}` : ''}</p></div>
    {canManage && <div className="flex shrink-0 items-center gap-2"><select aria-label={`${tr('Role for')} ${memberLabel(member.user_id, [member], currentUserId)}`} className="input !w-auto !min-w-0 !py-2 text-sm" value={member.role} onChange={(event) => onRole(event.target.value as SharedRole)}>{choices.map((role) => <option key={role} value={role}>{tr(ROLE_LABEL[role])}</option>)}</select><button type="button" className="btn-ghost !p-2 text-rose-600" title={self ? tr('Leave project') : tr('Remove member')} onClick={onRemove}><Trash2 size={16} /></button></div>}
    {!canManage && self && <span className="chip">{tr('You')}</span>}
  </div>;
}

function BoardDropColumn({ status, count, children }: { status: SharedTaskStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `shared-task-status:${status}`, data: { status } });
  const meta = TASK_STATUS.find((item) => item.id === status)!;
  return <section ref={setNodeRef} aria-label={`${tr(meta.label)} · ${count}`} className={cx('min-w-0 rounded-xl border border-t-2 p-2.5 transition-colors sm:p-3', isOver ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10' : 'border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[.02]')} style={{ borderTopColor: meta.color }}><h4 className="mb-3 flex min-h-8 items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} /><span className="min-w-0 flex-1 break-words">{tr(meta.label)}</span><span className="rounded-full bg-white/80 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-200">{count}</span></h4><div className="min-h-20 space-y-2 rounded-lg">{children}</div></section>;
}

function TaskCard({ task, projectId, members, currentUserId, canWork, dependencies, allTasks, privateLinks, privateLabels, goals, habits, runAction, onChange }: {
  task: SharedTask; projectId: string; members: SharedMember[]; currentUserId: string; canWork: boolean;
  dependencies: SharedWorkspaceSnapshot['dependencies']; allTasks: SharedTask[]; privateLinks: PrivateTaskLink[];
  privateLabels: Record<string, string>; goals: Array<{ id: string; title: string }>; habits: Array<{ id: string; title: string }>;
  runAction: (action: () => Promise<unknown>) => Promise<void>; onChange: (patch: Partial<SharedTask>) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `shared-task:${task.id}`, data: { type: 'shared-task', taskId: task.id }, disabled: !canWork });
  const [expanded, setExpanded] = useState(false);
  const [dependsOn, setDependsOn] = useState('');
  const [privateLinkValue, setPrivateLinkValue] = useState('');
  const taskDeps = dependencies.filter((dep) => dep.task_id === task.id);
  const taskLinks = privateLinks.filter((link) => link.task_id === task.id);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const waitingOn = taskDeps.map((dep) => allTasks.find((candidate) => candidate.id === dep.depends_on_task_id)).filter((candidate) => candidate && candidate.status !== 'done');
  return <article ref={setNodeRef} style={style} className={cx('min-w-0 rounded-xl border border-slate-200 bg-white p-3 transition dark:border-white/10 dark:bg-[#151821]', isDragging && 'z-20 opacity-60 shadow-xl')}>
    <div className="flex min-w-0 items-start gap-2">
      <button type="button" aria-label={`${tr('Drag to change task status')}: ${task.title}`} title={tr('Drag to change task status')} {...attributes} {...listeners} className="mt-1 grid h-8 w-7 shrink-0 touch-none place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10"><GripVertical size={17} /></button>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1"><h4 className={cx('break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]', task.status === 'done' && 'text-slate-500 line-through dark:text-slate-400')}>{task.title}</h4>{task.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 muted">{task.details}</p>}</div>
            <button type="button" className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg transition hover:bg-slate-100 dark:hover:bg-white/10', task.status === 'done' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600')} disabled={!canWork} aria-label={tr(task.status === 'done' ? 'Reopen task' : 'Mark task done')} title={tr(task.status === 'done' ? 'Reopen task' : 'Mark task done')} onClick={() => void onChange({ status: task.status === 'done' ? 'todo' : 'done' })}>{task.status === 'done' ? <CheckCircle2 size={19} /> : <Circle size={19} />}</button>
          </div>
          <select aria-label={tr('Task status')} disabled={!canWork} className="input mt-2 !w-full min-w-0 !py-1.5 text-xs" value={task.status} onChange={(event) => void onChange({ status: event.target.value as SharedTaskStatus })}>{TASK_STATUS.map((item) => <option key={item.id} value={item.id}>{tr(item.label)}</option>)}</select>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          {task.due_date && <span className={cx('chip', task.due_date < today() && task.status !== 'done' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : '')}><CalendarDays size={12} />{fmtDate(task.due_date)}</span>}
          {task.assignee_id && <span className="chip"><Users size={12} />{task.assignee_id === currentUserId ? tr('Assigned to you') : memberLabel(task.assignee_id, members, currentUserId)}</span>}
          {waitingOn.length > 0 && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{tr('Blocked by')} {waitingOn.length}</span>}
          {task.estimate_minutes !== null && <span className="chip">{task.estimate_minutes} {tr('min')}</span>}
          <button type="button" className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? tr('Hide details') : tr('Details')}<ChevronDown size={13} className={cx('transition-transform', expanded && 'rotate-180')} /></button>
        </div>
        {expanded && <div className="mt-3 grid min-w-0 gap-3 border-t border-slate-200 pt-3 dark:border-white/10 sm:grid-cols-2">
          <label className="min-w-0"><span className="label">{tr('Due date')}</span><input disabled={!canWork} type="date" className="input min-w-0" value={task.due_date ?? ''} onChange={(event) => void onChange({ due_date: event.target.value || null })} /></label>
          <label className="min-w-0"><span className="label">{tr('Assignee')}</span><select disabled={!canWork} className="input min-w-0" value={task.assignee_id ?? ''} onChange={(event) => void onChange({ assignee_id: event.target.value || null })}><option value="">{tr('Unassigned')}</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel(member.user_id, members, currentUserId)} · {tr(ROLE_LABEL[member.role])}</option>)}</select></label>
          <label className="min-w-0"><span className="label">{tr('Estimate (minutes)')}</span><input disabled={!canWork} type="number" min="0" max="100000" className="input min-w-0" value={task.estimate_minutes ?? ''} onChange={(event) => void onChange({ estimate_minutes: event.target.value ? Number(event.target.value) : null })} /></label>
          <label className="min-w-0 sm:col-span-2"><span className="label">{tr('Task details')}</span><textarea disabled={!canWork} className="input min-h-20 min-w-0 resize-y" defaultValue={task.details} onBlur={(event) => { if (event.currentTarget.value !== task.details) void onChange({ details: event.currentTarget.value }); }} /></label>
          <div className="min-w-0 rounded-lg bg-slate-50 p-3 dark:bg-white/[.03]">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Link2 size={13} />{tr('Dependencies')}</p>
            {taskDeps.length > 0 && <ul className="mb-2 space-y-1">{taskDeps.map((dep) => <li key={dep.depends_on_task_id} className="flex min-w-0 items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-words">{allTasks.find((candidate) => candidate.id === dep.depends_on_task_id)?.title ?? tr('Task')}</span>{canWork && <button type="button" className="btn-ghost !p-1 text-rose-600" aria-label={tr('Remove dependency')} onClick={() => void runAction(() => removeSharedDependency(projectId, task.id, dep.depends_on_task_id))}><Trash2 size={13} /></button>}</li>)}</ul>}
            <div className="flex min-w-0 gap-2"><select disabled={!canWork} className="input min-w-0 flex-1 !py-2 text-xs" value={dependsOn} onChange={(event) => setDependsOn(event.target.value)}><option value="">{tr('Depends on…')}</option>{allTasks.filter((candidate) => candidate.id !== task.id && !taskDeps.some((dep) => dep.depends_on_task_id === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button type="button" disabled={!canWork || !dependsOn} className="btn-outline !px-2" aria-label={tr('Add dependency')} onClick={() => { if (!dependsOn) return; void runAction(() => addSharedDependency(projectId, task.id, dependsOn, currentUserId)).then(() => setDependsOn('')); }}><Plus size={14} /></button></div>
          </div>
          <div className="min-w-0 rounded-lg bg-indigo-50/70 p-3 dark:bg-indigo-500/[.07]">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><LockKeyhole size={13} />{tr('Private link to my goal or habit')}</p><p className="mb-2 text-[11px] leading-4 muted">{tr('Only you can see this connection; it is not shared with project members.')}</p>
            {taskLinks.map((link) => <div key={link.id} className="mb-1 flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-words">{privateLabels[`${link.personal_item_type}:${link.personal_item_id}`] ?? tr('Personal item')}</span><button type="button" className="btn-ghost !p-1 text-rose-600" aria-label={tr('Remove private link')} onClick={() => void runAction(() => removePrivateTaskLink(link.id))}><Trash2 size={13} /></button></div>)}
            <div className="flex min-w-0 gap-2"><select disabled={!canWork} className="input min-w-0 flex-1 !py-2 text-xs" value={privateLinkValue} onChange={(event) => setPrivateLinkValue(event.target.value)}><option value="">{tr('Link a personal outcome…')}</option>{goals.map((item) => <option key={`goal:${item.id}`} value={`goal:${item.id}`}>🎯 {item.title}</option>)}{habits.map((item) => <option key={`habit:${item.id}`} value={`habit:${item.id}`}>↻ {item.title}</option>)}</select><button type="button" disabled={!canWork || !privateLinkValue} className="btn-outline !px-2" aria-label={tr('Add private link')} onClick={() => { const [type, id] = privateLinkValue.split(':'); if (id && (type === 'goal' || type === 'habit')) void runAction(() => addPrivateTaskLink(task.id, currentUserId, type, id)).then(() => setPrivateLinkValue('')); }}><Plus size={14} /></button></div>
          </div>
        </div>}
      </div>
    </div>
  </article>;
}

function PortfolioSection({ snapshot, currentUserId, runAction }: { snapshot: SharedWorkspaceSnapshot; currentUserId: string; runAction: (action: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activePortfolio, setActivePortfolio] = useState<string | null>(null);
  const [addProjectId, setAddProjectId] = useState('');
  const portfolio = snapshot.portfolios.find((item) => item.id === activePortfolio);
  const linkedIds = snapshot.portfolioProjects.filter((link) => link.portfolio_id === portfolio?.id).map((link) => link.project_id);
  const linkedProjects = snapshot.projects.filter((project) => linkedIds.includes(project.id));
  const portfolioRole = snapshot.portfolioMembers.find((member) => member.portfolio_id === portfolio?.id && member.user_id === currentUserId)?.role;
  const canManagePortfolio = portfolioRole === 'lead' || portfolioRole === 'admin';
  return <div className="min-w-0 space-y-4">
    {!portfolio ? <>
      <form className="card grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; void runAction(async () => { await createSharedPortfolio(title.trim(), description.trim()); setTitle(''); setDescription(''); }); }}>
        <label className="min-w-0"><span className="label">{tr('Portfolio name')}</span><input className="input min-w-0" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} /></label>
        <label className="min-w-0"><span className="label">{tr('Description')}</span><input className="input min-w-0" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></label>
        <button className="btn-primary" type="submit"><Plus size={16} />{tr('Create portfolio')}</button>
      </form>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.portfolios.map((item) => <button key={item.id} type="button" className="card min-w-0 p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-300" onClick={() => setActivePortfolio(item.id)}><h3 className="break-words font-semibold">{item.title}</h3>{item.description && <p className="mt-1 break-words text-sm muted">{item.description}</p>}<p className="mt-3 text-xs muted">{snapshot.portfolioProjects.filter((link) => link.portfolio_id === item.id).length} {tr('connected projects')}</p></button>)}
        {snapshot.portfolios.length === 0 && <div className="card p-5 text-sm muted">{tr('Group existing shared project IDs into a portfolio; connecting a project never grants access to it.')}</div>}
      </div>
    </> : <>
      <button type="button" className="btn-ghost -ml-2" onClick={() => setActivePortfolio(null)}><ArrowLeft size={16} />{tr('All portfolios')}</button>
      <section className="card min-w-0 p-4 sm:p-5"><h3 className="break-words text-lg font-semibold">{portfolio.title}</h3><p className="mt-1 text-sm muted">{tr('Portfolio links reference existing projects; they do not copy tasks or grant project access.')}</p>
        {canManagePortfolio ? <form className="mt-4 flex min-w-0 flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!addProjectId) return; void runAction(() => addProjectToPortfolio(portfolio.id, addProjectId, currentUserId)).then(() => setAddProjectId('')); }}>
          <select className="input min-w-0 flex-1" value={addProjectId} onChange={(event) => setAddProjectId(event.target.value)}><option value="">{tr('Add an accessible shared project…')}</option>{snapshot.projects.filter((project) => !linkedIds.includes(project.id)).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><button className="btn-outline" disabled={!addProjectId}><Plus size={15} />{tr('Add project')}</button>
        </form> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm muted dark:bg-white/[.03]">{tr('Portfolio links can be managed by portfolio leads and admins. Project access is still controlled separately.')}</p>}
        <div className="mt-4 space-y-2">{linkedProjects.map((project) => <div key={project.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-white/10"><span className="min-w-0 flex-1 break-words text-sm font-medium">{project.title}</span><span className="chip">{tr(STATUS.find((item) => item.id === project.status)?.label ?? project.status)}</span>{canManagePortfolio && <button type="button" className="btn-ghost !p-2 text-rose-600" aria-label={tr('Remove from portfolio')} onClick={() => void runAction(() => removeProjectFromPortfolio(portfolio.id, project.id))}><Trash2 size={15} /></button>}</div>)}</div>
      </section>
    </>}
  </div>;
}

export default function SharedProjectsWorkspace({ onSelectedChange, onSwitchToPrivate }: { onSelectedChange?: (open: boolean) => void; onSwitchToPrivate?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const goals = useStore((state) => state.goals);
  const habits = useStore((state) => state.habits);
  const language = useStore((state) => state.settings.language ?? 'en');
  const [snapshot, setSnapshot] = useState<SharedWorkspaceSnapshot>({ projects: [], members: [], tasks: [], dependencies: [], comments: [], commentReceipts: [], notes: [], activity: [], invitations: [], notifications: [], portfolios: [], portfolioMembers: [], portfolioProjects: [] });
  const [privateLinks, setPrivateLinks] = useState<PrivateTaskLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<'projects' | 'portfolios'>('projects');
  const [filter, setFilter] = useState<SharedStatus>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tasks');
  const [taskView, setTaskView] = useState<'list' | 'board' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(today().slice(0, 7));
  const [calendarDate, setCalendarDate] = useState(today());
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', description: '', status: 'planning' as SharedStatus, due_date: '' });
  const [newTask, setNewTask] = useState({ title: '', due_date: '', assignee_id: '' });
  const [joinToken, setJoinToken] = useState('');
  const [invitationRole, setInvitationRole] = useState<Exclude<SharedRole, 'lead' | 'admin'>>('member');
  const [inviteDays, setInviteDays] = useState(7);
  const [inviteUrl, setInviteUrl] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentTask, setCommentTask] = useState('');
  const [mentionUser, setMentionUser] = useState('');
  const [newNote, setNewNote] = useState({ note_type: 'decision' as SharedNoteType, title: '', body: '', occurred_on: '', color: 'paper' as SharedWorkspaceSnapshot['notes'][number]['color'], is_pinned: false });
  const [projectDraft, setProjectDraft] = useState({ title: '', description: '', status: 'planning' as SharedStatus, due_date: '' });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 190, tolerance: 8 } }), useSensor(KeyboardSensor));

  const refresh = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const profileName = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim();
      const next = await fetchSharedWorkspace(user.id, profileName);
      const links = await fetchMyPrivateTaskLinks(next.tasks.map((task) => task.id));
      setSnapshot(next); setPrivateLinks(links); setError('');
      setSelectedId((current) => current && next.projects.some((project) => project.id === current) ? current : null);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToSharedWorkspace(user.id, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(true), 250);
    });
    return () => { if (timer) clearTimeout(timer); unsubscribe(); };
  }, [user?.id, refresh]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(true); }
    catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  }, [refresh]);

  const acceptInvite = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed || !user?.id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await acceptSharedInvitation(trimmed);
      sessionStorage.removeItem('lifeos:pending-shared-invite');
      setJoinToken(''); setNotice(tr('Invitation accepted. Shared project is ready.'));
      navigate('/projects', { replace: true });
      await refresh(true);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  }, [navigate, refresh, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const urlToken = new URLSearchParams(location.search).get('invite');
    let pending = '';
    try { pending = sessionStorage.getItem('lifeos:pending-shared-invite') ?? ''; } catch { /* private browsing storage can be blocked */ }
    const token = urlToken || pending;
    if (token) { setJoinToken(token); void acceptInvite(token); }
  }, [location.search, user?.id, acceptInvite]);

  const selected = snapshot.projects.find((project) => project.id === selectedId) ?? null;
  useEffect(() => { onSelectedChange?.(Boolean(selected)); }, [selected?.id, onSelectedChange]);
  useEffect(() => {
    if (tab !== 'discussion' || !selected || !user?.id) return;
    const unread = snapshot.comments.filter((comment) => comment.project_id === selected.id && !snapshot.commentReceipts.some((receipt) => receipt.comment_id === comment.id && receipt.user_id === user.id));
    if (unread.length) void markSharedCommentsRead(selected.id, user.id, unread).then(() => refresh(true)).catch((problem) => setError(sharedServiceError(problem)));
  }, [tab, selected?.id, user?.id, snapshot.comments, snapshot.commentReceipts, refresh]);
  const members = snapshot.members.filter((member) => member.project_id === selected?.id);
  const me = members.find((member) => member.user_id === user?.id);
  const canManage = Boolean(me && ['lead', 'admin'].includes(me.role));
  const canWork = roleCanWork(me?.role);
  const hasManagers = members.some((member) => member.role === 'lead' || member.role === 'admin');
  const canInvite = Boolean(me && (canManage || (!hasManagers && me.role !== 'viewer')));
  const projectTasks = snapshot.tasks.filter((task) => task.project_id === selected?.id);
  const completedTaskCount = projectTasks.filter((task) => task.status === 'done').length;
  const taskProgress = projectTasks.length ? Math.round(completedTaskCount / projectTasks.length * 100) : 0;
  const projectNotes = snapshot.notes.filter((note) => note.project_id === selected?.id).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.updated_at.localeCompare(a.updated_at));
  const unreadCommentCount = snapshot.comments.filter((comment) => comment.project_id === selected?.id && comment.author_id !== user?.id && !snapshot.commentReceipts.some((receipt) => receipt.comment_id === comment.id && receipt.user_id === user?.id)).length;
  const projectCount = useMemo(() => STATUS.reduce((acc, item) => ({ ...acc, [item.id]: snapshot.projects.filter((project) => project.status === item.id).length }), {} as Record<SharedStatus, number>), [snapshot.projects]);
  const filteredProjects = snapshot.projects.filter((project) => project.status === filter);
  const calendarFirstDay = `${calendarMonth}-01`;
  const calendarOffset = (new Date(`${calendarFirstDay}T12:00:00`).getDay() + 6) % 7;
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(calendarFirstDay, index - calendarOffset));
  const calendarTasksByDate = new Map<string, SharedTask[]>();
  for (const task of projectTasks) if (task.due_date) calendarTasksByDate.set(task.due_date, [...(calendarTasksByDate.get(task.due_date) ?? []), task]);
  const selectedDateTasks = calendarTasksByDate.get(calendarDate) ?? [];
  const unscheduledTasks = projectTasks.filter((task) => !task.due_date);
  const weekLabels = Array.from({ length: 7 }, (_, index) => { const date = new Date('2024-01-01T12:00:00'); date.setDate(date.getDate() + index); return date.toLocaleDateString(localeForLanguage(language), { weekday: 'short' }); });
  const calendarMonthLabel = new Date(`${calendarFirstDay}T12:00:00`).toLocaleDateString(localeForLanguage(language), { month: 'long', year: 'numeric' });
  const shiftCalendarMonth = (offset: number) => { const date = new Date(`${calendarFirstDay}T12:00:00`); date.setMonth(date.getMonth() + offset); const nextMonth = date.toISOString().slice(0, 7); setCalendarMonth(nextMonth); setCalendarDate(`${nextMonth}-01`); };
  const privateLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    goals.forEach((goal) => { labels[`goal:${goal.id}`] = goal.title; });
    habits.forEach((habit) => { labels[`habit:${habit.id}`] = habit.title; });
    return labels;
  }, [goals, habits]);

  useEffect(() => {
    if (!selected) return;
    setProjectDraft({ title: selected.title, description: selected.description, status: selected.status, due_date: selected.due_date ?? '' });
    setTab('tasks'); setInviteUrl('');
  }, [selected?.id]);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const id = await createSharedProject(newProject.title.trim(), newProject.description.trim(), newProject.status);
      if (newProject.due_date) await updateSharedProject(id, { due_date: newProject.due_date } as Partial<Pick<SharedProject, 'title' | 'description' | 'status'>>);
      setNewProject({ title: '', description: '', status: 'planning', due_date: '' }); setCreating(false); setFilter(newProject.status);
      await refresh(true); setSelectedId(id);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  };

  const issueInvite = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setInviteUrl('');
    try {
      const expiresAt = new Date(Date.now() + inviteDays * 86400000).toISOString();
      const invitation = await createSharedInvitation(selected.id, invitationRole, expiresAt);
      const url = new URL(window.location.href); url.hash = `/projects?invite=${encodeURIComponent(invitation.token)}`;
      setInviteUrl(url.toString()); await refresh(true);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !user?.id || !newTask.title.trim()) return;
    setBusy(true); setError('');
    try { await createSharedTask(selected.id, user.id, newTask.title.trim(), newTask.due_date || undefined, newTask.assignee_id || undefined); setNewTask({ title: '', due_date: '', assignee_id: '' }); await refresh(true); }
    catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  };

  const updateTask = async (taskId: string, patch: Partial<SharedTask>) => {
    const task = snapshot.tasks.find((row) => row.id === taskId);
    return runAction(async () => {
      await updateSharedTask(taskId, patch);
      if (patch.status === 'done' && task && task.status !== 'done' && user?.id) {
        useStore.getState().awardReward(`shared-task:${user.id}:${taskId}`, task.title, 'task', 20);
      }
    });
  };
  const onDragEnd = (event: DragEndEvent) => {
    const active = event.active.data.current; const target = event.over?.data.current?.status as SharedTaskStatus | undefined;
    if (active?.type === 'shared-task' && active.taskId && target) {
      const task = projectTasks.find((item) => item.id === active.taskId);
      if (task && task.status !== target) void updateTask(task.id, { status: target });
    }
  };

  if (!cloudEnabled || !user) return <div className="card mx-auto max-w-2xl p-6 sm:p-8"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600"><Users size={24} /></div><h2 className="mt-3 text-center text-lg font-semibold">{tr('Shared projects need an account')}</h2><p className="mx-auto mt-2 max-w-lg text-center text-sm leading-6 muted">{tr('Sign in to your account to collaborate across devices. Guest-mode projects remain private on this device.')}</p></div>;

  return <div className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={tr('Project workspace type')}>
        <button type="button" role="tab" aria-selected={section === 'projects'} onClick={() => { setSection('projects'); setSelectedId(null); }} className={cx('btn', section === 'projects' ? 'bg-indigo-600 text-white' : 'btn-outline')}><Users size={16} />{tr('Shared work')}</button>
        <button type="button" role="tab" aria-selected={section === 'portfolios'} onClick={() => { setSection('portfolios'); setSelectedId(null); }} className={cx('btn', section === 'portfolios' ? 'bg-indigo-600 text-white' : 'btn-outline')}><ClipboardList size={16} />{tr('Portfolios')}</button>
      </div>
      <div className="flex shrink-0 items-center gap-2"><span className="hidden text-xs muted sm:inline">{tr('Private projects stay separate')}</span><button type="button" className="btn-ghost !p-2" title={tr('Refresh shared work')} onClick={() => void refresh(true)}><RefreshCw size={16} className={cx(refreshing && 'animate-spin')} /></button></div>
    </div>

    {error && <div className="flex min-w-0 items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200" role="alert"><ShieldCheck size={17} className="mt-0.5 shrink-0" /><p className="min-w-0 break-words">{error} {/migration|setup is incomplete/i.test(error) && <span className="mt-1 inline-flex flex-wrap gap-x-2"><a className="font-semibold underline underline-offset-2" href="https://github.com/abdullahbinfahad/life-os/blob/main/README.md#supabase-setup" target="_blank" rel="noreferrer">{tr('Open setup instructions')}</a><a className="font-semibold underline underline-offset-2" href="https://github.com/abdullahbinfahad/life-os/blob/main/supabase/migrations/20261023_shared_projects.sql" target="_blank" rel="noreferrer">{tr('Open migration')}</a><a className="font-semibold underline underline-offset-2" href="https://github.com/abdullahbinfahad/life-os/blob/main/supabase/migrations/20261024_shared_workspace_upgrade.sql" target="_blank" rel="noreferrer">{tr('Open workspace upgrade')}</a></span>}</p></div>}
    {notice && <p role="status" className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{notice}</p>}
    {loading ? <div className="card flex min-h-40 items-center justify-center gap-3 p-6 text-sm muted"><RefreshCw size={18} className="animate-spin" />{tr('Loading shared workspace…')}</div> : section === 'portfolios' ? <PortfolioSection snapshot={snapshot} currentUserId={user.id} runAction={runAction} /> : selected ? (
      <section className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2"><button type="button" className="btn-ghost -ml-2" onClick={() => setSelectedId(null)}><ArrowLeft size={16} />{tr('Shared projects')}</button><span className="text-slate-300 dark:text-slate-600">/</span><span className="min-w-0 break-words text-sm font-semibold">{selected.title}</span><span className="chip shrink-0">{tr(ROLE_LABEL[me?.role ?? 'viewer'])}</span></div>{onSwitchToPrivate && <button type="button" className="btn-ghost shrink-0" onClick={onSwitchToPrivate}><LockKeyhole size={15} />{tr('Private projects')}</button>}</div>
        <div className="card min-w-0 p-4 sm:p-5">
          {canManage ? <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(140px,1fr)_minmax(140px,1fr)]"><label className="min-w-0 sm:col-span-3"><span className="label">{tr('Project title')}</span><input className="input min-w-0" value={projectDraft.title} onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })} maxLength={200} /></label><label className="min-w-0 sm:col-span-3"><span className="label">{tr('Description')}</span><textarea className="input min-h-32 min-w-0 resize-y leading-6" value={projectDraft.description} onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })} maxLength={20000} /></label><label className="min-w-0"><span className="label">{tr('Status')}</span><select className="input min-w-0" value={projectDraft.status} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value as SharedStatus })}>{STATUS.map((item) => <option key={item.id} value={item.id}>{tr(item.label)}</option>)}</select></label><label className="min-w-0"><span className="label">{tr('Due date')}</span><input className="input min-w-0" type="date" value={projectDraft.due_date} onChange={(event) => setProjectDraft({ ...projectDraft, due_date: event.target.value })} /></label><div className="flex items-end"><button type="button" className="btn-primary" disabled={busy} onClick={() => void runAction(async () => { await updateSharedProject(selected.id, projectDraft); if (selected.status !== 'done' && projectDraft.status === 'done' && user?.id) useStore.getState().awardReward(`shared-project:${user.id}:${selected.id}`, selected.title, 'project', 100); })}><Check size={16} />{tr('Save project')}</button></div></div> : <><h2 className="break-words text-lg font-semibold">{selected.title}</h2>{selected.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 muted">{selected.description}</p>}<div className="mt-3 flex flex-wrap gap-2"><span className="chip">{tr(STATUS.find((item) => item.id === selected.status)?.label ?? selected.status)}</span>{selected.due_date && <span className="chip"><CalendarDays size={12} />{fmtDate(selected.due_date)}</span>}</div></>}
        </div>
        <section className="card grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4" aria-label={tr('Project progress')}>
          <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{tr('Project progress')}</h3><span className="text-xs tabular-nums muted">{completedTaskCount}/{projectTasks.length} {tr('Completed')} · {taskProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" role="progressbar" aria-label={tr('Project progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={taskProgress}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500" style={{ width: `${taskProgress}%` }} /></div></div>
          <div className="flex flex-wrap gap-2"><span className="chip"><Users size={12} />{members.length} {tr('People')}</span><span className="chip"><ClipboardList size={12} />{projectTasks.length} {tr('Tasks')}</span></div>
        </section>
        <div className="shared-project-layout min-w-0">
          <nav className="shared-project-tabs" role="tablist" aria-label={tr('Project workspace sections')}>
            {([['tasks', 'Tasks', ClipboardList], ['people', 'People', Users], ['discussion', 'Discussion', MessageCircle], ['notes', 'Notes & decisions', FileText], ['timeline', 'Timeline', CalendarDays], ['activity', 'Activity', Bell]] as const).map(([id, label, Icon]) => <button key={id} id={`shared-tab-${id}`} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('shared-project-tab flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition', tab === id ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-white/[.035] dark:text-slate-200')}><Icon size={16} />{tr(label)}{id === 'people' && <span className="ms-auto text-xs opacity-80">{members.length}</span>}{id === 'discussion' && unreadCommentCount > 0 && <span className="ms-auto min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">{unreadCommentCount}</span>}</button>)}
          </nav>
          <div className="min-w-0 space-y-4" role="tabpanel" aria-labelledby={`shared-tab-${tab}`}>
        {tab === 'tasks' && <section className="min-w-0 space-y-3" aria-label={tr('Shared project tasks')}>
          <form className="card grid min-w-0 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(145px,190px)_minmax(145px,220px)_auto] sm:items-end" onSubmit={addTask}><label className="min-w-0"><span className="label">{tr('New shared task')}</span><input className="input min-w-0" value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} maxLength={500} placeholder={tr('Add one clear next step')} disabled={!canWork} required /></label><label className="min-w-0"><span className="label">{tr('Due date')}</span><input className="input min-w-0" type="date" value={newTask.due_date} onChange={(event) => setNewTask({ ...newTask, due_date: event.target.value })} disabled={!canWork} /></label><label className="min-w-0"><span className="label">{tr('Assign to')}</span><select className="input min-w-0" value={newTask.assignee_id} onChange={(event) => setNewTask({ ...newTask, assignee_id: event.target.value })} disabled={!canWork}><option value="">{tr('No assignee')}</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel(member.user_id, members, user.id)}</option>)}</select></label><button className="btn-primary" disabled={!canWork || busy}><Plus size={16} />{tr('Add task')}</button></form>
          {!canWork && <p className="text-xs muted">{tr('Viewer access is read-only.')}</p>}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{tr(taskView === 'calendar' ? 'Calendar' : 'Team task list')}</h3><div className="flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/[.05]">{(['list', 'board', 'calendar'] as const).map((view) => <button key={view} type="button" className={cx('min-h-9 shrink-0 rounded-md px-2.5 py-1.5 text-xs', taskView === view ? 'bg-white shadow dark:bg-white/10' : 'muted')} onClick={() => setTaskView(view)}>{tr(view === 'list' ? 'List' : view === 'board' ? 'Board' : 'Calendar')}</button>)}</div></div>
          {projectTasks.length === 0 ? <div className="card p-6 text-center"><ClipboardList className="mx-auto text-indigo-500" size={28} /><p className="mt-2 font-medium">{tr('No shared tasks yet')}</p><p className="mt-1 text-sm muted">{tr('Add the first next step so everyone can see the same work.')}</p></div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            {taskView === 'list' ? <div className="min-w-0 space-y-2">{projectTasks.map((task) => <TaskCard key={task.id} task={task} projectId={selected.id} members={members} currentUserId={user.id} canWork={Boolean(canWork)} dependencies={snapshot.dependencies} allTasks={projectTasks} privateLinks={privateLinks} privateLabels={privateLabels} goals={goals} habits={habits} runAction={runAction} onChange={(patch) => updateTask(task.id, patch)} />)}</div> : taskView === 'board' ? <div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-4">{TASK_STATUS.filter((status) => status.id !== 'cancelled' || projectTasks.some((task) => task.status === 'cancelled')).map((status) => { const columnTasks = projectTasks.filter((task) => task.status === status.id); return <BoardDropColumn key={status.id} status={status.id} count={columnTasks.length}>{columnTasks.map((task) => <TaskCard key={task.id} task={task} projectId={selected.id} members={members} currentUserId={user.id} canWork={Boolean(canWork)} dependencies={snapshot.dependencies} allTasks={projectTasks} privateLinks={privateLinks} privateLabels={privateLabels} goals={goals} habits={habits} runAction={runAction} onChange={(patch) => updateTask(task.id, patch)} />)}</BoardDropColumn>; })}</div> : <div className="min-w-0 space-y-3"><section className="card min-w-0 p-3 sm:p-4"><div className="mb-3 flex items-center justify-between gap-2"><button type="button" className="btn-ghost !p-2" onClick={() => shiftCalendarMonth(-1)} aria-label={tr('Previous month')}><ArrowLeft size={16} /></button><h4 className="text-sm font-semibold">{calendarMonthLabel}</h4><button type="button" className="btn-ghost !p-2" onClick={() => shiftCalendarMonth(1)} aria-label={tr('Next month')}><ChevronDown size={16} className="-rotate-90" /></button></div><div className="grid grid-cols-7 gap-1">{weekLabels.map((day, index) => <div key={`${day}-${index}`} className="py-1 text-center text-[10px] font-medium muted sm:text-xs">{day}</div>)}{calendarDays.map((date) => { const inMonth = date.slice(0, 7) === calendarMonth; const count = calendarTasksByDate.get(date)?.length ?? 0; return <button key={date} type="button" aria-pressed={calendarDate === date} aria-label={`${new Date(`${date}T12:00:00`).toLocaleDateString(localeForLanguage(language), { dateStyle: 'full' })}${count ? ` · ${count}` : ''}`} onClick={() => setCalendarDate(date)} className={cx('min-h-11 min-w-0 rounded-lg border p-1 text-center transition sm:min-h-14 sm:p-2', inMonth ? 'border-slate-200 dark:border-white/10' : 'border-transparent opacity-45', calendarDate === date ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-500/10')}><span className="block text-xs font-medium">{new Date(`${date}T12:00:00`).getDate()}</span>{count > 0 && <span className={cx('mx-auto mt-1 block h-1.5 w-1.5 rounded-full', calendarDate === date ? 'bg-white' : 'bg-indigo-500')} />}</button>; })}</div><p className="mt-3 text-xs muted">{tr('Tasks for this date')}: {fmtDate(calendarDate, language)}</p><div className="mt-2 space-y-2">{selectedDateTasks.length ? selectedDateTasks.map((task) => <TaskCard key={task.id} task={task} projectId={selected.id} members={members} currentUserId={user.id} canWork={Boolean(canWork)} dependencies={snapshot.dependencies} allTasks={projectTasks} privateLinks={privateLinks} privateLabels={privateLabels} goals={goals} habits={habits} runAction={runAction} onChange={(patch) => updateTask(task.id, patch)} />) : <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs muted dark:border-white/10">{tr('No tasks due on this date')}</p>}</div></section>{unscheduledTasks.length > 0 && <section className="space-y-2"><h4 className="text-sm font-semibold">{tr('Tasks without due dates')}</h4>{unscheduledTasks.map((task) => <TaskCard key={task.id} task={task} projectId={selected.id} members={members} currentUserId={user.id} canWork={Boolean(canWork)} dependencies={snapshot.dependencies} allTasks={projectTasks} privateLinks={privateLinks} privateLabels={privateLabels} goals={goals} habits={habits} runAction={runAction} onChange={(patch) => updateTask(task.id, patch)} />)}</section>}</div>}
          </DndContext>}
        </section>}

        {tab === 'people' && <section className="min-w-0 space-y-3"><div className="card min-w-0 p-4 sm:p-5"><h3 className="flex items-center gap-2 font-semibold"><Users size={17} />{tr('Project members')}</h3><p className="mt-1 text-sm muted">{tr('Multiple leads are allowed. A team can also work as equal members with no lead; at least one member stays on the project.')}</p><div className="mt-3 space-y-2">{members.map((member) => <TeamMember key={member.user_id} member={member} currentUserId={user.id} canManage={canManage} isLead={me?.role === 'lead'} onRole={(role) => void runAction(() => setSharedMemberRole(selected.id, member.user_id, role))} onRemove={() => { const action = member.user_id === user.id ? tr('Leave this shared project?') : tr('Remove this member from the project?'); if (confirm(action)) void runAction(() => removeSharedMember(selected.id, member.user_id)); }} />)}</div></div>
          <div className="card min-w-0 p-4 sm:p-5"><h3 className="flex items-center gap-2 font-semibold"><UserPlus size={17} />{tr('Invite collaborators')}</h3><p className="mt-1 text-sm muted">{canManage ? tr('Create a one-use invite link. The secret is shown only here and is stored hashed on the server.') : hasManagers ? tr('A project lead or admin can invite people.') : tr('This team has no lead or admin; any member can issue a limited-role invite.')}</p>
            {canInvite && <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_minmax(120px,170px)_auto]"><label className="min-w-0"><span className="label">{tr('Invite role')}</span><select className="input min-w-0" value={invitationRole} onChange={(event) => setInvitationRole(event.target.value as Exclude<SharedRole, 'lead' | 'admin'>)}><option value="member">{tr('Member — can work')}</option><option value="guest">{tr('Guest — can work')}</option><option value="viewer">{tr('Viewer — read only')}</option></select></label><label className="min-w-0"><span className="label">{tr('Expires in')}</span><select className="input min-w-0" value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))}><option value={7}>7 {tr('days')}</option><option value={30}>30 {tr('days')}</option><option value={90}>90 {tr('days')}</option></select></label><div className="hidden sm:block" /><button type="button" className="btn-primary self-end" onClick={() => void issueInvite()} disabled={busy}><UserPlus size={15} />{tr('Create invite')}</button></div>}
            {inviteUrl && <div className="mt-3 rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10"><p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">{tr('Copy this private invite link now. It will not be shown again.')}</p><div className="mt-2 flex min-w-0 flex-wrap gap-2"><input aria-label={tr('Private invitation link')} className="input min-w-0 flex-1 text-xs" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="btn-outline" onClick={() => void navigator.clipboard?.writeText(inviteUrl).then(() => setNotice(tr('Invitation link copied.'))).catch(() => setNotice(tr('Select and copy the invitation link.')))}><Copy size={14} />{tr('Copy link')}</button></div><p className="mt-1 break-words text-[11px] text-emerald-800/80 dark:text-emerald-200/80">{tr('The link contains a one-use access token. Share it privately with the intended collaborator.')}</p></div>}
            {snapshot.invitations.filter((invite) => invite.project_id === selected.id).map((invite) => <div key={invite.id} className="mt-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-xs dark:border-white/10"><span className="min-w-0 flex-1 break-words">{tr(ROLE_LABEL[invite.role])} · {invite.accepted_at ? tr('Accepted') : invite.revoked_at ? tr('Revoked') : new Date(invite.expires_at).getTime() < Date.now() ? tr('Expired') : tr('Pending')} · {fmtDate(invite.expires_at.slice(0, 10))}</span>{canInvite && !invite.accepted_at && !invite.revoked_at && <button type="button" className="btn-ghost !p-1 text-rose-600" aria-label={tr('Revoke invite')} onClick={() => void runAction(() => revokeSharedInvitation(invite.id))}><Trash2 size={14} /></button>}</div>)}
          </div>
        </section>}

        {tab === 'discussion' && <section className="min-w-0 space-y-3"><div className="card min-w-0 overflow-hidden p-0"><div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10"><div><h3 className="flex items-center gap-2 font-semibold"><MessageCircle size={18} className="text-indigo-600 dark:text-indigo-300" />{tr('Project discussion')}</h3><p className="mt-1 text-xs muted">{tr('A shared conversation for project updates, decisions, and task context.')}</p></div><button type="button" className="btn-outline shrink-0" disabled={!snapshot.comments.some((comment) => comment.project_id === selected.id)} onClick={() => void runAction(() => markSharedCommentsRead(selected.id, user.id, snapshot.comments))}><Eye size={15} />{tr('Mark all read')}</button></div><form className="grid min-w-0 gap-2 border-b border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[.02]" onSubmit={(event) => { event.preventDefault(); if (!newComment.trim()) return; void runAction(() => addSharedComment(selected.id, user.id, newComment.trim(), commentTask || undefined, mentionUser ? [mentionUser] : [])).then(() => { setNewComment(''); setMentionUser(''); }); }}><label className="min-w-0"><span className="label">{tr('Write a message')}</span><textarea className="input min-h-24 min-w-0 resize-y rounded-2xl" value={newComment} onChange={(event) => setNewComment(event.target.value)} maxLength={10000} disabled={!canWork} placeholder={tr('Share an update with your team…')} required /></label><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">{<label className="min-w-0"><span className="label">{tr('Attach to task (optional)')}</span><select className="input min-w-0" value={commentTask} onChange={(event) => setCommentTask(event.target.value)} disabled={!canWork}><option value="">{tr('Project discussion')}</option>{projectTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>}<label className="min-w-0"><span className="label">{tr('Mention a member (optional)')}</span><select className="input min-w-0" value={mentionUser} onChange={(event) => setMentionUser(event.target.value)} disabled={!canWork}><option value="">{tr('No mention')}</option>{members.filter((member) => member.user_id !== user.id).map((member) => <option key={member.user_id} value={member.user_id}>{memberLabel(member.user_id, members, user.id)}</option>)}</select></label><button type="submit" className="btn-primary self-end" disabled={!canWork || busy || !newComment.trim()}><Send size={15} />{tr('Send message')}</button></div></form><div className="space-y-3 p-3 sm:p-4">{snapshot.comments.filter((comment) => comment.project_id === selected.id).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-white/10"><MessageCircle size={24} className="mx-auto text-indigo-500" /><p className="mt-2 font-medium">{tr('No messages yet')}</p><p className="mt-1 text-sm muted">{tr('Start the conversation with a useful update or question.')}</p></div> : snapshot.comments.filter((comment) => comment.project_id === selected.id).map((comment) => <CommentCard key={comment.id} comment={comment} members={members} currentUserId={user.id} tasks={projectTasks} language={language} receipts={snapshot.commentReceipts} onReadState={(commentId, isRead) => void runAction(() => setSharedCommentReadState(commentId, user.id, isRead))} />)}</div></div></section>}

        {tab === 'notes' && <section className="min-w-0 space-y-3"><form className="card grid min-w-0 gap-3 p-4 sm:grid-cols-2 sm:p-5" onSubmit={(event) => { event.preventDefault(); if (!newNote.title.trim()) return; void runAction(() => addSharedNote(selected.id, user.id, newNote.note_type, newNote.title.trim(), newNote.body.trim(), newNote.occurred_on || undefined, newNote.color, newNote.is_pinned)).then(() => setNewNote({ note_type: 'decision', title: '', body: '', occurred_on: '', color: 'paper', is_pinned: false })); }}><div className="sm:col-span-2"><h3 className="flex items-center gap-2 font-semibold"><FileText size={18} className="text-indigo-600 dark:text-indigo-300" />{tr('Notes & decisions')}</h3><p className="mt-1 text-xs muted">{tr('Capture context once so the whole team can find it later.')}</p></div><label className="min-w-0"><span className="label">{tr('Note type')}</span><select className="input min-w-0" value={newNote.note_type} onChange={(event) => setNewNote({ ...newNote, note_type: event.target.value as SharedNoteType })} disabled={!canWork}><option value="decision">{tr('Decision')}</option><option value="meeting">{tr('Meeting notes')}</option><option value="milestone">{tr('Milestone')}</option><option value="sticky">{tr('Sticky note')}</option></select></label><label className="min-w-0"><span className="label">{tr('Date')}</span><input className="input min-w-0" type="date" value={newNote.occurred_on} onChange={(event) => setNewNote({ ...newNote, occurred_on: event.target.value })} disabled={!canWork} /></label><label className="min-w-0 sm:col-span-2"><span className="label">{tr('Title')}</span><input className="input min-w-0" value={newNote.title} onChange={(event) => setNewNote({ ...newNote, title: event.target.value })} maxLength={500} disabled={!canWork} required /></label><label className="min-w-0 sm:col-span-2"><span className="label">{tr('Details')}</span><textarea className="input min-h-24 min-w-0 resize-y" value={newNote.body} onChange={(event) => setNewNote({ ...newNote, body: event.target.value })} maxLength={50000} disabled={!canWork} /></label><label className="min-w-0"><span className="label">{tr('Note color')}</span><select className="input min-w-0" value={newNote.color} onChange={(event) => setNewNote({ ...newNote, color: event.target.value as typeof newNote.color })} disabled={!canWork}><option value="paper">{tr('Paper')}</option><option value="lavender">{tr('Lavender')}</option><option value="mint">{tr('Mint')}</option><option value="sky">{tr('Sky')}</option></select></label><label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={newNote.is_pinned} onChange={(event) => setNewNote({ ...newNote, is_pinned: event.target.checked })} disabled={!canWork} />{tr('Pin note')}</label><div className="sm:col-span-2"><button className="btn-primary" disabled={!canWork || busy}><Plus size={15} />{tr('Add note')}</button></div></form><div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{projectNotes.map((note) => <article key={note.id} className={cx('min-w-0 rounded-2xl border border-slate-200/80 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10', NOTE_TONES[note.color] ?? NOTE_TONES.paper)}><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="chip"><Flag size={12} />{tr(note.note_type === 'decision' ? 'Decision' : note.note_type === 'meeting' ? 'Meeting notes' : note.note_type === 'sticky' ? 'Sticky note' : 'Milestone')}</span>{note.occurred_on && <span className="text-xs muted">{fmtDate(note.occurred_on, language)}</span>}{note.is_pinned && <span className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-300"><Pin size={12} />{tr('Pinned')}</span>}</div><h3 className="mt-3 break-words font-semibold">{note.title}</h3>{note.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 muted">{note.body}</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-300/50 pt-2 dark:border-white/10">{canWork && <><label className="sr-only" htmlFor={`note-color-${note.id}`}>{tr('Note color')}</label><select id={`note-color-${note.id}`} className="input !w-auto !min-w-0 !py-1 text-xs" value={note.color} onChange={(event) => void runAction(() => updateSharedNote(note.id, { color: event.target.value as typeof note.color }))}><option value="paper">{tr('Paper')}</option><option value="lavender">{tr('Lavender')}</option><option value="mint">{tr('Mint')}</option><option value="sky">{tr('Sky')}</option></select><button type="button" className="btn-ghost !min-h-8 !px-2 !py-1 text-xs" onClick={() => void runAction(() => updateSharedNote(note.id, { is_pinned: !note.is_pinned }))}><Pin size={13} />{tr(note.is_pinned ? 'Unpin note' : 'Pin note')}</button></>}</div></article>)}{projectNotes.length === 0 && <p className="card p-5 text-sm muted sm:col-span-2 xl:col-span-3">{tr('Capture decisions, meeting notes, and milestones so collaborators share the same context.')}</p>}</div></section>}

        {tab === 'timeline' && <ProjectTimeline tasks={projectTasks} members={members} currentUserId={user.id} language={language} onChange={(taskId, patch) => updateTask(taskId, patch)} />}

        {tab === 'activity' && <section className="card min-w-0 p-4"><h3 className="flex items-center gap-2 font-semibold"><Bell size={17} />{tr('Recent project activity')}</h3><ul className="mt-3 space-y-3">{snapshot.activity.filter((event) => event.project_id === selected.id).slice(0, 100).map((event) => <li key={event.id} className="flex min-w-0 gap-3 border-s border-slate-200 ps-3 dark:border-white/10"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" /><div className="min-w-0 flex-1"><p className="break-words text-sm"><span className="font-medium">{event.actor_id === user.id ? tr('You') : event.actor_id ? memberLabel(event.actor_id, members, user.id) : tr('Former member')}</span> · {tr(event.event_type.split('.').join(' '))}{typeof event.payload.title === 'string' ? ` · ${event.payload.title}` : ''}</p><time className="text-xs muted" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(localeForLanguage(language))}</time></div></li>)}</ul>{snapshot.activity.filter((event) => event.project_id === selected.id).length === 0 && <p className="mt-3 text-sm muted">{tr('Team changes will appear here.')}</p>}</section>}
          </div>
        </div>
      </section>
    ) : (
      <div className="min-w-0 space-y-4">
        <section className="card min-w-0 p-3 sm:p-4"><div className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-2"><div className="min-w-0"><h2 className="text-sm font-semibold">{tr('Work view')}</h2><p className="mt-0.5 text-xs muted">{tr('Choose one status. The same shared project is visible to each authorized member.')}</p></div><button type="button" className="btn-primary shrink-0" onClick={() => setCreating(true)}><Plus size={16} />{tr('New shared project')}</button></div><StatusRail value={filter} counts={projectCount} onChange={setFilter} /></section>
        <div className="card min-w-0 p-3 sm:p-4"><form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void acceptInvite(joinToken); }}><label className="min-w-0 flex-1"><span className="label">{tr('Join with an invitation link or code')}</span><input className="input min-w-0" value={joinToken} onChange={(event) => setJoinToken(event.target.value)} placeholder={tr('Paste the private invitation token')} /></label><button type="submit" className="btn-outline shrink-0" disabled={!joinToken.trim() || busy}><Link2 size={15} />{tr('Join project')}</button></form></div>
        {filteredProjects.length === 0 ? <div className="card px-5 py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600"><Users size={24} /></div><h3 className="mt-3 text-base font-semibold">{snapshot.projects.length ? tr(`No ${filter} shared projects`) : tr('No shared projects yet')}</h3><p className="mx-auto mt-1 max-w-lg text-sm leading-6 muted">{tr('Create a team workspace or accept a secure invite. Your personal projects, routines, and account snapshot stay private.')}</p>{!snapshot.projects.length && <button type="button" className="btn-primary mt-4" onClick={() => setCreating(true)}><Plus size={16} />{tr('Create a shared project')}</button>}</div> : <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredProjects.map((project) => {
          const projectMembers = snapshot.members.filter((member) => member.project_id === project.id);
          const tasks = snapshot.tasks.filter((task) => task.project_id === project.id);
          const done = tasks.filter((task) => task.status === 'done').length;
          const role = projectMembers.find((member) => member.user_id === user.id)?.role ?? 'viewer';
          const dueOver = project.due_date && project.due_date < today() && project.status !== 'done';
          return <button key={project.id} type="button" className="card group min-w-0 p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" onClick={() => setSelectedId(project.id)}><div className="flex min-w-0 items-start gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS.find((item) => item.id === project.status)?.color }} /><h3 className="min-w-0 flex-1 break-words text-[15px] font-semibold">{project.title}</h3><span className="chip shrink-0">{tr(ROLE_LABEL[role])}</span></div>{project.description && <p className="mt-2 line-clamp-2 break-words text-sm leading-5 muted">{project.description}</p>}<div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5"><span className="chip"><Users size={12} />{projectMembers.length}</span><span className="chip"><ClipboardList size={12} />{done}/{tasks.length}</span>{project.due_date && <span className={cx('chip', dueOver && 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300')}><CalendarDays size={12} />{fmtDate(project.due_date)}</span>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${tasks.length ? Math.round(done / tasks.length * 100) : 0}%` }} /></div></button>;
        })}</div>}
      </div>
    )}

    {creating && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#171a22]" role="dialog" aria-modal="true" aria-labelledby="new-shared-project-title"><div className="flex items-start justify-between gap-3"><div><h2 id="new-shared-project-title" className="text-lg font-semibold">{tr('Create a shared project')}</h2><p className="mt-1 text-sm muted">{tr('The project is stored separately from private personal projects. You can invite other accounts after creating it.')}</p></div><button type="button" className="btn-ghost !p-2" onClick={() => setCreating(false)} aria-label={tr('Close')}>×</button></div><form className="mt-4 grid min-w-0 gap-3" onSubmit={(event) => void createProject(event)}><label className="min-w-0"><span className="label">{tr('Project name')}</span><input autoFocus className="input min-w-0" value={newProject.title} onChange={(event) => setNewProject({ ...newProject, title: event.target.value })} maxLength={200} required /></label><label className="min-w-0"><span className="label">{tr('Description / shared context')}</span><textarea className="input min-h-20 min-w-0 resize-y" value={newProject.description} onChange={(event) => setNewProject({ ...newProject, description: event.target.value })} maxLength={20000} /></label><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0"><span className="label">{tr('Initial status')}</span><select className="input min-w-0" value={newProject.status} onChange={(event) => setNewProject({ ...newProject, status: event.target.value as SharedStatus })}>{STATUS.map((item) => <option key={item.id} value={item.id}>{tr(item.label)}</option>)}</select></label><label className="min-w-0"><span className="label">{tr('Due date')}</span><input className="input min-w-0" type="date" value={newProject.due_date} onChange={(event) => setNewProject({ ...newProject, due_date: event.target.value })} /></label></div><div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl bg-indigo-50/70 p-3 text-xs leading-5 text-indigo-800 dark:bg-indigo-500/[.07] dark:text-indigo-200"><ShieldCheck size={16} className="shrink-0" />{tr('You start as a transferable lead. You can add other leads or let the team work as equal members.')}</div><div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10"><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{tr('Cancel')}</button><button type="submit" className="btn-primary" disabled={busy}><Plus size={15} />{tr('Create shared project')}</button></div></form></section></div>}
  </div>;
}

function ProjectTimeline({ tasks, members, currentUserId, language, onChange }: { tasks: SharedTask[]; members: SharedMember[]; currentUserId: string; language: string; onChange: (taskId: string, patch: Partial<SharedTask>) => Promise<void> }) {
  const scheduled = [...tasks].filter((task) => task.due_date).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const unscheduled = tasks.filter((task) => !task.due_date);
  const done = tasks.filter((task) => task.status === 'done').length;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  return <section className="card min-w-0 p-4 sm:p-6">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={19} className="text-indigo-600 dark:text-indigo-300" />{tr('Project roadmap')}</h3><p className="mt-1 text-sm muted">{tr('A clear sequence of dated milestones and next steps.')}</p></div><span className="chip">{scheduled.length} {tr('scheduled tasks')}</span></div>
    <div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/[.04]"><p className="text-xl font-semibold tabular-nums">{tasks.length}</p><p className="text-xs muted">{tr('Tasks')}</p></div><div className="rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-500/[.08]"><p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{done}</p><p className="text-xs muted">{tr('Completed')}</p></div><div className="rounded-xl bg-indigo-50 p-3 text-center dark:bg-indigo-500/[.08]"><p className="text-xl font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{progress}%</p><p className="text-xs muted">{tr('Progress')}</p></div></div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
    <div className="mt-6 space-y-0">{scheduled.map((task) => <article key={task.id} className="timeline-item relative grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2 pb-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3"><div className="pt-3 text-right text-xs font-medium tabular-nums muted sm:text-sm">{fmtDate(task.due_date!, language)}</div><div className="relative min-w-0 border-s-2 border-indigo-200 ps-3 dark:border-indigo-400/20 sm:ps-4"><span className={cx('absolute -start-[7px] top-4 h-3 w-3 rounded-full border-2 border-white shadow-sm dark:border-[#171a22]', task.status === 'done' ? 'bg-emerald-500' : task.status === 'blocked' ? 'bg-rose-500' : 'bg-indigo-500')} /><div className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[.025] sm:p-4"><div className="flex min-w-0 items-start gap-2"><div className="min-w-0 flex-1"><h4 className={cx('break-words text-sm font-semibold', task.status === 'done' && 'line-through muted')}>{task.title}</h4>{task.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 muted">{task.details}</p>}</div><button type="button" className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg transition hover:bg-slate-100 dark:hover:bg-white/10', task.status === 'done' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600')} aria-label={tr(task.status === 'done' ? 'Reopen task' : 'Mark task done')} title={tr(task.status === 'done' ? 'Reopen task' : 'Mark task done')} onClick={() => void onChange(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}>{task.status === 'done' ? <CheckCircle2 size={18} /> : <Circle size={18} />}</button></div><div className="mt-2 flex flex-wrap gap-1.5"><span className="chip">{tr(TASK_STATUS.find((status) => status.id === task.status)?.label ?? task.status)}</span>{task.assignee_id && <span className="chip"><Users size={12} />{memberLabel(task.assignee_id, members, currentUserId)}</span>}{task.estimate_minutes !== null && <span className="chip">{task.estimate_minutes} {tr('min')}</span>}</div></div></div></article>)}
      {unscheduled.length > 0 && <div className="rounded-xl border border-dashed border-slate-300 p-3 sm:ms-[8rem] dark:border-white/10"><p className="text-xs font-semibold muted">{tr('Unscheduled next steps')}</p><ul className="mt-2 space-y-2">{unscheduled.map((task) => <li key={task.id} className="flex min-w-0 items-center gap-2 text-sm"><span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" /><span className="min-w-0 flex-1 break-words">{task.title}</span><span className="chip shrink-0">{tr(TASK_STATUS.find((status) => status.id === task.status)?.label ?? task.status)}</span></li>)}</ul></div>}
      {!tasks.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm muted dark:border-white/10">{tr('Add a task with a due date to start the roadmap.')}</p>}
    </div>
  </section>;
}

function CommentCard({ comment, members, currentUserId, tasks, language, receipts, onReadState }: { comment: SharedComment; members: SharedMember[]; currentUserId: string; tasks: SharedTask[]; language: string; receipts: SharedCommentReceipt[]; onReadState: (commentId: string, isRead: boolean) => void }) {
  const task = tasks.find((item) => item.id === comment.task_id);
  const ownReceipt = receipts.find((receipt) => receipt.comment_id === comment.id && receipt.user_id === currentUserId);
  const seenBy = receipts.filter((receipt) => receipt.comment_id === comment.id).map((receipt) => memberLabel(receipt.user_id, members, currentUserId));
  return <article className={cx('min-w-0 rounded-2xl border p-3.5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-md', comment.author_id === currentUserId ? 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-400/20 dark:bg-indigo-500/[.06]' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[.025]')}><div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{initials(memberLabel(comment.author_id, members, currentUserId))}</span><p className="min-w-0 break-words text-sm font-semibold">{memberLabel(comment.author_id, members, currentUserId)}</p></div><time className="shrink-0 text-xs muted" dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString(localeForLanguage(language))}</time></div>{task && <p className="mt-2 break-words text-xs text-indigo-600 dark:text-indigo-300">{tr('Task')}: {task.title}</p>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>{comment.mentioned_user_ids.length > 0 && <p className="mt-2 text-xs muted">{tr('Mentioned')}: {comment.mentioned_user_ids.map((id) => memberLabel(id, members, currentUserId)).join(', ')}</p>}<div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 dark:border-white/10"><p className="min-w-0 text-[11px] muted">{seenBy.length ? `${tr('Seen by')}: ${[...new Set(seenBy)].slice(0, 3).join(', ')}${seenBy.length > 3 ? ` +${seenBy.length - 3}` : ''}` : tr('Unread')}</p>{comment.author_id !== currentUserId && <button type="button" className="btn-ghost !min-h-8 !px-2 !py-1 text-xs" onClick={() => onReadState(comment.id, !ownReceipt)}>{ownReceipt ? <EyeOff size={13} /> : <Eye size={13} />}{tr(ownReceipt ? 'Mark unread' : 'Mark as read')}</button>}</div></article>;
}
