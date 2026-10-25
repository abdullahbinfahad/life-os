import { translate as tr } from '../lib/locales';
import { Award, CheckCircle2, Heart, TrendingUp, Zap, CalendarDays, BarChart3 } from 'lucide-react';
import { PageHeader, Progress, Stat, STATUS_META } from '../components/ui';
import { useStore } from '../lib/store';
import { addDays, daysBetween, pct, today } from '../lib/utils';
import { useMemo, useState } from 'react';

type WindowDays = 30 | 90;

export default function Insights() {
  const [shareStatus, setShareStatus] = useState('');
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const { items, goals, habits, projects, journal, categories } = useStore();
  const t = today();
  const done = items.filter((i) => i.status === 'done');
  const projectTasks = projects.flatMap((project) => project.tasks);
  const doneProjectTasks = projectTasks.filter((task) => task.done);
  const completedRecords = [...done, ...doneProjectTasks];
  const trackedCount = items.length + projectTasks.length;
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(t, -i * 7);
    const start = addDays(end, -6);
    const n = completedRecords.filter((x) => x.completedAt && x.completedAt.slice(0, 10) >= start && x.completedAt.slice(0, 10) <= end).length;
    return { label: start.slice(5), n, start, end };
  }).reverse();
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const thisMonth = completedRecords.filter((x) => x.completedAt?.slice(0, 7) === t.slice(0, 7)).length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitRates = activeHabits.map((h) => {
    const created = h.createdAt?.slice(0, 10) || addDays(t, -29);
    const activeDays = Math.max(0, Math.min(30, daysBetween(created, t) + 1));
    const actual = new Set(h.log.filter((d) => d >= addDays(t, -29) && d <= t && d >= created)).size;
    const expected = h.frequency === 'daily' ? activeDays : activeDays * h.targetPerWeek / 7;
    return expected ? Math.min(100, actual / expected * 100) : 0;
  });
  const habitRate = activeHabits.length ? Math.round(habitRates.reduce((sum, rate) => sum + rate, 0) / activeHabits.length) : 0;
  const statusCounts = Object.keys(STATUS_META).map((s) => ({ s, n: items.filter((i) => i.status === s).length }));
  const periodStart = addDays(t, -(windowDays - 1));
  const previousStart = addDays(t, -(windowDays * 2 - 1));
  const inWindow = (date?: string, start = periodStart, end = t) => !!date && date.slice(0, 10) >= start && date.slice(0, 10) <= end;
  const periodCompletions = completedRecords.filter((record) => inWindow(record.completedAt));
  const previousCompletions = completedRecords.filter((record) => inWindow(record.completedAt, previousStart, addDays(periodStart, -1)));
  const comparison = periodCompletions.length - previousCompletions.length;
  const moods = journal.filter((j) => j.date >= periodStart && j.date <= t);
  const avgMood = moods.length ? (moods.reduce((a, j) => a + j.mood, 0) / moods.length).toFixed(1) : '—';
  const catStats = categories.map((c) => {
    const ci = items.filter((i) => i.categoryId === c.id);
    return { c, total: ci.length, done: ci.filter((i) => i.status === 'done').length };
  }).sort((a, b) => b.total - a.total);
  const visibleCatStats = catStats.filter((x) => x.total > 0);
  const neglected = catStats.filter((x) => x.total >= 5 && pct(x.done, x.total) < 10).slice(0, 3);
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  const datedCompletions = completedRecords.flatMap((record) => record.completedAt ? [record.completedAt.slice(0, 10)] : []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  datedCompletions.forEach((date) => { dowCounts[new Date(`${date}T12:00:00`).getDay()] += 1; });
  const bestDowCount = Math.max(...dowCounts);
  const bestDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].filter((_, index) => dowCounts[index] === bestDowCount && bestDowCount > 0);
  const weekdayPatternReady = datedCompletions.length >= 5 && bestDays.length === 1;
  const shareInsights = async () => {
    const payload = `${tr('Life insights')}\n${tr('Period')}: ${tr('All time')} / ${tr('last 30 days')}\n${tr('Completed (all time)')}: ${done.length}\n${tr('Habit consistency')}: ${habitRate}%\n${tr('Goals achieved')}: ${goals.filter((g) => g.status === 'done').length}`;
    setShareStatus('');
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text: payload }); setShareStatus(tr('Shared successfully.')); return; }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') { setShareStatus(tr('Sharing canceled.')); return; } }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(payload);
      setShareStatus(tr('Share is unavailable; summary copied to clipboard.'));
    } catch { setShareStatus(tr('Sharing and clipboard are unavailable.')); }
  };
  const comparisonText = comparison === 0 ? tr('same as the previous period') : `${Math.abs(comparison)} ${tr('completions')} ${comparison > 0 ? tr('more') : tr('fewer')} ${tr('than the previous period')}`;
  const currentWeek = weeks[weeks.length - 1];
  const previousWeek = weeks[weeks.length - 2];

  return (
    <div className="space-y-6">
      <PageHeader title={tr('Insights')} subtitle={tr('Progress and patterns over time')} actions={<button type="button" className="btn-outline min-h-10" onClick={shareInsights}>{tr('Share')}</button>} />
      {shareStatus && <p className="text-sm muted" role="status" aria-live="polite">{shareStatus}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 sm:gap-4">
        <Stat label={tr('Completed (all time)')} value={completedRecords.length} sub={`${pct(completedRecords.length, trackedCount)}% ${tr('of items and project tasks')}`} icon={<CheckCircle2 size={18} />} color="#22c55e" />
        <Stat label={tr('This month')} value={thisMonth} sub={tr('items and project tasks completed')} icon={<TrendingUp size={18} />} />
        <Stat label={tr('Habit consistency')} value={`${habitRate}%`} sub={`${activeHabits.length} ${tr('active habits')} · ${tr('last 30 days')}`} icon={<Zap size={18} />} color="#f59e0b" />
        <Stat label={tr('Goals achieved')} value={goals.filter((g) => g.status === 'done').length} sub={tr('all time')} icon={<Award size={18} />} color="#a855f7" />
        <Stat label={tr('Average mood (last 30 days)')} value={moods.length ? `${avgMood}/5` : '—'} sub={`${moods.length} ${tr('journal entries')} · ${windowDays} ${tr('days')}`} icon={<Heart size={18} />} color="#ec4899" />
      </div>
      <section className="card p-4 sm:p-5" aria-labelledby="period-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-300"><CalendarDays size={18} /></span><div><h2 id="period-heading" className="font-semibold">{tr('Recent activity')}</h2><p className="mt-1 text-xs muted">{periodStart.slice(5)} – {t.slice(5)} · {periodCompletions.length} {tr('completions')}</p></div></div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="group" aria-label={tr('Date range')}>
            {([30, 90] as const).map((days) => <button key={days} type="button" aria-pressed={windowDays === days} onClick={() => setWindowDays(days)} className={`min-h-10 rounded-lg px-3 text-sm transition-colors motion-reduce:transition-none ${windowDays === days ? 'bg-white font-semibold shadow-sm dark:bg-white/10' : 'muted hover:text-current'}`}>{tr(days === 30 ? 'Past 30 days' : 'Past 90 days')}</button>)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03]"><p className="text-xs muted">{tr('Completions in selected period')}</p><p className="mt-1 text-2xl font-bold">{periodCompletions.length}</p><p className="mt-1 text-xs muted">{comparisonText}</p></div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03]"><p className="text-xs muted">{tr('Journal entries in selected period')}</p><p className="mt-1 text-2xl font-bold">{moods.length}</p><p className="mt-1 text-xs muted">{moods.length ? `${tr('Average mood')}: ${avgMood}/5` : tr('No journal entries in this period.')}</p></div>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card min-w-0 p-4 sm:p-5 lg:col-span-2" aria-labelledby="weekly-heading">
          <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-fuchsia-500/10 p-2 text-fuchsia-600 dark:text-fuchsia-300"><BarChart3 size={18} /></span><div><h2 id="weekly-heading" className="font-semibold">{tr('Completions per week')}</h2><p className="mt-1 text-xs muted">{tr('Last 12 weeks; includes project tasks.')}</p></div></div>
          <div className="grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-12" role="img" aria-label={`${tr('Completions per week')}: ${weeks.map((w) => `${w.label}: ${w.n}`).join(', ')}`}>
            {weeks.map((w, i) => (
              <div key={`${w.start}-${i}`} className="flex min-w-0 flex-col items-center gap-1.5" title={`${w.start} – ${w.end}: ${w.n}`}>
                <span className="text-[10px] tabular-nums muted">{w.n}</span>
                <div className="flex h-28 w-full items-end rounded-t-lg bg-slate-100 dark:bg-white/[0.04]"><div className={`w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-fuchsia-500 motion-safe:transition-[height] motion-safe:duration-500 ${w.start === currentWeek.start ? 'ring-2 ring-indigo-400/50 ring-offset-1 dark:ring-offset-[#12151c]' : ''}`} style={{ height: `${Math.max(w.n ? 8 : 2, (w.n / maxW) * 100)}%` }} /></div>
                <span className="text-[9px] leading-tight muted sm:text-[10px]">{w.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs muted">{tr('Latest week')}: {currentWeek.n} · {tr('previous week')}: {previousWeek.n}</p>
        </section>
        <section className="card p-4 sm:p-5" aria-labelledby="pipeline-heading">
          <h2 id="pipeline-heading" className="mb-4 font-semibold">{tr('Pipeline')}</h2>
          {items.length ? <div className="space-y-4">{statusCounts.map(({ s, n }) => (
            <div key={s}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span>{STATUS_META[s].label}</span><span className="tabular-nums muted">{n} <span className="text-xs">({pct(n, items.length)}%)</span></span></div><Progress value={pct(n, items.length)} color={STATUS_META[s].color} /></div>
          ))}</div> : <p className="text-sm muted">{tr('Add items to start seeing patterns.')}</p>}
        </section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0 p-4 sm:p-5" aria-labelledby="category-heading">
          <h2 id="category-heading" className="mb-1 font-semibold">{tr('By category')}</h2><p className="mb-4 text-xs muted">{tr('Completion rate among items in each category.')}</p>
          {visibleCatStats.length ? <div className="space-y-4">{visibleCatStats.map(({ c, total, done: categoryDone }) => (
            <div key={c.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{c.icon} {c.name}</span><span className="shrink-0 text-xs tabular-nums muted">{categoryDone}/{total} · {pct(categoryDone, total)}%</span></div><Progress value={pct(categoryDone, total)} color={c.color} /></div>
          ))}</div> : <p className="text-sm muted">{tr('No categorized items yet.')}</p>}
        </section>
        <section className="card p-4 sm:p-5" aria-labelledby="patterns-heading">
          <h2 id="patterns-heading" className="mb-4 font-semibold">{tr('Patterns')}</h2>
          <ul className="space-y-3 text-sm">
            {weekdayPatternReady && <li>{tr('📅 You complete the most on')} <b>{bestDays[0]}{tr('s')}</b> ({bestDowCount}/{datedCompletions.length} {tr('dated completions')}, {tr('all time')}).</li>}
            {datedCompletions.length > 0 && datedCompletions.length < 5 && <li className="muted">{tr('Weekday patterns appear after 5 dated completions.')}</li>}
            {datedCompletions.length >= 5 && bestDays.length > 1 && <li className="muted">{tr('Weekday patterns are tied; no single day is ranked.')}</li>}
            {visibleCatStats[0]?.total > 0 && <li>{tr('Largest category by item count:')} <b>{visibleCatStats[0].c.name}</b> ({visibleCatStats[0].total} {tr('items.')})</li>}
            {neglected.length > 0 && <li>{tr('⚠️ Needs attention:')} {neglected.map((n) => <b key={n.c.id} className="mr-1">{n.c.icon} {n.c.name} ({n.done}/{n.total})</b>)}{tr('— under 10% complete.')}</li>}
            {items.filter((i) => i.status === 'someday').length > items.length * 0.7 && items.length > 10 && <li>{tr('💡 Over 70% of your library is “Someday”. Pick 3 items to move to “Next”.')}</li>}
            {activeHabits.length >= 2 && habitRate >= 70 && <li>{tr('🔥 Strong habit consistency — keep it up!')}</li>}
            {activeHabits.length >= 2 && habitRate < 40 && <li>{tr('🌱 Habit consistency is low. Consider fewer, smaller habits.')}</li>}
            {trackedCount === 0 && <li className="muted">{tr('Add items to start seeing patterns.')}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
