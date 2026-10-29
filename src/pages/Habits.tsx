import { translate as tr } from '../lib/locales';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, CheckCircle2, Circle, Flame, GripVertical, Pencil, Plus, Repeat, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Habit } from '../lib/types';
import { addDays, bestStreak, cx, pct, streak, today, weekCount } from '../lib/utils';

type HabitForm = { id?: string; title: string; categoryId: string; frequency: 'daily' | 'weekly'; targetPerWeek: number; why: string };
function SortableHabitCard({ id, children, active }: { id: string; children: React.ReactNode; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('card min-w-0 p-4', isDragging && 'opacity-50', active && 'ring-2 ring-indigo-500')}>
    <div className="mb-2 flex justify-end"><button type="button" {...attributes} {...listeners} className="btn-ghost !p-2 touch-none cursor-grab active:cursor-grabbing" aria-label="Reorder habit" title="Drag to reorder"><GripVertical size={18} /></button></div>{children}
  </article>;
}
function SortableHabitRow({ id, children, active }: { id: string; children: React.ReactNode; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('group border-b border-slate-100 last:border-0 dark:border-white/[.04]', isDragging && 'opacity-50', active && 'bg-indigo-50 dark:bg-indigo-500/10')}>
    <td className="w-9 p-1"><button type="button" {...attributes} {...listeners} className="btn-ghost !p-1 touch-none cursor-grab active:cursor-grabbing" aria-label="Reorder habit" title="Drag to reorder"><GripVertical size={16} /></button></td>{children}
  </tr>;
}
const blankForm: HabitForm = { title: '', categoryId: 'health', frequency: 'daily', targetPerWeek: 7, why: '' };
const SUGGESTIONS: Omit<Habit, 'id' | 'log' | 'createdAt' | 'archived'>[] = [
  { title: 'Drink 2L water', categoryId: 'health', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Read 20 pages', categoryId: 'learning', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Morning workout', categoryId: 'health', frequency: 'weekly', targetPerWeek: 3 },
  { title: 'Meditate 10 min', categoryId: 'mind', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Journal', categoryId: 'mind', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Call someone I care about', categoryId: 'relationships', frequency: 'weekly', targetPerWeek: 1 },
  { title: 'Walk 10k steps', categoryId: 'health', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Learn a language 15 min', categoryId: 'learning', frequency: 'weekly', targetPerWeek: 5 },
  { title: 'Pray on time', categoryId: 'mind', frequency: 'daily', targetPerWeek: 7 },
  { title: 'Sleep before 11pm', categoryId: 'health', frequency: 'daily', targetPerWeek: 7 },
];

export default function Habits() {
  const { habits, categories, settings, addHabit, toggleHabit, updateHabit, deleteHabit } = useStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const catMap = useCategoryMap();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<HabitForm>(blankForm);
  const [showArchived, setShowArchived] = useState(false);
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const heat = Array.from({ length: 84 }, (_, i) => addDays(t, i - 83));
  const list = habits.filter((h) => Boolean(h.archived) === showArchived);
  const reorderVisible = (event: DragEndEvent) => {
    setDraggingId(null);
    if (!event.over || event.active.id === event.over.id) return;
    const current = useStore.getState().habits;
    const slots = current.flatMap((habit, index) => Boolean(habit.archived) === showArchived ? [index] : []);
    const visible = slots.map((index) => current[index]);
    const from = visible.findIndex((habit) => habit.id === event.active.id);
    const to = visible.findIndex((habit) => habit.id === event.over?.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(visible, from, to);
    const next = [...current];
    slots.forEach((slot, index) => { next[slot] = reordered[index]; });
    useStore.setState({ habits: next });
  };
  const active = habits.filter((h) => !h.archived);
  const checkedToday = active.filter((h) => h.log.includes(t)).length;

  const activeDaysInWindow = (h: Habit) => {
    const created = h.createdAt?.slice(0, 10) || addDays(t, -29);
    return Math.max(0, Math.min(30, Math.round((new Date(t + 'T00:00:00').getTime() - new Date(created + 'T00:00:00').getTime()) / 86400000) + 1));
  };
  const last30 = (h: Habit) => h.log.filter((d) => d >= addDays(t, -29) && d <= t && d >= (h.createdAt?.slice(0, 10) || addDays(t, -29))).length;
  const adherence = (h: Habit) => {
    const days = activeDaysInWindow(h);
    const target = h.frequency === 'daily' ? days : days * h.targetPerWeek / 7;
    return target ? pct(last30(h), target) : 0;
  };
  const openNew = (preset?: typeof SUGGESTIONS[number]) => {
    setForm(preset ? { ...preset, why: '' } : blankForm);
    setFormOpen(true);
  };
  const openEdit = (habit: Habit) => {
    setForm({ id: habit.id, title: habit.title, categoryId: habit.categoryId, frequency: habit.frequency, targetPerWeek: habit.targetPerWeek, why: habit.why ?? '' });
    setFormOpen(true);
  };
  const save = () => {
    const title = form.title.trim();
    if (!title) return;
    const payload = { title, categoryId: form.categoryId, frequency: form.frequency, targetPerWeek: form.frequency === 'daily' ? 7 : Math.max(1, Math.min(7, form.targetPerWeek)), why: form.why.trim() || undefined };
    if (form.id) updateHabit(form.id, payload);
    else addHabit(payload);
    setFormOpen(false);
    setForm(blankForm);
  };
  const remove = (habit: Habit) => {
    if (confirm(`Move “${habit.title}” to Trash?`)) deleteHabit(habit.id);
  };

  return (
    <div>
      <PageHeader title={tr("Habits")} subtitle={tr("Small repeatable actions, with daily or weekly goals")} actions={<>
        <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)}><Archive size={16} /> {showArchived ? 'Active' : 'Archived'}</button>
        <button className="btn-primary" onClick={() => openNew()}><Plus size={16} /> {tr("New habit")}</button></>} />

      {active.length > 0 && <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs muted">{tr("Active habits")}</div><div className="mt-1 text-2xl font-bold">{active.length}</div></div>
        <div className="card p-4"><div className="text-xs muted">{tr("Checked in today")}</div><div className="mt-1 text-2xl font-bold">{checkedToday}<span className="ml-1 text-sm font-normal muted">/ {active.length}</span></div></div>
        <div className="card col-span-2 p-4 sm:col-span-1"><div className="mb-2 flex items-center justify-between text-xs muted"><span>{tr("Today’s progress")}</span><span>{pct(checkedToday, active.length)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct(checkedToday, active.length)}%` }} /></div></div>
      </div>}

      {list.length === 0 ? (
        <Empty icon={<Repeat size={28} />} title={showArchived ? 'No archived habits' : 'Build your first habit'} text="Pick a daily routine or a realistic number of times each week. Your check-ins stay flexible." action={!showArchived && <div className="flex max-w-lg flex-wrap justify-center gap-2">{SUGGESTIONS.map((suggestion) => <button key={suggestion.title} className="chip border border-slate-200 px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10" onClick={() => addHabit(suggestion)}><Plus size={12} />{suggestion.title}</button>)}</div>} />
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setDraggingId(String(event.active.id))} onDragCancel={() => setDraggingId(null)} onDragEnd={reorderVisible}>
          <SortableContext items={list.map((h) => h.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 md:hidden" aria-label="Habits; drag handles reorder items">
            {list.map((h) => {
              const on = h.log.includes(t);
              const weekDone = weekCount(h.log, t, settings.weekStartsMonday);
              const days = activeDaysInWindow(h);
              return <SortableHabitCard key={h.id} id={h.id} active={draggingId === h.id}>
                <div className="flex min-w-0 items-start gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(h)} aria-label={`Edit ${h.title}`}>
                    <span className="block break-words font-semibold">{h.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5"><CatBadge cat={catMap[h.categoryId]} /><span className="chip bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-300">{h.frequency === 'daily' ? 'Daily' : `${h.targetPerWeek}× / week`}</span></span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost !p-2" title={tr("Edit habit")} aria-label={`Edit ${h.title}`} onClick={() => openEdit(h)}><Pencil size={15} /></button>
                    <button className="btn-ghost !p-2" title={showArchived ? 'Restore habit' : 'Archive habit'} aria-label={showArchived ? 'Restore habit' : 'Archive habit'} onClick={() => updateHabit(h.id, { archived: !h.archived })}><Archive size={15} /></button>
                    <button className="btn-ghost !p-2 text-rose-500" title={tr("Move habit to Trash")} aria-label={tr("Move habit to Trash")} onClick={() => remove(h)}><Trash2 size={15} /></button>
                  </div>
                </div>
                {h.why && <p className="mt-2 break-words text-sm muted">{h.why}</p>}
                <div className="mt-4 grid grid-cols-7 gap-1">
                  {week.map((d) => {
                    const logged = h.log.includes(d);
                    const label = new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
                    return <div key={d} className="min-w-0 text-center">
                      <span className={cx('block text-[10px]', d === t ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'muted')}>{label.slice(0, 1)} <span className="hidden sm:inline">{d.slice(8)}</span></span>
                      <button onClick={() => toggleHabit(h.id, d)} aria-label={`${logged ? 'Uncheck' : 'Check'} ${h.title} for ${d}`} aria-pressed={logged} className={cx('mt-1 aspect-square w-full min-w-0 rounded-lg text-xs font-semibold transition active:scale-95', logged ? 'text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/[.06] dark:hover:bg-white/10')}
                        style={logged ? { background: catMap[h.categoryId]?.color ?? '#22c55e' } : {}}>{logged ? <CheckCircle2 className="mx-auto" size={16} /> : d.slice(8)}</button>
                    </div>;
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs dark:border-white/[.08]">
                  {h.frequency === 'daily' ? <span className="inline-flex items-center gap-1 font-semibold text-orange-500"><Flame size={14} />{streak(h.log)} {tr("day streak")}</span> : <span className="font-semibold text-indigo-600 dark:text-indigo-300">{weekDone}/{h.targetPerWeek} {tr("this week")}</span>}
                  <span className="inline-flex items-center gap-1 muted"><Trophy size={13} />{h.frequency === 'daily' ? `${bestStreak(h.log)} best days` : `${adherence(h)}% of ${days} active days`}</span>
                  <button className={cx('rounded-lg px-2.5 py-1.5 font-medium transition', on ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-200')} onClick={() => toggleHabit(h.id, t)}>{on ? 'Undo today' : 'Check in today'}</button>
                </div>
              </SortableHabitCard>;
            })}
          </div>

          </SortableContext>
          <div className="hidden overflow-x-auto md:block">
            <div className="card overflow-hidden">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-slate-200 dark:border-white/[.06]"><th className="w-9" aria-label="Reorder" />
                  <th className="p-4 text-left font-medium muted">{tr("Habit")}</th>
                  {week.map((d) => <th key={d} className={cx('w-12 p-2 text-center text-xs font-medium', d === t ? 'text-indigo-600 dark:text-indigo-300' : 'muted')}>{new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}<div>{d.slice(8)}</div></th>)}
                  <th className="p-2 text-center text-xs font-medium muted">{tr("Current")}</th><th className="p-2 text-center text-xs font-medium muted">{tr("Best")}</th><th className="p-2 text-center text-xs font-medium muted">{tr("30d")}</th><th />
                </tr></thead>
                <tbody><SortableContext items={list.map((h) => h.id)} strategy={verticalListSortingStrategy}>{list.map((h) => <SortableHabitRow key={h.id} id={h.id} active={draggingId === h.id}>
                  <td className="min-w-0 p-4"><button className="block max-w-[220px] break-words text-left font-medium" onClick={() => openEdit(h)}>{h.title}</button><div className="mt-1 flex flex-wrap items-center gap-1"><CatBadge cat={catMap[h.categoryId]} /><span className="chip bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-300">{h.frequency === 'daily' ? 'Daily' : `${h.targetPerWeek}× / week`}</span></div></td>
                  {week.map((d) => { const logged = h.log.includes(d); return <td key={d} className="p-2 text-center"><button onClick={() => toggleHabit(h.id, d)} aria-label={`${logged ? 'Uncheck' : 'Check'} ${h.title} for ${d}`} className={cx('h-8 w-8 rounded-lg transition', logged ? 'shadow-md' : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/[.05] dark:hover:bg-white/10')} style={logged ? { background: catMap[h.categoryId]?.color ?? '#22c55e' } : {}}>{logged && <span className="text-white">✓</span>}</button></td>; })}
                  <td className="p-2 text-center">{h.frequency === 'daily' ? <span className="inline-flex items-center gap-1 font-semibold text-orange-500"><Flame size={14} />{streak(h.log)}</span> : <span className="font-semibold text-indigo-600 dark:text-indigo-300">{weekCount(h.log, t, settings.weekStartsMonday)}/{h.targetPerWeek}</span>}</td>
                  <td className="p-2 text-center text-xs muted">{h.frequency === 'daily' ? bestStreak(h.log) : 'weekly goal'}</td><td className="p-2 text-center text-xs font-semibold">{adherence(h)}%</td>
                  <td className="p-2"><div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"><button className="btn-ghost !p-1.5" title={tr("Edit")} onClick={() => openEdit(h)}><Pencil size={14} /></button><button className="btn-ghost !p-1.5" title={showArchived ? 'Restore' : 'Archive'} onClick={() => updateHabit(h.id, { archived: !h.archived })}><Archive size={14} /></button><button className="btn-ghost !p-1.5 text-rose-500" title={tr("Move to Trash")} onClick={() => remove(h)}><Trash2 size={14} /></button></div></td>
                </SortableHabitRow>)}</SortableContext></tbody>
              </table>
            </div>
          </div>
          </DndContext>
        </>
      )}

      {list.length > 0 && <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
        {list.map((h) => <div key={h.id} className="card min-w-0 p-4">
          <div className="mb-3 break-words text-sm font-medium">{h.title} {tr("· last 12 weeks")}</div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">{heat.map((d) => <div key={d} title={d} className="aspect-square min-w-0 rounded-sm" style={{ background: h.log.includes(d) ? catMap[h.categoryId]?.color ?? '#22c55e' : 'rgb(148 163 184 / .15)' }} />)}</div>
        </div>)}
      </div>}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? 'Edit habit' : 'New habit'}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="habit-title">{tr("Habit")}</label><input id="habit-title" autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("e.g. Read 20 pages")} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">{tr("Life area")}</label><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
            <div><label className="label">{tr("Schedule")}</label><select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as HabitForm['frequency'], targetPerWeek: e.target.value === 'daily' ? 7 : 3 })}><option value="daily">{tr("Daily")}</option><option value="weekly">{tr("Times per week")}</option></select></div>
            {form.frequency === 'weekly' && <div><label className="label">{tr("Target per week")}</label><input type="number" min={1} max={7} className="input" value={form.targetPerWeek} onChange={(e) => setForm({ ...form, targetPerWeek: Number(e.target.value) })} /></div>}
          </div>
          <div><label className="label">{tr("Why this matters")}<span className="font-normal normal-case tracking-normal muted">{tr("(optional)")}</span></label><textarea className="input min-h-20 resize-y" value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} placeholder={tr("A short reminder for the days motivation is low…")} /></div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setFormOpen(false)}>{tr("Cancel")}</button><button className="btn-primary" disabled={!form.title.trim()} onClick={save}>{form.id ? 'Save habit' : 'Create habit'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
