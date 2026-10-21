import { Award, CheckCircle2, TrendingUp, Zap } from 'lucide-react';
import { PageHeader, Progress, Stat, STATUS_META } from '../components/ui';
import { useStore } from '../lib/store';
import { addDays, daysBetween, pct, today } from '../lib/utils';

export default function Insights() {
  const { items, goals, habits, projects, journal, categories } = useStore();
  const t = today();
  const done = items.filter((i) => i.status === 'done');
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(t, -i * 7);
    const start = addDays(end, -6);
    const n = done.filter((x) => x.completedAt && x.completedAt.slice(0, 10) >= start && x.completedAt.slice(0, 10) <= end).length
      + projects.flatMap((p) => p.tasks).filter((x) => x.completedAt && x.completedAt.slice(0, 10) >= start && x.completedAt.slice(0, 10) <= end).length;
    return { label: start.slice(5), n };
  }).reverse();
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const thisMonth = done.filter((x) => x.completedAt?.slice(0, 7) === t.slice(0, 7)).length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitRates = activeHabits.map((h) => {
    const created = h.createdAt?.slice(0, 10) || addDays(t, -29);
    const activeDays = Math.max(0, Math.min(30, daysBetween(created, t) + 1));
    const actual = h.log.filter((d) => d >= addDays(t, -29) && d <= t && d >= created).length;
    const expected = h.frequency === 'daily' ? activeDays : activeDays * h.targetPerWeek / 7;
    return expected ? Math.min(100, actual / expected * 100) : 0;
  });
  const habitRate = activeHabits.length ? Math.round(habitRates.reduce((sum, rate) => sum + rate, 0) / activeHabits.length) : 0;
  const statusCounts = Object.keys(STATUS_META).map((s) => ({ s, n: items.filter((i) => i.status === s).length }));
  const moods = journal.filter((j) => j.date >= addDays(t, -30));
  const avgMood = moods.length ? (moods.reduce((a, j) => a + j.mood, 0) / moods.length).toFixed(1) : '—';
  const catStats = categories.map((c) => {
    const ci = items.filter((i) => i.categoryId === c.id);
    return { c, total: ci.length, done: ci.filter((i) => i.status === 'done').length };
  }).sort((a, b) => b.total - a.total);
  const neglected = catStats.filter((x) => x.total > 0 && pct(x.done, x.total) < 10).slice(0, 3);
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  done.forEach((d) => d.completedAt && dowCounts[new Date(d.completedAt).getDay()]++);
  const bestDow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dowCounts.indexOf(Math.max(...dowCounts))];

  return (
    <div>
      <PageHeader title="Insights" subtitle="Progress and patterns over time" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completed (all time)" value={done.length} sub={`${pct(done.length, items.length)}% of library`} icon={<CheckCircle2 size={18} />} color="#22c55e" />
        <Stat label="This month" value={thisMonth} sub="items completed" icon={<TrendingUp size={18} />} />
        <Stat label="Habit consistency" value={`${habitRate}%`} sub="last 30 days" icon={<Zap size={18} />} color="#f59e0b" />
        <Stat label="Goals achieved" value={goals.filter((g) => g.status === 'done').length} sub={`avg mood ${avgMood}/5`} icon={<Award size={18} />} color="#a855f7" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Completions per week</h3>
          <div className="flex h-48 items-end gap-2">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] muted">{w.n || ''}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-fuchsia-500 transition-all" style={{ height: `${(w.n / maxW) * 100}%`, minHeight: 3 }} />
                <span className="text-[10px] muted">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">Pipeline</h3>
          <div className="space-y-3">
            {statusCounts.map(({ s, n }) => (
              <div key={s}><div className="mb-1 flex justify-between text-sm"><span>{STATUS_META[s].label}</span><span className="muted">{n}</span></div><Progress value={pct(n, items.length)} color={STATUS_META[s].color} /></div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">By category</h3>
          <div className="space-y-3">
            {catStats.map(({ c, total, done }) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="w-44 truncate">{c.icon} {c.name}</span>
                <Progress value={pct(done, total)} color={c.color} />
                <span className="w-16 text-right text-xs muted">{done}/{total}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">Patterns</h3>
          <ul className="space-y-3 text-sm">
            {done.length > 0 && <li>📅 You complete the most on <b>{bestDow}s</b>.</li>}
            {catStats[0]?.total > 0 && <li>🧭 Your biggest focus area is <b>{catStats[0].c.name}</b> with {catStats[0].total} items.</li>}
            {neglected.length > 0 && <li>⚠️ Needs attention: {neglected.map((n) => <b key={n.c.id}>{n.c.icon} {n.c.name} </b>)}— under 10% complete.</li>}
            {items.filter((i) => i.status === 'someday').length > items.length * 0.7 && items.length > 10 && <li>💡 Over 70% of your library is “Someday”. Pick 3 items to move to “Next”.</li>}
            {habitRate >= 70 && <li>🔥 Strong habit consistency — keep it up!</li>}
            {activeHabits.length > 0 && habitRate < 40 && <li>🌱 Habit consistency is low. Consider fewer, smaller habits.</li>}
            {items.length === 0 && <li className="muted">Add items to start seeing patterns.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
