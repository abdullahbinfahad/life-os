import type {
  ActiveStudySession,
  FlashcardReview,
  ReviewGrade,
  StudyFlashcard,
  StudyInterval,
  StudySession,
  StudyState,
} from './types';

const ms = (v: string | number, now: number) => {
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(now, n)) : now;
};
const iso = (n: number) => new Date(Number.isFinite(n) ? Math.max(0, n) : Date.now()).toISOString();
const elapsedInterval = (i: StudyInterval, now: number) =>
  Math.max(0, ms(i.endedAt ?? now, now) - ms(i.startedAt, now)) / 1000;
export function elapsedSeconds(
  session: Pick<ActiveStudySession | StudySession, 'intervals'>,
  now: number | string = Date.now(),
  kind: 'focus' | 'break' = 'focus',
): number {
  const n =
    typeof now === 'string'
      ? ms(now, Date.now())
      : Number.isFinite(now)
        ? Math.max(0, now)
        : Date.now();
  return session.intervals
    .filter((i) => i.kind === kind)
    .reduce((sum, i) => sum + elapsedInterval(i, n), 0);
}
const closeCurrent = (s: ActiveStudySession, at: number): StudyInterval[] => {
  const rows = s.intervals.map((i) => ({ ...i }));
  const last = rows[rows.length - 1];
  if (last && !last.endedAt) last.endedAt = iso(at);
  return rows;
};
const transition = (
  s: ActiveStudySession,
  status: ActiveStudySession['status'],
  kind?: 'focus' | 'break',
  at = Date.now(),
): ActiveStudySession => {
  const intervals = closeCurrent(s, at);
  if (kind) intervals.push({ kind, startedAt: iso(at) });
  return {
    ...s,
    status,
    intervals,
    segmentStartedAt: kind ? iso(at) : undefined,
    updatedAt: iso(at),
  };
};
export function startSession(
  input: { id: string; subjectId?: string; topicId?: string; objective?: string },
  at = Date.now(),
): ActiveStudySession {
  const stamp = iso(at);
  return {
    ...input,
    status: 'running',
    startedAt: stamp,
    segmentStartedAt: stamp,
    intervals: [{ kind: 'focus', startedAt: stamp }],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
export const pauseSession = (s: ActiveStudySession, at = Date.now()) =>
  s.status === 'running' ? transition(s, 'paused', undefined, at) : s;
export const resumeSession = (s: ActiveStudySession, at = Date.now()) =>
  s.status === 'paused' ? transition(s, 'running', 'focus', at) : s;
export const startBreak = (s: ActiveStudySession, at = Date.now(), durationSeconds = 300) =>
  s.status === 'running' || s.status === 'paused'
    ? {
        ...transition(s, 'break', 'break', at),
        breakEndsAt: iso(ms(at, Date.now()) + Math.max(1, durationSeconds) * 1000),
      }
    : s;
export const skipBreak = (s: ActiveStudySession, at = Date.now()) =>
  s.status === 'break' ? { ...transition(s, 'running', 'focus', at), breakEndsAt: undefined } : s;
export const extendBreak = (s: ActiveStudySession, seconds = 60, at = Date.now()) =>
  s.status === 'break'
    ? {
        ...s,
        breakEndsAt: iso(
          Math.max(ms(s.breakEndsAt ?? at, at), ms(at, Date.now())) + Math.max(1, seconds) * 1000,
        ),
        updatedAt: iso(at),
      }
    : s;
export function enterRecovery(s: ActiveStudySession, at = Date.now()): ActiveStudySession {
  if (s.status === 'recovery') return s;
  const recoveryPreviousStatus =
    s.status === 'break' ? 'break' : s.status === 'running' ? 'running' : undefined;
  return {
    ...s,
    status: 'recovery',
    recoveryPreviousStatus,
    recoveryAt: iso(at),
    intervals: closeCurrent(s, at),
    segmentStartedAt: undefined,
    updatedAt: iso(at),
  };
}
export function resolveRecovery(
  s: ActiveStudySession,
  choice: 'resume' | 'discard',
  at = Date.now(),
): ActiveStudySession | null {
  if (s.status !== 'recovery') return s;
  if (choice === 'discard') return null;
  const kind = s.recoveryPreviousStatus === 'break' ? 'break' : 'focus';
  const next = transition(
    { ...s, status: 'paused', recoveryAt: undefined, recoveryPreviousStatus: undefined },
    kind === 'break' ? 'break' : 'running',
    kind,
    at,
  );
  return next;
}
export type SessionReflection = {
  reflection?: string;
  coveredMaterial?: string;
  confidence?: 'low' | 'medium' | 'high' | 1 | 2 | 3 | 4 | 5;
  confidenceRating?: 1 | 2 | 3 | 4 | 5;
  outcome?: string;
  unfinishedWork?: string;
  nextNote?: string;
};
export function finishSession(
  s: ActiveStudySession,
  history: StudySession[],
  reflection?: string | SessionReflection,
  at = Date.now(),
): { session: StudySession; history: StudySession[] } {
  const existing = history.find((x) => x.id === s.id);
  if (existing) return { session: existing, history };
  const intervals = closeCurrent(s, ms(at, Date.now()));
  const session: StudySession = {
    id: s.id,
    subjectId: s.subjectId,
    topicId: s.topicId,
    objective: s.objective,
    startedAt: s.startedAt,
    endedAt: iso(at),
    intervals,
    focusSeconds: elapsedSeconds({ intervals }, at, 'focus'),
    breakSeconds: elapsedSeconds({ intervals }, at, 'break'),
    ...(typeof reflection === 'string' ? { reflection } : (reflection ?? {})),
    createdAt: s.createdAt,
    updatedAt: iso(at),
  };
  return { session, history: [session, ...history] };
}
export const discardSession = (_s: ActiveStudySession) => null;
export function scheduleReview(
  card: StudyFlashcard,
  grade: ReviewGrade,
  at: string | number = Date.now(),
): { card: StudyFlashcard; review: FlashcardReview } {
  const when = typeof at === 'number' ? iso(at) : iso(ms(at, Date.now()));
  const priorEase = Number.isFinite(card.ease) ? Math.max(1.3, card.ease) : 2.5;
  let repetitions = Math.max(0, Math.floor(card.repetitions || 0));
  let ease = priorEase;
  let days: number;
  if (grade === 'Again') {
    repetitions = 0;
    days = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (grade === 'Hard') {
      days = Math.max(1, Math.ceil((card.intervalDays || 0) * 1.2 || 1));
      ease = Math.max(1.3, ease - 0.15);
    } else if (grade === 'Good') {
      days =
        repetitions === 0
          ? 1
          : repetitions === 1
            ? 6
            : Math.max(1, Math.round((card.intervalDays || 1) * ease));
    } else {
      days = Math.max(2, Math.round((card.intervalDays || 1) * (ease + 0.3)));
      ease += 0.15;
    }
    repetitions++;
  }
  const review = {
    id: `${card.id}:${when}:${card.reviewHistory.length}`,
    reviewedAt: when,
    grade,
    intervalDays: days,
    ease,
  };
  const due = Date.parse(when) + days * 86400000;
  return {
    review,
    card: {
      ...card,
      repetitions,
      ease,
      intervalDays: days,
      dueAt: iso(due),
      reviewHistory: [...card.reviewHistory, review],
      updatedAt: when,
    },
  };
}
export function aggregateStudy(
  state: Pick<StudyState, 'sessions' | 'flashcards'>,
  from?: string,
  to?: string,
) {
  const lo = from ? Date.parse(from) : -Infinity,
    hi = to ? Date.parse(to) : Infinity;
  const sessions = state.sessions.filter((s) => {
    const t = Date.parse(s.endedAt);
    return t >= lo && t <= hi;
  });
  const reviewed = state.flashcards
    .flatMap((c) => c.reviewHistory.map((r) => ({ cardId: c.id, ...r })))
    .filter((r) => {
      const t = Date.parse(r.reviewedAt);
      return t >= lo && t <= hi;
    });
  const focusSeconds = sessions.reduce((n, s) => n + Math.max(0, s.focusSeconds || 0), 0);
  const topicSeconds: Record<string, number> = {};
  for (const s of sessions)
    if (s.topicId)
      topicSeconds[s.topicId] = (topicSeconds[s.topicId] || 0) + Math.max(0, s.focusSeconds || 0);
  const grades: Record<ReviewGrade, number> = { Again: 0, Hard: 0, Good: 0, Easy: 0 };
  for (const r of reviewed) grades[r.grade]++;
  return {
    sessionCount: sessions.length,
    focusSeconds,
    reviewedCount: reviewed.length,
    grades,
    topicSeconds,
  };
}

export function getStudyTimerSnapshot(active: ActiveStudySession | null, nowMs = Date.now()) {
  if (!active)
    return { status: 'idle' as const, focusSeconds: 0, breakSeconds: 0, breakRemainingSeconds: 0 };
  const focusSeconds = elapsedSeconds(active, nowMs, 'focus');
  const breakSeconds = elapsedSeconds(active, nowMs, 'break');
  const deadline = active.breakEndsAt ? Date.parse(active.breakEndsAt) : NaN;
  const breakRemainingSeconds =
    active.status === 'break' && Number.isFinite(deadline)
      ? Math.max(
          0,
          Math.ceil((deadline - Math.max(0, Number.isFinite(nowMs) ? nowMs : Date.now())) / 1000),
        )
      : 0;
  return { status: active.status, focusSeconds, breakSeconds, breakRemainingSeconds };
}
export function startStudySession(
  active: ActiveStudySession | null,
  input: { id: string; subjectId?: string; topicId?: string; objective?: string },
  nowMs = Date.now(),
) {
  return active ?? startSession(input, nowMs);
}
export const pauseStudySession = pauseSession;
export const resumeStudySession = resumeSession;
export const beginStudyBreak = (active: ActiveStudySession, nowMs = Date.now()) =>
  startBreak(active, nowMs);
export const finishStudyBreak = skipBreak;
export const skipStudyBreak = skipBreak;
export const extendStudyBreak = (active: ActiveStudySession, seconds: number) =>
  extendBreak(active, seconds);
export const finishStudySession = finishSession;
