import { translate as tr } from '../lib/locales';
import { useDragSensors } from '../lib/dnd';
import { DndContext, closestCenter, pointerWithin, type CollisionDetection, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Check, CheckCircle2, Circle, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { useLongPress } from '../lib/useLongPress';
import { dragHaptic } from '../lib/dnd';
import type { Milestone } from '../lib/types';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader, Progress, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Goal } from '../lib/types';
import { cx, daysBetween, fmtDate, pct, today, uid } from '../lib/utils';

function SortableRow({ id, children, card = false, goalId, dropTarget = false }: { id: string; children: React.ReactNode; card?: boolean; goalId?: string; dropTarget?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { goalId } });
  const stopInteractiveDrag = (event: React.SyntheticEvent) => {
    const target = event.target as HTMLElement;
    // A milestone row inside a goal card handles its own drag: let the event through so the inner row wins.
    if (card && target.closest('.milestone-row')) return;
    if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) event.stopPropagation();
  };
  return <div ref={setNodeRef} {...attributes} {...listeners} onPointerDownCapture={stopInteractiveDrag} onTouchStartCapture={stopInteractiveDrag} aria-label={tr(card ? 'Drag to reorder goal' : 'Drag to move milestone (to another goal too)')} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 40 : undefined, touchAction: card ? 'pan-y' : undefined }} className={cx(card ? 'card relative cursor-grab p-5 pt-6 active:cursor-grabbing' : 'milestone-row group flex cursor-grab items-center gap-0.5 text-sm active:cursor-grabbing', isDragging && (card ? 'opacity-80 shadow-2xl' : 'is-dragging'), dropTarget && 'goal-drop-target')}>
    {children}
  </div>;
}

