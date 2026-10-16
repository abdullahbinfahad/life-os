export type Status = 'someday' | 'next' | 'active' | 'done' | 'dropped';
export type Priority = 1 | 2 | 3 | 4; // 1 = highest
export type Horizon = 'this-year' | '1-3y' | '3-5y' | '5-10y' | 'lifetime';
export type ItemType = 'goal' | 'idea' | 'experience' | 'skill' | 'place' | 'book' | 'habit' | 'other';

export interface Category {
  id: string;
  name: string;
  color: string; // tailwind-ish hex
  icon: string; // emoji
}

export interface LifeItem {
  id: string;
  title: string;
  notes: string;
  categoryId: string;
  type: ItemType;
  status: Status;
  priority: Priority;
  horizon: Horizon;
  tags: string[];
  dueDate?: string; // YYYY-MM-DD
  todayDate?: string; // set when pinned to Today
  starred: boolean;
  goalId?: string;
  checklist?: ChecklistItem[];
  url?: string;
  progress?: number; // 0-100, manual progress
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface ChecklistItem { id: string; title: string; done: boolean }

export interface Milestone { id: string; title: string; done: boolean; dueDate?: string }

export interface Goal {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  status: 'active' | 'paused' | 'done';
  targetDate?: string;
  milestones: Milestone[];
  createdAt: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string;
  dependsOn: string[]; // task ids in same project
  completedAt?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  goalId?: string;
  categoryId: string;
  status: 'planning' | 'active' | 'on-hold' | 'done';
  dueDate?: string;
  tasks: Task[];
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  categoryId: string;
  frequency: 'daily' | 'weekly';
  targetPerWeek: number;
  log: string[]; // dates YYYY-MM-DD
  createdAt: string;
  archived: boolean;
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  visibility: 'private' | 'public';
  coverImage?: string;
  location?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  memories: AlbumMemory[];
  createdAt: string;
}

export interface AlbumMemory {
  id: string;
  title: string;
  note: string;
  imageUrl?: string;
  date?: string;
  location?: string;
  tags: string[];
}

export interface Settings {
  theme: 'dark' | 'light';
  name: string;
  weekStartsMonday: boolean;
  birthday?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
}
