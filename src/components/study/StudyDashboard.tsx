import { translate as tr } from '../../lib/locales';
import { BookOpenCheck, Brain, Flame, Layers, NotebookPen, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StudyState, StudyStatus } from '../../lib/study/types';
import { CountUp } from '../ui';

const STAGES: { id: StudyStatus; color: string }[] = [
  { id: 'Not Started', color: '#64748b' },
  { id: 'Learning', color: '#38bdf8' },
  { id: 'Practicing', color: '#a78bfa' },
  { id: 'Needs Review', color: '#f59e0b' },
  { id: 'Mastered', color: '#34d399' },
];

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Study Studio overview dashboard: focus rings, 7-day focus chart, mastery donut and KPIs. */
export default function StudyDashboard({ study, todaySeconds, weekSeconds }: { study: StudyState; todaySeconds: number; weekSeconds: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const f = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(f); }, []);
  const prefs = { dailyTargetMinutes: study.preferences?.dailyTargetMinutes || 60, weeklyTargetMinutes: study.preferences?.weeklyTargetMinutes || 300 };
  const data = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const s of study.sessions) { const k = localKey(new Date(s.endedAt)); perDay.set(k, (perDay.get(k) ?? 0) + s.focusSeconds); }
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const k = localKey(d);
      return { key: k, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes: Math.round((perDay.get(k) ?? 0) / 60), today: i === 6 };
    });
    let streak = 0;
    const cursor = new Date();
    if (!perDay.has(localKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (perDay.has(localKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    const topics = study.topics.filter((t) => !t.archived);
    const stages = STAGES.map((s) => ({ ...s, n: topics.filter((t) => t.status === s.id).length }));
    const due = study.flashcards.filter((c) => !c.dueAt || Date.parse(c.dueAt) <= Date.now()).length;
    return { days, streak, stages, topicTotal: topics.length, due };
  }, [study]);

  const maxMin = Math.max(prefs.dailyTargetMinutes, ...data.days.map((d) => d.minutes), 1);
  const todayPct = Math.min(100, Math.round((todaySeconds / 60 / Math.max(1, prefs.dailyTargetMinutes)) * 100));
  const weekPct = Math.min(100, Math.round((weekSeconds / 60 / Math.max(1, prefs.weeklyTargetMinutes)) * 100));
  const mastered = data.stages.find((s) => s.id === 'Mastered')?.n ?? 0;
  const masteryPct = data.topicTotal ? Math.round((mastered / data.topicTotal) * 100) : 0;

  const R = 42; const C = 2 * Math.PI * R;
  let offset = 0;

  return <section className="study-dash" aria-label={tr('Study statistics')}>
    <div className="study-dash-card study-dash-rings">
      <h3>{tr('Focus targets')}</h3>
      <div className="study-dash-ringrow">
        {[{ label: tr('Today'), pct: todayPct, value: Math.round(todaySeconds / 60), target: prefs.dailyTargetMinutes, cls: 'a' }, { label: tr('This week'), pct: weekPct, value: Math.round(weekSeconds / 60), target: prefs.weeklyTargetMinutes, cls: 'b' }].map((ring) => <div key={ring.label} className="study-dash-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r={R} className="track" /><circle cx="50" cy="50" r={R} className={`bar ${ring.cls}`} strokeDasharray={C} strokeDashoffset={C - (ready ? ring.pct : 0) / 100 * C} /></svg>
          <div className="study-dash-ring-label"><b><CountUp value={ring.value} /></b><small>/ {ring.target} {tr('min')}</small></div>
          <span>{ring.label}</span>
        </div>)}
      </div>
    </div>

    <div className="study-dash-card study-dash-chart">
      <h3>{tr('Last 7 days')} <small>{tr('minutes focused')}</small></h3>
      <div className="study-bars" role="img" aria-label={data.days.map((d) => `${d.key}: ${d.minutes} min`).join(', ')}>
        <i className="study-bars-target" style={{ bottom: `${(prefs.dailyTargetMinutes / maxMin) * 100}%` }}><span>{prefs.dailyTargetMinutes}</span></i>
        {data.days.map((d, i) => <div key={d.key} className={`study-bar ${d.today ? 'is-today' : ''}`}>
          <span className="study-bar-fill" style={{ height: `${ready ? Math.max(d.minutes ? 4 : 0, (d.minutes / maxMin) * 100) : 0}%`, transitionDelay: `${i * 60}ms` }}>{d.minutes > 0 && <em>{d.minutes}</em>}</span>
          <small>{d.label}</small>
        </div>)}
      </div>
    </div>

    <div className="study-dash-card study-dash-donut">
      <h3>{tr('Topic mastery')}</h3>
      <div className="study-donut-wrap">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="track" />
          {data.topicTotal > 0 && data.stages.map((s) => { if (!s.n) return null; const len = (s.n / data.topicTotal) * C; const el = <circle key={s.id} cx="50" cy="50" r={R} className="seg" stroke={s.color} strokeDasharray={`${ready ? Math.max(0, len - 1.5) : 0} ${C}`} strokeDashoffset={-offset} />; offset += len; return el; })}
        </svg>
        <div className="study-donut-label"><b><CountUp value={masteryPct} />%</b><small>{tr('mastered')}</small></div>
      </div>
      <ul className="study-donut-legend">{data.stages.map((s) => <li key={s.id}><i style={{ background: s.color }} />{tr(s.id)}<b>{s.n}</b></li>)}</ul>
    </div>

    <div className="study-dash-kpis">
      <div><Flame size={16} /><span>{tr('Focus streak')}</span><b><CountUp value={data.streak} /> <small>{tr('days')}</small></b></div>
      <div><Timer size={16} /><span>{tr('Sessions')}</span><b><CountUp value={study.sessions.length} /></b></div>
      <div><Brain size={16} /><span>{tr('Cards due')}</span><b><CountUp value={data.due} /></b></div>
      <div><Layers size={16} /><span>{tr('Subjects')}</span><b><CountUp value={study.subjects.filter((s) => !s.archived).length} /></b></div>
      <div><BookOpenCheck size={16} /><span>{tr('Topics')}</span><b><CountUp value={data.topicTotal} /></b></div>
      <div><NotebookPen size={16} /><span>{tr('Notebooks')}</span><b><CountUp value={study.notebooks.length} /></b></div>
    </div>
  </section>;
}
