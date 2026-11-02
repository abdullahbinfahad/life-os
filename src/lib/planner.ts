export type PlannerKind = 'task' | 'habit' | 'goal' | 'milestone';

export type PlannerMilestone = {
  id?: string;
  title: string;
  dueDate?: string;
  done?: boolean;
};

export type PlannerProposal = {
  kind: PlannerKind;
  title: string;
  notes: string;
  priority: 1 | 2 | 3 | 4;
  dueDate?: string;
  scheduledTime?: string;
  durationMinutes?: number;
  goalId?: string;
  goalTitle?: string;
  projectTitle?: string;
  milestones?: PlannerMilestone[];
  availabilityRequired?: boolean;
  conflict?: string;
};

export type PlannerTask = {
  id: string;
  title: string;
  dueDate?: string;
  scheduledTime?: string;
  status?: string;
  goalId?: string;
};

export type PlannerHabit = {
  id: string;
  title: string;
  frequency?: string;
  log?: string[];
};

export type PlannerGoal = {
  id: string;
  title: string;
  targetDate?: string;
  milestones: PlannerMilestone[];
};

export type PlannerProject = {
  id: string;
  title: string;
  dueDate?: string;
  status?: string;
  tasks: Array<{ id: string; title: string; dueDate?: string; done?: boolean }>;
};

export type PlannerContext = {
  tasks: PlannerTask[];
  habits: PlannerHabit[];
  goals: PlannerGoal[];
  projects: PlannerProject[];
};

export function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function classifyPlannerRequest(text: string): PlannerKind {
  const value = text.toLowerCase();
  if (/\b(habit|routine|daily ritual|weekly ritual|check in|meditate|exercise|walk|journal|read|workout|sleep|water|practice)\b/.test(value)) return 'habit';
  if (/\b(milestone|checkpoint|phase|deliverable|target date|next step toward|launch milestone|release milestone)\b/.test(value)) return 'milestone';
  if (/\b(goal|objective|ambition|target|outcome|vision|annual plan|long term|plan to|journey)\b/.test(value)) return 'goal';
  return 'task';
}

export function parseClock(value?: string): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function getDateKey(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function hasAvailabilityHint(value: string) {
  return /\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|weekday|weekend|available|free|open|after|before|between)\b/i.test(value) ||
    /\b(?:am|pm)\b/i.test(value) ||
    /\d{1,2}:\d{2}\s*(?:am|pm)?/i.test(value);
}

export function findDuplicateTitle(title: string, existing: Array<{ title: string }>) {
  return existing.some((item) => normalizeTitle(item.title) === normalizeTitle(title));
}

export function detectScheduleConflict(candidate: { dueDate?: string; scheduledTime?: string }, items: Array<{ dueDate?: string; scheduledTime?: string }>) {
  const candidateDay = getDateKey(candidate.dueDate);
  const candidateMinutes = parseClock(candidate.scheduledTime);
  if (!candidateDay || candidateMinutes === null) return null;

  for (const item of items) {
    const itemDay = getDateKey(item.dueDate);
    const itemMinutes = parseClock(item.scheduledTime);
    if (!itemDay || itemMinutes === null) continue;
    if (itemDay !== candidateDay) continue;
    if (Math.abs(candidateMinutes - itemMinutes) < 45) {
      return `Conflict: ${candidate.scheduledTime} overlaps with ${item.scheduledTime ?? 'another commitment'} on ${candidateDay}`;
    }
  }
  return null;
}

export function buildPlannerContext(tasks: PlannerTask[], habits: PlannerHabit[], goals: PlannerGoal[], projects: PlannerProject[]): PlannerContext {
  return { tasks, habits, goals, projects };
}

export function getGoalByText(targetTitle: string, goals: PlannerGoal[]) {
  const title = normalizeTitle(targetTitle);
  return goals.find((goal) => normalizeTitle(goal.title) === title) ?? null;
}

export function clampPriority(raw: number) {
  if (!Number.isFinite(raw)) return 2;
  return Math.min(4, Math.max(1, Math.round(raw)));
}

