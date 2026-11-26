import { translate as tr } from '../../lib/locales';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Activity, ArrowLeft, CalendarDays, Check, ClipboardList, FileText, FolderKanban, GripVertical, LayoutDashboard, Link2, LockKeyhole, MessageCircle, Pencil, Plus, RefreshCw, Route, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useStore } from '../../lib/store';
import { cloudEnabled } from '../../lib/supabase';
import { playFeedback } from '../../lib/sounds';
import { cx, localeForLanguage } from '../../lib/utils';
import {
  acceptSharedInvitation, addSharedComment, claimSharedProjectAdmin, createSharedInvitation, createSharedProject, createSharedTask,
  fetchMyPrivateTaskLinks, fetchSharedCommentsPage, fetchSharedWorkspace, markSharedCommentsRead, markSharedProjectNotificationsRead,
  removeSharedMember, setSharedCommentReadState, setSharedMemberRole, sharedServiceError, subscribeToSharedWorkspace, updateSharedComment,
  updateSharedProject, updateSharedProjectStatus, updateSharedTask,
  type PrivateTaskLink, type SharedComment, type SharedProject, type SharedRole, type SharedStatus, type SharedTask, type SharedWorkspaceSnapshot,
} from '../../lib/sharedProjects';
import { AvatarStack, PillSelect, ProgressRing, ROLE_LABEL, STATUS, isOpen, isOverdue, mayChangeProjectStatus, relativeDay, roleCanWork, statusMeta } from './team/shared';
import TeamTasks, { type TaskContext } from './team/TeamTasks';
import TeamChat from './team/TeamChat';
import TeamOverview from './team/TeamOverview';
import TeamNotes from './team/TeamNotes';
import TeamPeople from './team/TeamPeople';
import { PortfolioSection, TeamActivity, TeamTimeline } from './team/TeamExtras';
import './team/TeamWorkspace.css';

type Tab = 'overview' | 'tasks' | 'people' | 'discussion' | 'notes' | 'timeline' | 'activity';
type Filter = SharedStatus | 'all';
const EMPTY: SharedWorkspaceSnapshot = { projects: [], members: [], tasks: [], dependencies: [], comments: [], commentReceipts: [], notes: [], activity: [], invitations: [], notifications: [], portfolios: [], portfolioMembers: [], portfolioProjects: [] };

function StatusChip({ id, label, color, count, selected, onSelect }: { id: Filter; label: string; color?: string; count: number; selected: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `shared-project-status:${id}`, data: { type: 'shared-project-status', status: id }, disabled: id === 'all' });
  return <button ref={setNodeRef} type="button" role="tab" aria-selected={selected} onClick={onSelect} className={cx('tw-chip', selected && 'is-on', isOver && 'is-drop')}>{color && <span className="tw-dot" style={{ background: color }} />}{tr(label)}<b>{count}</b></button>;
}

