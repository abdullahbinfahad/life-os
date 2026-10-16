import { CheckCircle2, Circle, Flame, Pencil, Plus, Star, Sunrise, X } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, PageHeader, PRIORITY_META, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { cx, pct, streak, today } from '../lib/utils';
import ItemEditor from '../components/ItemEditor';

export default function Today() {
  const { items, habits, projects, toggleItemDone, updateItem, addItems, toggleHabit, updateTask } = useStore();
  const catMap = useCategoryMap();
  const t = today();
  const [text, setText] = useState('');
  const [suggest, setSuggest] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const todays = items.filter((i) => i.todayDate === t || (i.dueDate === t && i.status !== 'dropped')).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.priority - b.priority);
  const overdue = items.filter((i) => i.dueDate && i.dueDate < t && i.status !== 'done' && i.status !== 'dropped' && i.todayDate !== t);
  const projectTasks = projects.filter((p) => p.status !== 'done').flatMap((p) => p.tasks.filter((x) => x.dueDate && x.dueDate <= t && !x.done).map((x) => ({ ...x, project: p })));
  const activeHabits = habits.filter((h) => !h.archived);
  const candidates = items.filter((i) => i.todayDate !== t && (i.status === 'next' || i.status === 'active' || i.starred)).sort((a, b) => a.priority - b.priority).slice(0, 12);
  const doneCount = todays.filter((i) => i.status === 'done').length + activeHabits.filter((h) => h.log.includes(t)).length;
  const total = todays.length + activeHabits.length;

  const add = () => { if (!text.trim()) return; addItems([{ title: text, todayDate: t, status: 'next', priority: 2 }]); setText(''); };

  return (
    <div>
      <PageHeader title="Today" subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · Immediate priorities and actions'}
        actions={<button className="btn-outline" onClick={() => setSuggest(!suggest)}><Star size={16} /> Pick from library</button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <div className="mb-4 flex gap-2">
              <input className="input" placeholder="What must happen today?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn-primary" onClick={add}><Plus size={16} /></button>
            </div>
            {suggest && candidates.length > 0 && (
              <div className="mb-4 rounded-xl border border-dashed border-indigo-400/50 bg-indigo-500/5 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-500">Suggested from your library — click to pin</div>
                <div className="flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <button key={c.id} onClick={() => updateItem(c.id, { todayDate: t, status: c.status === 'someday' ? 'next' : c.status })} className="chip border border-slate-200 bg-white px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10 dark:bg-white/[.04]">
                      <Plus size={12} /> {catMap[c.categoryId]?.icon} {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {todays.length === 0 ? (
              <Empty icon={<Sunrise size={28} />} title="Nothing planned yet" text="Add a few priorities or pick from your library. Keep it to 3–5 important things." />
            ) : (
              <div className="space-y-1">
                {todays.map((i) => (
                  <div key={i.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[.03]">
                    <button onClick={() => toggleItemDone(i.id)} className={i.status === 'done' ? 'text-emerald-500' : 'muted hover:text-emerald-500'}>{i.status === 'done' ? <CheckCircle2 size={22} /> : <Circle size={22} />}</button>
                    <span className="h-6 w-1 rounded-full" style={{ background: PRIORITY_META[i.priority].color }} />
                    <span className={cx('flex-1', i.status === 'done' && 'line-through muted')}>{i.title}</span>
                    <CatBadge cat={catMap[i.categoryId]} />
                    <button title="Edit item" onClick={() => setEditing(i.id)} className="opacity-0 group-hover:opacity-100 muted hover:text-indigo-500"><Pencil size={15} /></button>
                    <button title="Remove from today" onClick={() => updateItem(i.id, { todayDate: undefined })} className="opacity-0 group-hover:opacity-100 muted"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {projectTasks.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">Project tasks due</h3>
              {projectTasks.map((x) => (
                <div key={x.id} className="flex items-center gap-3 py-2">
                  <button onClick={() => updateTask(x.project.id, x.id, { done: true })} className="muted hover:text-emerald-500"><Circle size={20} /></button>
                  <span className="flex-1">{x.title}</span>
                  <span className="text-xs muted">{x.project.title}</span>
                  {x.dueDate! < t && <span className="chip bg-rose-500/15 text-rose-500">Overdue</span>}
                </div>
              ))}
            </div>
          )}

          {overdue.length > 0 && (
            <div className="card border-rose-500/30 p-5">
              <h3 className="mb-3 font-semibold text-rose-500">Overdue ({overdue.length})</h3>
              {overdue.slice(0, 10).map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="flex-1">{i.title}</span>
                  <span className="text-xs muted">{i.dueDate}</span>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => updateItem(i.id, { todayDate: t })}>Do today</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card flex flex-col items-center p-6">
            <Ring value={pct(doneCount, total)} size={120} stroke={10}><div className="text-center"><div className="text-2xl font-bold">{pct(doneCount, total)}%</div><div className="text-[10px] muted">today</div></div></Ring>
            <div className="mt-3 text-sm muted">{doneCount} of {total} complete</div>
          </div>
          <div className="card p-5">
            <h3 className="mb-3 font-semibold">Today's habits</h3>
            {activeHabits.length === 0 ? <p className="text-sm muted">No habits yet.</p> : activeHabits.map((h) => {
              const on = h.log.includes(t);
              return (
                <button key={h.id} onClick={() => toggleHabit(h.id, t)} className={cx('mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition', on ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-200 dark:border-white/[.07]')}>
                  {on ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} className="muted" />}
                  <span className="flex-1">{h.title}</span>
                  <span className="flex items-center gap-1 text-xs text-orange-500"><Flame size={13} />{streak(h.log)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <ItemEditor item={items.find((i) => i.id === editing) ?? null} onClose={() => setEditing(null)} />
    </div>
  );
}
