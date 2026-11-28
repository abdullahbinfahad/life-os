import type { Contact, Goal, Habit, LifeItem, Project, Task } from './types';
import { nextBirthday } from './contacts';
import { addDays, daysBetween, today } from './utils';

export type ReminderKind = 'library-item' | 'project-task' | 'shared-task' | 'project-date' | 'goal-date' | 'habit-checkin' | 'contact-follow-up' | 'contact-birthday' | 'contact-keep-in-touch';
export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  dueDate?: string;
  route: string;
  overdue: boolean;
  projectId?: string;
  taskId?: string;
  sharedTaskId?: string;
  itemId?: string;
  goalId?: string;
  habitId?: string;
  contactId?: string;
  detail?: string;
}

const overdue = (date?: string, now = today()) => Boolean(date && date < now);
const inWindow = (date?: string, end = addDays(today(), 7)) => Boolean(date && date <= end);

export function collectReminders(data: { items: LifeItem[]; goals: Goal[]; projects: Project[]; habits: Habit[]; contacts?: Contact[] }, now = today()): Reminder[] {
  const end = addDays(now, 7);
  const reminders: Reminder[] = [];
  for (const item of data.items) {
    if (item.status === 'done' || item.status === 'dropped' || (item.dueDate && !inWindow(item.dueDate, end))) continue;
    reminders.push({ id: `item:${item.id}`, kind: 'library-item', title: item.title, dueDate: item.dueDate, route: '/library', overdue: overdue(item.dueDate, now), itemId: item.id, detail: item.dueDate ? undefined : 'No due date set' });
  }
  for (const project of data.projects) {
    if (project.status !== 'done' && project.dueDate && inWindow(project.dueDate, end)) {
      reminders.push({ id: `project:${project.id}`, kind: 'project-date', title: project.title, dueDate: project.dueDate, route: '/projects', overdue: overdue(project.dueDate, now), projectId: project.id });
    }
    if (project.status === 'done') continue;
    for (const task of project.tasks) {
      if (task.done || (task.dueDate && !inWindow(task.dueDate, end))) continue;
      reminders.push({ id: `task:${project.id}:${task.id}`, kind: 'project-task', title: task.title, dueDate: task.dueDate, route: '/projects', overdue: overdue(task.dueDate, now), projectId: project.id, taskId: task.id, detail: task.dueDate ? project.title : `${project.title} · No due date set` });
    }
  }
  for (const goal of data.goals) {
    if (goal.status === 'done' || goal.status === 'paused' || !goal.targetDate || !inWindow(goal.targetDate, end)) continue;
    reminders.push({ id: `goal:${goal.id}`, kind: 'goal-date', title: goal.title, dueDate: goal.targetDate, route: '/goals', overdue: overdue(goal.targetDate, now), goalId: goal.id });
  }
  for (const habit of data.habits) {
    if (habit.archived) continue;
    const completed = habit.log.includes(now);
    const weeklyCount = habit.log.filter((date) => date >= addDays(now, -6) && date <= now).length;
    const needsCheckin = habit.frequency === 'daily' ? !completed : weeklyCount < habit.targetPerWeek;
    if (!needsCheckin) continue;
    reminders.push({ id: `habit:${habit.id}:${now}`, kind: 'habit-checkin', title: habit.title, route: '/habits', overdue: false, habitId: habit.id, detail: habit.frequency === 'daily' ? 'Daily check-in' : `${weeklyCount}/${habit.targetPerWeek} this week` });
  }
  for (const contact of data.contacts ?? []) {
    const route = `/contacts?c=${encodeURIComponent(contact.id)}`;
    if (contact.followUpDate && inWindow(contact.followUpDate, end)) {
      reminders.push({ id: `contact-follow:${contact.id}:${contact.followUpDate}`, kind: 'contact-follow-up', title: `${contact.name}`, dueDate: contact.followUpDate, route, overdue: overdue(contact.followUpDate, now), contactId: contact.id, detail: contact.followUpNote ? `Follow up · ${contact.followUpNote}` : 'Follow up' });
    }
    const birthday = nextBirthday(contact.birthday);
    if (birthday && birthday.days <= 7) {
      reminders.push({ id: `contact-bday:${contact.id}:${birthday.date}`, kind: 'contact-birthday', title: `${contact.name}`, dueDate: birthday.date, route, overdue: false, contactId: contact.id, detail: birthday.turns ? `Birthday · turns ${birthday.turns}` : 'Birthday' });
    }
    if (contact.keepInTouchDays) {
      const last = (contact.lastContacted ?? contact.createdAt).slice(0, 10);
      const due = addDays(last, contact.keepInTouchDays);
      if (due <= now) reminders.push({ id: `contact-touch:${contact.id}:${due}`, kind: 'contact-keep-in-touch', title: `${contact.name}`, dueDate: due, route, overdue: due < now, contactId: contact.id, detail: 'Time to reconnect' });
    }
  }
  return reminders.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.title.localeCompare(b.title));
}

export function reminderTiming(reminder: Reminder, now = today()): 'overdue' | 'today' | 'upcoming' | 'check-in' {
  if (reminder.kind === 'habit-checkin') return 'check-in';
  if (!reminder.dueDate) return 'upcoming';
  if (reminder.dueDate < now || daysBetween(now, reminder.dueDate) < 0) return 'overdue';
  if (reminder.dueDate === now) return 'today';
  return 'upcoming';
}

export type LocalTaskLookup = { project: Project; task: Task };
