import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HORIZON_META, PageHeader } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { cx, toISODate, today } from '../lib/utils';

type Ev = { title: string; date: string; color: string; kind: string; done?: boolean };

export default function Calendar() {
  const { items, goals, projects, settings } = useStore();
  const catMap = useCategoryMap();
  const [tab, setTab] = useState<'month' | 'timeline' | 'horizons'>('month');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const t = today();

  const events = useMemo<Ev[]>(() => [
    ...items.filter((i) => i.dueDate).map((i) => ({ title: i.title, date: i.dueDate!, color: catMap[i.categoryId]?.color ?? '#6366f1', kind: 'Item', done: i.status === 'done' })),
    ...goals.filter((g) => g.targetDate).map((g) => ({ title: '🎯 ' + g.title, date: g.targetDate!, color: catMap[g.categoryId]?.color ?? '#22c55e', kind: 'Goal', done: g.status === 'done' })),
    ...goals.flatMap((g) => g.milestones.filter((m) => m.dueDate).map((m) => ({ title: '◆ ' + m.title, date: m.dueDate!, color: catMap[g.categoryId]?.color ?? '#22c55e', kind: 'Milestone', done: m.done }))),
    ...projects.filter((p) => p.dueDate).map((p) => ({ title: '📁 ' + p.title, date: p.dueDate!, color: catMap[p.categoryId]?.color ?? '#3b82f6', kind: 'Project', done: p.status === 'done' })),
    ...projects.flatMap((p) => p.tasks.filter((x) => x.dueDate).map((x) => ({ title: x.title, date: x.dueDate!, color: catMap[p.categoryId]?.color ?? '#3b82f6', kind: 'Task', done: x.done }))),
  ], [items, goals, projects, catMap]);

  const byDate = useMemo(() => { const m: Record<string, Ev[]> = {}; events.forEach((e) => (m[e.date] ??= []).push(e)); return m; }, [events]);

  const startOffset = settings.weekStartsMonday ? (cursor.getDay() + 6) % 7 : cursor.getDay();
  const days = Array.from({ length: 42 }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + i));
  const wk = settings.weekStartsMonday ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeline = events.filter((e) => e.date >= t && !e.done).sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = timeline.reduce<Record<string, Ev[]>>((m, e) => { (m[e.date.slice(0, 7)] ??= []).push(e); return m; }, {});

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
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/[.06] dark:bg-white/[.06]">
            {wk.map((d) => <div key={d} className="bg-slate-50 py-2 text-center text-xs font-medium muted dark:bg-[#0f1218]">{d}</div>)}
            {days.map((d) => {
              const iso = toISODate(d);
              const ev = byDate[iso] ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div key={iso} className={cx('min-h-[96px] bg-white p-1.5 dark:bg-[#0d1016]', !inMonth && 'opacity-40')}>
                  <div className={cx('mb-1 grid h-6 w-6 place-items-center rounded-full text-xs', iso === t && 'bg-indigo-600 font-bold text-white')}>{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {ev.slice(0, 3).map((e, i) => (
                      <div key={i} title={`${e.kind}: ${e.title}`} className={cx('truncate rounded px-1.5 py-0.5 text-[11px]', e.done && 'line-through opacity-60')} style={{ background: e.color + '22', color: e.color }}>{e.title}</div>
                    ))}
                    {ev.length > 3 && <div className="px-1 text-[10px] muted">+{ev.length - 3} more</div>}
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
    </div>
  );
}
