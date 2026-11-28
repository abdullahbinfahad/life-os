import { translate as tr } from '../lib/locales';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Flame, Plus, Repeat, Sparkles, Sunrise, Target } from 'lucide-react';
import './Overview.css';
import { Link } from 'react-router-dom';
import { CatBadge, CountUp, Progress, Ring, Stat } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { pct, streak, today, toISODate } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { fetchMyAssignedSharedTasks, type AssignedSharedTask } from '../lib/sharedProjects';
import DailyWrapUp from '../components/DailyWrapUp';

const WeatherCard = lazy(() => import('../components/WeatherCard'));
const ScheduleToday = lazy(() => import('../components/ScheduleToday'));

export default function Overview() {
  const { items, goals, habits, settings, toggleItemDone } = useStore();
  const { user } = useAuth();
  const [assignedTasks, setAssignedTasks] = useState<AssignedSharedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksUnavailable, setTasksUnavailable] = useState(false);
  const catMap = useCategoryMap();
  const t = today();
  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedToday = items.filter((i) => i.status === 'done' && (i.completedAt ? toISODate(new Date(i.completedAt)) === t : i.todayDate === t || i.dueDate === t));
  const todayItems = items.filter((i) => (i.todayDate === t || i.dueDate === t) && i.status !== 'done' && i.status !== 'dropped');
  const todayDone = completedToday.length;
  const activeHabits = habits.filter((h) => !h.archived);
  const habitsToday = activeHabits.filter((h) => h.log.includes(t)).length;
  const bestStreak = Math.max(0, ...activeHabits.filter((h) => h.frequency === 'daily').map((h) => streak(h.log)));
  const goalProgress = (g: (typeof goals)[0]) => pct(g.milestones.filter((m) => m.done).length, g.milestones.length);
  const taskPct = pct(todayDone, todayItems.length + todayDone);
  const habitPct = pct(habitsToday, activeHabits.length);
  const goalPct = activeGoals.length ? Math.round(activeGoals.reduce((sum, g) => sum + goalProgress(g), 0) / activeGoals.length) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? tr('Good night') : hour < 12 ? tr('Good morning') : hour < 18 ? tr('Good afternoon') : tr('Good evening');
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const [ringsReady, setRingsReady] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setRingsReady(true)); return () => cancelAnimationFrame(frame); }, []);

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
    <div className="space-y-4 sm:space-y-6">
      <section className="dash-hero">
        <div className="dash-hero-art" aria-hidden="true"><span /><span /><span /></div>
        <div className="dash-hero-copy">
          <span className="dash-chip"><Sparkles size={13} /> {dateLabel}</span>
          <h1 className="dash-title">{greeting}{settings.name ? `, ${settings.name.split(' ')[0]}` : ''}</h1>
          <p className="dash-sub">{todayItems.length ? `${todayItems.length} ${tr('things left today')} · ${habitsToday}/${activeHabits.length} ${tr('habits checked in')}` : tr('A clear place for the goals you care about and the next small step you can take.')}</p>
          <div className="dash-actions">
            <button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn-primary"><Plus size={16} /> {tr('Add a task')}</button>
            <Link to="/today" className="btn dash-ghost" aria-label={tr('View today')}><Sunrise size={16} /><span className="dash-act-label">{tr('View today')}</span></Link>
            <Link to="/goals" className="btn dash-ghost" aria-label={tr('Add a goal')}><Target size={16} /><span className="dash-act-label">{tr('Add a goal')}</span></Link>
          </div>
        </div>
        <div className="dash-rings" role="img" aria-label={`${tr('Tasks')} ${taskPct}%, ${tr('Habits')} ${habitPct}%, ${tr('Goals')} ${goalPct}%`}>
          <svg viewBox="0 0 200 200">
            {[{ r: 86, v: taskPct, c: 'url(#ring-a)' }, { r: 64, v: habitPct, c: 'url(#ring-b)' }, { r: 42, v: goalPct, c: 'url(#ring-c)' }].map((ring, i) => {
              const c = 2 * Math.PI * ring.r;
              return <g key={i}>
                <circle cx="100" cy="100" r={ring.r} className="dash-ring-track" />
                <circle cx="100" cy="100" r={ring.r} className="dash-ring-bar" stroke={ring.c} strokeDasharray={c} strokeDashoffset={c - (ringsReady ? ring.v : 0) / 100 * c} style={{ transitionDelay: `${i * 140}ms` }} />
              </g>;
            })}
            <defs>
              <linearGradient id="ring-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f472b6" /><stop offset="1" stopColor="#a855f7" /></linearGradient>
              <linearGradient id="ring-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#10b981" /></linearGradient>
              <linearGradient id="ring-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#6366f1" /></linearGradient>
            </defs>
          </svg>
          <ul className="dash-legend">
            <li><i style={{ background: '#ec4899' }} />{tr('Tasks')} <b><CountUp value={taskPct} />%</b></li>
            <li><i style={{ background: '#10b981' }} />{tr('Habits')} <b><CountUp value={habitPct} />%</b></li>
            <li><i style={{ background: '#3b82f6' }} />{tr('Goals')} <b><CountUp value={goalPct} />%</b></li>
          </ul>
        </div>
      </section>

      <Suspense fallback={<div className="h-32 animate-pulse rounded-[1.35rem] bg-slate-200/40 dark:bg-white/[.03]" />}><ScheduleToday /></Suspense>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={tr('Done today')} value={todayDone} icon={<CheckCircle2 size={18} />} color="#ec4899" />
        <Stat label={tr('Habits today')} value={`${habitsToday}/${activeHabits.length}`} icon={<Repeat size={18} />} color="#10b981" />
        <Stat label={tr('Best streak')} value={bestStreak} sub={tr('days')} icon={<Flame size={18} />} color="#f59e0b" />
        <Stat label={tr('Active goals')} value={activeGoals.length} icon={<Target size={18} />} color="#6366f1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-3 sm:p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-3 sm:mb-4"><div><h3 className="text-sm font-semibold sm:text-base">{tr("Today’s plan")}</h3><p className="mt-0.5 text-xs muted sm:mt-1 sm:text-sm">{todayItems.length || todayDone ? `${todayDone} of ${todayItems.length + todayDone} complete` : 'Choose a small action to focus on today.'}</p></div><Link to="/today" className="shrink-0 rounded-md px-2 py-2 text-xs text-indigo-500 sm:text-sm">{tr("Open plan")}<ArrowRight size={14} className="inline" /></Link></div>
          {todayItems.length === 0 ? (
            todayDone > 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-center dark:border-emerald-400/15 dark:bg-emerald-500/[.06]">
                <CheckCircle2 className="mx-auto text-emerald-600 dark:text-emerald-300" size={24} />
                <p className="mt-1 text-sm font-semibold">{tr('All planned tasks are complete')}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-3 text-center sm:p-6 dark:border-white/15">
                <Sunrise className="mx-auto text-amber-500" size={26} />
                <p className="mt-1 text-sm font-medium sm:mt-2 sm:text-base">{tr("Nothing planned yet")}</p>
                <p className="mt-1 text-xs muted sm:text-sm">{tr("Add a task or choose one action to make today feel manageable.")}</p>
                <button type="button" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))} className="btn-primary mt-3 min-h-11 sm:mt-4"><Plus size={15} /> {tr("Add a task")}</button>
              </div>
            )
          ) : (
            <div>
              {todayItems.slice(0, 5).map((item) => (
                <div key={item.id} className="tap-row flex items-center">
                  <button type="button" role="checkbox" aria-checked={false} aria-label={`${tr('Mark complete')}: ${item.title}`} onClick={() => toggleItemDone(item.id)} className="tap-toggle">
                    <span className="tap-check-icon" aria-hidden="true"><Circle size={20} /></span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </button>
                </div>
              ))}
              {todayItems.length > 5 && (
                <Link to="/today" className="inline-block min-h-11 pt-2 text-xs text-indigo-500 sm:text-sm">
                  {tr("See all")} {todayItems.length} {tr("items")}<ArrowRight size={14} className="inline" />
                </Link>
              )}
            </div>
          )}
          <DailyWrapUp compact />
        </section>

        <div className="grid min-w-0 content-start gap-6"><Suspense fallback={null}><WeatherCard /></Suspense>
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">{tr("Habit check-in")}</h3><p className="mt-1 text-sm muted">{tr("A quick look at today.")}</p></div><Flame size={18} className="text-amber-500" /></div>
          {activeHabits.length === 0 ? <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[.04]"><p className="font-medium">{tr("No active habits yet")}</p><p className="mt-1 text-sm muted">{tr("Your habit check-ins will show here when you add habits.")}</p><Link to="/habits" className="mt-3 inline-block text-sm text-indigo-700 dark:text-indigo-300">{tr("Explore habits")}<ArrowRight size={14} className="inline" /></Link></div> : <><p className="text-2xl font-semibold">{habitsToday}<span className="text-base font-normal muted"> / {activeHabits.length} {tr("checked in")}</span></p><Progress className="mt-3" value={pct(habitsToday, activeHabits.length)} color="#22c55e" /><p className="mt-3 text-sm muted">{bestStreak ? `Your longest current daily streak is ${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}.` : 'A small repeatable action is a good start.'}</p></>}
        </section></div>
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
