import { translate as tr } from '../lib/locales';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { type DragEvent, type FormEvent, type KeyboardEvent, useMemo, useState } from 'react';
import { HORIZON_META, Modal, PageHeader } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { cx, localeForLanguage, toISODate, today } from '../lib/utils';
import { playFeedback } from '../lib/sounds';

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

const displayDate = (date: string, language = 'en') => new Date(`${date}T00:00:00`).toLocaleDateString(localeForLanguage(language), {
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
    playFeedback('submit');
    setAnnouncement(`Added ${title} on ${displayDate(selectedDate, settings.language)}.`);
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
    setAnnouncement(`Moved ${event.title.replace(/^[^\w]+\s*/, '')} to ${displayDate(date, settings.language)}.`);
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

  const handleDragStart = (event: DragEvent<HTMLElement>, calendarEvent: Ev) => {
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

  const moveItemToHorizon = (itemId: string, horizon: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || item.horizon === horizon) return;
    updateItem(itemId, { horizon: horizon as typeof item.horizon });
    setAnnouncement(`Moved ${item.title} to ${HORIZON_META[horizon as keyof typeof HORIZON_META]}.`);
  };

  const handleHorizonDrop = (event: DragEvent<HTMLDivElement>, horizon: string) => {
    event.preventDefault();
    const key = event.dataTransfer.getData('text/plain');
    const dragged = draggedEvent ?? events.find((entry) => entry.key === key);
    if (dragged?.kind === 'Item') moveItemToHorizon(dragged.entityId, horizon);
    else if (dragged) setAnnouncement(`${dragged.kind} horizons cannot be changed here.`);
    setDraggedEvent(null);
  };

  return (
    <div>
      <PageHeader title={tr("Calendar & Timeline")} subtitle={tr("Deadlines and life horizons")} actions={
        <div className="mobile-choice-rail max-w-full gap-1 rounded-xl border border-slate-200 p-0.5 dark:border-white/10" role="tablist" aria-label={tr("Calendar views")}>
          {(['month', 'timeline', 'horizons'] as const).map((x) => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cx('rounded-lg px-3 py-1.5 text-sm capitalize', tab === x && 'bg-indigo-600 text-white')}>{x}</button>)}
        </div>} />

      {tab === 'month' && (
        <div className="card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="ml-auto flex shrink-0 gap-1">
              <button className="btn-ghost !p-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
              <button className="btn-outline !py-1" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{tr("Today")}</button>
              <button className="btn-ghost !p-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="calendar-month-grid grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/[.06] dark:bg-white/[.06]" role="grid" aria-label={tr("Monthly calendar")}>
            {wk.map((d) => <div key={d} className="bg-slate-50 py-2 text-center text-xs font-medium muted dark:bg-[#0f1218]">{d}</div>)}
            {days.map((d) => {
              const iso = toISODate(d);
              const ev = byDate[iso] ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div key={iso} role="gridcell" tabIndex={0}
                  aria-label={`${displayDate(iso, settings.language)}. ${ev.length} scheduled ${ev.length === 1 ? 'entry' : 'entries'}. ${keyboardMovingEvent ? `Press Enter to move ${keyboardMovingEvent.title} here.` : 'Press Enter to add an entry.'}`}
                  onClick={(event) => { if (!(event.target as HTMLElement).closest('[data-calendar-event]')) openAddEntry(iso); }}
                  onKeyDown={(event) => handleDayKeyDown(event, iso)}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragOverDate !== iso) setDragOverDate(iso); }}
                  onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverDate(null); }}
                  onDrop={(event) => handleDrop(event, iso)}
                  className={cx('group min-h-[96px] min-w-0 cursor-pointer bg-white p-0.5 outline-none transition dark:bg-[#0d1016] sm:p-1.5', !inMonth && 'opacity-40', dragOverDate === iso && 'bg-indigo-50 ring-2 ring-inset ring-indigo-500 dark:bg-indigo-500/10', 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500')}>
                  <div className="mb-1 flex items-center justify-between gap-0.5">
                    <div className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', iso === t && 'bg-indigo-600 font-bold text-white')}>{d.getDate()}</div>
                    <span className="hidden h-5 w-5 shrink-0 place-items-center rounded-full text-indigo-500 opacity-0 transition group-hover:opacity-100 sm:grid" aria-hidden="true"><Plus size={13} /></span>
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
                        className={cx('block w-full min-w-0 cursor-grab truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] text-slate-800 active:cursor-grabbing dark:text-slate-100 sm:px-1.5 sm:text-[11px]', e.done && 'line-through opacity-60', keyboardMovingEvent?.key === e.key && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-[#0d1016]')}
                        style={{ background: e.color + '22', borderLeftColor: e.color }}>{e.title}</button>
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
          {timeline.length === 0 ? <p className="muted">{tr("No upcoming dated items. Add due dates to items, goals, and tasks.")}</p> : (
            <div className="relative border-l-2 border-indigo-500/30 pl-6">
              {Object.entries(byMonth).map(([m, evs]) => (
                <div key={m} className="mb-8">
                  <div className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-4 border-indigo-500 bg-white dark:bg-[#0b0d12]" />
                  <h3 className="mb-3 font-semibold">{new Date(m + '-01T00:00:00').toLocaleDateString(localeForLanguage(settings.language), { month: 'long', year: 'numeric' })}</h3>
                  <div className="space-y-2">
                    {evs.map((e, i) => (
                      <div key={e.key} draggable onDragStart={(event) => handleDragStart(event, e)} onDragEnd={() => setDraggedEvent(null)} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:border-indigo-300 dark:border-white/[.06] dark:hover:border-indigo-500/50 motion-reduce:transition-none">
                        <span className="w-14 shrink-0 text-xs font-semibold muted">{new Date(e.date + 'T00:00:00').toLocaleDateString(localeForLanguage(settings.language), { day: 'numeric', month: 'short' })}</span>
                        <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                        <span className="min-w-0 flex-1 break-words text-sm">{e.title}</span><span className="shrink-0 text-xs muted">{e.kind}</span>
                        <label className="flex items-center gap-1 text-xs muted">{tr("Move date")}<input aria-label={`${tr("Move date for")} ${e.title}`} type="date" value={e.date} onChange={(event) => moveEvent(e, event.target.value)} className="max-w-[9.5rem] rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-slate-700 dark:border-white/10 dark:text-slate-200" /></label>
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
              <div key={h} className="card p-4 transition-colors motion-reduce:transition-none" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleHorizonDrop(event, h)}>
                <div className="mb-1 text-xs uppercase tracking-wide muted">{tr("Horizon")} {idx + 1}</div>
                <h3 className="mb-3 font-semibold">{label} <span className="text-sm muted">· {list.length}</span></h3>
                <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                  {list.slice(0, 60).map((i) => (
                    <div key={i.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `item-${i.id}`); }} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:ring-1 hover:ring-indigo-400/50 motion-reduce:transition-none" style={{ background: (catMap[i.categoryId]?.color ?? '#666') + '12' }}>
                      <span className="mt-0.5" aria-hidden="true">{catMap[i.categoryId]?.icon}</span><span className="min-w-0 break-words leading-5">{i.title}</span>
                      <label className="sr-only" htmlFor={`horizon-${i.id}`}>{tr("Move horizon for")} {i.title}</label>
                      <select id={`horizon-${i.id}`} aria-label={`${tr("Move horizon for")} ${i.title}`} value={i.horizon} onChange={(event) => moveItemToHorizon(i.id, event.target.value)} className="col-span-2 w-full min-w-0 rounded-md border border-slate-200 bg-white/80 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900">
                        {Object.entries(HORIZON_META).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                      </select>
                    </div>
                  ))}
                  {list.length > 60 && <div className="text-xs muted">+{list.length - 60} {tr("more")}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={tr("Add calendar entry")}>
        <form onSubmit={createEntry}>
          <p className="mb-4 text-sm muted">{tr("This item will be due")}<time dateTime={selectedDate ?? undefined} className="font-medium text-slate-700 dark:text-slate-200">{selectedDate && displayDate(selectedDate, settings.language)}</time>.</p>
          <div>
            <label className="label" htmlFor="calendar-entry-title">{tr("Title")}</label>
            <input id="calendar-entry-title" className="input" autoFocus required maxLength={200} value={entryTitle} onChange={(event) => setEntryTitle(event.target.value)} placeholder={tr("What do you need to do?")} />
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="calendar-entry-details">{tr("Details")}<span className="normal-case">{tr("(optional)")}</span></label>
            <textarea id="calendar-entry-details" className="input min-h-[96px]" value={entryDetails} onChange={(event) => setEntryDetails(event.target.value)} placeholder={tr("Add notes or context")} />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setSelectedDate(null)}>{tr("Cancel")}</button>
            <button type="submit" className="btn-primary" disabled={!entryTitle.trim()}>{tr("Add entry")}</button>
          </div>
        </form>
      </Modal>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  );
}
