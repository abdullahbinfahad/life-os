import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { translate as tr } from '../lib/locales';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import StudyNotebookEditor from '../components/study/StudyNotebookEditor';
import type {
  StudyState,
  StudySubject,
  StudyTopic,
  StudyNotebook,
  StudyFlashcard,
} from '../lib/study/types';
import {
  startSession,
  pauseSession,
  resumeSession,
  startBreak,
  skipBreak,
  extendBreak,
  finishSession,
  discardSession,
  getStudyTimerSnapshot,
  resolveRecovery,
  elapsedSeconds,
  scheduleReview,
} from '../lib/study/engine';
import './StudyStudio.css';

const sections = [
  ['overview', 'Overview'],
  ['focus', 'Focus room'],
  ['subjects', 'Subjects'],
  ['notebooks', 'Notebooks'],
  ['practice', 'Practice'],
  ['revision', 'Revision'],
  ['analytics', 'Analytics'],
  ['settings', 'Settings'],
] as const;
const sectionDescriptions: Record<string, string> = {
  overview: 'Make room for one thoughtful next step.',
  focus: 'Tracked timer time, not observed attention.',
  subjects: 'Build your subject map',
  notebooks: 'Think on paper',
  practice: 'Practice retrieval',
  revision: 'Review what’s ready',
  analytics: 'Recorded totals',
  settings: 'Set a kind, workable rhythm.',
};
const uid = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const mins = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)} ${tr('min')}`;
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export default function StudyStudio() {
  const location = useLocation(),
    navigate = useNavigate();
  const study = useStore((state) => state.study) as StudyState;
  const updateStudy = useStore((state) => state.updateStudy);
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const update = (recipe: (x: StudyState) => StudyState) => updateStudy(recipe);
  const slug = location.pathname.split('/')[2] || 'focus';
  const current = sections.some(([id]) => id === slug) ? slug : 'overview';

  const subjects = study?.subjects || [],
    topics = study?.topics || [],
    sessions = study?.sessions || [],
    cards = study?.flashcards || [],
    notebooks = study?.notebooks || [];
  const todaySessions = sessions.filter((s) => dateKey(new Date(s.endedAt)) === dateKey());
  const todaySeconds = todaySessions.reduce((n, s) => n + s.focusSeconds, 0);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const weekSeconds = sessions
    .filter((s) => Date.parse(s.endedAt) >= monday.getTime() && Date.parse(s.endedAt) < Date.now())
    .reduce((n, s) => n + s.focusSeconds, 0);
  const enterFullscreen = () => {
    if (document.fullscreenElement) return;
    try {
      const request = document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => undefined);
    } catch {
      // The app-level Focus Room remains full viewport when browser fullscreen is unavailable.
    }
  };
  const nav = (id: string) => {
    if (id === 'focus') enterFullscreen();
    navigate(`/study/${id}`);
  };
  const exitFocus = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    navigate('/study/overview');
  };
  const setStudy = (fn: (s: StudyState) => StudyState) => update(fn);
  const title = sections.find((x) => x[0] === current)?.[1] || 'Overview';
  const description = sectionDescriptions[current] || sectionDescriptions.overview;
  const page = (
    <div className={`study-studio ${current === 'focus' ? 'study-studio--focus' : ''}`}>
      <nav className="study-mobile-rail study-top-rail" aria-label={tr('Study sections')}>
        <div className="study-brand study-top-brand">
          <span className="study-mark">S</span>
          <span>
            Study Studio<small>{tr('your quiet workspace')}</small>
          </span>
        </div>
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={current === id ? 'active' : ''}
            onClick={() => nav(id)}
            aria-current={current === id ? 'page' : undefined}
          >
            {tr(label)}
          </button>
        ))}
      </nav>
      <div className="study-layout">
        <main className="study-main">
          <header className="study-heading">
            <div>
              <p className="study-eyebrow">{tr('PERSONAL STUDY ATELIER')}</p>
              <h1>{tr(title)}</h1>
              <p>{tr(description)}</p>
            </div>
            {current === 'focus' ? (
              <div className="study-focus-header-actions">
                <button className="study-secondary" onClick={exitFocus}>
                  ← {tr('Back to study')}
                </button>
              </div>
            ) : (
              <Link className="study-quiet-link" to="/study/focus" onClick={enterFullscreen}>
                {study?.activeSession ? tr('Return to your session') : tr('Open focus room')} →
              </Link>
            )}
          </header>
          {current === 'overview' && (
            <Overview
              study={study}
              todaySeconds={todaySeconds}
              weekSeconds={weekSeconds}
              onNavigate={nav}
            />
          )}
          {current === 'focus' && <Focus study={study} update={setStudy} />}
          {current === 'subjects' && <Subjects study={study} update={setStudy} />}
          {current === 'notebooks' && <Notebooks study={study} update={setStudy} />}
          {current === 'practice' && <Practice study={study} update={setStudy} />}
          {current === 'revision' && <Revision study={study} update={setStudy} />}
          {current === 'analytics' && <Analytics study={study} />}
          {current === 'settings' && (
            <Settings
              study={study}
              update={setStudy}
              globalSounds={settings?.sounds}
              onSounds={(sounds: boolean) => updateSettings({ sounds })}
            />
          )}
        </main>
      </div>
    </div>
  );
  return current === 'focus' ? createPortal(page, document.body) : page;
}
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`study-panel ${className}`}>{children}</section>;
}
function Empty({
  title,
  body,
  action,
  onClick,
}: {
  title: string;
  body: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="study-empty">
      <div className="study-empty-symbol">✳</div>
      <h3>{tr(title)}</h3>
      <p>{tr(body)}</p>
      {action && (
        <button className="study-primary" onClick={onClick}>
          {tr(action)}
        </button>
      )}
    </div>
  );
}
function Overview({
  study,
  todaySeconds,
  weekSeconds,
  onNavigate,
}: {
  study: StudyState;
  todaySeconds: number;
  weekSeconds: number;
  onNavigate: (s: string) => void;
}) {
  const p = study.preferences,
    active = study.activeSession;
  const due = study.flashcards.filter((c) => !c.dueAt || Date.parse(c.dueAt) <= Date.now()).length;
  return (
    <div className="study-grid">
      <Panel className="study-welcome">
        <div>
          <span className="study-pill">{tr('TODAY, AT YOUR PACE')}</span>
          <h2>
            A little attention
            <br />
            goes a long way.
          </h2>
          <p>{tr('Your workspace is private. Progress below reflects saved sessions and topic stages.')}</p>
          <button
            className="study-primary"
            onClick={() => onNavigate(active ? 'focus' : 'subjects')}
          >
            {active ? 'Resume focus' : 'Add your first subject'} <span>→</span>
          </button>
        </div>
        <div className="study-metrics">
          <div>
            <small>{tr('Today')}</small>
            <strong>{mins(todaySeconds)}</strong>
            <span>{tr('of {minutes} min target').replace('{minutes}', String(p.dailyTargetMinutes))}</span>
          </div>
          <div>
            <small>{tr('This week')}</small>
            <strong>{mins(weekSeconds)}</strong>
            <span>{tr('of {minutes} min target').replace('{minutes}', String(p.weeklyTargetMinutes))}</span>
          </div>
        </div>
      </Panel>
      {active && (
        <Panel>
          <div className="study-panel-head">
            <div>
              <span className="study-pill cyan">{tr('Session')} {tr(active.status[0].toUpperCase() + active.status.slice(1))}</span>
              <h3>{tr('Current focus')}</h3>
            </div>
            <button className="study-secondary" onClick={() => onNavigate('focus')}>
              Open room
            </button>
          </div>
          <p>
            {study.subjects.find((x) => x.id === active.subjectId)?.name || 'Independent study'}
            {active.objective ? ` · ${active.objective}` : ''}
          </p>
        </Panel>
      )}
      <Panel>
        <div className="study-panel-head">
          <div>
            <span className="study-pill">{tr('YOUR MAP')}</span>
            <h3>{tr('Subject progress')}</h3>
          </div>
          <button className="study-text-button" onClick={() => onNavigate('subjects')}>
            Manage subjects →
          </button>
        </div>
        {study.subjects.length ? (
          study.subjects.map((s) => {
            const own = study.topics.filter((t) => t.subjectId === s.id);
            return (
              <div className="study-progress-row" key={s.id}>
                <span>{s.name}</span>
                <div className="study-progress">
                  <i
                    style={{
                      width: `${own.length ? (own.filter((t) => t.status === 'Mastered').length / own.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {own.filter((t) => t.status === 'Mastered').length}/{own.length} mastered
                </small>
              </div>
            );
          })
        ) : (
          <Empty
            title="Your map starts with a subject"
            body="Add a subject, course, and topics to make progress visible."
            action="Create a subject"
            onClick={() => onNavigate('subjects')}
          />
        )}
      </Panel>
      <Panel>
        <div className="study-panel-head">
          <div>
            <span className="study-pill mint">{tr('RECALL')}</span>
            <h3>{tr('Next reviews')}</h3>
          </div>
          <button className="study-text-button" onClick={() => onNavigate('revision')}>
            Open revision →
          </button>
        </div>
        {due ? (
          <p>
            {due} {due === 1 ? 'card is' : 'cards are'} ready when you are.
          </p>
        ) : (
          <p>{tr('No cards due. Your review queue is clear.')}</p>
        )}
      </Panel>
      <Panel>
        <div className="study-panel-head">
          <div>
            <span className="study-pill">{tr('RECENT')}</span>
            <h3>{tr('Sessions & notebooks')}</h3>
          </div>
          <button className="study-text-button" onClick={() => onNavigate('notebooks')}>
            Notebooks →
          </button>
        </div>
        {study.sessions.length ? (
          study.sessions.slice(0, 4).map((x) => (
            <div className="study-list-row" key={x.id}>
              <span>
                {study.subjects.find((s) => s.id === x.subjectId)?.name || 'Independent study'}
              </span>
              <small>
                {mins(x.focusSeconds)} · {new Date(x.endedAt).toLocaleDateString()}
              </small>
            </div>
          ))
        ) : (
          <p className="study-muted">{tr('Saved work will appear here after your first focus session.')}</p>
        )}
        {study.notebooks.slice(0, 2).map((n) => (
          <div className="study-list-row" key={n.id}>
            <span>▤ {n.title}</span>
            <small>{n.pages.length} {tr('pages')}</small>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function Focus({
  study,
  update,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  const [subjectId, setSubject] = useState(''),
    [topicId, setTopic] = useState(''),
    [objective, setObjective] = useState(''),
    [reflection, setReflection] = useState(''),
    [outcome, setOutcome] = useState(''),
    [covered, setCovered] = useState(''),
    [unfinished, setUnfinished] = useState(''),
    [nextNote, setNextNote] = useState(''),
    [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5>(3),
    [discarding, setDiscarding] = useState(false),
    [confirm, setConfirm] = useState(false);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    setObjective(study.activeSession?.objective || '');
  }, [study.activeSession?.id]);
  useEffect(() => {
    if (!study.activeSession) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [Boolean(study.activeSession)]);
  useEffect(() => {
    if (!discarding) return;
    discardDialogRef.current?.querySelector<HTMLButtonElement>('.study-secondary')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDiscarding(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [discarding]);
  const a = study.activeSession;
  const p = study.preferences;
  const elapsed = a
    ? a.status === 'break'
      ? getStudyTimerSnapshot(a, tick).breakRemainingSeconds
      : elapsedSeconds(a, tick, 'focus')
    : 0;
  const invalid = !!a && (!Number.isFinite(Date.parse(a.startedAt)) || !a.intervals);
  const mutate = (f: (s: StudyState) => StudyState) => update(f);
  useEffect(() => {
    if (study.activeSession || autoStarted.current) return;
    autoStarted.current = true;
    mutate((s) =>
      s.activeSession
        ? s
        : {
            ...s,
            activeSession: startSession({ id: uid() }),
          },
    );
  }, [study.activeSession]);
  const start = () =>
    mutate((s) => ({
      ...s,
      activeSession: startSession({
        id: uid(),
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        objective: objective.trim() || undefined,
      }),
    }));
  const breakTime =
    p.longBreakEvery > 0 && (study.sessions.length + 1) % p.longBreakEvery === 0
      ? p.longBreakMinutes
      : p.shortBreakMinutes;
  const ringLength = 2 * Math.PI * 136;
  const intervalSeconds = Math.max(1, (a?.status === 'break' ? breakTime : p.focusMinutes) * 60);
  const ringProgress = !a
    ? 0
    : a.status === 'break'
      ? Math.max(0, Math.min(1, (intervalSeconds - elapsed) / intervalSeconds))
      : Math.max(0, Math.min(1, elapsed / intervalSeconds));
  const finish = () => {
    if (!a) return;
    mutate((s) => {
      const result = finishSession(a, s.sessions, {
        reflection: reflection.trim() || undefined,
        outcome: outcome.trim() || undefined,
        coveredMaterial: covered.trim() || undefined,
        unfinishedWork: unfinished.trim() || undefined,
        nextNote: nextNote.trim() || undefined,
        confidenceRating: confidence,
      });
      return { ...s, sessions: result.history, activeSession: null };
    });
    setConfirm(false);
  };
  return (
    <div className="study-focus-wrap">
      <Panel className="study-focus-panel">
        <span className={`study-pill ${a?.status === 'break' ? 'mint' : 'cyan'}`}>
          {a ? tr(a.status[0].toUpperCase() + a.status.slice(1)) : tr('Ready when you are')}
        </span>
        {a ? (
          <>
            <div className={`study-timepiece ${a.status === 'break' ? 'is-break' : ''} ${a.status === 'paused' ? 'is-paused' : ''}`}>
              <svg className="study-timepiece-ring" viewBox="0 0 320 320" aria-hidden="true">
                <defs>
                  <radialGradient id="study-focus-glow">
                    <stop offset="0%" stopColor="var(--study-cyan)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--study-cyan)" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle className="study-timepiece-aura" cx="160" cy="160" r="132" fill="url(#study-focus-glow)" />
                <circle className="study-timepiece-track" cx="160" cy="160" r="136" />
                <circle
                  className="study-timepiece-progress"
                  cx="160"
                  cy="160"
                  r="136"
                  strokeDasharray={ringLength}
                  strokeDashoffset={ringLength * (1 - ringProgress)}
                  transform="rotate(-90 160 160)"
                />
                <circle className="study-timepiece-inner" cx="160" cy="160" r="112" />
                <circle className="study-timepiece-node" cx="160" cy="24" r="3" />
              </svg>
              <div className="study-timer" aria-live="off">
                {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:
                {String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:
                {String(Math.floor(elapsed % 60)).padStart(2, '0')}
              </div>
            </div>
            <p className="study-focus-context">
              {study.subjects.find((s) => s.id === a.subjectId)?.name || tr('Independent study')}
              {a.objective ? ` · ${a.objective}` : ''}
            </p>
            {Number.isFinite(Date.parse(a.startedAt)) && (
              <p className="study-focus-started">
                {tr('Started at')} {new Date(a.startedAt).toLocaleTimeString()}
              </p>
            )}
            <details className="study-session-context" open={Boolean(a.subjectId || a.topicId || a.objective)}>
              <summary>
                {tr('Subject')} · {tr('Topic')}
              </summary>
              <div className="study-form-grid">
                <label>
                  {tr('Subject')}
                  <select
                    value={a.subjectId || ''}
                    onChange={(event) =>
                      mutate((s) => ({
                        ...s,
                        activeSession: s.activeSession
                          ? { ...s.activeSession, subjectId: event.target.value || undefined, topicId: undefined }
                          : null,
                      }))
                    }
                  >
                    <option value="">{tr('Independent study')}</option>
                    {study.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr('Topic')}
                  <select
                    value={a.topicId || ''}
                    onChange={(event) =>
                      mutate((s) => ({
                        ...s,
                        activeSession: s.activeSession
                          ? { ...s.activeSession, topicId: event.target.value || undefined }
                          : null,
                      }))
                    }
                  >
                    <option value="">{tr('Choose a topic (optional)')}</option>
                    {study.topics
                      .filter((topic) => !a.subjectId || topic.subjectId === a.subjectId)
                      .map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="study-wide">
                  {tr('Objective')}
                  <input
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    onBlur={() => {
                      if (objective === (a.objective || '')) return;
                      mutate((s) => ({
                        ...s,
                        activeSession: s.activeSession
                          ? { ...s.activeSession, objective: objective.trim() || undefined }
                          : null,
                      }));
                    }}
                    maxLength={160}
                    placeholder={tr('What will you work on?')}
                  />
                </label>
              </div>
            </details>
            {invalid && (
              <p role="alert" className="study-error">
                Session time data looks invalid. Review or discard this session; time may be
                incomplete.
              </p>
            )}
            {a.status === 'recovery' && (
              <div role="alert" className="study-error">
                {tr('The session needs recovery after an interruption.')}{' '}
                <button
                  className="study-primary"
                  onClick={() =>
                    mutate((s) => ({ ...s, activeSession: resolveRecovery(a, 'resume') }))
                  }
                >
                  {tr('Resume from now')}
                </button>{' '}
                <button className="study-danger" onClick={() => setDiscarding(true)}>
                  {tr('Discard session…')}
                </button>
              </div>
            )}
            <div className="study-actions">
              {discarding && (
                <div
                  className="study-modal"
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setDiscarding(false);
                  }}
                >
                  <div
                    ref={discardDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="study-discard-session-title"
                    tabIndex={-1}
                  >
                    <h3 id="study-discard-session-title">{tr('Discard this session?')}</h3>
                    <p>{tr('No session record will be saved.')}</p>
                    <button
                      type="button"
                      className="study-danger"
                      onClick={() => {
                        mutate((s) => ({ ...s, activeSession: discardSession(a) }));
                        setDiscarding(false);
                      }}
                    >
                    {tr('Discard session')}
                    </button>
                    <button type="button" className="study-secondary" onClick={() => setDiscarding(false)}>
                      {tr('Cancel')}
                    </button>
                  </div>
                </div>
              )}
              {a.status === 'running' ? (
                <button
                  className="study-secondary"
                  onClick={() => mutate((s) => ({ ...s, activeSession: pauseSession(a) }))}
                >
                  Pause
                </button>
              ) : a.status === 'paused' ? (
                <button
                  className="study-primary"
                  onClick={() => mutate((s) => ({ ...s, activeSession: resumeSession(a) }))}
                >
                  Resume
                </button>
              ) : null}
              {a.status === 'running' && (
                <button
                  className="study-secondary"
                  onClick={() =>
                    mutate((s) => ({
                      ...s,
                      activeSession: startBreak(a, Date.now(), breakTime * 60),
                    }))
                  }
                >
                    {tr('Take {minutes} min break').replace('{minutes}', String(breakTime))}
                </button>
              )}
              {a.status === 'break' && (
                <>
                  <button
                    className="study-primary"
                    onClick={() => mutate((s) => ({ ...s, activeSession: skipBreak(a) }))}
                  >
                    Finish break
                  </button>
                  <button
                    className="study-secondary"
                    onClick={() => mutate((s) => ({ ...s, activeSession: extendBreak(a, 60) }))}
                  >
                    {tr('+1 min')}
                  </button>
                </>
              )}
              {!confirm ? (
                <button className="study-danger" onClick={() => setConfirm(true)}>
                  Finish session
                </button>
              ) : (
                <div className="study-reflection">
                  <label>
                    Reflection
                    <textarea
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      maxLength={1000}
                      placeholder={tr('How did this session go?')}
                    />
                  </label>
                  <label>
                    Covered material (optional)
                    <textarea
                      value={covered}
                      onChange={(e) => setCovered(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <label>
                    {tr('Confidence (1–5)')}
                    <select
                      value={confidence}
                      onChange={(e) => setConfidence(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </label>
                  <label>
                    Outcome
                    <input
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      maxLength={1000}
                      placeholder={tr('What went well or changed?')}
                    />
                  </label>
                  <label>
                    Unfinished work
                    <textarea
                      value={unfinished}
                      onChange={(e) => setUnfinished(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <label>
                    Next note
                    <textarea
                      value={nextNote}
                      onChange={(e) => setNextNote(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                    <button className="study-primary" onClick={finish}>
                    {tr('Save & finish')}
                  </button>
                    <button className="study-secondary" onClick={() => setConfirm(false)}>
                    {tr('Keep going')}
                  </button>
                    <button className="study-danger" onClick={() => setDiscarding(true)}>
                    {tr('Discard…')}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="study-timer">{String(p.focusMinutes).padStart(2, '0')}:00</div>
            <p className="study-focus-context">
              A timestamp-based focus timer. It records elapsed time, not attention.
            </p>
            <div className="study-form-grid">
              <label>
                Subject
                <select value={subjectId} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">{tr('Independent study')}</option>
                  {study.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Topic
                <select value={topicId} onChange={(e) => setTopic(e.target.value)}>
                  <option value="">{tr('Choose a topic (optional)')}</option>
                  {study.topics
                    .filter((t) => !subjectId || t.subjectId === subjectId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="study-wide">
                Objective
                <input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  maxLength={160}
                  placeholder={tr('What will you work on?')}
                />
              </label>
            </div>
            <button className="study-primary study-start" onClick={start}>
              Begin focus session
            </button>
          </>
        )}
      </Panel>
      <details className="study-recent-panel study-panel">
        <summary>
          {tr('Recent sessions')} <span>({study.sessions.length})</span>
        </summary>
        {study.sessions.length ? (
          study.sessions.slice(0, 8).map((s) => (
            <div className="study-list-row" key={s.id}>
              <span>
                {study.subjects.find((x) => x.id === s.subjectId)?.name || tr('Independent study')}
              </span>
              <small>
                {mins(s.focusSeconds)} · {new Date(s.endedAt).toLocaleString()}
              </small>
            </div>
          ))
        ) : (
          <p className="study-muted">{tr('Your first completed session will be recorded here.')}</p>
        )}
      </details>
    </div>
  );
}
function Subjects({
  study,
  update,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  const [name, setName] = useState(''),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [confirm, setConfirm] = useState<StudySubject | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirm(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [confirm]);
  const add = () => {
    if (!name.trim()) return;
    update((s) => ({
      ...s,
      subjects: [
        ...s.subjects,
        { id: uid(), name: name.trim(), createdAt: stamp(), sortOrder: s.subjects.length },
      ],
    }));
    setName('');
  };
  const visible = study.subjects
    .filter(
      (s) =>
        !!s.archived === archived &&
        `${s.name} ${study.courses
          .filter((c) => c.subjectId === s.id)
          .map((c) => c.name)
          .join(' ')} ${study.topics
          .filter((t) => t.subjectId === s.id)
          .map((t) => t.name)
          .join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return (
    <>
      <div className="study-grid">
        <Panel>
          <h3>{tr('Build your subject map')}</h3>
          <p className="study-muted">
            Subjects contain courses or books, chapters, and topics. Archiving retains every linked
            record.
          </p>
          <form
            className="study-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={tr('e.g. Biology')}
              aria-label={tr('Subject name')}
            />
            <button className="study-primary">{tr('Add subject')}</button>
          </form>
          <label className="study-search">
            Search the subject tree
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Find subjects, courses, chapters, topics')}
            />
          </label>
          <button className="study-secondary" onClick={() => setArchived(!archived)}>
            {archived ? 'Show active subjects' : 'Show archived subjects'}
          </button>
        </Panel>
        {visible.map((s) => (
          <SubjectCard
            key={s.id}
            subject={s}
            study={study}
            update={update}
            requestArchive={() => setConfirm(s)}
          />
        ))}
        {!visible.length && (
          <Panel>
            <Empty
              title={archived ? 'No archived subjects' : 'No matches yet'}
              body={
                archived
                  ? 'Archived subjects will remain here until restored.'
                  : 'Add a subject or adjust your search.'
              }
            />
          </Panel>
        )}
      </div>
      {confirm && (
        <div
          className="study-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div>
            <h3 id="archive-title">{tr('Archive')} “{confirm.name}”?</h3>
            <p>
              Its courses, chapters, topics, notes, and sessions will be retained. You can restore
              the subject later.
            </p>
            <button
              className="study-danger"
              onClick={() => {
                update((s) => ({
                  ...s,
                  subjects: s.subjects.map((x) =>
                    x.id === confirm.id ? { ...x, archived: true } : x,
                  ),
                }));
                setConfirm(null);
              }}
            >
              Archive subject
            </button>{' '}
            <button autoFocus className="study-secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function SubjectCard({
  subject,
  study,
  update,
  requestArchive,
}: {
  subject: StudySubject;
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
  requestArchive: () => void;
}) {
  const [editing, setEditing] = useState<{
      id: string;
      type: 'subject' | 'course' | 'chapter' | 'topic';
      value: string;
    } | null>(null),
    [courseName, setCourseName] = useState(''),
    [chapterName, setChapterName] = useState(''),
    [topicName, setTopicName] = useState(''),
    [kind, setKind] = useState<'course' | 'book'>('course');
  const begin = (id: string, type: 'subject' | 'course' | 'chapter' | 'topic', value: string) =>
    setEditing({ id, type, value });
  const save = () => {
    if (!editing?.value.trim()) return;
    const value = editing.value.trim();
    update((s) => ({
      ...s,
      subjects: s.subjects.map((x) =>
        x.id === editing.id && editing.type === 'subject' ? { ...x, name: value } : x,
      ),
      courses: s.courses.map((x) =>
        x.id === editing.id && editing.type === 'course' ? { ...x, name: value } : x,
      ),
      chapters: s.chapters.map((x) =>
        x.id === editing.id && editing.type === 'chapter' ? { ...x, name: value } : x,
      ),
      topics: s.topics.map((x) =>
        x.id === editing.id && editing.type === 'topic' ? { ...x, name: value } : x,
      ),
    }));
    setEditing(null);
  };
  const order = (
    type: 'subject' | 'course' | 'chapter' | 'topic',
    id: string,
    parentId: string | undefined,
    delta: number,
  ) =>
    update((s) => {
      const key =
        type === 'subject'
          ? 'subjects'
          : type === 'course'
            ? 'courses'
            : type === 'chapter'
              ? 'chapters'
              : 'topics';
      type Row = {
        id: string;
        sortOrder?: number;
        subjectId?: string;
        courseId?: string;
        chapterId?: string;
      };
      const all = s[key] as Row[];
      const arr = all
        .filter((x) =>
          type === 'subject'
            ? true
            : type === 'course'
              ? x.subjectId === parentId
              : type === 'chapter'
                ? x.courseId === parentId
                : x.chapterId === parentId,
        )
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const i = arr.findIndex((x) => x.id === id),
        j = i + delta;
      if (i < 0 || j < 0 || j >= arr.length) return s;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const updates = new Map(arr.map((x, k) => [x.id, k]));
      return {
        ...s,
        [key]: all.map((x) => (updates.has(x.id) ? { ...x, sortOrder: updates.get(x.id) } : x)),
      };
    });
  const courses = study.courses
    .filter((c) => c.subjectId === subject.id)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const archive = (collection: 'courses' | 'chapters' | 'topics', id: string, arch: boolean) =>
    update((s) => ({
      ...s,
      [collection]: s[collection].map((x) => (x.id === id ? { ...x, archived: arch } : x)),
    }));
  const controls = (
    type: 'subject' | 'course' | 'chapter' | 'topic',
    id: string,
    label: string,
    parent: string | undefined,
    isArchived = false,
  ) => (
    <>
      <button className="study-text-button" onClick={() => begin(id, type, label)}>
        Edit
      </button>
      <button
        className="study-text-button"
        aria-label={`Move ${label} up`}
        onClick={() => order(type, id, parent, -1)}
      >
        ↑
      </button>
      <button
        className="study-text-button"
        aria-label={`Move ${label} down`}
        onClick={() => order(type, id, parent, 1)}
      >
        ↓
      </button>
      {type !== 'subject' && (
        <button
          className="study-secondary"
          onClick={() =>
            archive(
              type === 'course' ? 'courses' : type === 'chapter' ? 'chapters' : 'topics',
              id,
              !isArchived,
            )
          }
        >
          {isArchived ? 'Restore' : 'Archive'}
        </button>
      )}
    </>
  );
  return (
    <Panel>
      <div className="study-panel-head">
        <div>
          <span className="study-pill">{tr('SUBJECT')}</span>
          {editing?.type === 'subject' && editing.id === subject.id ? (
            <input
              aria-label={tr('Edit subject name')}
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            />
          ) : (
            <h3>{subject.name}</h3>
          )}
        </div>
        {editing?.type === 'subject' && editing.id === subject.id ? (
          <>
            <button className="study-primary" onClick={save}>
              Save
            </button>
            <button className="study-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {controls('subject', subject.id, subject.name, undefined)}
            <button
              className="study-secondary"
              onClick={() =>
                subject.archived
                  ? update((s) => ({
                      ...s,
                      subjects: s.subjects.map((x) =>
                        x.id === subject.id ? { ...x, archived: false } : x,
                      ),
                    }))
                  : requestArchive()
              }
            >
              {subject.archived ? 'Restore' : 'Archive'}
            </button>
          </>
        )}
      </div>
      {!subject.archived && (
        <>
          <form
            className="study-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!courseName.trim()) return;
              update((s) => ({
                ...s,
                courses: [
                  ...s.courses,
                  {
                    id: uid(),
                    subjectId: subject.id,
                    name: courseName.trim(),
                    kind,
                    sortOrder: courses.length,
                    createdAt: stamp(),
                  },
                ],
              }));
              setCourseName('');
            }}
          >
            <input
              aria-label={tr('Course or book title')}
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder={tr('Course or book title')}
              maxLength={100}
            />
            <select
              aria-label={tr('Course or book')}
              value={kind}
              onChange={(e) => setKind(e.target.value as 'course' | 'book')}
            >
              <option value="course">{tr('Course')}</option>
              <option value="book">{tr('Book')}</option>
            </select>
            <button className="study-secondary">{tr('Add')}</button>
          </form>
          {courses.map((c) => {
            const chapters = study.chapters
              .filter((ch) => ch.courseId === c.id)
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            return (
              <div className="study-tree-course" key={c.id}>
                <div className="study-list-row">
                  {editing?.type === 'course' && editing.id === c.id ? (
                    <>
                      <input
                        aria-label={tr('Edit course or book name')}
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      />
                      <button className="study-primary" onClick={save}>
                        Save
                      </button>
                      <button className="study-secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>
                        {c.archived ? 'Archived · ' : ''}
                        {c.kind === 'book' ? 'Book' : 'Course'}: {c.name}
                      </strong>
                      {controls('course', c.id, c.name, subject.id, !!c.archived)}
                    </>
                  )}
                </div>
                <form
                  className="study-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chapterName.trim()) return;
                    update((s) => ({
                      ...s,
                      chapters: [
                        ...s.chapters,
                        {
                          id: uid(),
                          courseId: c.id,
                          subjectId: subject.id,
                          name: chapterName.trim(),
                          sortOrder: chapters.length,
                          createdAt: stamp(),
                        },
                      ],
                    }));
                    setChapterName('');
                  }}
                >
                  <input
                    aria-label={`Chapter for ${c.name}`}
                    value={chapterName}
                    onChange={(e) => setChapterName(e.target.value)}
                    placeholder={`Add chapter to ${c.name}`}
                  />
                  <button className="study-secondary">{tr('Add chapter')}</button>
                </form>
                {chapters.map((ch) => (
                  <div className="study-tree-chapter" key={ch.id}>
                    <div className="study-list-row">
                      {editing?.type === 'chapter' && editing.id === ch.id ? (
                        <>
                          <input
                            aria-label={tr('Edit chapter name')}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          />
                          <button className="study-primary" onClick={save}>
                            Save
                          </button>
                          <button className="study-secondary" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span>
                            {ch.archived ? 'Archived · ' : ''}Chapter · {ch.name}
                          </span>
                          {controls('chapter', ch.id, ch.name, c.id, !!ch.archived)}
                        </>
                      )}
                    </div>
                    {study.topics
                      .filter((t) => t.chapterId === ch.id)
                      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                      .map((t) => (
                        <div className="study-list-row study-tree-topic" key={t.id}>
                          {editing?.type === 'topic' && editing.id === t.id ? (
                            <>
                              <input
                                aria-label={tr('Edit topic name')}
                                value={editing.value}
                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              />
                              <button className="study-primary" onClick={save}>
                                Save
                              </button>
                              <button className="study-secondary" onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span>
                                {t.archived ? 'Archived · ' : ''}
                                {t.name}
                              </span>
                              {controls('topic', t.id, t.name, ch.id, !!t.archived)}
                              <select
                                aria-label={`Status for ${t.name}`}
                                value={t.status}
                                onChange={(e) =>
                                  update((s) => ({
                                    ...s,
                                    topics: s.topics.map((x) =>
                                      x.id === t.id
                                        ? { ...x, status: e.target.value as StudyTopic['status'] }
                                        : x,
                                    ),
                                  }))
                                }
                              >
                                {[
                                  'Not Started',
                                  'Learning',
                                  'Practicing',
                                  'Needs Review',
                                  'Mastered',
                                ].map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                      ))}
                    <form
                      className="study-inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!topicName.trim()) return;
                        update((s) => ({
                          ...s,
                          topics: [
                            ...s.topics,
                            {
                              id: uid(),
                              subjectId: subject.id,
                              chapterId: ch.id,
                              name: topicName.trim(),
                              status: 'Not Started',
                              sortOrder: s.topics.filter((t) => t.chapterId === ch.id).length,
                              createdAt: stamp(),
                            },
                          ],
                        }));
                        setTopicName('');
                      }}
                    >
                      <input
                        aria-label={`Topic for ${ch.name}`}
                        value={topicName}
                        onChange={(e) => setTopicName(e.target.value)}
                        placeholder={tr('Add topic')}
                      />
                      <button className="study-secondary">{tr('Add topic')}</button>
                    </form>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </Panel>
  );
}
function Notebooks({
  study,
  update,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  const [q, setQ] = useState(''),
    [selected, setSelected] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [archived, setArchived] = useState(false);
  const add = () => {
    const n: StudyNotebook = {
      id: uid(),
      title: newTitle.trim() || 'Untitled notebook',
      createdAt: stamp(),
      pages: [],
    };
    update((s) => ({ ...s, notebooks: [n, ...s.notebooks] }));
    setSelected(n.id);
    setNewTitle('');
  };
  const changeTitle = (id: string, title: string) =>
    update((s) => ({
      ...s,
      notebooks: s.notebooks.map((n) => (n.id === id ? { ...n, title, updatedAt: stamp() } : n)),
    }));
  const matching = study.notebooks.filter(
    (n) =>
      !!n.archived === archived &&
      `${n.title} ${n.pages.map((p) => p.title + ' ' + p.blocks.map((b) => (b.type === 'divider' ? '' : b.text)).join(' ')).join(' ')}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const active = study.notebooks.find((n) => n.id === selected && !n.archived);
  return (
    <div className="study-grid study-notebooks-grid">
      <Panel>
        <div className="study-panel-head">
          <div>
            <span className="study-pill">{tr('NOTEBOOKS')}</span>
            <h3>{tr('Think on paper')}</h3>
          </div>
        </div>
        {!archived && (
          <form
            className="study-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={tr('New notebook title')}
              aria-label={tr('New notebook title')}
            />
            <button className="study-primary">{tr('Create')}</button>
          </form>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Search titles and page content')}
          aria-label={tr('Search notebooks and content')}
        />
        <button className="study-secondary" onClick={() => setArchived(!archived)}>
          {archived ? 'Show active notebooks' : 'Show archived notebooks'} (
          {study.notebooks.filter((n) => !!n.archived === !archived).length})
        </button>
        {matching.map((n) => (
          <div className="study-notebook-list-item" key={n.id}>
            <button
              className={`study-notebook-row ${n.id === selected ? 'active' : ''}`}
              onClick={() => setSelected(n.id)}
              disabled={!!n.archived}
            >
              {n.title}
              <small>{n.pages.length} {tr('pages')}</small>
            </button>
            <button
              className="study-secondary"
              aria-label={`${n.archived ? 'Restore' : 'Archive'} ${n.title}`}
              onClick={() => {
                update((s) => ({
                  ...s,
                  notebooks: s.notebooks.map((x) =>
                    x.id === n.id ? { ...x, archived: !n.archived, updatedAt: stamp() } : x,
                  ),
                }));
                if (n.id === selected) setSelected('');
              }}
            >
              {n.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        ))}
        {!matching.length && (
          <Empty
            title="No notebooks found"
            body={
              q
                ? 'Try another search.'
                : 'Create a notebook to keep notes and vector canvases together.'
            }
          />
        )}
      </Panel>
      {active && (
        <Panel className="study-notebook-panel">
          <label>
            Notebook title
            <input
              aria-label={tr('Notebook title')}
              value={active.title}
              maxLength={100}
              onChange={(e) => changeTitle(active.id, e.target.value)}
            />
          </label>
          <label>
            Subject
            <select
              value={active.subjectId || ''}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  notebooks: s.notebooks.map((n) =>
                    n.id === active.id
                      ? { ...n, subjectId: e.target.value || undefined, topicId: undefined }
                      : n,
                  ),
                }))
              }
            >
              <option value="">{tr('No subject')}</option>
              {study.subjects
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Topic
            <select
              value={active.topicId || ''}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  notebooks: s.notebooks.map((n) =>
                    n.id === active.id ? { ...n, topicId: e.target.value || undefined } : n,
                  ),
                }))
              }
            >
              <option value="">{tr('No topic')}</option>
              {study.topics
                .filter((t) => !active.subjectId || t.subjectId === active.subjectId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <StudyNotebookEditor study={study} update={update} notebook={active} />
        </Panel>
      )}
    </div>
  );
}
function Practice({
  study,
  update,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  const [front, setFront] = useState(''),
    [back, setBack] = useState(''),
    [subjectId, setSubjectId] = useState(''),
    [topicId, setTopicId] = useState('');
  const due = study.flashcards.filter((c) => !c.dueAt || Date.parse(c.dueAt) <= Date.now());
  const make = () => {
    if (!front.trim() || !back.trim()) return;
    update((s) => ({
      ...s,
      flashcards: [
        {
          id: uid(),
          front: front.trim(),
          back: back.trim(),
          subjectId: subjectId || undefined,
          topicId: topicId || undefined,
          createdAt: stamp(),
          intervalDays: 0,
          ease: 2.5,
          repetitions: 0,
          reviewHistory: [],
        },
        ...s.flashcards,
      ],
    }));
    setFront('');
    setBack('');
    setSubjectId('');
    setTopicId('');
  };
  return (
    <div className="study-grid">
      <Panel>
        <span className="study-pill mint">{tr('Due now')} · {due.length}</span>
        <h3>{tr('Practice retrieval')}</h3>
        {due.length ? (
          <FlashReview card={due[0]} update={update} />
        ) : (
          <p className="study-muted">{tr('Nothing due right now. Add a question and answer to begin.')}</p>
        )}
      </Panel>
      <Panel>
        <h3>{tr('Create a card')}</h3>
        <label>
          Subject
          <select
            aria-label={tr('Flashcard subject')}
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId('');
            }}
          >
            <option value="">{tr('Independent study')}</option>
            {study.subjects.filter((subject) => !subject.archived).map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <select
            aria-label={tr('Flashcard topic')}
            value={topicId}
            disabled={!subjectId}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">{tr('No topic')}</option>
            {study.topics
              .filter((topic) => !topic.archived && topic.subjectId === subjectId)
              .map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </label>
        <label>
          Question
          <textarea value={front} onChange={(e) => setFront(e.target.value)} maxLength={2000} />
        </label>
        <label>
          Answer
          <textarea value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} />
        </label>
        <button className="study-primary" onClick={make}>
          Add flashcard
        </button>
      </Panel>
      <Panel>
        <h3>{tr('All cards')} · {study.flashcards.length}</h3>
        {study.flashcards.slice(0, 30).map((c) => (
          <div className="study-list-row" key={c.id}>
            <span>
              {c.front}
              <small>
                {study.subjects.find((subject) => subject.id === c.subjectId)?.name || 'Independent study'}
                {c.topicId ? ` · ${study.topics.find((topic) => topic.id === c.topicId)?.name || 'Topic'}` : ''}
              </small>
            </span>
            <small>{c.dueAt ? `${tr('Due')} ${new Date(c.dueAt).toLocaleDateString()}` : tr('New')}</small>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function FlashReview({
  card,
  update,
}: {
  card: StudyFlashcard;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="study-review-card">
      <p>{revealed ? card.back : card.front}</p>
      {!revealed ? (
        <button className="study-primary" onClick={() => setRevealed(true)}>
          Reveal answer
        </button>
      ) : (
        <div className="study-actions">
          {(['Again', 'Hard', 'Good', 'Easy'] as const).map((g) => (
            <button
              className="study-secondary"
              key={g}
              onClick={() => {
                update((s) => {
                  const result = scheduleReview(card, g);
                  return {
                    ...s,
                    flashcards: s.flashcards.map((c) => (c.id === card.id ? result.card : c)),
                  };
                });
                setRevealed(false);
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <small>
        {card.reviewHistory.length} reviews · last{' '}
        {card.reviewHistory.length
          ? new Date(
              card.reviewHistory[card.reviewHistory.length - 1].reviewedAt,
            ).toLocaleDateString()
          : 'not reviewed'}
      </small>
    </div>
  );
}
function Revision({
  study,
  update,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
}) {
  return (
    <div className="study-grid">
      <Panel>
        <span className="study-pill mint">{tr('DUE QUEUE')}</span>
        <h3>{tr('Review what’s ready')}</h3>
        {study.flashcards.filter((c) => !c.dueAt || Date.parse(c.dueAt) <= Date.now()).length ? (
          study.flashcards
            .filter((c) => !c.dueAt || Date.parse(c.dueAt) <= Date.now())
            .map((c) => (
              <div className="study-list-row" key={c.id}>
                <span>{c.front}</span>
                <small>{c.dueAt && Date.parse(c.dueAt) < Date.now() ? 'Overdue' : 'Due now'}</small>
              </div>
            ))
        ) : (
          <Empty
            title="Queue is clear"
            body="New cards appear here when they are ready for review."
          />
        )}
      </Panel>
      <Panel>
        <h3>{tr('Review history')}</h3>
        {study.flashcards
          .flatMap((c) => c.reviewHistory.map((r) => ({ ...r, front: c.front })))
          .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
          .slice(0, 30)
          .map((r) => (
            <div className="study-list-row" key={r.id}>
              <span>{r.front}</span>
              <small>
                {r.grade} · {new Date(r.reviewedAt).toLocaleDateString()}
              </small>
            </div>
          ))}
      </Panel>
    </div>
  );
}
function Analytics({ study }: { study: StudyState }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - 6);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const key = dateKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      seconds: study.sessions
        .filter((s) => dateKey(new Date(s.endedAt)) === key && Date.parse(s.endedAt) <= Date.now())
        .reduce((n, s) => n + s.focusSeconds, 0),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.seconds));
  const reviews = study.flashcards.flatMap((c) => c.reviewHistory);
  const positive = reviews.filter((r) => r.grade !== 'Again').length;
  return (
    <div className="study-grid">
      <Panel>
        <span className="study-pill cyan">{tr('SAVED RECORDS')}</span>
        <h3>{tr('Focus, day by day')}</h3>
        <p className="study-muted">{tr('Tracked timer time, not observed attention.')}</p>
        {study.sessions.length ? (
          <svg
            className="study-chart"
            viewBox="0 0 700 230"
            role="img"
            aria-label={tr('Focus minutes by day for the last seven days')}
          >
            {days.map((d, i) => {
              const h = (d.seconds / max) * 150;
              return (
                <g key={d.key}>
                  <rect
                    x={32 + i * 94}
                    y={180 - h}
                    width="44"
                    height={h}
                    rx="8"
                    fill="var(--study-cyan)"
                  />
                  <text x={54 + i * 94} y="205" textAnchor="middle">
                    {d.label}
                  </text>
                  <text x={54 + i * 94} y={Math.max(15, 170 - h)} textAnchor="middle">
                    {Math.round(d.seconds / 60)}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <Empty
            title="Your first week is unwritten"
            body="Complete focus sessions to see a real weekly view."
          />
        )}
      </Panel>
      <Panel>
        <h3>{tr('Recorded totals')}</h3>
        <div className="study-metrics">
          <div>
            <small>{tr('Sessions')}</small>
            <strong>{study.sessions.length}</strong>
          </div>
          <div>
            <small>{tr('Focus time')}</small>
            <strong>{mins(study.sessions.reduce((n, s) => n + s.focusSeconds, 0))}</strong>
          </div>
          <div>
          <small>{tr('Reviews')}</small>
          <strong>{reviews.length}</strong>
        </div>
        <div>
          <small>{tr('Successful recall')}</small>
          <strong>{reviews.length ? Math.round((positive / reviews.length) * 100) : 0}%</strong>
          </div>
        </div>
        <p className="study-muted">
          Recall percentage reflects self-ratings only; it is not a measure of mastery.
        </p>
      </Panel>
    </div>
  );
}
function Settings({
  study,
  update,
  globalSounds,
  onSounds,
}: {
  study: StudyState;
  update: (fn: (s: StudyState) => StudyState) => void;
  globalSounds?: boolean;
  onSounds: (n: boolean) => void;
}) {
  const p = study.preferences;
  const field = (key: keyof typeof p, label: string, help: string) => (
    <label>
      {label}
      <input
        type="number"
        min={1}
        max={key === 'longBreakEvery' ? 20 : 1440}
        value={p[key] as number}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 1)
            update((s) => ({
              ...s,
              preferences: {
                ...s.preferences,
                [key]: Math.min(key === 'longBreakEvery' ? 20 : 1440, Math.round(n)),
              },
            }));
        }}
      />
      <small>{tr(help)}</small>
    </label>
  );
  return (
    <Panel>
      <span className="study-pill">{tr('STUDY PREFERENCES')}</span>
      <h3>{tr('Set a kind, workable rhythm')}</h3>
      <div className="study-form-grid">
        {field('focusMinutes', 'Focus interval', 'Minutes per focus segment, from 1 to 1,440.')}
        {field('shortBreakMinutes', 'Short break', 'Minutes for the shorter reset.')}
        {field('longBreakMinutes', 'Long break', 'Minutes for the longer reset.')}
        {field('longBreakEvery', 'Long break cadence', 'Focus sessions between long breaks.')}
        {field('dailyTargetMinutes', 'Daily focus target', 'A personal guide, not a score.')}
        {field('weeklyTargetMinutes', 'Weekly focus target', 'A weekly intention in minutes.')}
      </div>
      <label className="study-sound">
        <input
          type="checkbox"
          checked={!!globalSounds}
          onChange={(e) => onSounds(e.target.checked)}
        />{' '}
        Use Life OS sound preference
      </label>
    </Panel>
  );
}
