export type StudyStatus = 'Not Started' | 'Learning' | 'Practicing' | 'Needs Review' | 'Mastered';
export type StudyRecordBase = { id: string; createdAt: string; updatedAt?: string };
export type StudyLink = { subjectId?: string; topicId?: string };
export interface StudySubject extends StudyRecordBase {
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  archived?: boolean;
}
export interface StudyCourse extends StudyRecordBase, StudyLink {
  name: string;
  description?: string;
  kind: 'course' | 'book';
  sortOrder?: number;
  archived?: boolean;
}
export interface StudyChapter extends StudyRecordBase, StudyLink {
  courseId: string;
  name: string;
  sortOrder?: number;
  archived?: boolean;
}
export interface StudyTopic extends StudyRecordBase, StudyLink {
  name: string;
  chapterId?: string;
  status: StudyStatus;
  description?: string;
  sortOrder?: number;
  archived?: boolean;
}
export type StudyNoteBlock =
  | {
      id: string;
      type: 'paragraph' | 'heading' | 'checklist' | 'code' | 'callout' | 'quote' | 'formula';
      text: string;
      checked?: boolean;
      level?: 1 | 2 | 3;
      language?: string;
    }
  | { id: string; type: 'divider' };
export type NoteBlock = StudyNoteBlock;
export interface StudyNotebookPage extends StudyRecordBase {
  title: string;
  blocks: StudyNoteBlock[];
  sortOrder: number;
}
export type NotebookPage = StudyNotebookPage;
export interface StudyNotebook extends StudyRecordBase, StudyLink {
  title: string;
  pages: StudyNotebookPage[];
  archived?: boolean;
}
export type Point = { x: number; y: number };
export type StudyCanvasObject =
  | { id: string; type: 'stroke'; points: Point[]; color?: string; width?: number }
  | { id: string; type: 'line' | 'arrow'; from: Point; to: Point; color?: string; width?: number }
  | {
      id: string;
      type: 'rect' | 'ellipse';
      x: number;
      y: number;
      width: number;
      height: number;
      color?: string;
      strokeWidth?: number;
      fill?: string;
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      text: string;
      color?: string;
      fontSize?: number;
    };
export type CanvasObject = StudyCanvasObject;
export type StudyCanvasBackground = 'plain' | 'grid' | 'dot' | 'lined';
export interface StudyCanvasDocument extends StudyRecordBase, StudyLink {
  notebookId?: string;
  pageId?: string;
  title: string;
  width: number;
  height: number;
  objects: StudyCanvasObject[];
  background?: StudyCanvasBackground;
}
export type StudyCanvas = StudyCanvasDocument;
export type TimerStatus = 'running' | 'paused' | 'break' | 'recovery';
export interface StudyInterval {
  kind: 'focus' | 'break';
  startedAt: string;
  endedAt?: string;
}
export interface ActiveStudySession extends StudyRecordBase, StudyLink {
  status: TimerStatus;
  startedAt: string;
  segmentStartedAt?: string;
  breakEndsAt?: string;
  objective?: string;
  intervals: StudyInterval[];
  recoveryAt?: string;
  recoveryPreviousStatus?: 'running' | 'break';
}
export interface StudySessionRecord extends StudyRecordBase, StudyLink {
  startedAt: string;
  endedAt: string;
  objective?: string;
  focusSeconds: number;
  breakSeconds: number;
  intervals: StudyInterval[];
  reflection?: string;
  coveredMaterial?: string;
  confidence?: 'low' | 'medium' | 'high' | 1 | 2 | 3 | 4 | 5;
  confidenceRating?: 1 | 2 | 3 | 4 | 5;
  outcome?: string;
  unfinishedWork?: string;
  nextNote?: string;
}
export type StudySession = StudySessionRecord;
export type ReviewGrade = 'Again' | 'Hard' | 'Good' | 'Easy';
export interface FlashcardReview {
  id: string;
  reviewedAt: string;
  grade: ReviewGrade;
  intervalDays: number;
  ease: number;
}
export interface StudyFlashcard extends StudyRecordBase, StudyLink {
  front: string;
  back: string;
  dueAt?: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  reviewHistory: FlashcardReview[];
}
export interface StudyPreferences {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  longBreakEvery: number;
  widgets: Record<string, boolean>;
}
export interface StudyData {
  version: 1;
  subjects: StudySubject[];
  courses: StudyCourse[];
  chapters: StudyChapter[];
  topics: StudyTopic[];
  notebooks: StudyNotebook[];
  canvases: StudyCanvasDocument[];
  activeSession: ActiveStudySession | null;
  sessions: StudySessionRecord[];
  flashcards: StudyFlashcard[];
  preferences: StudyPreferences;
}
export type StudyState = StudyData;
export const createEmptyStudyData = (): StudyData => ({
  version: 1,
  subjects: [],
  courses: [],
  chapters: [],
  topics: [],
  notebooks: [],
  canvases: [],
  activeSession: null,
  sessions: [],
  flashcards: [],
  preferences: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    dailyTargetMinutes: 60,
    weeklyTargetMinutes: 300,
    longBreakEvery: 4,
    widgets: { nextSession: true, dueCards: true, weeklyProgress: true },
  },
});
export const createEmptyStudyState = createEmptyStudyData;
