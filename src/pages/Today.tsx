import { translate as tr } from '../lib/locales';
import { CheckCircle2, Circle, Flame, GripVertical, Pencil, Plus, Star, Sunrise, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CatBadge, Empty, PageHeader, PRIORITY_META, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { cx, pct, streak, today, weekCount } from '../lib/utils';
import ItemEditor from '../components/ItemEditor';
import { useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { fetchMyAssignedSharedTasks, subscribeToSharedWorkspace, updateSharedTask, type AssignedSharedTask } from '../lib/sharedProjects';

export default function Today() {
  const { items, habits, projects, settings, toggleItemDone, updateItem, addItems, toggleHabit, updateTask } = useStore();
  const catMap = useCategoryMap();
  const { user } = useAuth();
  const [sharedTasks, setSharedTasks] = useState<AssignedSharedTask[]>([]);
  const [sharedError, setSharedError] = useState('');
  const t = today();
  const [text, setText] = useState('');
  const [suggest, setSuggest] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user || !cloudEnabled) { setSharedTasks([]); return; }
    let alive = true;
    const load = () => void fetchMyAssignedSharedTasks(user.id).then((tasks) => { if (alive) { setSharedTasks(tasks); setSharedError(''); } }).catch((error) => { if (alive) setSharedError(error instanceof Error ? error.message : tr('Shared tasks are temporarily unavailable.')); });
    load();
    const unsubscribe = subscribeToSharedWorkspace(user.id, load);
    return () => { alive = false; unsubscribe(); };
  }, [user?.id]);

  const todays = items.filter((i) => i.todayDate === t || (i.dueDate === t && i.status !== 'dropped')).map((item, index) => ({ item, index })).sort((a, b) => Number(a.item.status === 'done') - Number(b.item.status === 'done') || a.index - b.index).map(({ item }) => item);
  const overdue = items.filter((i) => i.dueDate && i.dueDate < t && i.status !== 'done' && i.status !== 'dropped' && i.todayDate !== t);
  const projectTasks = projects.filter((p) => p.status !== 'done').flatMap((p) => p.tasks.filter((x) => x.dueDate && x.dueDate <= t && !x.done).map((x) => ({ ...x, project: p })));
  const activeHabits = habits.filter((h) => !h.archived);
  const candidates = items.filter((i) => i.todayDate !== t && (i.status === 'next' || i.status === 'active' || i.starred)).sort((a, b) => a.priority - b.priority).slice(0, 12);
  const doneCount = todays.filter((i) => i.status === 'done').length + activeHabits.filter((h) => h.log.includes(t)).length;
  const total = todays.length + activeHabits.length;

  const add = () => { if (!text.trim()) return; addItems([{ title: text, todayDate: t, status: 'next', priority: 2 }]); setText(''); };

  const moveItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= todays.length || to >= todays.length) return;
    const ids = [...todays.map((item) => item.id)];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    useStore.setState((state) => {
      const selected = new Set(todays.map((item) => item.id));
      let nextIndex = 0;
      const reordered = [...state.items];
      state.items.forEach((item, index) => {
        if (selected.has(item.id)) reordered[index] = state.items.find((candidate) => candidate.id === ids[nextIndex++]) ?? item;
      });
      return { items: reordered };
    });
  };
  const finishDrag = (to: number) => {
    const from = dragIndexRef.current;
    if (from !== null) moveItem(from, to);
    dragIndexRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  };
  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (dragIndexRef.current === null) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-personal-index]');
    if (row) setDropIndex(Number(row.dataset.personalIndex));
  };

  return (
    <div>
      <PageHeader title={tr("Today")} subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · Immediate priorities and actions'}
        actions={<button className="btn-outline" onClick={() => setSuggest(!suggest)}><Star size={16} /> {tr("Pick from library")}</button>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <div className="mb-4 flex gap-2">
              <input className="input" placeholder={tr("What must happen today?")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn-primary" onClick={add}><Plus size={16} /></button>
            </div>
            {suggest && candidates.length > 0 && (
              <div className="mb-4 rounded-xl border border-dashed border-indigo-400/50 bg-indigo-500/5 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-500">{tr("Suggested from your library — click to pin")}</div>
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
              <Empty icon={<Sunrise size={28} />} title={tr("Nothing planned yet")} text="Add a few priorities or pick from your library. Keep it to 3–5 important things." />
            ) : (
              <div className="space-y-1">
                {todays.map((i, index) => (
                  <div key={i.id} data-personal-index={index} onPointerMove={trackPointer} onPointerUp={(event) => { if (dragIndexRef.current === null) return; const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-personal-index]'); finishDrag(row ? Number(row.dataset.personalIndex) : dragIndexRef.current); }} className={cx('group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[.03]', dropIndex === index && dragIndex !== index && 'bg-indigo-500/10', dragIndex === index && 'opacity-50')}>
                    <button type="button" aria-label={`${tr('Reorder item')}: ${i.title}`} title={tr('Drag to reorder')} onPointerDown={(event) => { if (event.button !== 0) return; dragIndexRef.current = index; setDragIndex(index); setDropIndex(index); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerCancel={() => finishDrag(dragIndexRef.current ?? index)} onKeyDown={(event) => { if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); moveItem(index, index - 1); } else if (event.key === 'ArrowDown' && index < todays.length - 1) { event.preventDefault(); moveItem(index, index + 1); } else if (event.key === 'Home') { event.preventDefault(); moveItem(index, 0); } else if (event.key === 'End') { event.preventDefault(); moveItem(index, todays.length - 1); } }} className="touch-none cursor-grab text-slate-400 hover:text-indigo-500 active:cursor-grabbing" onClick={(event) => event.preventDefault()}><GripVertical size={18} /></button>
                    <button onClick={() => toggleItemDone(i.id)} className={i.status === 'done' ? 'text-emerald-500' : 'muted hover:text-emerald-500'}>{i.status === 'done' ? <CheckCircle2 size={22} /> : <Circle size={22} />}</button>
                    <span className="h-6 w-1 rounded-full" style={{ background: PRIORITY_META[i.priority].color }} />
                    <span className={cx('flex-1', i.status === 'done' && 'line-through muted')}>{i.title}</span>
                    <CatBadge cat={catMap[i.categoryId]} />
                    <button title={tr("Edit item")} onClick={() => setEditing(i.id)} className="opacity-0 group-hover:opacity-100 muted hover:text-indigo-500"><Pencil size={15} /></button>
                    <button title={tr("Remove from today")} onClick={() => updateItem(i.id, { todayDate: undefined })} className="opacity-0 group-hover:opacity-100 muted"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {projectTasks.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">{tr("Project tasks due")}</h3>
              {projectTasks.map((x) => (
                <div key={x.id} className="flex items-center gap-3 py-2">
                  <button onClick={() => updateTask(x.project.id, x.id, { done: true })} className="muted hover:text-emerald-500"><Circle size={20} /></button>
                  <span className="flex-1">{x.title}</span>
                  <span className="text-xs muted">{x.project.title}</span>
                  {x.dueDate! < t && <span className="chip bg-rose-500/15 text-rose-500">{tr("Overdue")}</span>}
                </div>
              ))}
            </div>
          )}

          {user && <section className="card min-w-0 p-5" aria-labelledby="assigned-shared-heading">
            <div className="mb-3 flex items-center justify-between gap-2"><h3 id="assigned-shared-heading" className="font-semibold">{tr('Team tasks assigned to you')}</h3><span className="chip bg-indigo-500/10 text-indigo-700 dark:text-indigo-200">{sharedTasks.length}</span></div>
            {sharedError && <p className="mb-2 break-words text-xs text-rose-600 dark:text-rose-300">{sharedError}</p>}
            {sharedTasks.length ? <div className="space-y-1">{sharedTasks.map((task) => <div key={task.id} className="flex min-w-0 items-start gap-3 rounded-lg py-2"><button type="button" aria-label={`${tr('Mark task done')}: ${task.title}`} className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-600" onClick={() => void updateSharedTask(task.id, { status: 'done' }).then(() => setSharedTasks((current) => current.filter((item) => item.id !== task.id))).catch((error) => setSharedError(error instanceof Error ? error.message : tr('Could not update shared task.')))}><Circle size={19} /></button><div className="min-w-0 flex-1"><p className="break-words text-sm">{task.title}</p><p className="break-words text-xs muted">{task.project_title}{task.due_date ? ` · ${task.due_date}` : ''}</p></div></div>)}</div> : <p className="text-sm muted">{tr('Tasks assigned to you in shared projects will appear here.')}</p>}
          </section>}

          {overdue.length > 0 && (
            <div className="card border-rose-500/30 p-5">
              <h3 className="mb-3 font-semibold text-rose-500">{tr("Overdue (")}{overdue.length})</h3>
              {overdue.slice(0, 10).map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="flex-1">{i.title}</span>
                  <span className="text-xs muted">{i.dueDate}</span>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => updateItem(i.id, { todayDate: t })}>{tr("Do today")}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card flex flex-col items-center p-6">
            <Ring value={pct(doneCount, total)} size={120} stroke={10}><div className="text-center"><div className="text-2xl font-bold">{pct(doneCount, total)}%</div><div className="text-[10px] muted">{tr("today")}</div></div></Ring>
            <div className="mt-3 text-sm muted">{doneCount} {tr("of")}{total} {tr("complete")}</div>
          </div>
          <div className="card p-5">
            <h3 className="mb-3 font-semibold">{tr("Today's habits")}</h3>
            {activeHabits.length === 0 ? <p className="text-sm muted">{tr("No habits yet.")}</p> : activeHabits.map((h) => {
              const on = h.log.includes(t);
              return (
                <button key={h.id} onClick={() => toggleHabit(h.id, t)} className={cx('mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition', on ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-200 dark:border-white/[.07]')}>
                  {on ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} className="muted" />}
                  <span className="flex-1">{h.title}</span>
                  {h.frequency === 'daily' ? <span className="flex items-center gap-1 text-xs text-orange-500"><Flame size={13} />{streak(h.log)}</span> : <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-300">{weekCount(h.log, t, settings.weekStartsMonday)}/{h.targetPerWeek} {tr("this week")}</span>}
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