function MilestoneRow({ goal, milestone, goals, onToggle, onSave, onDelete, onMove }: { goal: Goal; milestone: Milestone; goals: Goal[]; onToggle: () => void; onSave: (patch: Partial<Milestone>) => void; onDelete: () => void; onMove: (goalId: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [due, setDue] = useState(milestone.dueDate ?? '');
  const press = useLongPress(() => { setTitle(milestone.title); setDue(milestone.dueDate ?? ''); setEditing(true); }, onToggle);
  const save = () => { const value = title.trim(); if (value) onSave({ title: value, dueDate: due || undefined }); setEditing(false); };
  if (editing) return <div className="milestone-edit">
    <input autoFocus className="input min-w-0 !py-2 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(false); }} aria-label={tr('Milestone')} />
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
      <div className="relative min-w-0">
        <input type="date" className="input !w-auto !py-1.5 text-xs" value={due} onChange={(event) => setDue(event.target.value)} aria-label={tr('Due date')} />
        {!due && <span className="due-date-hint pointer-events-none absolute inset-y-0 left-3 items-center gap-1 text-xs muted" aria-hidden="true"><CalendarDays size={13} />{tr('Due date')}</span>}
      </div>
      {goals.length > 1 && <select className="input !w-auto min-w-0 max-w-[12rem] !py-1.5 text-xs" value={goal.id} onChange={(event) => { if (event.target.value !== goal.id) { onMove(event.target.value); setEditing(false); } }} aria-label={tr('Move to goal')}>{goals.map((item) => <option key={item.id} value={item.id}>{item.id === goal.id ? `📍 ${item.title}` : `→ ${item.title}`}</option>)}</select>}
      <span className="flex-1" />
      <button type="button" className="tap-action !opacity-100 text-rose-500" aria-label={tr('Delete milestone')} onClick={() => { if (confirm(tr('Delete this milestone?'))) onDelete(); }}><Trash2 size={15} /></button>
      <button type="button" className="tap-action !opacity-100" aria-label={tr('Cancel')} onClick={() => setEditing(false)}><X size={16} /></button>
      <button type="button" className="btn-primary !min-h-9 !px-3" onClick={save}><Check size={15} />{tr('Save')}</button>
    </div>
  </div>;
  return <>
    <button type="button" role="checkbox" aria-checked={milestone.done} title={tr('Tap to tick · long-press or double-click to edit')} className={cx('milestone-toggle', milestone.done && 'is-done')} {...press}>
      <span className="milestone-check" aria-hidden="true">{milestone.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}</span>
      <span className="min-w-0 flex-1 text-left"><span className={cx('break-words', milestone.done && 'line-through muted')}>{milestone.title}</span>{milestone.dueDate && <span className="mt-0.5 block text-xs muted">{tr('Due date')}: {fmtDate(milestone.dueDate)}</span>}</span>
    </button>
    <button type="button" className="milestone-delete" aria-label={`${tr('Edit milestone')}: ${milestone.title}`} title={tr('Edit')} onClick={() => { setTitle(milestone.title); setDue(milestone.dueDate ?? ''); setEditing(true); }}><Pencil size={14} /></button>
  </>;
}

export default function Goals() {
  const { goals, items, projects, categories, addGoal, updateGoal, deleteGoal } = useStore();
  const catMap = useCategoryMap();
  const [filter, setFilter] = useState<'active' | 'paused' | 'done' | 'all'>('active');
  const [edit, setEdit] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', targetDate: '' });
  const [ms, setMs] = useState<Record<string, string>>({});
  const sensors = useDragSensors('row');
  const [overGoal, setOverGoal] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState('');

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

  const goalOf = (id: string | undefined) => !id ? undefined : id.startsWith('goal:') ? id.slice(5) : goals.find((goal) => goal.milestones.some((m) => `milestone:${m.id}` === id))?.id;
  // Milestones look for other milestones first, then for a goal card to drop into; goals only see goals.
  const collision: CollisionDetection = (args) => {
    const activeId = String(args.active.id);
    if (activeId.startsWith('goal:')) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((entry) => String(entry.id).startsWith('goal:')) });
    const milestones = args.droppableContainers.filter((entry) => String(entry.id).startsWith('milestone:'));
    const onMilestone = pointerWithin({ ...args, droppableContainers: milestones });
    if (onMilestone.length) return onMilestone;
    const onGoal = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((entry) => String(entry.id).startsWith('goal:')) });
    if (onGoal.length) return onGoal;
    return closestCenter({ ...args, droppableContainers: milestones });
  };
  const moveMilestone = (milestoneId: string, fromGoalId: string, toGoalId: string, beforeId?: string) => {
    const from = goals.find((goal) => goal.id === fromGoalId); const to = goals.find((goal) => goal.id === toGoalId);
    const milestone = from?.milestones.find((m) => m.id === milestoneId);
    if (!from || !to || !milestone || from.id === to.id) return;
    const index = beforeId ? to.milestones.findIndex((m) => m.id === beforeId) : -1;
    const nextTo = [...to.milestones]; nextTo.splice(index >= 0 ? index : nextTo.length, 0, milestone);
    useStore.setState((state) => ({ goals: state.goals.map((goal) => goal.id === from.id ? { ...goal, milestones: goal.milestones.filter((m) => m.id !== milestoneId) } : goal.id === to.id ? { ...goal, milestones: nextTo } : goal) }));
    setMoveNote(`${tr('Moved')} “${milestone.title}” ${tr('to')} ${to.title}`);
    window.setTimeout(() => setMoveNote(''), 2600);
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!String(active.id).startsWith('milestone:')) return;
    const target = goalOf(over ? String(over.id) : undefined);
    setOverGoal(target && target !== active.data.current?.goalId ? target : null);
  };
  const reorder = ({ active, over }: DragEndEvent) => {
    setOverGoal(null);
    if (!over || active.id === over.id) return;
    dragHaptic();
    const a = String(active.id), b = String(over.id);
    if (a.startsWith('goal:') && b.startsWith('goal:')) {
      const visibleIds = list.map((g) => g.id);
      const moved = arrayMove(visibleIds, visibleIds.indexOf(a.slice(5)), visibleIds.indexOf(b.slice(5)));
      useStore.setState((state) => {
        let i = 0; const visible = new Set(visibleIds);
        const byId = new Map(state.goals.map((g) => [g.id, g]));
        return { goals: state.goals.map((g) => visible.has(g.id) ? byId.get(moved[i++])! : g) };
      });
    } else if (a.startsWith('milestone:')) {
      const fromGoalId = active.data.current?.goalId as string | undefined;
      const toGoalId = goalOf(b);
      if (!fromGoalId || !toGoalId) return;
      if (toGoalId !== fromGoalId) { moveMilestone(a.slice(10), fromGoalId, toGoalId, b.startsWith('milestone:') ? b.slice(10) : undefined); return; }
      const goal = goals.find((g) => g.id === fromGoalId); if (!goal || !b.startsWith('milestone:')) return;
      const from = goal.milestones.findIndex((m) => `milestone:${m.id}` === a);
      const to = goal.milestones.findIndex((m) => `milestone:${m.id}` === b);
      if (from >= 0 && to >= 0) updateGoal(fromGoalId, { milestones: arrayMove(goal.milestones, from, to) });
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
      {moveNote && <div className="goal-move-note" role="status"><Check size={15} />{moveNote}</div>}
      {list.length === 0 ? (
        <Empty icon={<Target size={28} />} title={tr("No goals here")} text="Goals are meaningful outcomes. Break them into milestones and link library items and projects to track progress." action={<button className="btn-primary" onClick={() => setCreating(true)}>{tr("Create a goal")}</button>} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={() => dragHaptic()} onDragOver={onDragOver} onDragCancel={() => setOverGoal(null)} onDragEnd={reorder} accessibility={{ announcements: {
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
              <SortableRow key={g.id} id={`goal:${g.id}`} card dropTarget={overGoal === g.id}>
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
                <div className="mt-4">
                  <div className="label mb-1 flex items-center justify-between"><span>{tr("Milestones")}</span>{g.milestones.length > 0 && <span className="text-[10px] font-normal normal-case tracking-normal opacity-70">{tr('Long-press to edit')}</span>}</div>
                  <SortableContext items={g.milestones.map((m) => `milestone:${m.id}`)} strategy={verticalListSortingStrategy}>
                  {g.milestones.map((m) => (
                    <SortableRow key={m.id} id={`milestone:${m.id}`} goalId={g.id}>
                      <MilestoneRow goal={g} milestone={m} goals={goals.filter((goal) => goal.status !== 'done' || goal.id === g.id)}
                        onToggle={() => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}
                        onSave={(patch) => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) })}
                        onDelete={() => updateGoal(g.id, { milestones: g.milestones.filter((x) => x.id !== m.id) })}
                        onMove={(toGoalId) => moveMilestone(m.id, g.id, toGoalId)} />
                    </SortableRow>
                  ))}
                  {g.milestones.length === 0 && overGoal === g.id && <p className="goal-drop-hint">{tr('Drop here to move the milestone')}</p>}
                  </SortableContext>
                  <input className="input mt-2 min-h-10 !py-2" enterKeyHint="done" placeholder={tr("+ Add milestone, press Enter")} value={ms[g.id] ?? ''} onChange={(e) => setMs({ ...ms, [g.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addMilestone(g)} />
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
