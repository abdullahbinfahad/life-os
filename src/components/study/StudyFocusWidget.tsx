import React, { useEffect, useState } from 'react';
import { translate as tr } from '../../lib/locales';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import {
  elapsedSeconds,
  getStudyTimerSnapshot,
  pauseSession,
  resumeSession,
  skipBreak,
} from '../../lib/study/engine';
import type { StudyData } from '../../lib/study/types';
import './StudyFocusWidget.css';

export function StudyFocusWidget() {
  const active = useStore((state) => state.study.activeSession);
  const updateStudy = useStore((state) => state.updateStudy);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [Boolean(active)]);
  if (!active) return null;
  const state = getStudyTimerSnapshot(active, now);
  const seconds =
    state.status === 'break' ? state.breakRemainingSeconds : elapsedSeconds(active, now, 'focus');
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const act = (transform: typeof pauseSession) =>
    updateStudy((study: StudyData) => ({ ...study, activeSession: transform(active) }));
  return (
    <aside
      className={`study-focus-widget ${active.status === 'break' ? 'is-break' : ''}`}
      aria-label={tr('Active study session')}
    >
      <span className="study-widget-dot" />
      <span className="study-widget-time" aria-live="off">
        {time}
      </span>
      <span className="study-widget-state">
        {active.status === 'break'
          ? tr('Break remaining')
          : active.status === 'paused'
            ? tr('Paused')
            : active.status === 'recovery'
              ? tr('Recovery')
              : tr('Focus')}
      </span>
      <div className="study-widget-actions">
        {active.status === 'running' && (
          <button aria-label={tr('Pause study session')} onClick={() => act(pauseSession)}>
            Ⅱ
          </button>
        )}
        {active.status === 'paused' && (
          <button aria-label={tr('Resume study session')} onClick={() => act(resumeSession)}>
            ▶
          </button>
        )}
        {active.status === 'break' && (
          <button aria-label={tr('End break')} onClick={() => act(skipBreak)}>
            ↗
          </button>
        )}
        <Link to="/study/focus" aria-label={tr('Open Focus Room')}>
          ↗
        </Link>
        <Link
          to="/study/focus"
          aria-label={tr('Finish session and add reflection')}
          title={tr('Finish in Focus Room')}
        >
          ■
        </Link>
      </div>
    </aside>
  );
}
export default StudyFocusWidget;