export function validPlannerDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validPlannerProposal(value: unknown): value is PlannerProposal {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const kind = String(p.kind ?? 'task');
  const validKind = kind === 'task' || kind === 'habit' || kind === 'goal' || kind === 'milestone';
  return typeof p.title === 'string' && p.title.trim().length > 0 && p.title.length <= 200 &&
    validKind &&
    typeof p.notes === 'string' && p.notes.length <= 1000 &&
    Number.isInteger(p.priority) && Number(p.priority) >= 1 && Number(p.priority) <= 4 &&
    (p.dueDate === undefined || (typeof p.dueDate === 'string' && validPlannerDate(p.dueDate))) &&
    (p.scheduledTime === undefined || (typeof p.scheduledTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.scheduledTime))) &&
    (p.durationMinutes === undefined || (typeof p.durationMinutes === 'number' && Number.isFinite(p.durationMinutes) && p.durationMinutes > 0 && p.durationMinutes <= 720)) &&
    (p.goalId === undefined || typeof p.goalId === 'string') &&
    (p.goalTitle === undefined || typeof p.goalTitle === 'string') &&
    (p.projectTitle === undefined || typeof p.projectTitle === 'string') &&
    (p.availabilityRequired === undefined || typeof p.availabilityRequired === 'boolean');
}

export function createPlannerProposalFromText(requestText: string, context: PlannerContext): PlannerProposal[] {
  const kind = classifyPlannerRequest(requestText);
  const title = requestText.replace(/\s+/g, ' ').trim();
  const notes = kind === 'goal' ? 'Goal created from planner request.' : 'Planned from request.';
  const base: PlannerProposal = {
    kind,
    title: title.slice(0, 200),
    notes,
    priority: 2,
    availabilityRequired: true,
  };

  const existingGoal = kind === 'milestone' ? getGoalByText(title, context.goals) : null;
  if (existingGoal) {
    base.goalId = existingGoal.id;
    base.goalTitle = existingGoal.title;
  }

  const duplicates = kind === 'habit' ? context.habits : kind === 'goal' ? context.goals : kind === 'task' ? context.tasks : [];
  const duplicateFound = duplicates.some((entry) => normalizeTitle(entry.title) === normalizeTitle(title));
  if (duplicateFound) {
    base.notes = 'Duplicate detected; review before saving.';
    base.priority = 3;
  }

  return [base];
}

export function buildPlannerQuestion(requestText: string, context: PlannerContext) {
  const kind = classifyPlannerRequest(requestText);
  const missingAvailability = !hasAvailabilityHint(requestText);
  if (missingAvailability) {
    return 'I need your availability to build a realistic plan. Please tell me when you are free (for example “Tue 7–9pm” or “weekdays after 6pm”). I will not invent free time or calendar events.';
  }
  if (kind === 'milestone' && !context.goals.length) {
    return 'Which goal should this milestone belong to? I can add it under the goal once you choose the parent goal.';
  }
  return '';
}

export function containsSensitiveInfo(value: string) {
  return /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /(?:\+?\d[\s().-]*){9,}/.test(value) ||
    /\b(?:passport|national id|government id|social security|ssn|aadhaar|nid|credit card|debit card|cvv|bank account)\b/i.test(value) ||
    /\b(?:password|api key|secret key|private key|access token)\b\s*(?:is|:|=)\s*\S+/i.test(value);
}

export function routePlannerProposal(proposal: PlannerProposal, existing: { habits: Array<{ title: string }>; goals: Array<{ title: string }>; projects: Array<{ title: string }>; tasks: Array<{ title: string }> }) {
  const duplicate = ({ title }: { title: string }) => normalizeTitle(title) === normalizeTitle(proposal.title);
  const duplicateHabit = proposal.kind === 'habit' && existing.habits.some(duplicate);
  const duplicateGoal = proposal.kind === 'goal' && existing.goals.some(duplicate);
  const duplicateProject = proposal.kind === 'task' && existing.projects.some(duplicate);
  const duplicateTask = proposal.kind === 'task' && existing.tasks.some(duplicate);
  return {
    duplicate: duplicateHabit || duplicateGoal || duplicateProject || duplicateTask,
    kind: proposal.kind,
  };
}
