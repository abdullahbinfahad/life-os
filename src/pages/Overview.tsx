import { ArrowRight, CheckCircle2, Flame, Plus, Sunrise, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CatBadge, PageHeader, Progress, Ring, Stat } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { pct, streak, today } from '../lib/utils';

export default function Overview() {
  const { items, goals, habits, categories, settings } = useStore();
  const catMap = useCategoryMap();
  const t = today();
  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'done').length;
  const todayItems = items.filter((i) => i.todayDate === t || i.dueDate === t);
  const todayDone = todayItems.filter((i) => i.status === 'done').length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitsToday = activeHabits.filter((h) => h.log.includes(t)).length;
  const bestStreak = Math.max(0, ...activeHabits.map((h) => streak(h.log)));
  const goalProgress = (g: (typeof goals)[0]) => pct(g.milestones.filter((m) => m.done).length, g.milestones.length);
  const lifetimeGoals = activeGoals;

  return (
    <div className="space-y-6">
      <PageHeader title={settings.name ? `Your life map, ${settings.name}` : 'Your life map'} subtitle="Choose what matters for the long term, then take one small step today." />

      <section className="card overflow-hidden border-indigo-200/70 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-600/15 sm:p-8">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Target size={14} /> Lifetime goals first</div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What do you want your life to become?</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">Create a few meaningful goals for your health, family, work, learning, money, and experiences. Life Circle turns them into milestones and daily actions you can actually track.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/goals" className="btn bg-white text-indigo-700 hover:bg-white/90"><Plus size={16} /> Set a lifetime goal</Link>
            <Link to="/today" className="btn bg-white/15 text-white hover:bg-white/25"><Sunrise size={16} /> Plan today</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Life goals" value={activeGoals.length} sub={`${completedGoals} achieved`} icon={<Target size={18} />} color="#6366f1" />
        <Stat label="Today" value={`${todayDone}/${todayItems.length}`} sub="actions complete" icon={<Sunrise size={18} />} color="#f59e0b" />
        <Stat label="Habits" value={`${habitsToday}/${activeHabits.length}`} sub="checked in today" icon={<CheckCircle2 size={18} />} color="#22c55e" />
        <Stat label="Best streak" value={`${bestStreak}d`} sub="keep going" icon={<Flame size={18} />} color="#ef4444" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Your goals in motion</h3><p className="mt-1 text-sm muted">The few outcomes you are actively moving forward.</p></div><Link to="/goals" className="shrink-0 text-sm text-indigo-500">Manage goals <ArrowRight size={14} className="inline" /></Link></div>
          {activeGoals.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-white/15"><Target className="mx-auto text-indigo-500" size={28} /><p className="mt-2 font-medium">Start with one goal that matters</p><p className="mt-1 text-sm muted">You can add milestones and link daily actions later.</p><Link to="/goals" className="btn-primary mt-4"><Plus size={15} /> Create your first goal</Link></div> : <div className="grid gap-3 sm:grid-cols-2">{activeGoals.slice(0, 6).map((g) => { const p = goalProgress(g); return <Link to="/goals" key={g.id} className="rounded-2xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 dark:border-white/[.07]"><div className="flex items-center gap-3"><Ring value={p} size={54} color={catMap[g.categoryId]?.color} /><div className="min-w-0"><div className="truncate font-medium">{g.title}</div><CatBadge cat={catMap[g.categoryId]} /></div></div><Progress className="mt-4" value={p} color={catMap[g.categoryId]?.color} /></Link>; })}</div>}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Next step</h3><p className="mt-1 text-sm muted">Keep today small and clear.</p></div><Link to="/today" className="text-sm text-indigo-500">Open <ArrowRight size={14} className="inline" /></Link></div>
          {todayItems.length === 0 ? <div className="rounded-2xl bg-amber-500/10 p-4"><Sunrise className="text-amber-500" size={22} /><p className="mt-2 font-medium">Nothing planned for today</p><p className="mt-1 text-sm muted">Pick one action from a goal and make it your next step.</p><Link to="/today" className="btn-outline mt-3 !px-3 !py-1.5 text-xs">Plan one action</Link></div> : <div className="space-y-2">{todayItems.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/[.04]"><CheckCircle2 size={16} className={item.status === 'done' ? 'text-emerald-500' : 'muted'} /><span className={item.status === 'done' ? 'line-through muted' : 'truncate'}>{item.title}</span></div>)}</div>}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Life areas</h3><p className="mt-1 text-sm muted">A quick view of where your attention is going.</p></div><Link to="/library" className="text-sm text-indigo-500">Browse ideas <ArrowRight size={14} className="inline" /></Link></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.slice(0, 8).map((c) => { const areaItems = items.filter((i) => i.categoryId === c.id); const complete = areaItems.filter((i) => i.status === 'done').length; return <div key={c.id} className="rounded-xl bg-slate-50 p-3 dark:bg-white/[.04]"><div className="flex justify-between text-sm"><span>{c.icon} {c.name}</span><span className="muted">{complete}/{areaItems.length}</span></div><Progress className="mt-2" value={pct(complete, areaItems.length)} color={c.color} /></div>; })}</div>
        {lifetimeGoals.length > 0 && <p className="mt-4 text-xs muted">{lifetimeGoals.length} lifetime {lifetimeGoals.length === 1 ? 'goal is' : 'goals are'} on your map.</p>}
      </section>
    </div>
  );
}
