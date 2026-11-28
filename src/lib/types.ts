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
  scheduledTime?: string; // HH:mm in the user's local timezone
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
  /** Optional reminder of why this routine matters; absent in older saved habits. */
  why?: string;
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
  relatedGoalId?: string;
  relatedItemId?: string;
  relatedProjectId?: string;
  sortOrder?: number;
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
  /** Private object path in the life-media bucket; render via a signed URL. */
  imagePath?: string;
  /** Legacy/external URL fallback. New direct uploads use imagePath instead. */
  imageUrl?: string;
  date?: string;
  location?: string;
  tags: string[];
}

export interface Settings {
  theme: 'dark' | 'light' | 'paper' | 'monochrome' | 'sapphire' | 'forest';
  language?: 'en' | 'bn' | 'hi' | 'ar' | 'es' | 'zh' | 'ja' | 'ko';
  sounds?: boolean;
  /** Optional browser notifications while the app is open; never enabled without permission. */
  browserNotifications?: boolean;
  /** Weather location & units for the Home card, Schedule and weather alerts. */
  weather?: { name?: string; lat?: number; lon?: number; units?: 'metric' | 'imperial'; useDevice?: boolean };
  /** Notification preferences (times are local HH:MM). */
  notify?: {
    digest?: boolean; digestTime?: string;
    habits?: boolean; habitTime?: string;
    due?: boolean; contacts?: boolean; team?: boolean; schedule?: boolean; scheduleLead?: number;
    quietStart?: string; quietEnd?: string;
    badge?: boolean; vibrate?: boolean;
    weather?: boolean; hotAt?: number; coldAt?: number;
  };
  name: string;
  weekStartsMonday: boolean;
  birthday?: string;
  bio?: string;
  location?: string;
  /** Private object path in the life-media bucket; render via a signed URL. */
  avatarPath?: string;
  /** Optional legacy/external URL fallback. */
  avatarUrl?: string;
}

export type TrashEntityType = 'item' | 'goal' | 'project' | 'task' | 'habit' | 'journal' | 'album' | 'memory' | 'category' | 'contact' | 'schedule';

export interface TrashRecord {
  id: string;
  entityType: TrashEntityType;
  title: string;
  deletedAt: string;
  /** Parent container id for tasks and album memories. */
  parentId?: string;
  data: unknown;
  metadata?: { linkedItemIds?: string[]; linkedProjectIds?: string[]; affectedItemIds?: string[]; fallbackCategoryId?: string };
}

/** Personal productivity records only; these are kept in the user's private account snapshot. */
export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt: string;
  focusMinutes: number;
  distractionMinutes: number;
  note?: string;
  pointsAwarded: number;
}

export interface RewardEvent {
  id: string;
  uniqueKey: string;
  title: string;
  kind: 'focus' | 'task' | 'project' | 'goal' | 'habit';
  points: number;
  createdAt: string;
}

/* ---------------- Network / contacts ---------------- */
export type ContactGroup = 'friend' | 'family' | 'work' | 'client' | 'mentor' | 'business' | 'school' | 'service' | 'other';
export type SocialPlatform = 'linkedin' | 'x' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'github' | 'telegram' | 'whatsapp' | 'wechat' | 'snapchat' | 'discord' | 'website' | 'other';
export interface ContactField { id: string; label: string; value: string }
export interface ContactSocial { id: string; platform: SocialPlatform; value: string }
export interface ContactInteraction { id: string; date: string; kind: 'call' | 'message' | 'meeting' | 'email' | 'note'; note: string }
export interface Contact {
  id: string;
  name: string;
  nickname?: string;
  photo?: string;            // small JPEG data URL (≈160px) so it syncs cheaply
  jobTitle?: string;
  company?: string;
  department?: string;
  industry?: string;
  phones: ContactField[];
  emails: ContactField[];
  socials: ContactSocial[];
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
  birthday?: string;         // YYYY-MM-DD, or --MM-DD when the year is unknown
  group: ContactGroup;
  tags: string[];
  favorite: boolean;
  closeness?: 1 | 2 | 3 | 4 | 5;
  howWeMet?: string;
  metOn?: string;
  introducedBy?: string;
  languages?: string;
  interests?: string;
  canHelpWith?: string;      // what they can help with / their expertise
  notes: string;
  keepInTouchDays?: number;  // remind me if I haven't talked for this long
  followUpDate?: string;
  followUpNote?: string;
  lastContacted?: string;
  interactions: ContactInteraction[];
  createdAt: string;
  updatedAt: string;
}
