import {
  createEmptyStudyData,
  type StudyCanvasObject,
  type StudyNoteBlock,
  type StudyData,
  type StudySessionRecord,
} from './types';
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const validStamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const cleanText = (value: unknown) => (typeof value === 'string' ? value : '');
const isId = (value: unknown): value is Record<string, unknown> & { id: string } =>
  isObject(value) && typeof value.id === 'string' && value.id.length > 0;
const cleanBase = <T extends Record<string, unknown>>(value: T) => ({
  ...value,
  createdAt: validStamp(value.createdAt) ? value.createdAt : new Date(0).toISOString(),
  ...(validStamp(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
});
const blockTypes = new Set([
  'paragraph',
  'heading',
  'checklist',
  'code',
  'callout',
  'quote',
  'divider',
  'formula',
]);
function cleanBlock(value: unknown): StudyNoteBlock | null {
  if (!isId(value) || typeof value.type !== 'string' || !blockTypes.has(value.type)) return null;
  if (value.type === 'divider') return { id: value.id, type: 'divider' };
  return {
    id: value.id,
    type: value.type as Exclude<StudyNoteBlock, { type: 'divider' }>['type'],
    text: cleanText(value.text),
    ...(typeof value.checked === 'boolean' ? { checked: value.checked } : {}),
    ...(value.level === 1 || value.level === 2 || value.level === 3 ? { level: value.level } : {}),
    ...(typeof value.language === 'string' ? { language: value.language } : {}),
  };
}
const point = (value: unknown) =>
  isObject(value) &&
  typeof value.x === 'number' &&
  Number.isFinite(value.x) &&
  typeof value.y === 'number' &&
  Number.isFinite(value.y)
    ? { x: Math.max(0, Math.min(1, value.x)), y: Math.max(0, Math.min(1, value.y)) }
    : null;
function cleanObject(value: unknown): StudyCanvasObject | null {
  if (!isId(value)) return null;
  const width =
    typeof value.width === 'number' && Number.isFinite(value.width)
      ? Math.max(0.25, Math.min(100, value.width))
      : 2;
  const color = cleanText(value.color);
  if (value.type === 'stroke' && Array.isArray(value.points) && value.points.length <= 3000) {
    const points = value.points.map(point).filter((p): p is NonNullable<typeof p> => !!p);
    return { id: value.id, type: 'stroke', points, color, width };
  }
  if ((value.type === 'line' || value.type === 'arrow') && point(value.from) && point(value.to))
    return {
      id: value.id,
      type: value.type,
      from: point(value.from)!,
      to: point(value.to)!,
      color,
      width,
    };
  if (
    (value.type === 'rect' || value.type === 'ellipse') &&
    ['x', 'y', 'width', 'height'].every(
      (k) => typeof value[k] === 'number' && Number.isFinite(value[k]),
    )
  )
    return {
      id: value.id,
      type: value.type,
      x: Math.max(0, Math.min(1, Number(value.x))),
      y: Math.max(0, Math.min(1, Number(value.y))),
      width: Math.max(0, Math.min(1, Number(value.width))),
      height: Math.max(0, Math.min(1, Number(value.height))),
      color,
      strokeWidth:
        typeof value.strokeWidth === 'number' && Number.isFinite(value.strokeWidth)
          ? Math.max(0.25, Math.min(100, value.strokeWidth))
          : 2,
      ...(typeof value.fill === 'string' ? { fill: value.fill } : {}),
    };
  if (value.type === 'text' && point({ x: value.x, y: value.y }))
    return {
      id: value.id,
      type: 'text',
      x: Number(value.x),
      y: Number(value.y),
      text: cleanText(value.text),
      color,
      fontSize:
        typeof value.fontSize === 'number' ? Math.max(6, Math.min(200, value.fontSize)) : 16,
    };
  return null;
}
const rows = (value: unknown, predicate: (row: Record<string, unknown>) => boolean) =>
  array(value)
    .filter((row): row is Record<string, unknown> => isId(row) && predicate(row))
    .map(cleanBase);
export function normalizeStudyData(raw: unknown): StudyData {
  const data = createEmptyStudyData();
  if (!isObject(raw)) return data;
  const statuses = new Set(['Not Started', 'Learning', 'Practicing', 'Needs Review', 'Mastered']);
  data.subjects = rows(raw.subjects, (x) => typeof x.name === 'string').map((x) => ({
    ...x,
    name: cleanText(x.name),
    ...(typeof x.archived === 'boolean' ? { archived: x.archived } : {}),
  })) as StudyData['subjects'];
  data.courses = rows(raw.courses, (x) => typeof x.name === 'string').map((x) => ({
    ...x,
    name: cleanText(x.name),
    kind: x.kind === 'book' ? 'book' : 'course',
  })) as StudyData['courses'];
  data.chapters = rows(
    raw.chapters,
    (x) => typeof x.name === 'string' && typeof x.courseId === 'string',
  ).map((x) => ({ ...x, name: cleanText(x.name) })) as StudyData['chapters'];
  data.topics = rows(raw.topics, (x) => typeof x.name === 'string').map((x) => ({
    ...x,
    name: cleanText(x.name),
    status: statuses.has(String(x.status)) ? x.status : 'Not Started',
  })) as StudyData['topics'];
  data.notebooks = rows(raw.notebooks, (x) => typeof x.title === 'string').map((x) => ({
    ...x,
    title: cleanText(x.title),
    archived: typeof x.archived === 'boolean' ? x.archived : false,
    pages: array(x.pages)
      .filter(isId)
      .map((p) => ({
        ...cleanBase(p),
        title: cleanText(p.title),
        sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : 0,
        blocks: array(p.blocks)
          .map(cleanBlock)
          .filter((b): b is StudyNoteBlock => !!b),
      })),
  })) as StudyData['notebooks'];
  data.canvases = rows(raw.canvases, (x) => typeof x.title === 'string').map((x) => ({
    ...x,
    title: cleanText(x.title),
    width: typeof x.width === 'number' ? Math.max(1, Math.min(10000, x.width)) : 1000,
    height: typeof x.height === 'number' ? Math.max(1, Math.min(10000, x.height)) : 700,
    ...(x.background === 'plain' || x.background === 'grid' || x.background === 'dot' || x.background === 'lined'
      ? { background: x.background }
      : {}),
    objects: array(x.objects)
      .map(cleanObject)
      .filter((o): o is StudyCanvasObject => !!o),
  })) as StudyData['canvases'];
  if (isObject(raw.preferences))
    data.preferences = {
      ...data.preferences,
      ...raw.preferences,
      widgets: {
        ...data.preferences.widgets,
        ...(isObject(raw.preferences.widgets) ? raw.preferences.widgets : {}),
      },
    } as StudyData['preferences'];
  const duration = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.max(1, Math.min(1440, Math.round(value))) : fallback;
  for (const key of [
    'focusMinutes',
    'shortBreakMinutes',
    'longBreakMinutes',
    'dailyTargetMinutes',
    'weeklyTargetMinutes',
    'longBreakEvery',
  ] as const)
    data.preferences[key] = duration(
      data.preferences[key],
      createEmptyStudyData().preferences[key],
    );
  data.sessions = rows(
    raw.sessions,
    (x) => validStamp(x.startedAt) && validStamp(x.endedAt) && Array.isArray(x.intervals),
  ).map((x) => ({
    ...x,
    intervals: array(x.intervals),
    focusSeconds: Math.max(0, Number(x.focusSeconds) || 0),
    breakSeconds: Math.max(0, Number(x.breakSeconds) || 0),
    ...(Number.isInteger(x.confidenceRating) &&
    Number(x.confidenceRating) >= 1 &&
    Number(x.confidenceRating) <= 5
      ? { confidenceRating: Number(x.confidenceRating) as 1 | 2 | 3 | 4 | 5 }
      : { confidenceRating: undefined }),
  })) as StudySessionRecord[];
  const active = raw.activeSession;
  data.activeSession =
    isId(active) &&
    validStamp(active.startedAt) &&
    ['running', 'paused', 'break', 'recovery'].includes(String(active.status))
      ? ({
          ...cleanBase(active),
          status: active.status,
          intervals: array(active.intervals),
        } as StudyData['activeSession'])
      : null;
  data.flashcards = rows(
    raw.flashcards,
    (x) => typeof x.front === 'string' && typeof x.back === 'string',
  ).map((x) => ({
    ...x,
    front: cleanText(x.front),
    back: cleanText(x.back),
    intervalDays: Math.max(0, Number(x.intervalDays) || 0),
    ease: Math.max(1.3, Number(x.ease) || 2.5),
    repetitions: Math.max(0, Math.floor(Number(x.repetitions) || 0)),
    reviewHistory: array(x.reviewHistory),
  })) as StudyData['flashcards'];
  return data;
}
export const normalizeStudyState = normalizeStudyData;
