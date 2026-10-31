import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Album, AlbumMemory, Category, FocusSession, Goal, Habit, JournalEntry, LifeItem, Project, RewardEvent, Settings, Task, TrashRecord } from './types';
import { DEFAULT_CATEGORIES } from './library';
import { addDays, today, uid } from './utils';
import { isThemeUnlocked } from './themes';
import { createEmptyStudyData, type StudyData } from './study/types';
import { normalizeStudyData } from './study/normalize';

type NewItem = Partial<LifeItem> & { title: string };

interface State {
  categories: Category[];
  items: LifeItem[];
  goals: Goal[];
  projects: Project[];
  habits: Habit[];
  journal: JournalEntry[];
  albums: Album[];
  settings: Settings;
  trash: TrashRecord[];
  focusSessions: FocusSession[];
  rewardEvents: RewardEvent[];
  study: StudyData;
  updateStudy: (recipe: (current: StudyData) => StudyData) => void;

  // items
  addItems: (items: NewItem[]) => void;
  updateItem: (id: string, patch: Partial<LifeItem>) => void;
  updateItems: (ids: string[], patch: Partial<LifeItem>) => void;
  deleteItems: (ids: string[]) => LifeItem[];
  restoreItems: (items: LifeItem[]) => void;
  duplicateItems: (ids: string[]) => void;
  addTagToItems: (ids: string[], tag: string) => void;
  removeTagFromItems: (ids: string[], tag: string) => void;
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
  reorderJournal: (ids: string[]) => void;
  deleteEntry: (id: string) => void;
  addAlbum: (a: Partial<Album> & { title: string }) => string;
  updateAlbum: (id: string, patch: Partial<Album>) => void;
  deleteAlbum: (id: string) => void;
  addMemory: (albumId: string, memory: Partial<AlbumMemory> & { title: string }) => void;
  updateMemory: (albumId: string, memoryId: string, patch: Partial<AlbumMemory>) => void;
  deleteMemory: (albumId: string, memoryId: string) => void;
  // settings / data
  updateSettings: (patch: Partial<Settings>, verifiedOwnerAdmin?: boolean) => void;
  restoreFromTrash: (id: string) => boolean;
  permanentlyDeleteFromTrash: (id: string) => TrashRecord | undefined;
  permanentlyDeleteManyFromTrash: (ids: string[]) => TrashRecord[];
  emptyTrash: () => TrashRecord[];
  addFocusSession: (session: Omit<FocusSession, 'id' | 'pointsAwarded'>) => number;
  awardReward: (uniqueKey: string, title: string, kind: RewardEvent['kind'], points: number) => void;
  importAll: (data: Partial<State>) => void;
  resetAll: () => void;
  loadDemo: () => void;
}

