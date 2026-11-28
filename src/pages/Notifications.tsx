import { translate as tr } from '../lib/locales';
import { CalendarDays, Check, CheckCircle2, Circle, Clock3, ExternalLink, Flame } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { fetchMyAssignedSharedTasks, sharedServiceError, subscribeToSharedWorkspace, updateSharedTask, type AssignedSharedTask } from '../lib/sharedProjects';
import { collectReminders, reminderTiming, type Reminder } from '../lib/reminders';
import { fmtDate, today } from '../lib/utils';
import { completeReminder } from '../lib/reminderActions';
import { isIOS, isStandalone, requestPermission, showAppNotification } from '../lib/notify';
import NotificationSettings from '../components/NotificationSettings';

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
    ...collectReminders({ items: state.items, goals: state.goals, projects: state.projects, habits: state.habits, contacts: state.contacts }),
    ...sharedTasks.map((task) => ({ id: `shared-task:${task.id}`, kind: 'shared-task' as const, title: task.title, dueDate: task.due_date ?? undefined, route: '/projects', overdue: Boolean(task.due_date && task.due_date < today()), sharedTaskId: task.id, detail: `${task.project_title} · ${tr('Shared project')}` })),
  ], [state.items, state.goals, state.projects, state.habits, state.contacts, sharedTasks]);
  const [permissionMessage, setPermissionMessage] = useState('');
  const todayKey = today();

  useEffect(() => {
    if (!cloudEnabled || !user?.id) { setSharedTasks([]); return; }
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshShared = () => { void fetchMyAssignedSharedTasks(user.id).then((rows) => { if (active) setSharedTasks(rows); }).catch((error) => { if (active && /shared_|does not exist|schema cache/i.test(String(error))) setPermissionMessage(sharedServiceError(error)); }); };
    refreshShared();
    const unsubscribe = subscribeToSharedWorkspace(user.id, () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshShared, 250); });
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); unsubscribe(); };
  }, [user?.id]);
  const enableNotifications = async (enabled: boolean) => {
    if (!enabled) { state.updateSettings({ browserNotifications: false }); setPermissionMessage(tr('Device notifications are off. In-app reminders remain available.')); return; }
    const result = await requestPermission();
    if (result === 'granted') {
      state.updateSettings({ browserNotifications: true });
      const shown = await showAppNotification({ title: `✅ ${tr('Notifications are on')}`, body: tr('Life OS will remind you about due work, classes, habits and people.'), tag: 'lifeos-test', url: '/notifications' });
      setPermissionMessage(tr(shown ? 'Notifications are on for this device.' : 'Permission granted, but this device did not show a test alert. Check system notification settings.'));
    } else if (result === 'unsupported') setPermissionMessage(tr(isIOS() && !isStandalone() ? 'On iPhone/iPad: tap Share → “Add to Home Screen”, open Life OS from the Home Screen, then turn notifications on.' : 'This browser does not support notifications. In-app reminders are available here.'));
    else { state.updateSettings({ browserNotifications: false }); setPermissionMessage(tr('Notifications are blocked. Allow them for this site in your browser or system settings, then try again.')); }
  };

  const complete = async (reminder: Reminder) => {
    if (reminder.sharedTaskId && user?.id) {
      try { await updateSharedTask(reminder.sharedTaskId, { status: 'done' }); state.awardReward(`shared-task:${user.id}:${reminder.sharedTaskId}`, reminder.title, 'task', 20); }
      catch (error) { setPermissionMessage(sharedServiceError(error)); }
      return;
    }
    completeReminder(reminder);
  };

  const buckets = (['overdue', 'today', 'upcoming', 'check-in'] as const).map((key) => [key, reminders.filter((reminder) => reminderTiming(reminder, todayKey) === key)] as const).filter(([, rows]) => rows.length);
  const urgentCount = reminders.filter((reminder) => ['overdue', 'today'].includes(reminderTiming(reminder, todayKey))).length;

  return (
    <div className="min-w-0">
      <PageHeader title={tr('Reminders')} subtitle={urgentCount ? `${urgentCount} ${tr('due or overdue items need attention')}` : tr('Due dates and unfinished work, in one quiet place')} />
      <NotificationSettings onEnable={(enabled) => void enableNotifications(enabled)} />
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
