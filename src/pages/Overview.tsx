import { ArrowRight, CheckCircle2, Flame, Plus, Sunrise, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CatBadge, PageHeader, Progress, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { pct, streak, today } from '../lib/utils';

export default function Overview() {
  const { items, goals, habits, settings } = useStore();
  const catMap = useCategoryMap();
  const t = today();
  const activeGoals = goals.filter((g) => g.status === 'active');
  const todayItems = items.filter((i) => i.todayDate === t || i.dueDate === t);
  const todayDone = todayItems.filter((i) => i.status === 'done').length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitsToday = activeHabits.filter((h) => h.log.includes(t)).length;
  const bestStreak = Math.max(0, ...activeHabits.filter((h) => h.frequency === 'daily').map((h) => streak(h.log)));
  const goalProgress = (g: (typeof goals)[0]) => pct(g.milestones.filter((m) => m.done).length, g.milestones.length);

  return (
    <div className="space-y-6">
      <PageHeader title={settings.name ? `Welcome back, ${settings.name}` : 'Welcome to your life map'} subtitle="A clear place for the goals you care about and the next small step you can take." />

      <section className="card overflow-hidden border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 text-slate-900 shadow-xl shadow-indigo-600/5 dark:border-indigo-400/20 dark:from-indigo-950 dark:via-slate-900 dark:to-violet-950 dark:text-slate-100 dark:shadow-indigo-600/10 sm:p-8">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-800 dark:bg-white/15 dark:text-indigo-100"><Target size={14} /> Start with what matters</div>
          <h2 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Make room for one meaningful next step.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">Add a task for today or set a goal for the longer term. Your overview will bring your plan and progress together.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn bg-white text-indigo-700 hover:bg-white/90"><Plus size={16} /> Add a task</button>
            <Link to="/goals" className="btn bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"><Target size={16} /> Add a goal</Link>
            <Link to="/today" className="btn bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"><Sunrise size={16} /> View today</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Today’s plan</h3><p className="mt-1 text-sm muted">{todayItems.length ? `${todayDone} of ${todayItems.length} complete` : 'Choose a small action to focus on today.'}</p></div><Link to="/today" className="shrink-0 text-sm text-indigo-500">Open plan <ArrowRight size={14} className="inline" /></Link></div>
          {todayItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-white/15"><Sunrise className="mx-auto text-amber-500" size={26} /><p className="mt-2 font-medium">Nothing planned yet</p><p className="mt-1 text-sm muted">Add a task or choose one action to make today feel manageable.</p><button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn-primary mt-4"><Plus size={15} /> Add a task</button></div> : <div className="space-y-2">{todayItems.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/[.04]"><CheckCircle2 size={16} className={item.status === 'done' ? 'text-emerald-500' : 'muted'} /><span className={item.status === 'done' ? 'line-through muted' : 'truncate'}>{item.title}</span></div>)}{todayItems.length > 5 && <Link to="/today" className="inline-block pt-1 text-sm text-indigo-500">See all {todayItems.length} items <ArrowRight size={14} className="inline" /></Link>}</div>}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Habit check-in</h3><p className="mt-1 text-sm muted">A quick look at today.</p></div><Flame size={18} className="text-amber-500" /></div>
          {activeHabits.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[.04]"><p className="font-medium">No active habits yet</p><p className="mt-1 text-sm muted">Your habit check-ins will show here when you add habits.</p><Link to="/habits" className="mt-3 inline-block text-sm text-indigo-700 dark:text-indigo-300">Explore habits <ArrowRight size={14} className="inline" /></Link></div> : <><p className="text-2xl font-semibold">{habitsToday}<span className="text-base font-normal muted"> / {activeHabits.length} checked in</span></p><Progress className="mt-3" value={pct(habitsToday, activeHabits.length)} color="#22c55e" /><p className="mt-3 text-sm muted">{bestStreak ? `Your longest current daily streak is ${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}.` : 'A small repeatable action is a good start.'}</p></>}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Active goals</h3><p className="mt-1 text-sm muted">Progress through completed milestones.</p></div><Link to="/goals" className="shrink-0 text-sm text-indigo-500">Manage goals <ArrowRight size={14} className="inline" /></Link></div>
        {activeGoals.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-white/15"><Target className="mx-auto text-indigo-500" size={26} /><p className="mt-2 font-medium">No active goals yet</p><p className="mt-1 text-sm muted">Add one outcome that matters to you; you can build milestones over time.</p><Link to="/goals" className="btn-primary mt-4"><Plus size={15} /> Add a goal</Link></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeGoals.slice(0, 6).map((g) => { const p = goalProgress(g); return <Link to="/goals" key={g.id} className="rounded-2xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 dark:border-white/[.07]"><div className="flex items-center gap-3"><Ring value={p} size={54} color={catMap[g.categoryId]?.color} /><div className="min-w-0"><div className="truncate font-medium">{g.title}</div><CatBadge cat={catMap[g.categoryId]} /></div></div><Progress className="mt-4" value={p} color={catMap[g.categoryId]?.color} /></Link>; })}</div>}
      </section>
    </div>
  );
}
