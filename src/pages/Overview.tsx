import { ArrowRight, CheckCircle2, Flame, FolderKanban, Library, Sparkles, Sunrise, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CatBadge, PageHeader, Progress, Ring, Stat } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { addDays, fmtDate, pct, streak, today } from '../lib/utils';

export default function Overview() {
  const { items, goals, projects, habits, journal, categories, settings, loadDemo } = useStore();
  const catMap = useCategoryMap();
  const t = today();
  const done = items.filter((i) => i.status === 'done').length;
  const todayItems = items.filter((i) => i.todayDate === t || i.dueDate === t);
  const todayDone = todayItems.filter((i) => i.status === 'done').length;
  const activeGoals = goals.filter((g) => g.status === 'active');
  const activeHabits = habits.filter((h) => !h.archived);
  const habitsToday = activeHabits.filter((h) => h.log.includes(t)).length;
  const bestStreak = Math.max(0, ...activeHabits.map((h) => streak(h.log)));
  const upcoming = [
    ...items.filter((i) => i.dueDate && i.dueDate >= t && i.status !== 'done').map((i) => ({ title: i.title, date: i.dueDate!, kind: 'Item' })),
    ...goals.filter((g) => g.targetDate && g.targetDate >= t && g.status !== 'done').map((g) => ({ title: g.title, date: g.targetDate!, kind: 'Goal' })),
    ...projects.flatMap((p) => p.tasks.filter((x) => x.dueDate && !x.done && x.dueDate >= t).map((x) => ({ title: x.title, date: x.dueDate!, kind: p.title }))),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const goalProgress = (g: (typeof goals)[0]) => pct(g.milestones.filter((m) => m.done).length, g.milestones.length);

  return (
    <div>
      <PageHeader title={`${greet}${settings.name ? `, ${settings.name}` : ''}`} subtitle="Your current life at a glance" />

      {items.length + goals.length + habits.length === 0 && (
        <div className="card mb-6 overflow-hidden bg-gradient-to-br from-indigo-600 to-fuchsia-600 p-8 text-white">
          <h2 className="text-2xl font-bold">Welcome to Life OS</h2>
          <p className="mt-2 max-w-xl text-white/80">Capture everything you want to do in life — hundreds or thousands of things — then organize, prioritize and track them.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/library" className="btn bg-white text-indigo-700 hover:bg-white/90"><Sparkles size={16} /> Start with 400+ ideas</Link>
            <button className="btn bg-white/15 hover:bg-white/25" onClick={loadDemo}>Load demo data</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Life Library" value={items.length} sub={`${done} completed · ${pct(done, items.length)}%`} icon={<Library size={18} />} />
        <Stat label="Today" value={`${todayDone}/${todayItems.length}`} sub="actions done" icon={<Sunrise size={18} />} color="#f59e0b" />
        <Stat label="Active goals" value={activeGoals.length} sub={`${goals.filter((g) => g.status === 'done').length} achieved`} icon={<Target size={18} />} color="#22c55e" />
        <Stat label="Best streak" value={`${bestStreak}d`} sub={`${habitsToday}/${activeHabits.length} habits today`} icon={<Flame size={18} />} color="#ef4444" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Life balance</h3><Link to="/insights" className="text-xs text-indigo-500">Insights →</Link></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categories.map((c) => {
              const ci = items.filter((i) => i.categoryId === c.id);
              const cd = ci.filter((i) => i.status === 'done').length;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.icon} {c.name}</span><span className="muted">{cd}/{ci.length}</span></div>
                  <Progress value={pct(cd, ci.length)} color={c.color} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Coming up</h3><Link to="/calendar" className="text-xs text-indigo-500">Calendar →</Link></div>
          {upcoming.length === 0 ? <p className="text-sm muted">No upcoming deadlines.</p> : (
            <div className="space-y-3">
              {upcoming.map((u, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 shrink-0 rounded-lg bg-indigo-500/10 py-1 text-center text-xs font-semibold text-indigo-500">
                    {u.date === t ? 'Today' : u.date === addDays(t, 1) ? 'Tmrw' : fmtDate(u.date).split(',')[0]}
                  </div>
                  <div className="min-w-0"><div className="truncate text-sm">{u.title}</div><div className="text-xs muted">{u.kind}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Goals in motion</h3><Link to="/goals" className="text-xs text-indigo-500">All goals →</Link></div>
          {activeGoals.length === 0 ? <p className="text-sm muted">No active goals yet.</p> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeGoals.slice(0, 4).map((g) => (
                <div key={g.id} className="flex items-center gap-4 rounded-xl border border-slate-200 p-3 dark:border-white/[.06]">
                  <Ring value={goalProgress(g)} size={56} color={catMap[g.categoryId]?.color} />
                  <div className="min-w-0"><div className="truncate font-medium">{g.title}</div><CatBadge cat={catMap[g.categoryId]} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">Quick jump</h3>
          <div className="space-y-2">
            {[
              { to: '/today', label: 'Plan today', icon: <Sunrise size={16} /> },
              { to: '/projects', label: `${projects.filter((p) => p.status === 'active').length} active projects`, icon: <FolderKanban size={16} /> },
              { to: '/habits', label: 'Check in habits', icon: <CheckCircle2 size={16} /> },
              { to: '/journal', label: `${journal.length} journal entries`, icon: <Sparkles size={16} /> },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-slate-100 dark:hover:bg-white/[.05]">
                {l.icon}{l.label}<ArrowRight size={14} className="ml-auto muted" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
