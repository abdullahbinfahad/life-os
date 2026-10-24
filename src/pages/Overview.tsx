import { translate as tr } from '../lib/locales';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Flame, Plus, Sunrise, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CatBadge, PageHeader, Progress, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { pct, streak, today } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { fetchMyAssignedSharedTasks, type AssignedSharedTask } from '../lib/sharedProjects';

export default function Overview() {
  const { items, goals, habits, settings } = useStore();
  const { user } = useAuth();
  const [assignedTasks, setAssignedTasks] = useState<AssignedSharedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksUnavailable, setTasksUnavailable] = useState(false);
  const catMap = useCategoryMap();
  const t = today();
  const activeGoals = goals.filter((g) => g.status === 'active');
  const todayItems = items.filter((i) => i.todayDate === t || i.dueDate === t);
  const todayDone = todayItems.filter((i) => i.status === 'done').length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitsToday = activeHabits.filter((h) => h.log.includes(t)).length;
  const bestStreak = Math.max(0, ...activeHabits.filter((h) => h.frequency === 'daily').map((h) => streak(h.log)));
  const goalProgress = (g: (typeof goals)[0]) => pct(g.milestones.filter((m) => m.done).length, g.milestones.length);

  useEffect(() => {
    let active = true;
    if (!user || !cloudEnabled) {
      setAssignedTasks([]);
      setTasksLoading(false);
      setTasksUnavailable(false);
      return () => { active = false; };
    }
    setTasksLoading(true);
    setTasksUnavailable(false);
    void fetchMyAssignedSharedTasks(user.id)
      .then((tasks) => { if (active) setAssignedTasks(tasks); })
      .catch(() => { if (active) { setAssignedTasks([]); setTasksUnavailable(true); } })
      .finally(() => { if (active) setTasksLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <PageHeader title={settings.name ? `${tr("Welcome back,")} ${settings.name}` : tr("Welcome to your life map")} subtitle={tr("A clear place for the goals you care about and the next small step you can take.")} />

      <section className="card overflow-hidden border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 text-slate-900 shadow-xl shadow-indigo-600/5 dark:border-indigo-400/20 dark:from-indigo-950 dark:via-slate-900 dark:to-violet-950 dark:text-slate-100 dark:shadow-indigo-600/10 sm:p-8">
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-800 sm:mb-3 dark:bg-white/15 dark:text-indigo-100"><Target size={14} /> {tr("Start with what matters")}</div>
          <h2 className="break-words text-xl font-bold leading-tight tracking-tight sm:text-3xl">{tr("Make room for one meaningful next step.")}</h2>
          <p className="mt-2 max-w-xl text-sm leading-5 text-slate-600 sm:mt-3 sm:leading-6 dark:text-slate-300">{tr("Add a task for today or set a goal for the longer term. Your overview will bring your plan and progress together.")}</p>
          <div className="mt-4 flex flex-wrap gap-2 sm:mt-6">
            <button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn bg-white text-indigo-700 hover:bg-white/90"><Plus size={16} /> {tr("Add a task")}</button>
            <Link to="/goals" className="btn bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"><Target size={16} /> {tr("Add a goal")}</Link>
            <Link to="/today" className="btn bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"><Sunrise size={16} /> {tr("View today")}</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4"><div><h3 className="text-sm font-semibold sm:text-base">{tr("Today’s plan")}</h3><p className="mt-0.5 text-xs muted sm:mt-1 sm:text-sm">{todayItems.length ? `${todayDone} of ${todayItems.length} complete` : 'Choose a small action to focus on today.'}</p></div><Link to="/today" className="shrink-0 text-xs text-indigo-500 sm:text-sm">{tr("Open plan")}<ArrowRight size={14} className="inline" /></Link></div>
          {todayItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center sm:p-6 dark:border-white/15"><Sunrise className="mx-auto text-amber-500" size={26} /><p className="mt-1.5 text-sm font-medium sm:mt-2 sm:text-base">{tr("Nothing planned yet")}</p><p className="mt-1 text-xs muted sm:text-sm">{tr("Add a task or choose one action to make today feel manageable.")}</p><button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn-primary mt-3 sm:mt-4"><Plus size={15} /> {tr("Add a task")}</button></div> : <div className="space-y-2">{todayItems.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs sm:px-3 sm:py-2.5 sm:text-sm dark:bg-white/[.04]"><CheckCircle2 size={16} className={item.status === 'done' ? 'text-emerald-500' : 'muted'} /><span className={item.status === 'done' ? 'line-through muted' : 'truncate'}>{item.title}</span></div>)}{todayItems.length > 5 && <Link to="/today" className="inline-block pt-1 text-xs text-indigo-500 sm:text-sm">{tr("See all")}{todayItems.length} {tr("items")}<ArrowRight size={14} className="inline" /></Link>}</div>}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">{tr("Habit check-in")}</h3><p className="mt-1 text-sm muted">{tr("A quick look at today.")}</p></div><Flame size={18} className="text-amber-500" /></div>
          {activeHabits.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[.04]"><p className="font-medium">{tr("No active habits yet")}</p><p className="mt-1 text-sm muted">{tr("Your habit check-ins will show here when you add habits.")}</p><Link to="/habits" className="mt-3 inline-block text-sm text-indigo-700 dark:text-indigo-300">{tr("Explore habits")}<ArrowRight size={14} className="inline" /></Link></div> : <><p className="text-2xl font-semibold">{habitsToday}<span className="text-base font-normal muted"> / {activeHabits.length} {tr("checked in")}</span></p><Progress className="mt-3" value={pct(habitsToday, activeHabits.length)} color="#22c55e" /><p className="mt-3 text-sm muted">{bestStreak ? `Your longest current daily streak is ${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}.` : 'A small repeatable action is a good start.'}</p></>}
        </section>
      </div>

      {user && cloudEnabled && <section className="card min-w-0 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h3 className="font-semibold">{tr("Assigned team tasks")}</h3><p className="mt-1 text-sm muted">{tr("A quick look at tasks assigned to you.")}</p></div>
          <Link to="/projects" className="shrink-0 text-sm text-indigo-500">{tr("Team Projects")}<ArrowRight size={14} className="inline" /></Link>
        </div>
        {tasksLoading ? <p className="text-sm muted">{tr("Loading assigned tasks…")}</p>
          : tasksUnavailable ? <p className="text-sm muted">{tr("Team tasks are temporarily unavailable.")}</p>
          : assignedTasks.length === 0 ? <p className="text-sm muted">{tr("No tasks are currently assigned to you.")}</p>
          : <div className="space-y-2">{assignedTasks.slice(0, 3).map((task) => <div key={task.id} className="flex min-w-0 flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/[.04] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0"><p className="truncate font-medium">{task.title}</p><p className="truncate text-xs muted">{task.project_title}</p></div>
            <div className="flex shrink-0 flex-wrap gap-x-3 text-xs muted"><span>{tr(task.status)}</span>{task.due_date && <span>{tr("Due")} {task.due_date}</span>}<span>{tr("Assigned to you")}</span></div>
          </div>)}</div>}
      </section>}

      <section className="card min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{tr("Active goals")}</h3><p className="mt-1 text-sm muted">{tr("Progress through completed milestones.")}</p></div><Link to="/goals" className="shrink-0 text-sm text-indigo-500">{tr("Manage goals")}<ArrowRight size={14} className="inline" /></Link></div>
        {activeGoals.length === 0 ? <div className="min-w-0 rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-white/15"><Target className="mx-auto text-indigo-500" size={26} /><p className="mt-2 font-medium">{tr("No active goals yet")}</p><p className="mt-1 text-sm muted">{tr("Add one outcome that matters to you; you can build milestones over time.")}</p><Link to="/goals" className="btn-primary mt-4"><Plus size={15} /> {tr("Add a goal")}</Link></div> : <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeGoals.slice(0, 6).map((g) => { const p = goalProgress(g); return <Link to="/goals" key={g.id} className="block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:border-indigo-300 sm:p-4 dark:border-white/[.07]"><div className="flex min-w-0 items-center gap-3"><Ring value={p} size={54} color={catMap[g.categoryId]?.color} /><div className="min-w-0 flex-1"><div className="break-words font-medium leading-snug [overflow-wrap:anywhere]">{g.title}</div><div className="mt-1 min-w-0"><CatBadge cat={catMap[g.categoryId]} /></div></div></div><Progress className="mt-4" value={p} color={catMap[g.categoryId]?.color} /></Link>; })}</div>}
      </section>
    </div>
  );
}
