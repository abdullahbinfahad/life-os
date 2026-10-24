import { translate as tr } from '../lib/locales';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, GripVertical, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader, Progress, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Goal } from '../lib/types';
import { cx, daysBetween, fmtDate, pct, today, uid } from '../lib/utils';

function SortableRow({ id, children, card = false, goalId }: { id: string; children: React.ReactNode; card?: boolean; goalId?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { goalId } });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(card ? 'card relative p-5' : 'group flex items-center gap-2 rounded text-sm', isDragging && 'z-10 bg-indigo-500/10 ring-2 ring-indigo-400')}>
    <button type="button" {...attributes} {...listeners} aria-label={card ? tr('Reorder goal') : tr('Reorder milestone')} title={tr('Drag to reorder')} className={cx('cursor-grab touch-none rounded p-1 muted hover:bg-slate-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 active:cursor-grabbing', card && 'absolute right-2 top-2 z-10')}><GripVertical size={card ? 18 : 15} /></button>
    {children}
  </div>;
}

export default function Goals() {
  const { goals, items, projects, categories, addGoal, updateGoal, deleteGoal } = useStore();
  const catMap = useCategoryMap();
  const [filter, setFilter] = useState<'active' | 'paused' | 'done' | 'all'>('active');
  const [edit, setEdit] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', targetDate: '' });
  const [ms, setMs] = useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const list = goals.filter((g) => filter === 'all' || g.status === filter);
  const progress = (g: Goal) => {
    const linked = items.filter((i) => i.goalId === g.id);
    const tot = g.milestones.length + linked.length;
    const done = g.milestones.filter((m) => m.done).length + linked.filter((i) => i.status === 'done').length;
    return pct(done, tot);
  };

  const create = () => {
    if (!form.title.trim()) return;
    addGoal({ ...form, targetDate: form.targetDate || undefined });
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '', targetDate: '' });
    setCreating(false);
  };
  const addMilestone = (g: Goal) => {
    const v = ms[g.id]?.trim();
    if (!v) return;
    updateGoal(g.id, { milestones: [...g.milestones, { id: uid(), title: v, done: false }] });
    setMs({ ...ms, [g.id]: '' });
  };

  const reorder = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const a = String(active.id), b = String(over.id);
    if (a.startsWith('goal:') && b.startsWith('goal:')) {
      const visibleIds = list.map((g) => g.id);
      const moved = arrayMove(visibleIds, visibleIds.indexOf(a.slice(5)), visibleIds.indexOf(b.slice(5)));
      useStore.setState((state) => {
        let i = 0; const visible = new Set(visibleIds);
        const byId = new Map(state.goals.map((g) => [g.id, g]));
        return { goals: state.goals.map((g) => visible.has(g.id) ? byId.get(moved[i++])! : g) };
      });
    } else if (a.startsWith('milestone:') && b.startsWith('milestone:')) {
      const goalId = active.data.current?.goalId as string | undefined;
      if (!goalId || over.data.current?.goalId !== goalId) return;
      const goal = goals.find((g) => g.id === goalId); if (!goal) return;
      const from = goal.milestones.findIndex((m) => `milestone:${m.id}` === a);
      const to = goal.milestones.findIndex((m) => `milestone:${m.id}` === b);
      if (from >= 0 && to >= 0) updateGoal(goalId, { milestones: arrayMove(goal.milestones, from, to) });
    }
  };

  return (
    <div>
      <PageHeader title={tr("Goals")} subtitle={tr("Outcomes, milestones, and progress")} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {tr("New goal")}</button>} />
      <div className="mb-5 flex gap-1">
        {(['active', 'paused', 'done', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('btn capitalize', filter === f ? 'bg-indigo-600 text-white' : 'btn-ghost')}>{f} <span className="text-xs opacity-60">{goals.filter((g) => f === 'all' || g.status === f).length}</span></button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon={<Target size={28} />} title={tr("No goals here")} text="Goals are meaningful outcomes. Break them into milestones and link library items and projects to track progress." action={<button className="btn-primary" onClick={() => setCreating(true)}>{tr("Create a goal")}</button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder} accessibility={{ announcements: {
          onDragStart: ({ active }) => `${String(active.id).startsWith('goal:') ? tr('Goal') : tr('Milestone')} ${tr('picked up')}`,
          onDragOver: ({ over }) => over ? `${tr('Over')} ${String(over.id).startsWith('goal:') ? tr('goal') : tr('milestone')}` : tr('Not over a drop target'),
          onDragEnd: ({ active, over }) => over ? `${String(active.id).startsWith('goal:') ? tr('Goal') : tr('Milestone')} ${tr('reordered')}` : tr('Drag cancelled'),
          onDragCancel: () => tr('Drag cancelled'),
        } }}>
        <SortableContext items={list.map((g) => `goal:${g.id}`)} strategy={rectSortingStrategy}>
        <div className="grid gap-5 md:grid-cols-2">
          {list.map((g) => {
            const p = progress(g);
            const c = catMap[g.categoryId];
            const left = g.targetDate ? daysBetween(today(), g.targetDate) : null;
            const linkedProjects = projects.filter((x) => x.goalId === g.id);
            const linkedItems = items.filter((i) => i.goalId === g.id);
            return (
              <SortableRow key={g.id} id={`goal:${g.id}`} card>
                <div className="flex items-start gap-4">
                  <Ring value={p} size={72} color={c?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold leading-snug">{g.title}</h3>
                      <select className="rounded-lg bg-transparent text-xs muted outline-none" value={g.status} onChange={(e) => updateGoal(g.id, { status: e.target.value as any })}>
                        <option value="active">{tr("Active")}</option><option value="paused">{tr("Paused")}</option><option value="done">{tr("Achieved")}</option>
                      </select>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CatBadge cat={c} />
                      {g.targetDate && <span className={cx('chip', left! < 0 ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-200/70 dark:bg-white/[.06]')}>{fmtDate(g.targetDate)} · {left! < 0 ? `${-left!}d over` : `${left}d left`}</span>}
                    </div>
                    {g.description && <p className="mt-2 text-sm muted">{g.description}</p>}
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="label">{tr("Milestones")}</div>
                  <SortableContext items={g.milestones.map((m) => `milestone:${m.id}`)} strategy={verticalListSortingStrategy}>
                  {g.milestones.map((m) => (
                    <SortableRow key={m.id} id={`milestone:${m.id}`} goalId={g.id}>
                      <button className={m.done ? 'text-emerald-500' : 'muted'} onClick={() => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}>
                        {m.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                      <span className={cx('flex-1', m.done && 'line-through muted')}>{m.title}</span>
                      <button className="opacity-0 group-hover:opacity-100 muted" onClick={() => updateGoal(g.id, { milestones: g.milestones.filter((x) => x.id !== m.id) })}><Trash2 size={14} /></button>
                    </SortableRow>
                  ))}
                  </SortableContext>
                  <input className="input mt-2 !py-1.5" placeholder={tr("+ Add milestone, press Enter")} value={ms[g.id] ?? ''} onChange={(e) => setMs({ ...ms, [g.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addMilestone(g)} />
                </div>
                {(linkedItems.length > 0 || linkedProjects.length > 0) && (
                  <div className="mt-4 border-t border-slate-200 pt-3 text-xs muted dark:border-white/[.06]">
                    {linkedItems.length} {tr("linked items ·")}{linkedProjects.length} {tr("projects")}{linkedProjects.map((lp) => <Progress key={lp.id} className="mt-2" value={pct(lp.tasks.filter((x) => x.done).length, lp.tasks.length)} color={c?.color} />)}
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-1">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(g)}>{tr("Edit")}</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs text-rose-500" onClick={() => confirm('Delete goal?') && deleteGoal(g.id)}>{tr("Delete")}</button>
                </div>
              </SortableRow>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr("New goal")}>
        <div className="space-y-3">
          <div><label className="label">{tr("Goal")}</label><input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("e.g. Become fluent in Mandarin")} /></div>
          <div><label className="label">{tr("Why it matters")}</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{tr("Category")}</label><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
            <div><label className="label">{tr("Target date")}</label><input type="date" className="input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setCreating(false)}>{tr("Cancel")}</button><button className="btn-primary" onClick={create}>{tr("Create")}</button></div>
        </div>
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={tr("Edit goal")}>
        {edit && (
          <div className="space-y-3">
            <div><label className="label">{tr("Goal")}</label><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div><label className="label">{tr("Why it matters")}</label><textarea className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{tr("Category")}</label><select className="input" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
              <div><label className="label">{tr("Target date")}</label><input type="date" className="input" value={edit.targetDate ?? ''} onChange={(e) => setEdit({ ...edit, targetDate: e.target.value || undefined })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setEdit(null)}>{tr("Cancel")}</button><button className="btn-primary" onClick={() => { const { status, ...rest } = edit; updateGoal(edit.id, rest); setEdit(null); }}>{tr("Save")}</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
