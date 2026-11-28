import { useStore } from './store';
import { collectReminders, type Reminder } from './reminders';
import { today } from './utils';

export function currentReminders(): Reminder[] {
  const state = useStore.getState();
  return collectReminders({ items: state.items, goals: state.goals, projects: state.projects, habits: state.habits, contacts: state.contacts });
}

/** Complete a personal reminder (shared team tasks are completed on their own page). Returns true when something changed. */
export function completeReminder(reminder: Reminder): boolean {
  const state = useStore.getState();
  const day = today();
  if (reminder.itemId) { state.updateItem(reminder.itemId, { status: 'done' }); return true; }
  if (reminder.projectId && reminder.taskId) { state.updateTask(reminder.projectId, reminder.taskId, { done: true }); return true; }
  if (reminder.habitId) { const habit = state.habits.find((row) => row.id === reminder.habitId); if (habit && !habit.log.includes(day)) state.toggleHabit(habit.id, day); return true; }
  if (reminder.goalId) { state.updateGoal(reminder.goalId, { status: 'done' }); return true; }
  if (reminder.contactId) {
    const patch = reminder.kind === 'contact-follow-up' ? { followUpDate: undefined, followUpNote: undefined, lastContacted: day } : { lastContacted: day };
    state.updateContact(reminder.contactId, patch); return true;
  }
  if (reminder.id.startsWith('planner:')) { state.updatePlannerItem(reminder.id.slice(8), { done: true }); return true; }
  return false;
}

export function completeReminderById(id: string): boolean {
  if (id.startsWith('planner:')) { useStore.getState().updatePlannerItem(id.slice(8), { done: true }); return true; }
  const reminder = currentReminders().find((row) => row.id === id);
  return reminder ? completeReminder(reminder) : false;
}
