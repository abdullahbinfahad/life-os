import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Category, Goal, Habit, JournalEntry, LifeItem, Project, Settings, Task } from './types';
import { DEFAULT_CATEGORIES } from './templates';
import { addDays, today, uid } from './utils';

type NewItem = Partial<LifeItem> & { title: string };

interface State {
  categories: Category[];
  items: LifeItem[];
  goals: Goal[];
  projects: Project[];
  habits: Habit[];
  journal: JournalEntry[];
  settings: Settings;

  // items
  addItems: (items: NewItem[]) => void;
  updateItem: (id: string, patch: Partial<LifeItem>) => void;
  updateItems: (ids: string[], patch: Partial<LifeItem>) => void;
  deleteItems: (ids: string[]) => void;
  toggleItemDone: (id: string) => void;
  // categories
  addCategory: (c: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  // goals
  addGoal: (g: Partial<Goal> & { title: string }) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  // projects
  addProject: (p: Partial<Project> & { title: string }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTask: (projectId: string, title: string, dueDate?: string) => void;
  updateTask: (projectId: string, taskId: string, patch: Partial<Task>) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  // habits
  addHabit: (h: Partial<Habit> & { title: string }) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabit: (id: string, date: string) => void;
  // journal
  saveEntry: (e: Partial<JournalEntry> & { id?: string }) => void;
  deleteEntry: (id: string) => void;
  // settings / data
  updateSettings: (patch: Partial<Settings>) => void;
  importAll: (data: Partial<State>) => void;
  resetAll: () => void;
  loadDemo: () => void;
}

const now = () => new Date().toISOString();

const makeItem = (i: NewItem): LifeItem => ({
  id: uid(),
  notes: '',
  categoryId: 'experiences',
  type: 'goal',
  status: 'someday',
  priority: 3,
  horizon: '1-3y',
  tags: [],
  starred: false,
  createdAt: now(),
  ...i,
  title: i.title.trim(),
});

const initial = {
  categories: DEFAULT_CATEGORIES,
  items: [] as LifeItem[],
  goals: [] as Goal[],
  projects: [] as Project[],
  habits: [] as Habit[],
  journal: [] as JournalEntry[],
  settings: { theme: 'dark', name: '', weekStartsMonday: true } as Settings,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,

      addItems: (items) => set((s) => ({ items: [...items.map(makeItem), ...s.items] })),
      updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      updateItems: (ids, patch) => {
        const set_ = new Set(ids);
        set((s) => ({
          items: s.items.map((i) => {
            if (!set_.has(i.id)) return i;
            const next = { ...i, ...patch };
            if (patch.status === 'done' && i.status !== 'done') next.completedAt = now();
            if (patch.status && patch.status !== 'done') next.completedAt = undefined;
            return next;
          }),
        }));
      },
      deleteItems: (ids) => {
        const s_ = new Set(ids);
        set((s) => ({ items: s.items.filter((i) => !s_.has(i.id)) }));
      },
      toggleItemDone: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id
              ? i.status === 'done'
                ? { ...i, status: 'active', completedAt: undefined }
                : { ...i, status: 'done', completedAt: now() }
              : i,
          ),
        })),

      addCategory: (c) => set((s) => ({ categories: [...s.categories, { ...c, id: uid() }] })),
      updateCategory: (id, patch) => set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCategory: (id) =>
        set((s) => {
          const fallback = s.categories.find((c) => c.id !== id)?.id ?? 'experiences';
          return {
            categories: s.categories.filter((c) => c.id !== id),
            items: s.items.map((i) => (i.categoryId === id ? { ...i, categoryId: fallback } : i)),
          };
        }),

      addGoal: (g) => {
        const id = uid();
        set((s) => ({
          goals: [
            { id, description: '', categoryId: 'career', status: 'active', milestones: [], createdAt: now(), ...g },
            ...s.goals,
          ],
        }));
        return id;
      },
      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id
              ? { ...g, ...patch, completedAt: patch.status === 'done' ? now() : patch.status ? undefined : g.completedAt }
              : g,
          ),
        })),
      deleteGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
          items: s.items.map((i) => (i.goalId === id ? { ...i, goalId: undefined } : i)),
          projects: s.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
        })),

      addProject: (p) => {
        const id = uid();
        set((s) => ({
          projects: [
            { id, description: '', categoryId: 'career', status: 'planning', tasks: [], createdAt: now(), ...p },
            ...s.projects,
          ],
        }));
        return id;
      },
      updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      addTask: (projectId, title, dueDate) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, tasks: [...p.tasks, { id: uid(), title, done: false, dueDate, dependsOn: [] }] } : p,
          ),
        })),
      updateTask: (projectId, taskId, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  tasks: p.tasks.map((t) =>
                    t.id === taskId
                      ? { ...t, ...patch, completedAt: patch.done === true ? now() : patch.done === false ? undefined : t.completedAt }
                      : t,
                  ),
                }
              : p,
          ),
        })),
      deleteTask: (projectId, taskId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  tasks: p.tasks
                    .filter((t) => t.id !== taskId)
                    .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== taskId) })),
                }
              : p,
          ),
        })),

      addHabit: (h) =>
        set((s) => ({
          habits: [
            { id: uid(), categoryId: 'health', frequency: 'daily', targetPerWeek: 7, log: [], createdAt: now(), archived: false, ...h },
            ...s.habits,
          ],
        })),
      updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      toggleHabit: (id, date) =>
        set((s) => ({
          habits: s.habits.map((h) =>
            h.id === id ? { ...h, log: h.log.includes(date) ? h.log.filter((d) => d !== date) : [...h.log, date] } : h,
          ),
        })),

      saveEntry: (e) =>
        set((s) => {
          if (e.id && s.journal.some((j) => j.id === e.id))
            return { journal: s.journal.map((j) => (j.id === e.id ? { ...j, ...e } as JournalEntry : j)) };
          return {
            journal: [
              { id: uid(), date: today(), title: '', content: '', mood: 3, tags: [], createdAt: now(), ...e } as JournalEntry,
              ...s.journal,
            ],
          };
        }),
      deleteEntry: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      importAll: (data) =>
        set(() => ({
          categories: data.categories ?? initial.categories,
          items: data.items ?? [],
          goals: data.goals ?? [],
          projects: data.projects ?? [],
          habits: data.habits ?? [],
          journal: data.journal ?? [],
          settings: { ...initial.settings, ...(data.settings ?? {}) },
        })),
      resetAll: () => set(() => ({ ...initial })),
      loadDemo: () => {
        const t = today();
        const s = get();
        const goalId = s.addGoal({
          title: 'Become fluent in Mandarin',
          description: 'Live comfortably in China and hold deep conversations.',
          categoryId: 'learning',
          targetDate: addDays(t, 300),
          milestones: [
            { id: uid(), title: 'Pass HSK 3', done: true },
            { id: uid(), title: 'Pass HSK 4', done: false, dueDate: addDays(t, 90) },
            { id: uid(), title: 'Pass HSK 5', done: false, dueDate: addDays(t, 280) },
          ],
        });
        const g2 = s.addGoal({
          title: 'Run a half marathon',
          categoryId: 'health',
          targetDate: addDays(t, 120),
          milestones: [
            { id: uid(), title: 'Run 5K non-stop', done: true },
            { id: uid(), title: 'Run 10K', done: false },
            { id: uid(), title: 'Run 15K', done: false },
          ],
        });
        const pid = s.addProject({ title: 'Launch portfolio website', categoryId: 'tech', status: 'active', dueDate: addDays(t, 21) });
        s.addTask(pid, 'Pick a design', addDays(t, 2));
        s.addTask(pid, 'Write project case studies', addDays(t, 7));
        s.addTask(pid, 'Deploy to GitHub Pages', addDays(t, 14));
        s.addProject({ title: 'Half marathon training plan', categoryId: 'health', goalId: g2, status: 'active', dueDate: addDays(t, 120) });
        s.addItems([
          { title: 'See the Northern Lights', categoryId: 'travel', type: 'experience', priority: 2, horizon: '1-3y', starred: true },
          { title: 'Read 50 books in a year', categoryId: 'learning', status: 'active', priority: 2, horizon: 'this-year' },
          { title: 'Practice Mandarin 30 min', categoryId: 'learning', status: 'next', priority: 1, goalId, todayDate: t, dueDate: t },
          { title: 'Build a 6-month emergency fund', categoryId: 'finance', status: 'active', priority: 1, horizon: 'this-year' },
          { title: 'Visit Japan in cherry blossom season', categoryId: 'travel', type: 'experience', horizon: '1-3y' },
          { title: 'Call my parents', categoryId: 'relationships', status: 'next', priority: 1, todayDate: t },
          { title: 'Go skydiving', categoryId: 'experiences', type: 'experience', horizon: '3-5y' },
          { title: 'Learn robotics', categoryId: 'learning', type: 'skill', status: 'active', dueDate: addDays(t, 60) },
          { title: 'Perform Umrah', categoryId: 'mind', priority: 1, horizon: '1-3y', starred: true },
          { title: 'Run a 5K', categoryId: 'health', status: 'done', completedAt: new Date(Date.now() - 86400000 * 10).toISOString() },
        ]);
        const log = (p: number) => Array.from({ length: 40 }, (_, i) => addDays(t, -i)).filter(() => Math.random() < p);
        s.addHabit({ title: 'Morning workout', categoryId: 'health', log: log(0.7) });
        s.addHabit({ title: 'Read 20 pages', categoryId: 'learning', log: log(0.8) });
        s.addHabit({ title: 'Meditate 10 min', categoryId: 'mind', log: log(0.5) });
        s.saveEntry({ title: 'A good start', content: 'Set up my Life OS today. Feeling clear about what matters.', mood: 4, tags: ['reflection'] });
      },
    }),
    { name: 'life-os-v1' },
  ),
);

export const useCategoryMap = () => {
  const cats = useStore((s) => s.categories);
  return Object.fromEntries(cats.map((c) => [c.id, c])) as Record<string, Category>;
};