const now = () => new Date().toISOString();
const trashEntry = (entityType: TrashRecord['entityType'], title: string, data: unknown, parentId?: string, metadata?: TrashRecord['metadata']): TrashRecord => ({
  id: uid(), entityType, title: title || 'Untitled', data, parentId, metadata, deletedAt: now(),
});

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
  albums: [] as Album[],
  trash: [] as TrashRecord[],
  focusSessions: [] as FocusSession[],
  rewardEvents: [] as RewardEvent[],
  study: createEmptyStudyData(),
  settings: { theme: 'dark', name: '', weekStartsMonday: true } as Settings,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      updateStudy: (recipe) => set((s) => ({ study: normalizeStudyData(recipe(s.study)) })),

      addItems: (items) => set((s) => ({ items: [...items.map(makeItem), ...s.items] })),
      updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: now() } : i)) })),
      updateItems: (ids, patch) => {
        const set_ = new Set(ids);
        set((s) => ({
          items: s.items.map((i) => {
            if (!set_.has(i.id)) return i;
            const next = { ...i, ...patch, updatedAt: now() };
            if (patch.status === 'done' && i.status !== 'done') next.completedAt = now();
            if (patch.status && patch.status !== 'done') next.completedAt = undefined;
            return next;
          }),
        }));
      },
      deleteItems: (ids) => {
        const selected = new Set(ids);
        const removed = get().items.filter((i) => selected.has(i.id));
        set((s) => ({
          items: s.items.filter((i) => !selected.has(i.id)),
          trash: [...s.trash, ...removed.map((item) => trashEntry('item', item.title, item))],
        }));
        return removed;
      },
      restoreItems: (restored) =>
        set((s) => {
          const have = new Set(s.items.map((i) => i.id));
          const restoredIds = new Set(restored.map((i) => i.id));
          return {
            items: [...restored.filter((i) => !have.has(i.id)), ...s.items],
            trash: s.trash.filter((record) => !(record.entityType === 'item' && restoredIds.has((record.data as LifeItem).id))),
          };
        }),
      duplicateItems: (ids) =>
        set((s) => {
          const s_ = new Set(ids);
          const copies = s.items
            .filter((i) => s_.has(i.id))
            .map((i) => ({
              ...i,
              id: uid(),
              title: i.title + ' (copy)',
              status: i.status === 'done' ? ('someday' as const) : i.status,
              completedAt: undefined,
              checklist: i.checklist?.map((c) => ({ ...c, id: uid(), done: false })),
              createdAt: now(),
              updatedAt: undefined,
            }));
          return { items: [...copies, ...s.items] };
        }),
      addTagToItems: (ids, tag) => {
        const t = tag.trim().replace(/^#/, '');
        if (!t) return;
        const s_ = new Set(ids);
        set((s) => ({ items: s.items.map((i) => (s_.has(i.id) && !i.tags.includes(t) ? { ...i, tags: [...i.tags, t], updatedAt: now() } : i)) }));
      },
      removeTagFromItems: (ids, tag) => {
        const t = tag.trim().replace(/^#/, '');
        const s_ = new Set(ids);
        set((s) => ({ items: s.items.map((i) => (s_.has(i.id) ? { ...i, tags: i.tags.filter((x) => x !== t), updatedAt: now() } : i)) }));
      },
      toggleItemDone: (id) =>
        set((s) => {
          const item = s.items.find((row) => row.id === id);
          const uniqueKey = `item:${id}`;
          const rewardEvents = item && item.status !== 'done' && !s.rewardEvents.some((event) => event.uniqueKey === uniqueKey)
            ? [...s.rewardEvents, { id: uid(), uniqueKey, title: item.title, kind: 'task' as const, points: item.dueDate && item.dueDate >= today() ? 25 : 15, createdAt: now() }]
            : s.rewardEvents;
          return {
            items: s.items.map((i) => i.id === id
              ? i.status === 'done' ? { ...i, status: 'active', completedAt: undefined } : { ...i, status: 'done', completedAt: now() }
              : i),
            rewardEvents,
          };
        }),

      addCategory: (c) => set((s) => ({ categories: [...s.categories, { ...c, id: uid() }] })),
      updateCategory: (id, patch) => set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCategory: (id) =>
        set((s) => {
          const category = s.categories.find((c) => c.id === id);
          if (!category) return s;
          const fallback = s.categories.find((c) => c.id !== id)?.id ?? 'experiences';
          const affectedItemIds = s.items.filter((i) => i.categoryId === id).map((i) => i.id);
          return {
            categories: s.categories.filter((c) => c.id !== id),
            items: s.items.map((i) => (i.categoryId === id ? { ...i, categoryId: fallback } : i)),
            trash: [...s.trash, trashEntry('category', category.name, category, undefined, { affectedItemIds, fallbackCategoryId: fallback })],
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
        set((s) => {
          const goal = s.goals.find((g) => g.id === id);
          const key = `goal:${id}`;
          const rewards = goal && patch.status === 'done' && goal.status !== 'done' && !s.rewardEvents.some((event) => event.uniqueKey === key)
            ? [...s.rewardEvents, { id: uid(), uniqueKey: key, title: goal.title, kind: 'goal' as const, points: 50, createdAt: now() }]
            : s.rewardEvents;
          return {
            goals: s.goals.map((g) => g.id === id ? { ...g, ...patch, completedAt: patch.status === 'done' ? now() : patch.status ? undefined : g.completedAt } : g),
            rewardEvents: rewards,
          };
        }),
      deleteGoal: (id) =>
        set((s) => {
          const goal = s.goals.find((g) => g.id === id);
          if (!goal) return s;
          const linkedItemIds = s.items.filter((i) => i.goalId === id).map((i) => i.id);
          const linkedProjectIds = s.projects.filter((p) => p.goalId === id).map((p) => p.id);
          return {
            goals: s.goals.filter((g) => g.id !== id),
            items: s.items.map((i) => (i.goalId === id ? { ...i, goalId: undefined } : i)),
            projects: s.projects.map((p) => (p.goalId === id ? { ...p, goalId: undefined } : p)),
            trash: [...s.trash, trashEntry('goal', goal.title, goal, undefined, { linkedItemIds, linkedProjectIds })],
          };
        }),

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
      updateProject: (id, patch) => set((s) => {
        const project = s.projects.find((p) => p.id === id);
        const key = `project:${id}`;
        const rewards = project && patch.status === 'done' && project.status !== 'done' && !s.rewardEvents.some((event) => event.uniqueKey === key)
          ? [...s.rewardEvents, { id: uid(), uniqueKey: key, title: project.title, kind: 'project' as const, points: 100, createdAt: now() }]
          : s.rewardEvents;
        return { projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)), rewardEvents: rewards };
      }),
      deleteProject: (id) => set((s) => {
        const project = s.projects.find((p) => p.id === id);
        return project ? { projects: s.projects.filter((p) => p.id !== id), trash: [...s.trash, trashEntry('project', project.title, project)] } : s;
      }),
      addTask: (projectId, title, dueDate) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, tasks: [...p.tasks, { id: uid(), title, done: false, dueDate, dependsOn: [] }] } : p,
          ),
        })),
      updateTask: (projectId, taskId, patch) =>
        set((s) => {
          const task = s.projects.find((p) => p.id === projectId)?.tasks.find((row) => row.id === taskId);
          const key = `project-task:${taskId}`;
          const rewards = task && patch.done === true && !task.done && !s.rewardEvents.some((event) => event.uniqueKey === key)
            ? [...s.rewardEvents, { id: uid(), uniqueKey: key, title: task.title, kind: 'task' as const, points: task.dueDate && task.dueDate >= today() ? 25 : 20, createdAt: now() }]
            : s.rewardEvents;
          return {
            projects: s.projects.map((p) => p.id === projectId ? { ...p, tasks: p.tasks.map((t) => t.id === taskId ? { ...t, ...patch, completedAt: patch.done === true ? now() : patch.done === false ? undefined : t.completedAt } : t) } : p),
            rewardEvents: rewards,
          };
        }),
      deleteTask: (projectId, taskId) =>
        set((s) => {
          const project = s.projects.find((p) => p.id === projectId);
          const task = project?.tasks.find((t) => t.id === taskId);
          if (!task) return s;
          return {
            projects: s.projects.map((p) => p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== taskId) })) } : p),
            trash: [...s.trash, trashEntry('task', task.title, task, projectId)],
          };
        }),

      addHabit: (h) =>
        set((s) => ({
          habits: [
            { id: uid(), categoryId: 'health', frequency: 'daily', targetPerWeek: 7, log: [], createdAt: now(), archived: false, ...h },
            ...s.habits,
          ],
        })),
      updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      deleteHabit: (id) => set((s) => {
        const habit = s.habits.find((h) => h.id === id);
        return habit ? { habits: s.habits.filter((h) => h.id !== id), trash: [...s.trash, trashEntry('habit', habit.title, habit)] } : s;
      }),
      toggleHabit: (id, date) =>
        set((s) => {
          const habit = s.habits.find((row) => row.id === id);
          const uniqueKey = `habit:${id}:${date}`;
          const rewards = habit && !habit.log.includes(date) && !s.rewardEvents.some((event) => event.uniqueKey === uniqueKey)
            ? [...s.rewardEvents, { id: uid(), uniqueKey, title: habit.title, kind: 'habit' as const, points: 5, createdAt: now() }]
            : s.rewardEvents;
          return {
            habits: s.habits.map((h) => h.id === id ? { ...h, log: h.log.includes(date) ? h.log.filter((d) => d !== date) : [...h.log, date] } : h),
            rewardEvents: rewards,
          };
        }),

      saveEntry: (e) =>
        set((s) => {
          if (e.id && s.journal.some((j) => j.id === e.id))
            return { journal: s.journal.map((j) => (j.id === e.id ? { ...j, ...e } as JournalEntry : j)) };
          return {
            journal: [
              { id: uid(), date: today(), title: '', content: '', mood: 3, tags: [], visibility: 'private', createdAt: now(), ...e } as JournalEntry,
              ...s.journal,
            ],
          };
        }),
      reorderJournal: (ids) => set((s) => {
        const position = new Map(ids.map((id, index) => [id, index]));
        return { journal: s.journal.map((entry) => position.has(entry.id) ? { ...entry, sortOrder: position.get(entry.id)! } : entry) };
      }),
      deleteEntry: (id) => set((s) => {
        const entry = s.journal.find((j) => j.id === id);
        return entry ? { journal: s.journal.filter((j) => j.id !== id), trash: [...s.trash, trashEntry('journal', entry.title || 'Journal entry', entry)] } : s;
      }),

      addAlbum: (a) => {
        const id = uid();
        set((s) => ({ albums: [{ id, description: '', memories: [], createdAt: now(), ...a }, ...s.albums] }));
        return id;
      },
      updateAlbum: (id, patch) => set((s) => ({ albums: s.albums.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      deleteAlbum: (id) => set((s) => {
        const album = s.albums.find((a) => a.id === id);
        return album ? { albums: s.albums.filter((a) => a.id !== id), trash: [...s.trash, trashEntry('album', album.title, album)] } : s;
      }),
      addMemory: (albumId, memory) => set((s) => ({ albums: s.albums.map((a) => a.id === albumId ? { ...a, memories: [{ id: uid(), note: '', tags: [], ...memory }, ...a.memories] } : a) })),
      updateMemory: (albumId, memoryId, patch) => set((s) => ({ albums: s.albums.map((a) => a.id === albumId ? { ...a, memories: a.memories.map((m) => m.id === memoryId ? { ...m, ...patch } : m) } : a) })),
      deleteMemory: (albumId, memoryId) => set((s) => {
        const album = s.albums.find((a) => a.id === albumId);
        const memory = album?.memories.find((m) => m.id === memoryId);
        if (!memory) return s;
        return {
          albums: s.albums.map((a) => a.id === albumId ? { ...a, memories: a.memories.filter((m) => m.id !== memoryId) } : a),
          trash: [...s.trash, trashEntry('memory', memory.title, memory, albumId)],
        };
      }),

      updateSettings: (patch, verifiedOwnerAdmin = false) => set((s) => {
        if (patch.theme && !verifiedOwnerAdmin && !isThemeUnlocked(patch.theme, s.rewardEvents.reduce((sum, event) => sum + event.points, 0))) return s;
        return { settings: { ...s.settings, ...patch } };
      }),
      addFocusSession: (session) => {
        const focusMinutes = Math.max(0, Math.min(720, Math.round(session.focusMinutes)));
        const distractionMinutes = Math.max(0, Math.min(720, Math.round(session.distractionMinutes)));
        const points = focusMinutes;
        const id = uid();
        set((s) => ({ focusSessions: [{ ...session, id, focusMinutes, distractionMinutes, pointsAwarded: points }, ...s.focusSessions].slice(0, 10000), rewardEvents: points ? [...s.rewardEvents, { id: uid(), uniqueKey: `focus:${id}`, title: `${focusMinutes} min focus`, kind: 'focus', points, createdAt: now() }] : s.rewardEvents }));
        return points;
      },
      awardReward: (uniqueKey, title, kind, points) => set((s) => s.rewardEvents.some((event) => event.uniqueKey === uniqueKey) ? s : ({ rewardEvents: [...s.rewardEvents, { id: uid(), uniqueKey, title, kind, points: Math.max(0, Math.floor(points)), createdAt: now() }] })),
      restoreFromTrash: (id) => {
        let restored = false;
        set((s) => {
          const record = s.trash.find((entry) => entry.id === id);
          if (!record) return s;
          const trash = s.trash.filter((entry) => entry.id !== id);
          const prependUnique = <T extends { id: string }>(rows: T[], row: T) => [row, ...rows.filter((entry) => entry.id !== row.id)];
          switch (record.entityType) {
            case 'item': restored = true; return { items: prependUnique(s.items, record.data as LifeItem), trash };
            case 'goal': {
              const goal = record.data as Goal;
              const itemIds = new Set(record.metadata?.linkedItemIds ?? []);
              const projectIds = new Set(record.metadata?.linkedProjectIds ?? []);
              restored = true;
              return {
                goals: prependUnique(s.goals, goal),
                items: s.items.map((item) => itemIds.has(item.id) && !item.goalId ? { ...item, goalId: goal.id } : item),
                projects: s.projects.map((project) => projectIds.has(project.id) && !project.goalId ? { ...project, goalId: goal.id } : project),
                trash,
              };
            }
            case 'project': restored = true; return { projects: prependUnique(s.projects, record.data as Project), trash };
            case 'task': {
              const project = s.projects.find((row) => row.id === record.parentId);
              if (!project) return s;
              const task = record.data as Task;
              restored = true;
              return { projects: s.projects.map((row) => row.id === project.id ? { ...row, tasks: prependUnique(row.tasks, task) } : row), trash };
            }
            case 'habit': restored = true; return { habits: prependUnique(s.habits, record.data as Habit), trash };
            case 'journal': restored = true; return { journal: prependUnique(s.journal, record.data as JournalEntry), trash };
            case 'album': restored = true; return { albums: prependUnique(s.albums, record.data as Album), trash };
            case 'memory': {
              const albumId = record.parentId;
              if (!albumId || !s.albums.some((row) => row.id === albumId)) return s;
              const memory = record.data as AlbumMemory;
              restored = true;
              return { albums: s.albums.map((row) => row.id === albumId ? { ...row, memories: prependUnique(row.memories, memory) } : row), trash };
            }
            case 'category': {
              const category = record.data as Category;
              const affected = new Set(record.metadata?.affectedItemIds ?? []);
              const fallback = record.metadata?.fallbackCategoryId;
              restored = true;
              return {
                categories: prependUnique(s.categories, category),
                items: s.items.map((item) => affected.has(item.id) && item.categoryId === fallback ? { ...item, categoryId: category.id } : item),
                trash,
              };
            }
          }
        });
        return restored;
      },
      permanentlyDeleteFromTrash: (id) => {
        const record = get().trash.find((entry) => entry.id === id);
        if (record) set((s) => ({ trash: s.trash.filter((entry) => entry.id !== id) }));
        return record;
      },
      permanentlyDeleteManyFromTrash: (ids) => {
        const wanted = new Set(ids);
        let removed: TrashRecord[] = [];
        set((s) => {
          removed = s.trash.filter((entry) => wanted.has(entry.id));
          return removed.length ? { trash: s.trash.filter((entry) => !wanted.has(entry.id)) } : s;
        });
        return removed;
      },
      emptyTrash: () => {
        const records = get().trash;
        set({ trash: [] });
        return records;
      },
      importAll: (data) =>
        set(() => ({
          categories: data.categories ?? initial.categories,
          items: data.items ?? [],
          goals: data.goals ?? [],
          projects: data.projects ?? [],
          habits: data.habits ?? [],
          journal: data.journal ?? [],
          albums: data.albums ?? [],
          trash: data.trash ?? [],
          focusSessions: data.focusSessions ?? [],
          rewardEvents: data.rewardEvents ?? [],
          settings: { ...initial.settings, ...(data.settings ?? {}) },
          study: normalizeStudyData(data.study),
        })),
      resetAll: () => set(() => ({ ...initial, study: createEmptyStudyData() })),
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
        s.saveEntry({ title: 'A good start', content: 'Set up my Life Circle today. Feeling clear about what matters.', mood: 4, tags: ['reflection'] });
      },
    }),
    {
      name: 'life-os-v1',
      version: 4,
      // v2 adds the idea categories; v3 introduces Trash; v4 adds private Study Studio data.
      migrate: (persisted: any, version) => {
        if (persisted && version < 2) {
          const have = new Set((persisted.categories ?? []).map((c: Category) => c.id));
          persisted.categories = [...(persisted.categories ?? []), ...DEFAULT_CATEGORIES.filter((c) => !have.has(c.id))];
        }
        if (persisted && version < 3) persisted.trash = [];
        if (persisted && version < 4) persisted.study = createEmptyStudyData();
        return persisted;
      },
    },
  ),
);

export const useCategoryMap = () => {
  const cats = useStore((s) => s.categories);
  return Object.fromEntries(cats.map((c) => [c.id, c])) as Record<string, Category>;
};
