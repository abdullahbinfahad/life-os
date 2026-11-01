import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { LifeItem } from '../lib/types';
import { translate as tr } from '../lib/locales';
import { localeForLanguage } from '../lib/utils';

function localDate(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function selectCompletedToday(items: LifeItem[], todayDate: string): LifeItem[] {
  return items.filter((item) => item.status === 'done' && (
    item.completedAt ? localDate(item.completedAt) === todayDate : item.todayDate === todayDate || item.dueDate === todayDate
  )).sort((a, b) => {
    const aDate = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.updatedAt ?? a.createdAt).getTime();
    const bDate = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.updatedAt ?? b.createdAt).getTime();
    return bDate - aDate;
  });
}

interface ReverseTodoListProps {
  items: LifeItem[];
  todayDate: string;
  onReopen: (id: string) => void;
  language?: string;
  limit?: number;
  compact?: boolean;
}

export default function ReverseTodoList({ items, todayDate, onReopen, language, limit, compact = false }: ReverseTodoListProps) {
  const completed = selectCompletedToday(items, todayDate);
  const shown = limit === undefined ? completed : completed.slice(0, limit);
  return (
    <section className={compact ? 'mt-3 border-t border-slate-200 pt-3 dark:border-white/[.08]' : 'card p-4 sm:p-5'} aria-labelledby="reverse-todo-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="reverse-todo-heading" className={compact ? 'text-sm font-semibold' : 'font-semibold'}>{tr('Reverse To-Do')}</h3>
        {compact && completed.length > 0 && <span className="text-xs muted">{completed.length}</span>}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-center dark:border-white/15 dark:bg-white/[.03]">
          <CheckCircle2 className="mx-auto text-emerald-500" size={compact ? 22 : 28} />
          <p className="mt-2 text-sm font-semibold">{tr('No tasks completed today yet')}</p>
          <p className="mt-1 text-xs muted">{tr('Completed tasks will appear here, newest first.')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((item) => (
            <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-emerald-500/[.06] px-3 py-2">
              <CheckCircle2 size={17} className="shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-sm line-through muted">{item.title}</span>
              {item.completedAt && <time className="shrink-0 text-xs tabular-nums muted" dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleTimeString(localeForLanguage(language), { hour: 'numeric', minute: '2-digit' })}</time>}
              <button type="button" aria-label={`${tr('Reopen')}: ${item.title}`} title={tr('Reopen')} onClick={() => onReopen(item.id)} className="btn-ghost min-h-11 min-w-11 shrink-0 justify-center px-2 text-xs text-indigo-700 dark:text-indigo-300 motion-safe:transition-colors"><RotateCcw size={15} /><span className="sr-only sm:not-sr-only">{tr('Reopen')}</span></button>
            </div>
          ))}
          {limit !== undefined && completed.length > shown.length && <p className="pt-1 text-xs muted">{tr('And')} {completed.length - shown.length} {tr('more completed')}</p>}
        </div>
      )}
    </section>
  );
}
