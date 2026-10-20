import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { type DragEvent, type FormEvent, type KeyboardEvent, useMemo, useState } from 'react';
import { HORIZON_META, Modal, PageHeader } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { cx, toISODate, today } from '../lib/utils';

type EventKind = 'Item' | 'Goal' | 'Milestone' | 'Project' | 'Task';
type Ev = {
  key: string;
  title: string;
  date: string;
  color: string;
  kind: EventKind;
  entityId: string;
  parentId?: string;
  done?: boolean;
};

const displayDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

export default function Calendar() {
  const { items, goals, projects, settings, addItems, updateItem, updateGoal, updateProject, updateTask } = useStore();
  const catMap = useCategoryMap();
  const [tab, setTab] = useState<'month' | 'timeline' | 'horizons'>('month');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryDetails, setEntryDetails] = useState('');
  const [draggedEvent, setDraggedEvent] = useState<Ev | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [keyboardMovingEvent, setKeyboardMovingEvent] = useState<Ev | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const t = today();

  const events = useMemo<Ev[]>(() => [
    ...items.filter((i) => i.dueDate).map((i) => ({ key: `item-${i.id}`, entityId: i.id, title: i.title, date: i.dueDate!, color: catMap[i.categoryId]?.color ?? '#6366f1', kind: 'Item' as const, done: i.status === 'done' })),
    ...goals.filter((g) => g.targetDate).map((g) => ({ key: `goal-${g.id}`, entityId: g.id, title: '🎯 ' + g.title, date: g.targetDate!, color: catMap[g.categoryId]?.color ?? '#22c55e', kind: 'Goal' as const, done: g.status === 'done' })),
    ...goals.flatMap((g) => g.milestones.filter((m) => m.dueDate).map((m) => ({ key: `milestone-${g.id}-${m.id}`, entityId: m.id, parentId: g.id, title: '◆ ' + m.title, date: m.dueDate!, color: catMap[g.categoryId]?.color ?? '#22c55e', kind: 'Milestone' as const, done: m.done }))),
    ...projects.filter((p) => p.dueDate).map((p) => ({ key: `project-${p.id}`, entityId: p.id, title: '📁 ' + p.title, date: p.dueDate!, color: catMap[p.categoryId]?.color ?? '#3b82f6', kind: 'Project' as const, done: p.status === 'done' })),
    ...projects.flatMap((p) => p.tasks.filter((x) => x.dueDate).map((x) => ({ key: `task-${p.id}-${x.id}`, entityId: x.id, parentId: p.id, title: x.title, date: x.dueDate!, color: catMap[p.categoryId]?.color ?? '#3b82f6', kind: 'Task' as const, done: x.done }))),
  ], [items, goals, projects, catMap]);

  const byDate = useMemo(() => { const m: Record<string, Ev[]> = {}; events.forEach((e) => (m[e.date] ??= []).push(e)); return m; }, [events]);

  const startOffset = settings.weekStartsMonday ? (cursor.getDay() + 6) % 7 : cursor.getDay();
  const days = Array.from({ length: 42 }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + i));
  const wk = settings.weekStartsMonday ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeline = events.filter((e) => e.date >= t && !e.done).sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = timeline.reduce<Record<string, Ev[]>>((m, e) => { (m[e.date.slice(0, 7)] ??= []).push(e); return m; }, {});

  const openAddEntry = (date: string) => {
    setSelectedDate(date);
    setEntryTitle('');
    setEntryDetails('');
  };

  const createEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = entryTitle.trim();
    if (!title || !selectedDate) return;
    addItems([{ title, notes: entryDetails.trim(), dueDate: selectedDate }]);
    setAnnouncement(`Added ${title} on ${displayDate(selectedDate)}.`);
    setSelectedDate(null);
  };

  const moveEvent = (event: Ev, date: string) => {
    if (event.date === date) return;
    if (event.kind === 'Item') updateItem(event.entityId, { dueDate: date });
    if (event.kind === 'Goal') updateGoal(event.entityId, { targetDate: date });
    if (event.kind === 'Milestone' && event.parentId) {
      const goal = goals.find((g) => g.id === event.parentId);
      if (!goal) return;
      updateGoal(goal.id, { milestones: goal.milestones.map((m) => (m.id === event.entityId ? { ...m, dueDate: date } : m)) });
    }
    if (event.kind === 'Project') updateProject(event.entityId, { dueDate: date });
    if (event.kind === 'Task' && event.parentId) updateTask(event.parentId, event.entityId, { dueDate: date });
    setAnnouncement(`Moved ${event.title.replace(/^[^\w]+\s*/, '')} to ${displayDate(date)}.`);
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLDivElement>, date: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (keyboardMovingEvent) {
      moveEvent(keyboardMovingEvent, date);
      setKeyboardMovingEvent(null);
    } else {
      openAddEntry(date);
    }
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, calendarEvent: Ev) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', calendarEvent.key);
    setDraggedEvent(calendarEvent);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, date: string) => {
    event.preventDefault();
    const key = event.dataTransfer.getData('text/plain');
    const calendarEvent = draggedEvent ?? events.find((item) => item.key === key);
    if (calendarEvent) moveEvent(calendarEvent, date);
    setDraggedEvent(null);
    setDragOverDate(null);
  };

  return (
    <div>
      <PageHeader title="Calendar & Timeline" subtitle="Deadlines and life horizons" actions={
        <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-white/10">
          {(['month', 'timeline', 'horizons'] as const).map((x) => <button key={x} onClick={() => setTab(x)} className={cx('rounded-lg px-3 py-1.5 text-sm capitalize', tab === x && 'bg-indigo-600 text-white')}>{x}</button>)}
        </div>} />

      {tab === 'month' && (
        <div className="card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="flex gap-1">
              <button className="btn-ghost !p-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
              <button className="btn-outline !py-1" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
              <button className="btn-ghost !p-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/[.06] dark:bg-white/[.06]" role="grid" aria-label="Monthly calendar">
            {wk.map((d) => <div key={d} className="bg-slate-50 py-2 text-center text-xs font-medium muted dark:bg-[#0f1218]">{d}</div>)}
            {days.map((d) => {
              const iso = toISODate(d);
              const ev = byDate[iso] ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div key={iso} role="gridcell" tabIndex={0}
                  aria-label={`${displayDate(iso)}. ${ev.length} scheduled ${ev.length === 1 ? 'entry' : 'entries'}. ${keyboardMovingEvent ? `Press Enter to move ${keyboardMovingEvent.title} here.` : 'Press Enter to add an entry.'}`}
                  onClick={(event) => { if (!(event.target as HTMLElement).closest('[data-calendar-event]')) openAddEntry(iso); }}
                  onKeyDown={(event) => handleDayKeyDown(event, iso)}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOverDate !== iso) setDragOverDate(iso); }}
                  onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverDate(null); }}
                  onDrop={(event) => handleDrop(event, iso)}
                  className={cx('group min-h-[96px] cursor-pointer bg-white p-1.5 outline-none transition dark:bg-[#0d1016]', !inMonth && 'opacity-40', dragOverDate === iso && 'bg-indigo-50 ring-2 ring-inset ring-indigo-500 dark:bg-indigo-500/10', 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500')}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className={cx('grid h-6 w-6 place-items-center rounded-full text-xs', iso === t && 'bg-indigo-600 font-bold text-white')}>{d.getDate()}</div>
                    <span className="grid h-5 w-5 place-items-center rounded-full text-indigo-500 opacity-0 transition group-hover:opacity-100" aria-hidden="true"><Plus size={13} /></span>
                  </div>
                  <div className="max-h-[72px] space-y-0.5 overflow-y-auto pr-0.5">
                    {ev.map((e) => (
                      <button key={e.key} type="button" draggable data-calendar-event title={`${e.kind}: ${e.title}. Drag to another date, or press Enter to pick up for keyboard move.`}
                        aria-label={`${e.kind}: ${e.title}, due ${displayDate(e.date)}. Press Enter to ${keyboardMovingEvent?.key === e.key ? 'cancel moving' : 'pick up and move with a calendar date'}.`}
                        aria-pressed={keyboardMovingEvent?.key === e.key}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          const pickingUp = keyboardMovingEvent?.key !== e.key;
                          setKeyboardMovingEvent(pickingUp ? e : null);
                          setAnnouncement(pickingUp ? `Moving ${e.title.replace(/^[^\w]+\s*/, '')}. Focus a date and press Enter to place it.` : `Cancelled moving ${e.title.replace(/^[^\w]+\s*/, '')}.`);
                        }}
                        onDragStart={(event) => handleDragStart(event, e)}
                        onDragEnd={() => { setDraggedEvent(null); setDragOverDate(null); }}
                        className={cx('block w-full cursor-grab truncate rounded px-1.5 py-0.5 text-left text-[11px] active:cursor-grabbing', e.done && 'line-through opacity-60', keyboardMovingEvent?.key === e.key && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-[#0d1016]')}
                        style={{ background: e.color + '22', color: e.color }}>{e.title}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card p-6">
          {timeline.length === 0 ? <p className="muted">No upcoming dated items. Add due dates to items, goals, and tasks.</p> : (
            <div className="relative border-l-2 border-indigo-500/30 pl-6">
              {Object.entries(byMonth).map(([m, evs]) => (
                <div key={m} className="mb-8">
                  <div className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-4 border-indigo-500 bg-white dark:bg-[#0b0d12]" />
                  <h3 className="mb-3 font-semibold">{new Date(m + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
                  <div className="space-y-2">
                    {evs.map((e, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-white/[.06]">
                        <span className="w-14 text-xs font-semibold muted">{new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                        <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                        <span className="flex-1 text-sm">{e.title}</span><span className="text-xs muted">{e.kind}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'horizons' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(HORIZON_META).map(([h, label], idx) => {
            const list = items.filter((i) => i.horizon === h && i.status !== 'done' && i.status !== 'dropped');
            return (
              <div key={h} className="card p-4">
                <div className="mb-1 text-xs uppercase tracking-wide muted">Horizon {idx + 1}</div>
                <h3 className="mb-3 font-semibold">{label} <span className="text-sm muted">· {list.length}</span></h3>
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                  {list.slice(0, 60).map((i) => (
                    <div key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm" style={{ background: (catMap[i.categoryId]?.color ?? '#666') + '12' }}>
                      <span>{catMap[i.categoryId]?.icon}</span><span className="truncate">{i.title}</span>
                    </div>
                  ))}
                  {list.length > 60 && <div className="text-xs muted">+{list.length - 60} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title="Add calendar entry">
        <form onSubmit={createEntry}>
          <p className="mb-4 text-sm muted">This item will be due <time dateTime={selectedDate ?? undefined} className="font-medium text-slate-700 dark:text-slate-200">{selectedDate && displayDate(selectedDate)}</time>.</p>
          <div>
            <label className="label" htmlFor="calendar-entry-title">Title</label>
            <input id="calendar-entry-title" className="input" autoFocus required maxLength={200} value={entryTitle} onChange={(event) => setEntryTitle(event.target.value)} placeholder="What do you need to do?" />
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="calendar-entry-details">Details <span className="normal-case">(optional)</span></label>
            <textarea id="calendar-entry-details" className="input min-h-[96px]" value={entryDetails} onChange={(event) => setEntryDetails(event.target.value)} placeholder="Add notes or context" />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setSelectedDate(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!entryTitle.trim()}>Add entry</button>
          </div>
        </form>
      </Modal>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  );
}
