import { translate as tr } from '../lib/locales';
import { CalendarDays, ChevronRight, MapPin, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { addDays, cx, localeForLanguage, today } from '../lib/utils';
import { dayStart, expand, fmtTime, localDayKey } from '../lib/schedule';

/** Home card: what's on today from your timetables and planner. */
export default function ScheduleToday() {
  const schedules = useStore((state) => state.schedules);
  const planner = useStore((state) => state.planner);
  const locale = localeForLanguage(useStore((state) => state.settings.language ?? 'en'));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  const day = today();
  const occ = useMemo(() => expand(schedules, dayStart(day), dayStart(addDays(day, 1))).filter((row) => !row.event.allDay && localDayKey(row.start) === day), [schedules, day]);
  const items = planner.filter((item) => item.date === day && !item.done);
  if (!schedules.length) return <Link to="/schedule" className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-500"><Upload size={18} /></span>
    <span className="min-w-0 flex-1"><b className="block text-sm">{tr('Add your class or work schedule')}</b><span className="text-xs muted">{tr('Upload an .ics timetable and see today at a glance.')}</span></span><ChevronRight size={16} className="muted" />
  </Link>;
  const upcoming = occ.filter((row) => row.end > now);
  return <section className="card min-w-0 p-4">
    <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><CalendarDays size={16} className="text-indigo-500" />{tr('Today’s schedule')}</h3><Link to="/schedule" className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{tr('Open')} →</Link></div>
    {!occ.length && !items.length ? <p className="text-sm muted">🌿 {tr('No classes or shifts today.')}</p>
      : !upcoming.length && !items.length ? <p className="text-sm muted">✅ {tr('Done for today')} · {occ.length} {tr('finished')}</p>
      : <ul className="grid gap-1.5">
        {upcoming.slice(0, 4).map((row) => { const live = row.start <= now; return <li key={row.key} className={cx('flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5', live && 'bg-indigo-500/10')}>
          <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: row.calendar.color }} />
          <span className="w-12 shrink-0 text-xs font-semibold tabular-nums">{fmtTime(row.start, locale)}</span>
          <span className="min-w-0 flex-1"><b className="block truncate text-sm">{row.event.title}</b>{row.event.location && <span className="flex items-center gap-1 truncate text-xs muted"><MapPin size={10} />{row.event.location}</span>}</span>
          {live ? <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold uppercase text-white">{tr('Now')}</span> : <span className="text-[11px] muted">{Math.round((row.start.getTime() - now.getTime()) / 60000) < 120 ? `${tr('in')} ${Math.round((row.start.getTime() - now.getTime()) / 60000)}m` : ''}</span>}
        </li>; })}
        {items.slice(0, 3).map((item) => <li key={item.id} className="flex min-w-0 items-center gap-2.5 px-2 py-1 text-sm"><span className="w-1 shrink-0" /><span className="w-12 shrink-0 text-xs tabular-nums muted">{item.time ?? '—'}</span><span className="min-w-0 flex-1 truncate">{item.type === 'meeting' ? '👥' : item.type === 'task' ? '✅' : '⏰'} {item.title}</span></li>)}
      </ul>}
  </section>;
}