function ProjectCard({ project, tasks, memberIds, members, currentUserId, role, unread, canChangeStatus, canClaimAdmin, busy, language, onOpen, onStatus, onClaim }: {
  project: SharedProject; tasks: SharedTask[]; memberIds: string[]; members: SharedWorkspaceSnapshot['members']; currentUserId: string; role: SharedRole; unread: number;
  canChangeStatus: boolean; canClaimAdmin: boolean; busy: boolean; language: string; onOpen: () => void; onStatus: (status: SharedStatus) => void; onClaim: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `shared-project:${project.id}`, data: { type: 'shared-project', projectId: project.id }, disabled: !canChangeStatus || busy });
  const done = tasks.filter((task) => task.status === 'done').length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const overdue = tasks.filter(isOverdue).length;
  const next = tasks.filter(isOpen).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
  const meta = statusMeta(project.status);
  const late = project.due_date && project.status !== 'done' && project.due_date < new Date().toISOString().slice(0, 10);
  return <article ref={setNodeRef} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(1deg)` } : undefined} className={cx('tw-project-card', isDragging && 'is-dragging')} aria-label={`${tr('Shared project')}: ${project.title}`}>
    <span className="tw-project-glow" style={{ background: meta.color }} aria-hidden="true" />
    <div className="flex min-w-0 items-center gap-2">
      <PillSelect className="tw-status-select" style={{ ['--tone' as string]: meta.color }} icon={<span className="tw-dot" style={{ background: meta.color }} />} value={project.status} disabled={!canChangeStatus || busy} ariaLabel={`${tr('Project status')}: ${project.title}`} onChange={(value) => onStatus(value)} options={STATUS.map((item) => ({ value: item.id, label: tr(item.label) }))} />
      <span className="tw-role-tag">{tr(ROLE_LABEL[role])}</span>
      <span className="flex-1" />
      {unread > 0 && <span className="tw-unread" title={tr('Unread messages')}><MessageCircle size={12} />{unread}</span>}
      {canChangeStatus && <button type="button" aria-label={`${tr('Move project')}: ${project.title}`} title={tr('Drag to change project status')} {...attributes} {...listeners} className="tw-grip"><GripVertical size={16} /></button>}
    </div>
    <button type="button" className="mt-3 flex w-full min-w-0 items-start gap-3 text-left" onClick={onOpen}>
      <span className="min-w-0 flex-1"><span className="block break-words text-[15px] font-semibold leading-snug">{project.title}</span>{project.description && <span className="mt-1 line-clamp-2 block break-words text-sm leading-5 muted">{project.description}</span>}</span>
      <ProgressRing value={pct} size={46} label={`${pct}% ${tr('complete')}`} />
    </button>
    {next && <button type="button" className="tw-next" onClick={onOpen}><span className="muted">{tr('Next')}:</span><span className="min-w-0 flex-1 truncate">{next.title}</span>{next.due_date && <span className={cx('shrink-0', isOverdue(next) ? 'text-rose-400' : 'muted')}>{relativeDay(next.due_date, localeForLanguage(language))}</span>}</button>}
    <div className="mt-3 flex min-w-0 items-center gap-2">
      <AvatarStack ids={memberIds} members={members} currentUserId={currentUserId} max={4} size={26} />
      <span className="flex-1" />
      <span className="tw-meta"><ClipboardList size={12} />{done}/{tasks.length}</span>
      {overdue > 0 && <span className="tw-meta is-late">{overdue} {tr('late')}</span>}
      {project.due_date && <span className={cx('tw-meta', late && 'is-late')}><CalendarDays size={12} />{relativeDay(project.due_date, localeForLanguage(language))}</span>}
    </div>
    {canClaimAdmin && <button type="button" className="tw-link-btn mt-3" disabled={busy} onClick={onClaim}><ShieldCheck size={14} />{tr('No admin yet — become admin')}</button>}
  </article>;
}

export default function SharedProjectsWorkspace({ onSelectedChange, onSwitchToPrivate, initialProjectId, initialTab }: { onSelectedChange?: (open: boolean) => void; onSwitchToPrivate?: () => void; initialProjectId?: string | null; initialTab?: Tab }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const goals = useStore((state) => state.goals);
  const habits = useStore((state) => state.habits);
  const language = useStore((state) => state.settings.language ?? 'en');
  const [snapshot, setSnapshot] = useState<SharedWorkspaceSnapshot>(EMPTY);
  const [privateLinks, setPrivateLinks] = useState<PrivateTaskLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<'projects' | 'portfolios'>('projects');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newProject, setNewProject] = useState({ title: '', description: '', status: 'active' as SharedStatus, due_date: '' });
  const [joinToken, setJoinToken] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [discussionComments, setDiscussionComments] = useState<SharedComment[]>([]);
  const [discussionHasMore, setDiscussionHasMore] = useState(false);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [projectDraft, setProjectDraft] = useState({ title: '', description: '', status: 'planning' as SharedStatus, due_date: '' });
  const [editingProject, setEditingProject] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const pendingCommentSends = useRef(new Map<string, { body: string; taskId: string | null; startedAt: number }>());
  const discussionRequestId = useRef(0);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor));
  const selectedIdRef = useRef<string | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const tabRef = useRef<Tab>(tab);
  selectedIdRef.current = selectedId;
  tabRef.current = tab;

  const refresh = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const profileName = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim();
      const next = await fetchSharedWorkspace(user.id, profileName);
      const links = await fetchMyPrivateTaskLinks(next.tasks.map((task) => task.id));
      setSnapshot(next); setPrivateLinks(links); setError('');
      setSelectedId((current) => current && next.projects.some((project) => project.id === current) ? current : initialProjectId && next.projects.some((project) => project.id === initialProjectId) ? initialProjectId : null);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id, initialProjectId]);

  const runAction = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(true); return true; }
    catch (problem) { setError(sharedServiceError(problem)); playFeedback('failed'); return false; }
    finally { setBusy(false); }
  }, [refresh]);

  const loadDiscussionPage = useCallback(async (projectId: string, before?: Pick<SharedComment, 'created_at' | 'id'>, append = false) => {
    if (!user?.id) return;
    const requestId = ++discussionRequestId.current;
    setDiscussionLoading(true);
    try {
      const page = await fetchSharedCommentsPage(projectId, before, 50);
      if (requestId !== discussionRequestId.current || selectedIdRef.current !== projectId) return;
      setDiscussionComments((current) => {
        const resolved = new Set<string>();
        for (const comment of current) {
          if (!comment.id.startsWith('optimistic-')) continue;
          const pending = pendingCommentSends.current.get(comment.id);
          if (pending && page.comments.some((row) => row.author_id === user.id && row.body === pending.body && row.task_id === pending.taskId && Date.parse(row.created_at) >= pending.startedAt - 1000)) resolved.add(comment.id);
        }
        const keep = append ? current : current.filter((comment) => comment.id.startsWith('optimistic-') && !resolved.has(comment.id));
        const unique = new Map([...keep, ...page.comments].map((comment) => [comment.id, comment]));
        return [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
      if (!append) setDiscussionHasMore(page.hasMore); else setDiscussionHasMore(page.hasMore);
      const ids = new Set(page.comments.map((comment) => comment.id));
      setSnapshot((current) => ({ ...current, commentReceipts: [...current.commentReceipts.filter((receipt) => !ids.has(receipt.comment_id)), ...page.receipts] }));
    } catch (problem) {
      if (requestId === discussionRequestId.current && selectedIdRef.current === projectId) setError(sharedServiceError(problem));
    } finally {
      if (requestId === discussionRequestId.current) setDiscussionLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) { setDiscussionComments([]); setDiscussionHasMore(false); return; }
    if (tab === 'discussion') void loadDiscussionPage(selectedId);
  }, [tab, selectedId, loadDiscussionPage]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    void refresh();
    let full: ReturnType<typeof setTimeout> | undefined;
    let chat: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToSharedWorkspace(user.id, (table, row) => {
      const projectId = selectedIdRef.current;
      if (table === 'shared_project_comments' && projectId && tabRef.current === 'discussion' && (!row || row.project_id === projectId)) {
        if (chat) clearTimeout(chat);
        chat = setTimeout(() => void loadDiscussionPage(projectId), 80);
      }
      if (full) clearTimeout(full);
      full = setTimeout(() => void refresh(true), table === 'shared_project_comments' ? 1200 : 300);
    });
    return () => { if (full) clearTimeout(full); if (chat) clearTimeout(chat); unsubscribe(); };
  }, [user?.id, refresh, loadDiscussionPage]);

  const selected = snapshot.projects.find((project) => project.id === selectedId) ?? null;

  const sendComment = async (body: string, taskId: string | null, mentions: string[]) => {
    if (!selected || !user?.id) return false;
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    const now = new Date(startedAt).toISOString();
    pendingCommentSends.current.set(optimisticId, { body, taskId, startedAt });
    setDiscussionComments((current) => [{ id: optimisticId, project_id: selected.id, task_id: taskId, author_id: user.id, body, mentioned_user_ids: mentions, created_at: now, updated_at: now }, ...current]);
    playFeedback('submit');
    try {
      const saved = await addSharedComment(selected.id, user.id, body, taskId || undefined, mentions);
      setDiscussionComments((current) => {
        const byId = new Map([...current.filter((comment) => comment.id !== optimisticId), saved].map((comment) => [comment.id, comment]));
        return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
      setSnapshot((current) => ({ ...current, comments: [saved, ...current.comments.filter((comment) => comment.id !== saved.id)] }));
      return true;
    } catch (problem) {
      setDiscussionComments((current) => current.filter((comment) => comment.id !== optimisticId));
      setError(sharedServiceError(problem)); playFeedback('failed');
      return false;
    } finally { pendingCommentSends.current.delete(optimisticId); }
  };

  const acceptInvite = useCallback(async (token: string) => {
    const trimmed = token.trim().replace(/^.*[?&]invite=/, '').replace(/&.*$/, '');
    if (!trimmed || !user?.id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await acceptSharedInvitation(decodeURIComponent(trimmed));
      try { sessionStorage.removeItem('lifeos:pending-shared-invite'); } catch { /* storage blocked */ }
      setJoinToken(''); setJoining(false); setNotice(tr('Invitation accepted. Shared project is ready.'));
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

  useEffect(() => {
    if (initialProjectId) setSelectedId(initialProjectId);
    if (initialTab) setTab(initialTab);
  }, [initialProjectId, initialTab]);
  useEffect(() => { onSelectedChange?.(Boolean(selected)); }, [selected?.id, onSelectedChange]);
  useEffect(() => {
    if (!selected) return;
    setProjectDraft({ title: selected.title, description: selected.description, status: selected.status, due_date: selected.due_date ?? '' });
    setEditingProject(false); setDescOpen(false); setInviteUrl('');
    setTab(initialProjectId === selected.id && initialTab ? initialTab : 'overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selected?.id, initialProjectId, initialTab]);

  useEffect(() => {
    if (tab !== 'discussion' || !selected || !user?.id) return;
    const unread = discussionComments.filter((comment) => !comment.id.startsWith('optimistic-') && comment.author_id !== user.id && !snapshot.commentReceipts.some((receipt) => receipt.comment_id === comment.id && receipt.user_id === user.id));
    const hasUnreadNotes = snapshot.notifications.some((notification) => notification.project_id === selected.id && !notification.read_at && notification.kind.startsWith('comment.'));
    if (!unread.length && !hasUnreadNotes) return;
    const ids = unread.map((comment) => comment.id);
    void Promise.all([ids.length ? markSharedCommentsRead(selected.id, user.id, unread) : Promise.resolve(), markSharedProjectNotificationsRead(selected.id, user.id)])
      .then(() => {
        const seenAt = new Date().toISOString();
        setSnapshot((current) => ({ ...current, commentReceipts: [...current.commentReceipts.filter((receipt) => !(ids.includes(receipt.comment_id) && receipt.user_id === user.id)), ...ids.map((comment_id) => ({ comment_id, user_id: user.id, seen_at: seenAt }))], notifications: current.notifications.map((notification) => notification.project_id === selected.id && notification.kind.startsWith('comment.') ? { ...notification, read_at: notification.read_at ?? seenAt } : notification) }));
      })
      .catch((problem) => setError(sharedServiceError(problem)));
  }, [tab, selected?.id, user?.id, discussionComments, snapshot.commentReceipts, snapshot.notifications]);

  // Chat fills the screen: bring the sticky tab bar to the top so the composer sits right above the bottom nav.
  useEffect(() => {
    if (tab !== 'discussion' || !tabsRef.current) return;
    const nav = tabsRef.current;
    const frame = requestAnimationFrame(() => {
      const stickyTop = parseFloat(getComputedStyle(nav).top) || 0;
      const target = window.scrollY + nav.getBoundingClientRect().top - stickyTop;
      if (Math.abs(target - window.scrollY) > 4) window.scrollTo({ top: target, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, selected?.id]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('tw-chat-open', tab === 'discussion' && Boolean(selected));
    return () => root.classList.remove('tw-chat-open');
  }, [tab, selected?.id]);

  const members = snapshot.members.filter((member) => member.project_id === selected?.id);
  const me = members.find((member) => member.user_id === user?.id);
  const canManage = Boolean(me && ['lead', 'admin'].includes(me.role));
  const canWork = roleCanWork(me?.role);
  const hasAdmin = members.some((member) => member.role === 'admin');
  const canChangeStatus = mayChangeProjectStatus(me?.role, hasAdmin);
  const canClaimAdmin = Boolean(me?.role === 'member' && !hasAdmin);
  const hasManagers = members.some((member) => member.role === 'lead' || member.role === 'admin');
  const canInvite = Boolean(me && (canManage || (!hasManagers && me.role !== 'viewer')));
  const projectTasks = useMemo(() => snapshot.tasks.filter((task) => task.project_id === selected?.id), [snapshot.tasks, selected?.id]);
  const doneCount = projectTasks.filter((task) => task.status === 'done').length;
  const progress = projectTasks.length ? Math.round(doneCount / projectTasks.length * 100) : 0;
  const projectNotes = snapshot.notes.filter((note) => note.project_id === selected?.id).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.updated_at.localeCompare(a.updated_at));
  const projectActivity = snapshot.activity.filter((event) => event.project_id === selected?.id);
  const unreadFor = useCallback((projectId: string) => snapshot.comments.filter((comment) => comment.project_id === projectId && comment.author_id !== user?.id && !snapshot.commentReceipts.some((receipt) => receipt.comment_id === comment.id && receipt.user_id === user?.id)).length, [snapshot.comments, snapshot.commentReceipts, user?.id]);
  const unreadHere = selected ? unreadFor(selected.id) : 0;
  const privateLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    goals.forEach((goal) => { labels[`goal:${goal.id}`] = goal.title; });
    habits.forEach((habit) => { labels[`habit:${habit.id}`] = habit.title; });
    return labels;
  }, [goals, habits]);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const id = await createSharedProject(newProject.title.trim(), newProject.description.trim(), newProject.status);
      if (newProject.due_date) await updateSharedProject(id, { due_date: newProject.due_date });
      setNewProject({ title: '', description: '', status: 'active', due_date: '' }); setCreating(false); setFilter('all');
      playFeedback('confirm');
      await refresh(true); setSelectedId(id);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  };

  const issueInvite = async (role: Exclude<SharedRole, 'lead' | 'admin'>, days: number) => {
    if (!selected) return;
    setBusy(true); setError(''); setInviteUrl('');
    try {
      const invitation = await createSharedInvitation(selected.id, role, new Date(Date.now() + days * 86400000).toISOString());
      const url = new URL(window.location.href); url.search = ''; url.hash = `/projects?invite=${encodeURIComponent(invitation.token)}`;
      setInviteUrl(url.toString()); await refresh(true);
    } catch (problem) { setError(sharedServiceError(problem)); }
    finally { setBusy(false); }
  };

  /** Optimistic: the UI changes instantly, the server catches up, and a failure rolls back. */
  const updateTask = useCallback(async (taskId: string, patch: Partial<SharedTask>) => {
    const before = snapshot.tasks.find((row) => row.id === taskId);
    if (!before) return false;
    setSnapshot((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch, updated_at: new Date().toISOString() } : task) }));
    if (patch.status === 'done' && before.status !== 'done') playFeedback('confirm');
    setError('');
    try {
      await updateSharedTask(taskId, patch);
      if (patch.status === 'done' && before.status !== 'done' && user?.id) useStore.getState().awardReward(`shared-task:${user.id}:${taskId}`, before.title, 'task', 20);
      void refresh(true);
      return true;
    } catch (problem) {
      setSnapshot((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? before : task) }));
      setError(sharedServiceError(problem)); playFeedback('failed');
      return false;
    }
  }, [snapshot.tasks, refresh, user?.id]);

  const addTask = async (title: string, due: string, assignee: string) => {
    if (!selected || !user?.id) return false;
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    setSnapshot((current) => ({ ...current, tasks: [{ id: tempId, project_id: selected.id, title, details: '', status: 'todo', due_date: due || null, estimate_minutes: null, assignee_id: assignee || null, created_by: user.id, created_at: now, updated_at: now }, ...current.tasks] }));
    try { await createSharedTask(selected.id, user.id, title, due || undefined, assignee || undefined); playFeedback('add'); void refresh(true); return true; }
    catch (problem) { setSnapshot((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== tempId) })); setError(sharedServiceError(problem)); return false; }
  };

  const saveProjectEdit = async () => {
    if (!selected || !projectDraft.title.trim()) return;
    const draft = { ...projectDraft, title: projectDraft.title.trim(), description: projectDraft.description.trim() };
    const saved = await runAction(async () => {
      await updateSharedProject(selected.id, { ...draft, due_date: draft.due_date || null });
      if (selected.status !== 'done' && draft.status === 'done' && user?.id) useStore.getState().awardReward(`shared-project:${user.id}:${selected.id}`, draft.title, 'project', 100);
    });
    if (saved) setEditingProject(false);
  };
  const claimProjectAdmin = async (projectId = selected?.id) => {
    if (!projectId) return;
    if (await runAction(() => claimSharedProjectAdmin(projectId))) setNotice(tr('Your project role is now Admin.'));
  };
  const moveSharedProjectStatus = async (projectId: string, target: SharedStatus) => {
    const project = snapshot.projects.find((item) => item.id === projectId);
    const role = snapshot.members.find((member) => member.project_id === projectId && member.user_id === user?.id)?.role;
    const adminAssigned = snapshot.members.some((member) => member.project_id === projectId && member.role === 'admin');
    if (!project || project.status === target) return;
    if (!mayChangeProjectStatus(role, adminAssigned)) { setError(tr('Only project leads and admins can change project status.')); return; }
    setBusy(true); setError('');
    setSnapshot((current) => ({ ...current, projects: current.projects.map((item) => item.id === projectId ? { ...item, status: target } : item) }));
    try { await updateSharedProjectStatus(projectId, target); await refresh(true); }
    catch (problem) {
      setSnapshot((current) => ({ ...current, projects: current.projects.map((item) => item.id === projectId ? { ...item, status: project.status } : item) }));
      setError(sharedServiceError(problem));
    } finally { setBusy(false); }
  };
  const onProjectDragEnd = (event: DragEndEvent) => {
    const active = event.active.data.current;
    const over = event.over?.data.current as { type?: string; status?: Filter } | undefined;
    if (active?.type !== 'shared-project' || !active.projectId || over?.type !== 'shared-project-status' || !over.status || over.status === 'all') return;
    void moveSharedProjectStatus(active.projectId, over.status);
  };

  if (!cloudEnabled || !user) return <div className="tw-empty mx-auto max-w-xl"><span>👥</span><p className="font-semibold">{tr('Shared projects need an account')}</p><p className="text-sm muted">{tr('Sign in to your account to collaborate across devices. Guest-mode projects remain private on this device.')}</p></div>;

  const taskCtx: TaskContext = { projectId: selected?.id ?? '', members, currentUserId: user.id, canWork, canManage, language, allTasks: projectTasks, dependencies: snapshot.dependencies, privateLinks, privateLabels, goals, habits, runAction, updateTask };
  const openTasks = projectTasks.filter(isOpen).length;
  const TABS: { id: Tab; label: string; icon: typeof Users; badge?: number; alert?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList, badge: openTasks },
    { id: 'discussion', label: 'Chat', icon: MessageCircle, badge: unreadHere, alert: unreadHere > 0 },
    { id: 'notes', label: 'Notes', icon: FileText, badge: projectNotes.length },
    { id: 'timeline', label: 'Timeline', icon: Route },
    { id: 'people', label: 'People', icon: Users, badge: members.length },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  // Workspace-wide numbers for the list view.
  const myIds = new Set(snapshot.members.filter((member) => member.user_id === user.id).map((member) => member.project_id));
  const allOpen = snapshot.tasks.filter((task) => myIds.has(task.project_id) && isOpen(task));
  const mineOpen = allOpen.filter((task) => task.assignee_id === user.id).length;
  const totalUnread = snapshot.projects.reduce((sum, project) => sum + unreadFor(project.id), 0);
  const counts = STATUS.reduce((acc, item) => ({ ...acc, [item.id]: snapshot.projects.filter((project) => project.status === item.id).length }), { all: snapshot.projects.length } as Record<Filter, number>);
  const q = query.trim().toLowerCase();
  const shownProjects = snapshot.projects.filter((project) => (filter === 'all' || project.status === filter) && (!q || `${project.title} ${project.description}`.toLowerCase().includes(q)));

  return <div className="tw-root min-w-0 space-y-3">
    {!selected && <div className="flex min-w-0 items-center gap-2">
      <div className="tw-seg" role="tablist" aria-label={tr('Project workspace type')}>
        <button type="button" role="tab" aria-selected={section === 'projects'} className={cx(section === 'projects' && 'is-on')} onClick={() => setSection('projects')}><Users size={15} /><span>{tr('Team projects')}</span></button>
        <button type="button" role="tab" aria-selected={section === 'portfolios'} className={cx(section === 'portfolios' && 'is-on')} onClick={() => setSection('portfolios')}><FolderKanban size={15} /><span>{tr('Portfolios')}</span></button>
      </div>
      <span className="flex-1" />
      <button type="button" className="tw-icon-btn" title={tr('Refresh shared work')} aria-label={tr('Refresh shared work')} onClick={() => void refresh(true)}><RefreshCw size={16} className={cx(refreshing && 'animate-spin')} /></button>
      {section === 'projects' && <button type="button" className="btn-primary !min-h-10 shrink-0 max-sm:!px-3" aria-label={tr('New team project')} onClick={() => setCreating(true)}><Plus size={17} /><span className="hidden sm:inline">{tr('New team project')}</span></button>}
    </div>}

    {error && <div className="tw-alert" role="alert"><ShieldCheck size={16} className="mt-0.5 shrink-0" /><p className="min-w-0 flex-1 break-words">{error} {/migration|setup is incomplete/i.test(error) && <a className="font-semibold underline" href="https://github.com/abdullahbinfahad/life-os/blob/main/README.md#supabase-setup" target="_blank" rel="noreferrer">{tr('Open setup instructions')}</a>}</p><button type="button" onClick={() => setError('')} aria-label={tr('Dismiss')}><X size={14} /></button></div>}
    {notice && <div className="tw-notice" role="status"><Check size={15} />{notice}<button type="button" className="ms-auto" onClick={() => setNotice('')} aria-label={tr('Dismiss')}><X size={14} /></button></div>}

    {loading ? <div className="space-y-3" aria-busy="true"><div className="tw-stats">{[0, 1, 2, 3].map((index) => <div key={index} className="tw-stat tw-skel" />)}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <div key={index} className="tw-project-card tw-skel h-44" />)}</div></div>
      : section === 'portfolios' && !selected ? <PortfolioSection snapshot={snapshot} currentUserId={user.id} runAction={runAction} />
      : selected ? <section className="min-w-0 space-y-3 tw-enter">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className="btn-ghost -ml-2 !min-h-10" onClick={() => setSelectedId(null)}><ArrowLeft size={17} />{tr('Team projects')}</button>
          <span className="flex-1" />
          {canManage && !editingProject && <button type="button" className="tw-icon-btn" title={tr('Edit project')} aria-label={tr('Edit project')} onClick={() => { setProjectDraft({ title: selected.title, description: selected.description, status: selected.status, due_date: selected.due_date ?? '' }); setEditingProject(true); }}><Pencil size={16} /></button>}
          {onSwitchToPrivate && <button type="button" className="tw-icon-btn" onClick={onSwitchToPrivate} title={tr('Private projects')} aria-label={tr('Private projects')}><LockKeyhole size={16} /></button>}
          <button type="button" className="tw-icon-btn" title={tr('Refresh')} aria-label={tr('Refresh')} onClick={() => void refresh(true)}><RefreshCw size={16} className={cx(refreshing && 'animate-spin')} /></button>
        </div>

        <header className="tw-hero" style={{ ['--tone' as string]: statusMeta(selected.status).color }}>
          <span className="tw-hero-orb" aria-hidden="true" />
          {canManage && editingProject ? <div className="relative grid min-w-0 gap-2.5">
            <input className="input min-w-0 text-base font-semibold" value={projectDraft.title} onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })} maxLength={200} aria-label={tr('Project title')} />
            <textarea className="input min-h-24 min-w-0 resize-y leading-6" value={projectDraft.description} onChange={(event) => setProjectDraft({ ...projectDraft, description: event.target.value })} maxLength={20000} aria-label={tr('Description')} placeholder={tr('What is this project about?')} />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select className="input !w-auto !py-2" value={projectDraft.status} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value as SharedStatus })} aria-label={tr('Status')}>{STATUS.map((item) => <option key={item.id} value={item.id}>{tr(item.label)}</option>)}</select>
              <input className="input !w-auto !py-2" type="date" value={projectDraft.due_date} onChange={(event) => setProjectDraft({ ...projectDraft, due_date: event.target.value })} aria-label={tr('Due date')} />
              <span className="flex-1" />
              <button type="button" className="btn-ghost" onClick={() => setEditingProject(false)}>{tr('Cancel')}</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveProjectEdit()}><Check size={16} />{tr('Save')}</button>
            </div>
          </div> : <div className="relative flex min-w-0 items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <PillSelect className="tw-status-select" style={{ ['--tone' as string]: statusMeta(selected.status).color }} icon={<span className="tw-dot" style={{ background: statusMeta(selected.status).color }} />} value={selected.status} disabled={!canChangeStatus || busy} ariaLabel={tr('Project status')} onChange={(value) => void moveSharedProjectStatus(selected.id, value)} options={STATUS.map((item) => ({ value: item.id, label: tr(item.label) }))} />
                {selected.due_date && <span className={cx('tw-meta', selected.status !== 'done' && isOverdue({ due_date: selected.due_date, status: 'todo' }) && 'is-late')}><CalendarDays size={12} />{tr('Due')} {relativeDay(selected.due_date, localeForLanguage(language))}</span>}
                <span className="tw-role-tag">{tr(ROLE_LABEL[me?.role ?? 'viewer'])}</span>
              </div>
              <h2 className="mt-2 break-words text-xl font-bold leading-tight tracking-tight sm:text-2xl">{selected.title}</h2>
              {selected.description && <><p className={cx('mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 muted', !descOpen && 'line-clamp-2')}>{selected.description}</p>{selected.description.length > 110 && <button type="button" className="tw-link-btn mt-0.5" onClick={() => setDescOpen((value) => !value)}>{tr(descOpen ? 'Show less' : 'Show more')}</button>}</>}
            </div>
            <ProgressRing value={progress} size={64} stroke={5} label={`${progress}% ${tr('complete')}`} />
          </div>}
          {!editingProject && <div className="relative mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" className="flex items-center gap-2" onClick={() => setTab('people')} aria-label={tr('People')}><AvatarStack ids={members.map((member) => member.user_id)} members={members} currentUserId={user.id} max={5} size={28} /></button>
            <span className="text-xs muted">{doneCount}/{projectTasks.length} {tr('tasks done')}</span>
            <span className="flex-1" />
            {canInvite && <button type="button" className="btn-outline !min-h-9 !px-3" onClick={() => setTab('people')}><UserPlus size={15} />{tr('Invite')}</button>}
          </div>}
          {canClaimAdmin && !editingProject && <div className="tw-claim"><ShieldCheck size={16} /><span className="min-w-0 flex-1 text-sm">{tr('No admin is assigned. Project members can claim the admin role.')}</span><button type="button" className="btn-outline !min-h-9" disabled={busy} onClick={() => void claimProjectAdmin(selected.id)}>{tr('Become admin')}</button></div>}
        </header>

        <nav ref={tabsRef} className="tw-tabs" role="tablist" aria-label={tr('Project workspace sections')}>
          {TABS.map(({ id, label, icon: Icon, badge, alert }) => <button key={id} id={`shared-tab-${id}`} type="button" role="tab" aria-selected={tab === id} className={cx('tw-tab', tab === id && 'is-on')} onClick={() => setTab(id)}><Icon size={16} /><span>{tr(label)}</span>{badge ? <b className={cx(alert && 'is-alert')}>{badge}</b> : null}</button>)}
        </nav>

        <div className="min-w-0 tw-enter" key={tab} role="tabpanel" aria-labelledby={`shared-tab-${tab}`}>
          {tab === 'overview' && <TeamOverview tasks={projectTasks} ctx={taskCtx} notes={projectNotes} comments={snapshot.comments.filter((comment) => comment.project_id === selected.id)} activity={projectActivity} onGo={setTab} />}
          {tab === 'tasks' && <TeamTasks tasks={projectTasks} ctx={taskCtx} busy={busy} onAdd={addTask} />}
          {tab === 'discussion' && <TeamChat messages={discussionComments} members={members} currentUserId={user.id} tasks={projectTasks} language={language} receipts={snapshot.commentReceipts} canWork={canWork} hasMore={discussionHasMore} loading={discussionLoading}
            onLoadOlder={() => { const real = discussionComments.filter((comment) => !comment.id.startsWith('optimistic-')); const oldest = real[real.length - 1]; if (oldest) void loadDiscussionPage(selected.id, { created_at: oldest.created_at, id: oldest.id }, true); }}
            onSend={sendComment}
            onEdit={async (id, body) => { try { await updateSharedComment(id, body); setDiscussionComments((current) => current.map((comment) => comment.id === id ? { ...comment, body, updated_at: new Date().toISOString() } : comment)); return true; } catch (problem) { setError(sharedServiceError(problem)); return false; } }}
            onMarkUnread={(id) => void setSharedCommentReadState(id, user.id, false).then(() => setSnapshot((current) => ({ ...current, commentReceipts: current.commentReceipts.filter((receipt) => !(receipt.comment_id === id && receipt.user_id === user.id)) }))).catch((problem) => setError(sharedServiceError(problem)))} />}
          {tab === 'notes' && <TeamNotes notes={projectNotes} projectId={selected.id} currentUserId={user.id} canWork={canWork} language={language} runAction={runAction} />}
          {tab === 'timeline' && <TeamTimeline tasks={projectTasks} members={members} currentUserId={user.id} language={language} canWork={canWork} onChange={updateTask} />}
          {tab === 'people' && <TeamPeople members={members} tasks={projectTasks} invitations={snapshot.invitations.filter((invite) => invite.project_id === selected.id)} currentUserId={user.id} myRole={me?.role} canManage={canManage} canInvite={canInvite} hasManagers={hasManagers} inviteUrl={inviteUrl} busy={busy} runAction={runAction}
            onRole={(userId, role) => void runAction(() => setSharedMemberRole(selected.id, userId, role))}
            onRemove={(userId) => { if (confirm(userId === user.id ? tr('Leave this shared project?') : tr('Remove this member from the project?'))) void runAction(() => removeSharedMember(selected.id, userId)); }}
            onInvite={(role, days) => void issueInvite(role, days)} onNotice={setNotice} />}
          {tab === 'activity' && <TeamActivity activity={projectActivity} members={members} currentUserId={user.id} language={language} />}
        </div>
      </section>
      : <div className="min-w-0 space-y-3 tw-enter">
        <div className="tw-stats">
          {([['Projects', snapshot.projects.length, FolderKanban, '#8b5cf6'], ['Open tasks', allOpen.length, ClipboardList, '#6366f1'], ['Assigned to me', mineOpen, Users, '#06b6d4'], ['Unread', totalUnread, MessageCircle, totalUnread ? '#f43f5e' : '#64748b']] as const).map(([label, value, Icon, tone]) => <div key={label} className="tw-stat" style={{ ['--tone' as string]: tone }}><span className="tw-stat-icon"><Icon size={16} /></span><b>{value}</b><span>{tr(label)}</span></div>)}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProjectDragEnd}>
          <div className="tw-toolbar">
            <div className="tw-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search team projects')} aria-label={tr('Search team projects')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={tr('Clear')}><X size={14} /></button>}</div>
            <button type="button" className={cx('tw-chip !min-h-10', joining && 'is-on')} onClick={() => setJoining((value) => !value)}><Link2 size={14} />{tr('Join')}</button>
          </div>
          {joining && <form className="tw-panel flex min-w-0 flex-wrap items-center gap-2 tw-enter" onSubmit={(event) => { event.preventDefault(); void acceptInvite(joinToken); }}>
            <input autoFocus className="input min-w-0 flex-1" value={joinToken} onChange={(event) => setJoinToken(event.target.value)} placeholder={tr('Paste an invite link or code')} aria-label={tr('Join with an invitation link or code')} />
            <button type="submit" className="btn-primary shrink-0" disabled={!joinToken.trim() || busy}>{tr('Join project')}</button>
          </form>}
          <div className="tw-chip-row" role="tablist" aria-label={tr('Shared project statuses')}>
            <StatusChip id="all" label="All" count={counts.all} selected={filter === 'all'} onSelect={() => setFilter('all')} />
            {STATUS.map((item) => <StatusChip key={item.id} id={item.id} label={item.label} color={item.color} count={counts[item.id]} selected={filter === item.id} onSelect={() => setFilter(item.id)} />)}
          </div>
          {shownProjects.length === 0 ? <div className="tw-empty"><span>{snapshot.projects.length ? '🔍' : '🚀'}</span><p className="font-semibold">{snapshot.projects.length ? tr('No projects match') : tr('Start your first team project')}</p><p className="text-sm muted">{tr('Plan tasks together, chat in one place and see who is doing what. Your private projects stay private.')}</p>{!snapshot.projects.length && <div className="mt-3 flex flex-wrap justify-center gap-2"><button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />{tr('Create a team project')}</button><button type="button" className="btn-outline" onClick={() => setJoining(true)}><Link2 size={15} />{tr('Join with invite')}</button></div>}</div>
            : <div className="tw-project-grid">{shownProjects.map((project) => {
              const projectMembers = snapshot.members.filter((member) => member.project_id === project.id);
              const role = projectMembers.find((member) => member.user_id === user.id)?.role ?? 'viewer';
              const adminAssigned = projectMembers.some((member) => member.role === 'admin');
              return <ProjectCard key={project.id} project={project} tasks={snapshot.tasks.filter((task) => task.project_id === project.id)} memberIds={projectMembers.map((member) => member.user_id)} members={snapshot.members.filter((member) => member.project_id === project.id)} currentUserId={user.id} role={role} unread={unreadFor(project.id)} canChangeStatus={mayChangeProjectStatus(role, adminAssigned)} canClaimAdmin={role === 'member' && !adminAssigned} busy={busy} language={language} onOpen={() => setSelectedId(project.id)} onStatus={(status) => void moveSharedProjectStatus(project.id, status)} onClaim={() => void claimProjectAdmin(project.id)} />;
            })}</div>}
        </DndContext>
      </div>}

    {creating && <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}>
      <section className="tw-modal-card" role="dialog" aria-modal="true" aria-labelledby="new-shared-project-title">
        <div className="flex items-start gap-3"><span className="tw-modal-icon"><Users size={20} /></span><div className="min-w-0 flex-1"><h2 id="new-shared-project-title" className="text-lg font-semibold">{tr('New team project')}</h2><p className="mt-0.5 text-sm muted">{tr('Invite people after you create it.')}</p></div><button type="button" className="tw-icon-btn" onClick={() => setCreating(false)} aria-label={tr('Close')}><X size={16} /></button></div>
        <form className="mt-4 grid min-w-0 gap-3" onSubmit={(event) => void createProject(event)}>
          <input autoFocus className="input min-w-0 text-base font-semibold" value={newProject.title} onChange={(event) => setNewProject({ ...newProject, title: event.target.value })} maxLength={200} placeholder={tr('Project name')} aria-label={tr('Project name')} required />
          <textarea className="input min-h-20 min-w-0 resize-y" value={newProject.description} onChange={(event) => setNewProject({ ...newProject, description: event.target.value })} maxLength={20000} placeholder={tr('Goal, scope or shared context (optional)')} aria-label={tr('Description / shared context')} />
          <div className="tw-chip-row !pb-0">{STATUS.filter((item) => item.id !== 'done').map((item) => <button key={item.id} type="button" className={cx('tw-chip', newProject.status === item.id && 'is-on')} onClick={() => setNewProject({ ...newProject, status: item.id })}><span className="tw-dot" style={{ background: item.color }} />{tr(item.label)}</button>)}</div>
          <label className="flex min-w-0 items-center gap-2 text-sm"><CalendarDays size={15} className="muted" /><span className="muted">{tr('Due date')}</span><input className="input !w-auto !py-1.5" type="date" value={newProject.due_date} onChange={(event) => setNewProject({ ...newProject, due_date: event.target.value })} /></label>
          <p className="tw-hint"><ShieldCheck size={15} />{tr('You start as lead. Your private projects and personal data are never shared.')}</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCreating(false)}>{tr('Cancel')}</button><button type="submit" className="btn-primary" disabled={busy || !newProject.title.trim()}><Plus size={15} />{tr('Create project')}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}
