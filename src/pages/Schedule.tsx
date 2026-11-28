import { translate as tr } from '../lib/locales';
import { Bell, BellOff, BookOpen, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Eye, EyeOff, FileUp, GraduationCap, List, MapPin, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Upload, User, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { addDays, cx, localeForLanguage, today, uid } from '../lib/utils';
import {
  ALERT_OPTIONS, CAL_COLORS, KINDS, academicWeek, courseKey, coursesOf, dayStart, defaultTermStart, expand, fmtTime, localDayKey, manualEvent, parseIcs, ruleText,
  type CourseInfo, type Occurrence, type PlannerItem, type ScheduleCalendar, type ScheduleKind,
} from '../lib/schedule';
import WeatherCard, { useWeather } from '../components/WeatherCard';
import { emojiFor, slotAt } from '../lib/weather';
import { playFeedback } from '../lib/sounds';
import '../components/projects/team/TeamWorkspace.css';
import './Schedule.css';

type View = 'day' | 'week' | 'list';
const PLANNER_TYPES: { id: PlannerItem['type']; label: string; emoji: string }[] = [{ id: 'task', label: 'Task', emoji: '✅' }, { id: 'meeting', label: 'Meeting', emoji: '👥' }, { id: 'reminder', label: 'Reminder', emoji: '⏰' }];
const alertLabel = (minutes: number) => minutes === 0 ? 'At this time' : minutes === 60 ? '1 hour before' : `${minutes} minutes before`;

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), ms); return () => window.clearInterval(timer); }, [ms]);
  return now;
}
const durationText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${Math.max(1, minutes)}m`;

/* ---------------- Planner form (matches Title / Type / Date / Time / Alert timing / Details / Notify) ---------------- */
function PlannerForm({ initial, courses, onSave, onClose }: { initial: Partial<PlannerItem>; courses: string[]; onSave: (item: Omit<PlannerItem, 'id' | 'createdAt'>) => void; onClose: () => void }) {
  const [item, setItem] = useState({ title: '', type: 'task' as PlannerItem['type'], date: today(), time: '', alertBefore: 10, notify: true, details: '', course: '', ...initial });
  return <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="tw-modal-card" role="dialog" aria-modal="true" aria-labelledby="planner-title" onSubmit={(event) => { event.preventDefault(); if (!item.title.trim()) return; onSave({ ...item, title: item.title.trim(), time: item.time || undefined, details: item.details?.trim() || undefined, course: item.course || undefined, done: false }); }}>
      <div className="flex items-start gap-3"><span className="tw-modal-icon"><CalendarPlus size={20} /></span><div className="min-w-0 flex-1"><h2 id="planner-title" className="text-lg font-semibold">{tr(initial.title ? 'Edit item' : 'Add item')}</h2><p className="text-sm muted">{tr('Add tasks, meetings, and reminders to any day or time.')}</p></div><button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={16} /></button></div>
      <div className="mt-4 grid gap-3">
        <label><span className="label">{tr('Title')}</span><input autoFocus required className="input" value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} maxLength={200} /></label>
        <div><span className="label">{tr('Type')}</span><div className="tw-seg w-full">{PLANNER_TYPES.map((type) => <button key={type.id} type="button" className={cx('flex-1 justify-center', item.type === type.id && 'is-on')} onClick={() => setItem({ ...item, type: type.id })}>{type.emoji} {tr(type.label)}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0"><span className="label">{tr('Date')}</span><input type="date" required className="input min-w-0" value={item.date} onChange={(event) => setItem({ ...item, date: event.target.value })} /></label>
          <label className="min-w-0"><span className="label">{tr('Time')}</span><input type="time" className="input min-w-0" value={item.time ?? ''} onChange={(event) => setItem({ ...item, time: event.target.value })} /></label>
        </div>
        <label><span className="label">{tr('Alert timing')}</span><select className="input" value={item.alertBefore} onChange={(event) => setItem({ ...item, alertBefore: Number(event.target.value) })}>{ALERT_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{tr(alertLabel(minutes))}</option>)}</select></label>
        {courses.length > 0 && <label><span className="label">{tr('Course (optional)')}</span><select className="input" value={item.course ?? ''} onChange={(event) => setItem({ ...item, course: event.target.value })}><option value="">{tr('— None —')}</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>}
        <label><span className="label">{tr('Details (optional)')}</span><textarea className="input min-h-16" value={item.details ?? ''} onChange={(event) => setItem({ ...item, details: event.target.value })} /></label>
        <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[color:var(--accent)]" checked={item.notify} onChange={(event) => setItem({ ...item, notify: event.target.checked })} />{tr('Send a notification for this item')}</label>
        {item.notify && !item.time && <p className="text-xs text-amber-500">{tr('Add a time to get an alert.')}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tr('Cancel')}</button><button type="submit" className="btn-primary" disabled={!item.title.trim()}><Check size={15} />{tr('Save item')}</button></div>
      </div>
    </form>
  </div>;
}

/* ---------------- Manual class / shift ---------------- */
function ManualClassForm({ calendars, onSave, onClose }: { calendars: ScheduleCalendar[]; onSave: (calendarId: string | null, kind: ScheduleKind, event: ReturnType<typeof manualEvent>) => void; onClose: () => void }) {
  const [form, setForm] = useState({ title: '', days: [new Date().getDay()], startTime: '09:00', endTime: '10:30', location: '', teacher: '', from: today(), until: '', calendarId: calendars.find((calendar) => calendar.source === 'manual')?.id ?? '', kind: 'class' as ScheduleKind });
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="tw-modal-card" role="dialog" aria-modal="true" aria-labelledby="manual-title" onSubmit={(event) => { event.preventDefault(); if (!form.title.trim() || !form.days.length) return; const created = manualEvent({ ...form, note: form.teacher ? `Teacher: ${form.teacher}` : undefined }); if (form.teacher) created.organizer = form.teacher; onSave(form.calendarId || null, form.kind, created); }}>
      <div className="flex items-start gap-3"><span className="tw-modal-icon"><BookOpen size={20} /></span><div className="min-w-0 flex-1"><h2 id="manual-title" className="text-lg font-semibold">{tr('Add a class or shift')}</h2><p className="text-sm muted">{tr('Repeats every week on the days you pick.')}</p></div><button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={16} /></button></div>
      <div className="mt-4 grid gap-3">
        <input autoFocus required className="input font-semibold" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={tr('e.g. Physics 101, Morning shift')} aria-label={tr('Title')} />
        <div><span className="label">{tr('Days')}</span><div className="sc-days">{[1, 2, 3, 4, 5, 6, 0].map((day) => <button key={day} type="button" aria-pressed={form.days.includes(day)} className={cx('sc-day-btn', form.days.includes(day) && 'is-on')} onClick={() => setForm({ ...form, days: form.days.includes(day) ? form.days.filter((value) => value !== day) : [...form.days, day] })}>{tr(names[day])}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2"><label><span className="label">{tr('Starts')}</span><input type="time" className="input" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label><span className="label">{tr('Ends')}</span><input type="time" className="input" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div>
        <div className="grid grid-cols-2 gap-2"><input className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder={tr('Room / place')} aria-label={tr('Location')} /><input className="input" value={form.teacher} onChange={(event) => setForm({ ...form, teacher: event.target.value })} placeholder={tr('Teacher / manager')} aria-label={tr('Teacher')} /></div>
        <div className="grid grid-cols-2 gap-2"><label><span className="label">{tr('From')}</span><input type="date" className="input" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label><span className="label">{tr('Until (optional)')}</span><input type="date" className="input" value={form.until} onChange={(event) => setForm({ ...form, until: event.target.value })} /></label></div>
        <label><span className="label">{tr('Add to')}</span><select className="input" value={form.calendarId} onChange={(event) => setForm({ ...form, calendarId: event.target.value })}><option value="">{tr('A new “My routine” timetable')}</option>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tr('Cancel')}</button><button type="submit" className="btn-primary" disabled={!form.title.trim() || !form.days.length}><Plus size={15} />{tr('Add to schedule')}</button></div>
      </div>
    </form>
  </div>;
}

/* ---------------- Timetable settings ---------------- */
function CalendarSettings({ calendar, onClose }: { calendar: ScheduleCalendar; onClose: () => void }) {
  const updateSchedule = useStore((state) => state.updateSchedule);
  const deleteSchedule = useStore((state) => state.deleteSchedule);
  const set = (patch: Partial<ScheduleCalendar>) => updateSchedule(calendar.id, patch);
  const courses = coursesOf(calendar);
  return <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tw-modal-card" role="dialog" aria-modal="true" aria-label={calendar.name}>
      <div className="flex items-center gap-3"><span className="sc-cal-dot !h-10 !w-10" style={{ background: calendar.color }} /><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{calendar.name}</h2><p className="text-xs muted">{calendar.events.length} {tr('events')} · {courses.length} {tr('courses')}{calendar.fileName ? ` · ${calendar.fileName}` : ''}</p></div><button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={16} /></button></div>
      <div className="mt-4 grid gap-3">
        <label><span className="label">{tr('Name')}</span><input className="input" defaultValue={calendar.name} onBlur={(event) => event.target.value.trim() && set({ name: event.target.value.trim() })} /></label>
        <label><span className="label">{tr('Program / class (shown in the header)')}</span><input className="input" defaultValue={calendar.program ?? ''} placeholder={tr('e.g. Class 2501 · Automation (International)')} onBlur={(event) => set({ program: event.target.value.trim() || undefined })} /></label>
        <div><span className="label">{tr('Type')}</span><div className="tw-chip-row !pb-0 flex-wrap">{KINDS.map((kind) => <button key={kind.id} type="button" className={cx('tw-chip', calendar.kind === kind.id && 'is-on')} onClick={() => set({ kind: kind.id })}>{kind.emoji} {tr(kind.label)}</button>)}</div></div>
        <div><span className="label">{tr('Color')}</span><div className="flex flex-wrap gap-2">{CAL_COLORS.map((color) => <button key={color} type="button" aria-label={color} aria-pressed={calendar.color === color} className={cx('sc-swatch', calendar.color === color && 'is-on')} style={{ background: color }} onClick={() => set({ color })} />)}</div></div>
        <label><span className="label">{tr('Week 1 starts on')}</span><input type="date" className="input" value={calendar.termStart ?? defaultTermStart(calendar) ?? ''} onChange={(event) => set({ termStart: event.target.value || undefined })} /><span className="mt-1 block text-xs muted">{tr('Used for “Week N” numbers, like your academic week.')}</span></label>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--tw-surface-2)] p-3"><div><p className="text-sm font-semibold">{tr('Alerts before each class/shift')}</p><p className="text-xs muted">{tr('Needs notifications turned on in Reminders.')}</p></div><button type="button" role="switch" aria-checked={calendar.notify} className={cx('ns-switch', calendar.notify && 'is-on')} onClick={() => set({ notify: !calendar.notify })} aria-label={tr('Alerts')}><span /></button></div>
        {calendar.notify && <label><span className="label">{tr('Remind me')}</span><select className="input" value={calendar.leadMinutes ?? 10} onChange={(event) => set({ leadMinutes: Number(event.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{tr(alertLabel(minutes))}</option>)}</select></label>}
        <div className="flex justify-between gap-2 pt-1"><button type="button" className="btn-ghost text-rose-500" onClick={() => { if (confirm(tr('Remove this timetable? You can restore it from Trash.'))) { deleteSchedule(calendar.id); onClose(); } }}><Trash2 size={15} />{tr('Remove')}</button><button type="button" className="btn-primary" onClick={onClose}><Check size={15} />{tr('Done')}</button></div>
      </div>
    </section>
  </div>;
}

/* ---------------- Course sheet: credits, teacher, private note, reminder ---------------- */
function CourseSheet({ calendar, course, onClose, onReminder }: { calendar: ScheduleCalendar; course: string; onClose: () => void; onReminder: () => void }) {
  const updateSchedule = useStore((state) => state.updateSchedule);
  const info = calendar.courses?.[course] ?? {};
  const [draft, setDraft] = useState<CourseInfo>(info);
  const [saved, setSaved] = useState(false);
  const row = coursesOf(calendar).find((item) => item.title === course);
  const sessions = row?.events.filter((event) => event.rule).map((event) => ruleText(event.rule)) ?? [];
  const rooms = [...new Set(row?.events.map((event) => event.location).filter(Boolean))] as string[];
  const save = () => { updateSchedule(calendar.id, { courses: { ...(calendar.courses ?? {}), [course]: { ...draft, credits: draft.credits ? Number(draft.credits) : undefined } } }); setSaved(true); playFeedback('confirm'); setTimeout(() => setSaved(false), 1600); };
  return <div className="tw-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tw-modal-card" role="dialog" aria-modal="true" aria-label={course}>
      <div className="flex items-start gap-3"><span className="tw-modal-icon" style={{ background: calendar.color }}><GraduationCap size={20} /></span><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{course}</h2><p className="text-xs muted">{calendar.name}</p></div><button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={16} /></button></div>
      {(sessions.length > 0 || rooms.length > 0) && <div className="mt-3 grid gap-1 rounded-xl bg-[var(--tw-surface-2)] p-3 text-xs">{[...new Set(sessions)].map((text) => <p key={text} className="flex items-center gap-1.5"><Clock size={12} />{text}</p>)}{rooms.length > 0 && <p className="flex items-center gap-1.5"><MapPin size={12} />{rooms.join(' · ')}</p>}</div>}
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <label><span className="label">{tr('Credits')}</span><input type="number" min="0" step="0.5" inputMode="decimal" className="input" value={draft.credits ?? ''} onChange={(event) => setDraft({ ...draft, credits: event.target.value ? Number(event.target.value) : undefined })} /></label>
          <label className="col-span-2"><span className="label">{tr('Course code')}</span><input className="input" value={draft.code ?? ''} onChange={(event) => setDraft({ ...draft, code: event.target.value || undefined })} /></label>
        </div>
        <label><span className="label">{tr('Teacher')}</span><input className="input" value={draft.teacher ?? row?.events.find((event) => event.organizer)?.organizer ?? ''} onChange={(event) => setDraft({ ...draft, teacher: event.target.value || undefined })} /></label>
        <label><span className="label">{tr('Private course note')}</span><textarea className="input min-h-28" value={draft.note ?? ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={tr('Exam dates, homework, what to bring, grading…')} /></label>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-outline" onClick={onReminder}><Bell size={15} />{tr('Set reminder')}</button><button type="button" className="btn-primary" onClick={save}><Check size={15} />{tr(saved ? 'Saved' : 'Save note')}</button></div>
      </div>
    </section>
  </div>;
}

/* ---------------- Event details ---------------- */
function EventSheet({ occ, locale, onClose, onCourse, onReminder }: { occ: Occurrence; locale: string; onClose: () => void; onCourse: () => void; onReminder: () => void }) {
  const { event, calendar } = occ;
  const course = calendar.courses?.[courseKey(event.title)];
  const { data } = useWeather();
  const slot = event.allDay ? null : slotAt(data, occ.start.getTime());
  return <div className="tw-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="tw-modal-card" role="dialog" aria-modal="true" aria-label={event.title}>
      <div className="flex items-start gap-3"><span className="sc-ev-bar" style={{ background: calendar.color }} /><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{event.title}</h2><p className="text-sm muted">{occ.start.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}{event.allDay ? '' : ` · ${fmtTime(occ.start, locale)}–${fmtTime(occ.end, locale)}`}</p></div><button type="button" className="tw-icon-btn" onClick={onClose} aria-label={tr('Close')}><X size={16} /></button></div>
      <div className="mt-3 grid gap-2 text-sm">
        {event.location && <a className="sc-info" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noreferrer"><MapPin size={15} />{event.location}</a>}
        {(course?.teacher || event.organizer) && <p className="sc-info"><User size={15} />{course?.teacher ?? event.organizer}</p>}
        {event.rule && <p className="sc-info"><CalendarDays size={15} />{ruleText(event.rule)}</p>}
        {slot && Math.abs(slot.time - occ.start.getTime()) < 3 * 3600000 && <p className="sc-info">{emojiFor(slot.code, slot.icon)}<span className="capitalize">{Math.round(slot.temp)}° · {slot.description}{slot.pop >= 0.3 ? ` · ${Math.round(slot.pop * 100)}% ${tr('rain')}` : ''}</span></p>}
        {course?.credits ? <p className="sc-info"><GraduationCap size={15} />{course.credits} {tr('credits')}{course.code ? ` · ${course.code}` : ''}</p> : null}
        {event.description && <p className="whitespace-pre-wrap rounded-xl bg-[var(--tw-surface-2)] p-3 text-sm">{event.description}</p>}
        {course?.note && <p className="whitespace-pre-wrap rounded-xl bg-[var(--tw-accent-soft)] p-3 text-sm"><b className="block text-xs">{tr('Your note')}</b>{course.note}</p>}
        <p className="flex items-center gap-1.5 text-xs muted"><span className="sc-cal-dot" style={{ background: calendar.color }} />{calendar.name}</p>
      </div>
      {!event.allDay && <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="btn-outline" onClick={onReminder}><Bell size={15} />{tr('Set reminder')}</button><button type="button" className="btn-primary" onClick={onCourse}><Pencil size={15} />{tr('Course notes')}</button></div>}
    </section>
  </div>;
}

/* ---------------- Page ---------------- */
export default function Schedule() {
  const { schedules, planner, addSchedule, updateSchedule, addPlannerItem, updatePlannerItem, deletePlannerItem } = useStore();
  const language = useStore((state) => state.settings.language ?? 'en');
  const locale = localeForLanguage(language);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useState(() => params.get('day') ?? today());
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('lifeos:schedule-view') as View) || (window.innerWidth >= 1024 ? 'week' : 'day'); } catch { return 'day'; } });
  const [notice, setNotice] = useState('');
  const [planning, setPlanning] = useState<Partial<PlannerItem> | null>(null);
  const [manual, setManual] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [courseFor, setCourseFor] = useState<{ calendarId: string; course: string } | null>(null);
  const [occOpen, setOccOpen] = useState<Occurrence | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: weather } = useWeather();
  useEffect(() => { try { localStorage.setItem('lifeos:schedule-view', view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (params.get('add') === 'planner') { setPlanning({}); const next = new URLSearchParams(params); next.delete('add'); setParams(next, { replace: true }); } }, [params, setParams]);

  const importFiles = async (files: FileList | File[]) => {
    let added = 0; const names: string[] = [];
    for (const file of Array.from(files)) {
      if (!/\.ics$|calendar/i.test(file.name + file.type)) continue;
      const parsed = parseIcs(await file.text());
      if (!parsed.events.length) continue;
      const name = parsed.name || file.name.replace(/\.ics$/i, '');
      const guessKind: ScheduleKind = /shift|work|job|roster/i.test(name) ? 'work' : /uni|course|semester|term|class|timetable|lecture/i.test(name + parsed.events.slice(0, 5).map((event) => event.title).join(' ')) ? 'university' : 'other';
      const calendar: ScheduleCalendar = { id: uid(), name, color: CAL_COLORS[(schedules.length + added) % CAL_COLORS.length], kind: guessKind, visible: true, notify: true, source: 'ics', fileName: file.name, importedAt: new Date().toISOString(), events: parsed.events };
      calendar.termStart = defaultTermStart(calendar);
      addSchedule(calendar); added++; names.push(`${name} (${parsed.events.length})`);
    }
    setNotice(added ? `${tr('Imported')} ${names.join(', ')}` : tr('No events found. Make sure it is an .ics calendar file.'));
    if (added) playFeedback('confirm');
  };

  const visibleCalendars = schedules.filter((calendar) => calendar.visible);
  const monday = (iso: string) => addDays(iso, -((dayStart(iso).getDay() + 6) % 7));
  const weekStart = monday(day);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const rangeFrom = view === 'list' ? dayStart(day) : view === 'week' ? dayStart(weekStart) : dayStart(day);
  const rangeTo = view === 'list' ? dayStart(addDays(day, 14)) : view === 'week' ? dayStart(addDays(weekStart, 7)) : dayStart(addDays(day, 1));
  const occurrences = useMemo(() => expand(schedules, rangeFrom, rangeTo), [schedules, rangeFrom.getTime(), rangeTo.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayKey = localDayKey(now);
  const todayOcc = useMemo(() => expand(schedules, dayStart(todayKey), dayStart(addDays(todayKey, 2))), [schedules, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = todayOcc.filter((occ) => !occ.event.allDay && occ.start <= now && occ.end > now);
  const next = todayOcc.find((occ) => !occ.event.allDay && occ.start > now);
  const dayOcc = occurrences.filter((occ) => localDayKey(occ.start) === day || (occ.event.allDay && occ.start <= dayStart(day) && occ.end > dayStart(day)));
  const dayPlanner = planner.filter((item) => item.date === day).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  const primary = visibleCalendars.find((calendar) => calendar.kind === 'university' || calendar.kind === 'school' || calendar.kind === 'class') ?? visibleCalendars[0];
  const primaryCourseCount = useMemo(() => primary ? coursesOf(primary).length : 0, [primary]);
  const week = primary ? academicWeek(primary.termStart ?? defaultTermStart(primary), day) : null;
  const allCourses = useMemo(() => schedules.flatMap((calendar) => coursesOf(calendar).map((course) => ({ ...course, calendar }))), [schedules]);
  // One expansion for the whole visible week feeds the day strip (instead of seven).
  const stripCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const occ of expand(schedules, dayStart(weekStart), dayStart(addDays(weekStart, 7)))) { const key = localDayKey(occ.start); counts.set(key, (counts.get(key) ?? 0) + 1); }
    return counts;
  }, [schedules, weekStart]);
  const totalCredits = useMemo(() => (primary ? coursesOf(primary) : []).reduce((sum, course) => sum + (course.info.credits ?? 0), 0), [primary]);
  const savePlanner = (item: Omit<PlannerItem, 'id' | 'createdAt'>) => {
    if (planning?.id) updatePlannerItem(planning.id, item); else addPlannerItem(item);
    setPlanning(null); setNotice(tr(item.notify && item.time ? 'Saved · you’ll get an alert' : 'Saved')); playFeedback('add');
  };
  const saveManual = (calendarId: string | null, kind: ScheduleKind, event: ReturnType<typeof manualEvent>) => {
    const target = calendarId ? schedules.find((calendar) => calendar.id === calendarId) : undefined;
    if (target) updateSchedule(target.id, { events: [...target.events, event] });
    else addSchedule({ id: uid(), name: tr('My routine'), color: CAL_COLORS[schedules.length % CAL_COLORS.length], kind, visible: true, notify: true, source: 'manual', importedAt: new Date().toISOString(), events: [event], termStart: monday(event.start.slice(0, 10)) });
    setManual(false); setNotice(tr('Added to your schedule')); playFeedback('add');
  };
  const reminderFor = (occ: Occurrence) => { setOccOpen(null); setPlanning({ title: `${occ.event.title}`, type: 'reminder', date: localDayKey(occ.start), time: `${String(occ.start.getHours()).padStart(2, '0')}:${String(occ.start.getMinutes()).padStart(2, '0')}`, alertBefore: 10, course: courseKey(occ.event.title) }); };

  const weatherAt = (occ: Occurrence) => { if (occ.event.allDay) return null; const slot = slotAt(weather, occ.start.getTime()); return slot && Math.abs(slot.time - occ.start.getTime()) < 2.5 * 3600000 ? slot : null; };
  const occCard = (occ: Occurrence, compact = false) => {
    const live = occ.start <= now && occ.end > now;
    const past = occ.end <= now;
    const course = occ.calendar.courses?.[courseKey(occ.event.title)];
    const slot = weatherAt(occ);
    return <button key={occ.key} type="button" className={cx('sc-occ', live && 'is-live', past && 'is-past', compact && 'is-compact')} style={{ ['--c' as string]: occ.calendar.color }} onClick={() => setOccOpen(occ)}>
      <span className="sc-occ-time">{occ.event.allDay ? <b>{tr('All day')}</b> : <><b>{fmtTime(occ.start, locale)}</b><span>{fmtTime(occ.end, locale)}</span></>}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block break-words text-sm font-semibold leading-snug">{occ.event.title}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs muted">
          {occ.event.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{occ.event.location}</span>}
          {(course?.teacher || occ.event.organizer) && <span className="inline-flex items-center gap-1"><User size={11} />{course?.teacher ?? occ.event.organizer}</span>}
          {!occ.event.allDay && <span>{durationText(occ.event.minutes)}</span>}
          {course?.credits ? <span>{course.credits} cr</span> : null}
          {course?.note && <span title={tr('Has a note')}>📝</span>}
        </span>
        {live && <span className="sc-live-bar"><i style={{ width: `${Math.min(100, (now.getTime() - occ.start.getTime()) / (occ.end.getTime() - occ.start.getTime()) * 100)}%` }} /></span>}
      </span>
      {slot && <span className="sc-wx" title={slot.description}>{emojiFor(slot.code, slot.icon)}<small>{Math.round(slot.temp)}°</small></span>}
      {live && <span className="sc-live-tag">{tr('Now')}</span>}
    </button>;
  };
  const plannerRow = (item: PlannerItem) => {
    const type = PLANNER_TYPES.find((row) => row.id === item.type)!;
    return <div key={item.id} className={cx('sc-plan', item.done && 'is-done')}>
      <button type="button" role="checkbox" aria-checked={Boolean(item.done)} className={cx('tap-check', item.done && 'is-done')} onClick={() => updatePlannerItem(item.id, { done: !item.done })} aria-label={tr(item.done ? 'Mark not done' : 'Mark done')}>{item.done ? <Check size={18} /> : <span className="sc-plan-emoji">{type.emoji}</span>}</button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPlanning(item)}>
        <span className={cx('block break-words text-sm font-medium', item.done && 'line-through muted')}>{item.title}</span>
        <span className="flex flex-wrap gap-x-2 text-xs muted">{item.time && <span>{item.time}</span>}<span>{tr(type.label)}</span>{item.course && <span>· {item.course}</span>}{item.notify && item.time && <span className="inline-flex items-center gap-0.5"><Bell size={10} />{item.alertBefore ? `${item.alertBefore}m` : tr('on time')}</span>}</span>
      </button>
      <button type="button" className="tap-action" aria-label={tr('Delete')} onClick={() => deletePlannerItem(item.id)}><Trash2 size={14} /></button>
    </div>;
  };

  // Week grid geometry.
  const timed = occurrences.filter((occ) => !occ.event.allDay);
  const minHour = Math.max(0, Math.min(8, ...timed.map((occ) => occ.start.getHours())));
  const maxHour = Math.min(24, Math.max(18, ...timed.map((occ) => occ.end.getHours() + (occ.end.getMinutes() ? 1 : 0))));
  const hourPx = 56;

  if (!schedules.length) return <div className="tw-root sc-page min-w-0" onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void importFiles(event.dataTransfer.files); }}>
    <header className="sc-head"><div><p className="ct-eyebrow"><CalendarDays size={13} />{tr('Routine')}</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr('Schedule')}</h1></div></header>
    {notice && <div className="tw-notice" role="status">{notice}</div>}
    <div className={cx('sc-drop', dragOver && 'is-over')}>
      <span className="text-4xl">🗓️</span>
      <p className="text-lg font-semibold">{tr('Bring in your class routine or work schedule')}</p>
      <p className="max-w-md text-sm muted">{tr('Upload the .ics file from your school, university portal, Google/Outlook/Apple Calendar or shift app. See today, this week and what’s next — with alerts before every class.')}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2"><button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}><Upload size={16} />{tr('Upload .ics file')}</button><button type="button" className="btn-outline" onClick={() => setManual(true)}><Plus size={16} />{tr('Add classes by hand')}</button></div>
      <details className="sc-how"><summary>{tr('Where do I get an .ics file?')}</summary><ul>
        <li><b>Google Calendar</b> — {tr('Settings → Import & export → Export (zip of .ics), or calendar settings → “Secret address in iCal format”.')}</li>
        <li><b>Outlook</b> — {tr('Calendar → Share/Publish → ICS link, or File → Save calendar.')}</li>
        <li><b>Apple Calendar</b> — {tr('File → Export → Export…')}</li>
        <li><b>{tr('University / school portals')}</b> — {tr('look for “Export”, “Subscribe”, “iCal” or “.ics” on your timetable page.')}</li>
        <li><b>{tr('Shift apps')}</b> — {tr('most have “Export to calendar” / “Sync calendar”.')}</li>
      </ul></details>
    </div>
    <input ref={fileRef} type="file" accept=".ics,text/calendar" multiple className="hidden" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    {manual && <ManualClassForm calendars={schedules} onSave={saveManual} onClose={() => setManual(false)} />}
  </div>;

  const settingsCal = schedules.find((calendar) => calendar.id === settingsFor);
  const courseCal = schedules.find((calendar) => calendar.id === courseFor?.calendarId);
  const upcomingPlanner = planner.filter((item) => !item.done && item.date >= today()).sort((a, b) => `${a.date}${a.time ?? '99'}`.localeCompare(`${b.date}${b.time ?? '99'}`)).slice(0, 8);
  const scheduledToday = dayOcc.filter((occ) => !occ.event.allDay).length;

  return <div className="tw-root sc-page min-w-0" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragOver(false); void importFiles(event.dataTransfer.files); } }}>
    {dragOver && <div className="sc-drop-overlay"><FileUp size={32} />{tr('Drop .ics files to import')}</div>}
    <header className="sc-head">
      <div className="min-w-0 flex-1">
        <p className="ct-eyebrow"><CalendarDays size={13} />{tr('Routine')}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr('Schedule')}</h1>
        {primary && <p className="mt-0.5 truncate text-sm muted">{[primary.program || primary.name, `${primaryCourseCount} ${tr('courses')}`, totalCredits ? `${totalCredits} ${tr('credits')}` : ''].filter(Boolean).join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <button type="button" className="btn-outline !min-h-10 !px-3" onClick={() => fileRef.current?.click()} aria-label={tr('Upload .ics')}><Upload size={16} /><span className="hidden sm:inline">.ics</span></button>
        <button type="button" className="btn-outline !min-h-10 !px-3" onClick={() => setManual(true)} aria-label={tr('Add class')}><BookOpen size={16} /><span className="hidden sm:inline">{tr('Class')}</span></button>
        <button type="button" className="btn-primary !min-h-10" onClick={() => setPlanning({ date: day })}><Plus size={16} />{tr('Add item')}</button>
      </div>
    </header>
    <input ref={fileRef} type="file" accept=".ics,text/calendar" multiple className="hidden" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    {notice && <div className="tw-notice" role="status"><Check size={15} />{notice}</div>}

    <div className="tw-chip-row" aria-label={tr('Timetables')}>
      {schedules.map((calendar) => <span key={calendar.id} className={cx('sc-cal', !calendar.visible && 'is-hidden')} style={{ ['--c' as string]: calendar.color }}>
        <button type="button" className="flex items-center gap-1.5" onClick={() => updateSchedule(calendar.id, { visible: !calendar.visible })} aria-pressed={calendar.visible} title={tr(calendar.visible ? 'Hide' : 'Show')}><span className="sc-cal-dot" />{calendar.name}{calendar.visible ? <Eye size={12} className="opacity-50" /> : <EyeOff size={12} />}{calendar.notify ? null : <BellOff size={11} className="opacity-60" />}</button>
        <button type="button" className="sc-cal-more" onClick={() => setSettingsFor(calendar.id)} aria-label={`${tr('Settings')}: ${calendar.name}`}><MoreHorizontal size={14} /></button>
      </span>)}
    </div>

    <div className="sc-grid">
      <main className="min-w-0 space-y-3">
        <section className="sc-now" aria-live="polite">
          {current.length ? current.map((occ) => <div key={occ.key} className="sc-now-row" style={{ ['--c' as string]: occ.calendar.color }}>
            <span className="sc-pulse" /><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: occ.calendar.color }}>{tr('Now')} · {tr('ends in')} {durationText(Math.round((occ.end.getTime() - now.getTime()) / 60000))}</p><p className="truncate font-semibold">{occ.event.title}</p>{occ.event.location && <p className="truncate text-xs muted">{occ.event.location}</p>}</div>
          </div>) : <p className="text-sm muted">{todayOcc.some((occ) => localDayKey(occ.start) === today() && !occ.event.allDay && occ.end <= now) && !todayOcc.some((occ) => localDayKey(occ.start) === today() && occ.start > now) ? `✅ ${tr('Done for today')}` : `☕ ${tr('Nothing right now')}`}</p>}
          {next && <div className="sc-next" style={{ ['--c' as string]: next.calendar.color }}><span className="text-[11px] font-bold uppercase tracking-wide muted">{tr('Next')} · {localDayKey(next.start) === today() ? `${tr('in')} ${durationText(Math.round((next.start.getTime() - now.getTime()) / 60000))}` : tr('Tomorrow')}</span><button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setOccOpen(next)}><span className="sc-cal-dot" /><b className="truncate text-sm">{next.event.title}</b><span className="shrink-0 text-xs muted">{fmtTime(next.start, locale)}{next.event.location ? ` · ${next.event.location}` : ''}</span></button></div>}
        </section>

        <section className="sc-nav">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{tr('Selected day')}{week ? ` · ${tr('Week')} ${week}` : ''}</p><p className="truncate font-semibold">{dayStart(day).toLocaleDateString(locale, { weekday: 'long' })} <span className="font-normal muted">{dayStart(day).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}</span></p></div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="tw-icon-btn" onClick={() => setDay(addDays(day, view === 'week' ? -7 : -1))} aria-label={tr('Previous')}><ChevronLeft size={18} /></button>
              <button type="button" className={cx('tw-chip !min-h-9', day === today() && 'is-on')} onClick={() => setDay(today())}><Sparkles size={13} />{tr('Today')}</button>
              <button type="button" className="tw-icon-btn" onClick={() => setDay(addDays(day, view === 'week' ? 7 : 1))} aria-label={tr('Next')}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="sc-strip">{weekDays.map((date) => { const count = (stripCounts.get(date) ?? 0) + planner.filter((item) => item.date === date && !item.done).length; return <button key={date} type="button" className={cx('sc-strip-day', date === day && 'is-on', date === today() && 'is-today')} onClick={() => setDay(date)} aria-pressed={date === day}>
            <span>{dayStart(date).toLocaleDateString(locale, { weekday: 'narrow' })}</span><b>{Number(date.slice(8))}</b><i>{count ? '•'.repeat(Math.min(3, count)) : ''}</i>
          </button>; })}</div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="tw-seg" role="tablist" aria-label={tr('View')}>{([['day', '🗓️', 'Daily'], ['week', '📊', 'Weekly'], ['list', null, 'Upcoming']] as const).map(([id, emoji, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={cx(view === id && 'is-on')} onClick={() => setView(id)}>{emoji ?? <List size={14} />}<span>{tr(label)}</span></button>)}</div>
            {view === 'day' && <span className="whitespace-nowrap text-xs muted">{current.filter((occ) => localDayKey(occ.start) === day).length} {tr('active')} · {scheduledToday} {tr('scheduled')}</span>}
          </div>
        </section>

        {view === 'day' && <section className="space-y-2" aria-label={tr('Day schedule')}>
          {dayOcc.length === 0 && dayPlanner.length === 0 && <div className="tw-empty-sm">🌿 {tr('Nothing scheduled — a free day.')}</div>}
          {dayOcc.filter((occ) => occ.event.allDay).map((occ) => occCard(occ))}
          {dayOcc.filter((occ) => !occ.event.allDay).map((occ, index, rows) => { const gap = index > 0 ? Math.round((occ.start.getTime() - rows[index - 1].end.getTime()) / 60000) : 0; return <div key={occ.key}>{gap >= 30 && <p className="sc-gap">☕ {durationText(gap)} {tr('free')}</p>}{occCard(occ)}</div>; })}
          {dayPlanner.length > 0 && <div className="tw-panel !p-2"><p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide muted">{tr('Personal planner')}</p>{dayPlanner.map(plannerRow)}</div>}
        </section>}

        {view === 'week' && <section className="sc-week card" aria-label={tr('Week schedule')}>
          <div className="sc-week-inner" style={{ ['--rows' as string]: maxHour - minHour }}>
            <div className="sc-week-head"><span />{weekDays.map((date) => <button key={date} type="button" className={cx('sc-wh', date === today() && 'is-today', date === day && 'is-on')} onClick={() => { setDay(date); setView('day'); }}><span>{dayStart(date).toLocaleDateString(locale, { weekday: 'short' })}</span><b>{Number(date.slice(8))}</b></button>)}</div>
            {occurrences.some((occ) => occ.event.allDay) && <div className="sc-week-allday"><span className="text-[10px] muted">{tr('All day')}</span>{weekDays.map((date) => <div key={date}>{occurrences.filter((occ) => occ.event.allDay && occ.start <= dayStart(date) && occ.end > dayStart(date)).map((occ) => <button key={occ.key} type="button" className="sc-allday" style={{ background: occ.calendar.color }} onClick={() => setOccOpen(occ)}>{occ.event.title}</button>)}</div>)}</div>}
            <div className="sc-week-body" style={{ height: (maxHour - minHour) * hourPx }}>
              <div className="sc-hours">{Array.from({ length: maxHour - minHour }, (_, index) => <span key={index} style={{ top: index * hourPx }}>{new Date(2024, 0, 1, minHour + index).toLocaleTimeString(locale, { hour: 'numeric' })}</span>)}</div>
              {weekDays.map((date) => { const list = timed.filter((occ) => localDayKey(occ.start) === date); return <div key={date} className={cx('sc-col', date === today() && 'is-today')}>
                {Array.from({ length: maxHour - minHour }, (_, index) => <i key={index} className="sc-line" style={{ top: index * hourPx }} />)}
                {list.map((occ) => { const top = ((occ.start.getHours() - minHour) * 60 + occ.start.getMinutes()) / 60 * hourPx; const height = Math.max(22, (occ.end.getTime() - occ.start.getTime()) / 3600000 * hourPx - 2); const overlaps = list.filter((other) => other.start < occ.end && other.end > occ.start); const lane = overlaps.indexOf(occ); return <button key={occ.key} type="button" className={cx('sc-block', occ.end <= now && 'is-past', occ.start <= now && occ.end > now && 'is-live')} style={{ top, height, background: occ.calendar.color, left: `calc(${(lane / overlaps.length) * 100}% + 2px)`, width: `calc(${100 / overlaps.length}% - 4px)` }} onClick={() => setOccOpen(occ)} title={`${occ.event.title} · ${fmtTime(occ.start, locale)}`}>
                  <b>{occ.event.title}</b>{height > 40 && <span>{fmtTime(occ.start, locale)}{occ.event.location ? ` · ${occ.event.location}` : ''}</span>}
                </button>; })}
                {date === today() && now.getHours() >= minHour && now.getHours() < maxHour && <span className="sc-now-line" style={{ top: ((now.getHours() - minHour) * 60 + now.getMinutes()) / 60 * hourPx }} />}
              </div>; })}
            </div>
          </div>
        </section>}

        {view === 'list' && <section className="space-y-3" aria-label={tr('Upcoming')}>
          {Array.from({ length: 14 }, (_, index) => addDays(day, index)).map((date) => { const list = occurrences.filter((occ) => localDayKey(occ.start) === date); const items = planner.filter((item) => item.date === date && !item.done); if (!list.length && !items.length) return null; return <div key={date}>
            <p className="sc-list-day">{date === today() ? tr('Today') : date === addDays(today(), 1) ? tr('Tomorrow') : dayStart(date).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })}<span>{list.length + items.length}</span></p>
            <div className="space-y-1.5">{list.map((occ) => occCard(occ, true))}{items.map(plannerRow)}</div>
          </div>; })}
          {!occurrences.length && !planner.some((item) => item.date >= day) && <div className="tw-empty-sm">{tr('Nothing in the next two weeks.')}</div>}
        </section>}
      </main>

      <aside className="min-w-0 space-y-3">
        <WeatherCard compact />
        <section className="tw-panel">
          <header><h3>{tr('Personal planner')}</h3><button type="button" className="tw-more" onClick={() => setPlanning({ date: day })}><Plus size={13} />{tr('Add item')}</button></header>
          <p className="-mt-1 mb-2 text-xs muted">{tr('Add tasks, meetings, and reminders to any day or time.')}</p>
          {upcomingPlanner.length ? <div>{upcomingPlanner.map((item) => <div key={item.id}><p className="mt-1 text-[11px] font-semibold muted">{item.date === today() ? tr('Today') : dayStart(item.date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}</p>{plannerRow(item)}</div>)}</div> : <p className="tw-empty-sm">{tr('No upcoming items.')}</p>}
        </section>
        {allCourses.length > 0 && <section className="tw-panel">
          <header><h3>{tr('Course notes')}</h3><span className="text-xs muted">{allCourses.length} {tr('courses')}{totalCredits ? ` · ${totalCredits} cr` : ''}</span></header>
          <ul className="sc-courses">{allCourses.slice(0, 30).map((course) => <li key={`${course.calendar.id}:${course.title}`}><button type="button" onClick={() => setCourseFor({ calendarId: course.calendar.id, course: course.title })}>
            <span className="sc-cal-dot" style={{ background: course.calendar.color }} />
            <span className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{course.title}</b><span className="block truncate text-xs muted">{[course.info.teacher ?? course.events.find((event) => event.organizer)?.organizer, course.info.code].filter(Boolean).join(' · ') || ruleText(course.events.find((event) => event.rule)?.rule) || `${course.events.length} ${tr('sessions')}`}</span></span>
            {course.info.credits ? <span className="sc-credit">{course.info.credits}</span> : null}{course.info.note && <span title={tr('Has a note')}>📝</span>}
          </button></li>)}</ul>
        </section>}
        <p className="flex items-center gap-1.5 px-1 text-xs muted"><Users size={12} />{tr('Your schedule is private to your account and syncs to your devices.')}</p>
      </aside>
    </div>

    {planning && <PlannerForm initial={planning} courses={allCourses.map((course) => course.title)} onSave={savePlanner} onClose={() => setPlanning(null)} />}
    {manual && <ManualClassForm calendars={schedules} onSave={saveManual} onClose={() => setManual(false)} />}
    {settingsCal && <CalendarSettings calendar={settingsCal} onClose={() => setSettingsFor(null)} />}
    {courseCal && courseFor && <CourseSheet calendar={courseCal} course={courseFor.course} onClose={() => setCourseFor(null)} onReminder={() => { const course = courseFor.course; setCourseFor(null); setPlanning({ title: course, type: 'reminder', date: day, course }); }} />}
    {occOpen && <EventSheet occ={occOpen} locale={locale} onClose={() => setOccOpen(null)} onCourse={() => { setCourseFor({ calendarId: occOpen.calendar.id, course: courseKey(occOpen.event.title) }); setOccOpen(null); }} onReminder={() => reminderFor(occOpen)} />}
  </div>;
}

