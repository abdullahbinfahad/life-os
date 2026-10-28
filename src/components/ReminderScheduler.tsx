import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { collectReminders, type Reminder } from '../lib/reminders';
import { fetchMyAssignedSharedTasks, subscribeToSharedWorkspace, type AssignedSharedTask } from '../lib/sharedProjects';
import { playFeedback } from '../lib/sounds';
import { today } from '../lib/utils';

const DEFAULT_REMINDER_TIME = '09:00';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const firedInMemory = new Set<string>();
const pendingFires = new Set<string>();
type ReminderTimeSettings = { dailyReminderTime?: string };

function getCurrentLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function readFired(date: string) {
  const key = `lifeos:notification-fires:${date}`;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    const stored = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
    const inMemory = [...firedInMemory].filter((entry) => entry.startsWith(`${date}|`)).map((entry) => entry.slice(date.length + 1));
    return new Set([...stored, ...inMemory]);
  } catch {
    return new Set<string>([...firedInMemory].filter((entry) => entry.startsWith(`${date}|`)).map((entry) => entry.slice(date.length + 1)));
  }
}

function writeFired(date: string, fired: Set<string>) {
  for (const item of fired) firedInMemory.add(`${date}|${item}`);
  try {
    window.localStorage.setItem(`lifeos:notification-fires:${date}`, JSON.stringify([...fired]));
    const keepFrom = new Date(`${date}T00:00:00`);
    keepFrom.setDate(keepFrom.getDate() - 7);
    const cutoff = `${keepFrom.getFullYear()}-${String(keepFrom.getMonth() + 1).padStart(2, '0')}-${String(keepFrom.getDate()).padStart(2, '0')}`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('lifeos:notification-fires:') && key.slice('lifeos:notification-fires:'.length) < cutoff) window.localStorage.removeItem(key);
    }
  } catch { /* In-memory deduplication still applies for this open session. */ }
}

function wasDelivered(fired: Set<string>, reminderId: string) {
  return fired.has(reminderId) || [...fired].some((entry) => entry.endsWith(`|${reminderId}`));
}

function reminderTime(reminder: Reminder, date: string, dailyTime: string, items: ReturnType<typeof useStore.getState>['items']) {
  if (reminder.kind === 'habit-checkin') return dailyTime;

  if (reminder.kind === 'library-item') {
    const item = reminder.itemId ? items.find((candidate) => candidate.id === reminder.itemId) : undefined;
    const dueNowOrOverdue = Boolean(reminder.dueDate && reminder.dueDate <= date);
    const pinnedToday = item?.todayDate === date;
    if (!dueNowOrOverdue && !pinnedToday) return undefined;
    if (reminder.dueDate === date && reminder.scheduledTime && TIME_PATTERN.test(reminder.scheduledTime)) return reminder.scheduledTime;
    if (pinnedToday && !reminder.overdue && reminder.scheduledTime && TIME_PATTERN.test(reminder.scheduledTime)) return reminder.scheduledTime;
    return dailyTime;
  }

  if (reminder.dueDate && reminder.dueDate <= date) return dailyTime;
  return undefined;
}

async function showReminderNotification(date: string, time: string, reminders: Reminder[]) {
  const title = 'Life OS';
  const body = reminders.length === 1
    ? reminders[0].title.slice(0, 180)
    : reminders.slice(0, 3).map((reminder) => reminder.title.slice(0, 70)).join(' · ') + (reminders.length > 3 ? ` (+${reminders.length - 3})` : '');
  const options: NotificationOptions = {
    body,
    tag: `lifeos:${date}:${time}`,
    icon: `${import.meta.env.BASE_URL}runner-mark.svg`,
    data: { route: '/notifications' },
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
    } catch { /* Use the browser Notification API fallback below when available. */ }
  }
  new Notification(title, options);
}

/** Delivers opt-in alerts while Life OS is open; it does not promise closed-app/background delivery. */
export default function ReminderScheduler() {
  const items = useStore((state) => state.items);
  const goals = useStore((state) => state.goals);
  const projects = useStore((state) => state.projects);
  const habits = useStore((state) => state.habits);
  const settings = useStore((state) => state.settings);
  const { user } = useAuth();
  const [sharedTasks, setSharedTasks] = useState<AssignedSharedTask[]>([]);
  const browserAlertsEnabled = settings.browserNotifications === true;
  const configuredTime = (settings as typeof settings & ReminderTimeSettings).dailyReminderTime;
  const dailyTime = configuredTime && TIME_PATTERN.test(configuredTime) ? configuredTime : DEFAULT_REMINDER_TIME;

  useEffect(() => {
    if (!browserAlertsEnabled || !user?.id) {
      setSharedTasks([]);
      return;
    }
    let active = true;
    let refreshTimer: number | undefined;
    const refresh = () => {
      void fetchMyAssignedSharedTasks(user.id).then((rows) => { if (active) setSharedTasks(rows); }).catch(() => { /* RLS-scoped shared work is optional; the in-app inbox remains available. */ });
    };
    refresh();
    const unsubscribe = subscribeToSharedWorkspace(user.id, () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, 300);
    });
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [browserAlertsEnabled, user?.id]);

  const reminders = useMemo(() => [
    ...collectReminders({ items, goals, projects, habits }),
    ...sharedTasks.map((task) => ({
      id: `shared-task:${task.id}`,
      kind: 'shared-task' as const,
      title: task.title,
      dueDate: task.due_date ?? undefined,
      route: '/projects',
      overdue: Boolean(task.due_date && task.due_date < today()),
      sharedTaskId: task.id,
      detail: task.project_title,
    })),
  ], [items, goals, projects, habits, sharedTasks]);

  useEffect(() => {
    if (!browserAlertsEnabled || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    const checkAndNotify = async () => {
      const date = today();
      const currentTime = getCurrentLocalTime();
      const dueNow = reminders.map((reminder) => ({ reminder, scheduledTime: reminderTime(reminder, date, dailyTime, items) }))
        .filter((entry): entry is { reminder: Reminder; scheduledTime: string } => Boolean(entry.scheduledTime && entry.scheduledTime <= currentTime));
      if (!dueNow.length) return;

      const alreadyFired = readFired(date);
      const fresh = dueNow.filter(({ reminder }) => {
        const key = `${date}|${reminder.id}`;
        return !wasDelivered(alreadyFired, reminder.id) && !pendingFires.has(key);
      });
      if (!fresh.length) return;

      for (const { reminder } of fresh) pendingFires.add(`${date}|${reminder.id}`);
      try {
        await showReminderNotification(date, currentTime, fresh.map(({ reminder }) => reminder));
        const nextFired = readFired(date);
        for (const { reminder } of fresh) nextFired.add(reminder.id);
        writeFired(date, nextFired);
        playFeedback('notification');
      } catch { /* System permission or platform support can change; in-app reminders remain available. */ }
      finally { for (const { reminder } of fresh) pendingFires.delete(`${date}|${reminder.id}`); }
    };

    void checkAndNotify();
    const interval = window.setInterval(() => { void checkAndNotify(); }, 15_000);
    const resume = () => { if (document.visibilityState === 'visible') void checkAndNotify(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [browserAlertsEnabled, dailyTime, items, reminders]);

  return null;
}
