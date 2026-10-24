import { translate as tr } from '../lib/locales';
import { Bell, CalendarDays, Check, CheckCircle2, Circle, Clock3, ExternalLink, Flame, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { fetchMyAssignedSharedTasks, sharedServiceError, subscribeToSharedWorkspace, updateSharedTask, type AssignedSharedTask } from '../lib/sharedProjects';
import { collectReminders, reminderTiming, type Reminder } from '../lib/reminders';
import { fmtDate, today } from '../lib/utils';
import { playFeedback } from '../lib/sounds';

const sectionCopy = {
  overdue: { title: 'Overdue', color: 'text-rose-700 dark:text-rose-300', surface: 'border-rose-200 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/[.06]' },
  today: { title: 'Due today', color: 'text-amber-800 dark:text-amber-300', surface: 'border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[.06]' },
  upcoming: { title: 'Coming up', color: 'text-indigo-700 dark:text-indigo-300', surface: 'border-indigo-200 bg-indigo-50/65 dark:border-indigo-500/20 dark:bg-indigo-500/[.05]' },
  'check-in': { title: 'Routine check-ins', color: 'text-emerald-700 dark:text-emerald-300', surface: 'border-emerald-200 bg-emerald-50/65 dark:border-emerald-500/20 dark:bg-emerald-500/[.05]' },
};

export default function Notifications() {
  const state = useStore();
  const { user } = useAuth();
  const [sharedTasks, setSharedTasks] = useState<AssignedSharedTask[]>([]);
  const reminders = useMemo<Reminder[]>(() => [
    ...collectReminders({ items: state.items, goals: state.goals, projects: state.projects, habits: state.habits }),
    ...sharedTasks.map((task) => ({ id: `shared-task:${task.id}`, kind: 'shared-task' as const, title: task.title, dueDate: task.due_date ?? undefined, route: '/projects', overdue: Boolean(task.due_date && task.due_date < today()), sharedTaskId: task.id, detail: `${task.project_title} · ${tr('Shared project')}` })),
  ], [state.items, state.goals, state.projects, state.habits, sharedTasks]);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [notificationSupported, setNotificationSupported] = useState(false);
  const todayKey = today();

  useEffect(() => { setNotificationSupported(typeof window !== 'undefined' && 'Notification' in window); }, []);
  useEffect(() => {
    if (!cloudEnabled || !user?.id) { setSharedTasks([]); return; }
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshShared = () => { void fetchMyAssignedSharedTasks(user.id).then((rows) => { if (active) setSharedTasks(rows); }).catch((error) => { if (active && /shared_|does not exist|schema cache/i.test(String(error))) setPermissionMessage(sharedServiceError(error)); }); };
    refreshShared();
    const unsubscribe = subscribeToSharedWorkspace(user.id, () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshShared, 250); });
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); unsubscribe(); };
  }, [user?.id]);
  useEffect(() => {
    if (!state.settings.browserNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const urgent = reminders.filter((reminder) => {
      const timing = reminderTiming(reminder, todayKey);
      return timing === 'overdue' || timing === 'today';
    });
    if (!urgent.length) return;
    const storageKey = `lifeos-browser-reminders:${todayKey}`;
    let already: string[] = [];
    try { already = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); } catch { /* Ignore corrupt local notification history. */ }
    const fresh = urgent.filter((reminder) => !already.includes(reminder.id));
    if (!fresh.length) return;
    try {
      const body = fresh.length === 1 ? fresh[0].title : `${fresh.length} items need attention today.`;
      new Notification('Life OS reminders', { body, tag: `lifeos:${todayKey}`, icon: `${import.meta.env.BASE_URL}runner-mark.svg` });
      localStorage.setItem(storageKey, JSON.stringify([...already, ...fresh.map((reminder) => reminder.id)]));
      playFeedback('notification');
    } catch { /* Browser notifications are an enhancement; the in-app inbox remains available. */ }
  }, [state.settings.browserNotifications, reminders, todayKey]);

  const enableNotifications = async (enabled: boolean) => {
    if (!enabled) { state.updateSettings({ browserNotifications: false }); setPermissionMessage(tr('Browser alerts are off. In-app reminders remain available.')); return; }
    if (!('Notification' in window)) { setPermissionMessage(tr('This browser does not support notifications. In-app reminders are available here.')); return; }
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission === 'granted') { state.updateSettings({ browserNotifications: true }); setPermissionMessage(tr('Browser alerts are enabled for due and overdue items while this app is open.')); }
      else { state.updateSettings({ browserNotifications: false }); setPermissionMessage(tr('Notifications were not allowed. You can still use this in-app reminder list.')); }
    } catch { setPermissionMessage(tr('Could not enable browser notifications. In-app reminders remain available.')); }
  };

  const complete = async (reminder: Reminder) => {
    if (reminder.itemId) state.updateItem(reminder.itemId, { status: 'done' });
    if (reminder.projectId && reminder.taskId) state.updateTask(reminder.projectId, reminder.taskId, { done: true });
    if (reminder.habitId) state.toggleHabit(reminder.habitId, todayKey);
    if (reminder.goalId) state.updateGoal(reminder.goalId, { status: 'done' });
    if (reminder.sharedTaskId && user?.id) {
      try { await updateSharedTask(reminder.sharedTaskId, { status: 'done' }); state.awardReward(`shared-task:${user.id}:${reminder.sharedTaskId}`, reminder.title, 'task', 20); }
      catch (error) { setPermissionMessage(sharedServiceError(error)); }
    }
  };

  const buckets = (['overdue', 'today', 'upcoming', 'check-in'] as const).map((key) => [key, reminders.filter((reminder) => reminderTiming(reminder, todayKey) === key)] as const).filter(([, rows]) => rows.length);
  const urgentCount = reminders.filter((reminder) => ['overdue', 'today'].includes(reminderTiming(reminder, todayKey))).length;

  return (
    <div className="min-w-0">
      <PageHeader title={tr('Reminders')} subtitle={urgentCount ? `${urgentCount} ${tr('due or overdue items need attention')}` : tr('Due dates and unfinished work, in one quiet place')} actions={<label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[.04]"><Bell size={16} className="shrink-0 text-indigo-600 dark:text-indigo-300" /><span>{tr('Browser alerts')}</span><input type="checkbox" className="h-4 w-4 shrink-0 accent-indigo-600" checked={Boolean(state.settings.browserNotifications && notificationSupported)} disabled={!notificationSupported} onChange={(event) => void enableNotifications(event.target.checked)} aria-label={tr('Enable browser notifications')} /></label>} />
      <div className="mb-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs leading-5 muted dark:border-white/10 dark:bg-white/[.03]"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><p>{tr('Browser alerts are optional and only appear while the app is open. Your due dates and habit logs remain in your private account.')}</p></div>
      {permissionMessage && <p role="status" className="mb-4 rounded-lg bg-indigo-500/10 px-3 py-2 text-sm text-indigo-800 dark:text-indigo-200">{permissionMessage}</p>}
      {reminders.length === 0 ? <Empty icon={<CheckCircle2 size={28} />} title={tr('All clear for now')} text={tr('You have no due or unfinished items in the next week. New reminders will appear here automatically.')} action={<Link className="btn-outline" to="/projects">{tr('Open projects')} <ExternalLink size={14} /></Link>} /> : (
        <div className="space-y-5">
          {buckets.map(([key, rows]) => {
            const section = sectionCopy[key];
            return <section key={key} aria-labelledby={`reminder-${key}`} className="min-w-0">
              <div className="mb-2 flex items-center gap-2"><h2 id={`reminder-${key}`} className={`text-sm font-semibold ${section.color}`}>{tr(section.title)}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums muted dark:bg-white/[.07]">{rows.length}</span></div>
              <div className="grid min-w-0 gap-2">
                {rows.map((reminder) => {
                  const isRoutine = reminder.kind === 'habit-checkin';
                  return <article key={reminder.id} className={`grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-xl border px-3 py-3 ${section.surface}`}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/80 text-slate-600 dark:bg-white/[.07] dark:text-slate-200">{isRoutine ? <Flame size={17} /> : reminder.overdue ? <Clock3 size={17} /> : <CalendarDays size={17} />}</span>
                    <div className="min-w-0">
                      <Link to={reminder.route} className="block break-words text-sm font-medium leading-5 text-slate-900 underline-offset-2 hover:underline dark:text-slate-100">{reminder.title}</Link>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs muted"><span>{reminder.detail ?? tr(reminder.kind === 'library-item' ? 'Life plan' : reminder.kind === 'project-task' || reminder.kind === 'shared-task' ? 'Project task' : reminder.kind === 'project-date' ? 'Project due date' : reminder.kind === 'goal-date' ? 'Goal deadline' : 'Habit')}</span>{reminder.dueDate && <span className="tabular-nums">{fmtDate(reminder.dueDate, state.settings.language)}</span>}</div>
                    </div>
                    {isRoutine ? <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-emerald-700 hover:bg-white/75 dark:text-emerald-300 dark:hover:bg-white/10" aria-label={`${tr('Check in')}: ${reminder.title}`} onClick={() => void complete(reminder)}><Check size={17} /></button> : (reminder.itemId || reminder.taskId || reminder.goalId || reminder.sharedTaskId) ? <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-emerald-700 hover:bg-white/75 dark:text-emerald-300 dark:hover:bg-white/10" aria-label={`${tr('Mark complete')}: ${reminder.title}`} onClick={() => void complete(reminder)}><Circle size={17} /></button> : <Link to={reminder.route} aria-label={tr('Open reminder')} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/75 dark:hover:bg-white/10"><ExternalLink size={15} /></Link>}
                  </article>;
                })}
              </div>
            </section>;
          })}
        </div>
      )}
    </div>
  );
}
