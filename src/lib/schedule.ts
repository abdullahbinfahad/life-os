/* Routine / timetable calendars imported from .ics files (or typed in by hand). */
import { uid } from './utils';

export type ScheduleKind = 'school' | 'university' | 'class' | 'work' | 'other';
export interface ScheduleRule { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number; count?: number; until?: string; byday?: string[]; bymonthday?: number[] }
export interface ScheduleEvent {
  id: string;
  uid: string;
  title: string;
  /** Wall-clock start "YYYY-MM-DDTHH:MM:SS" (or "YYYY-MM-DD" when allDay) in `tz`. */
  start: string;
  /** Duration in minutes (all-day events: whole days × 1440). */
  minutes: number;
  allDay: boolean;
  /** IANA zone, 'UTC', or 'floating' (= device local time). */
  tz: string;
  location?: string;
  description?: string;
  organizer?: string;
  rule?: ScheduleRule;
  exdates?: string[];       // wall-clock starts to skip
  recurrenceId?: string;    // this event replaces that occurrence of the series with the same uid
  cancelled?: boolean;
}
export interface CourseInfo { credits?: number; teacher?: string; code?: string; note?: string; color?: string }
export interface PlannerItem {
  id: string;
  title: string;
  type: 'task' | 'meeting' | 'reminder';
  date: string;            // YYYY-MM-DD
  time?: string;           // HH:MM
  alertBefore: number;     // minutes before (0 = at the time)
  notify: boolean;
  details?: string;
  course?: string;         // linked course title
  done?: boolean;
  createdAt: string;
}
export const ALERT_OPTIONS = [0, 5, 10, 15, 20, 30, 60];
export interface ScheduleCalendar {
  id: string;
  name: string;
  /** e.g. "Class 2501 · Automation (International)" */
  program?: string;
  /** First day of week 1 (YYYY-MM-DD) for academic week numbers. */
  termStart?: string;
  /** Minutes before each class to notify. */
  leadMinutes?: number;
  courses?: Record<string, CourseInfo>;
  color: string;
  kind: ScheduleKind;
  visible: boolean;
  notify: boolean;
  source: 'ics' | 'manual';
  fileName?: string;
  importedAt: string;
  events: ScheduleEvent[];
}
export interface Occurrence { key: string; event: ScheduleEvent; calendar: ScheduleCalendar; start: Date; end: Date }

export const KINDS: { id: ScheduleKind; label: string; emoji: string }[] = [
  { id: 'school', label: 'School', emoji: '🏫' }, { id: 'university', label: 'University', emoji: '🎓' },
  { id: 'class', label: 'Classes', emoji: '📚' }, { id: 'work', label: 'Work shifts', emoji: '💼' }, { id: 'other', label: 'Other', emoji: '🗓️' },
];
export const CAL_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f43f5e', '#84cc16', '#0ea5e9', '#f97316'];
export const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/* ---------------- time zones ---------------- */
const WINDOWS_TZ: Record<string, string> = {
  'China Standard Time': 'Asia/Shanghai', 'Singapore Standard Time': 'Asia/Singapore', 'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul',
  'India Standard Time': 'Asia/Kolkata', 'Bangladesh Standard Time': 'Asia/Dhaka', 'Pakistan Standard Time': 'Asia/Karachi', 'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh', 'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'E. Europe Standard Time': 'Europe/Bucharest', 'Russian Standard Time': 'Europe/Moscow', 'Turkey Standard Time': 'Europe/Istanbul',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland', 'Taipei Standard Time': 'Asia/Taipei', 'SE Asia Standard Time': 'Asia/Bangkok',
  'Malay Peninsula Standard Time': 'Asia/Kuala_Lumpur', 'Egypt Standard Time': 'Africa/Cairo', 'South Africa Standard Time': 'Africa/Johannesburg', 'UTC': 'UTC',
};
function validZone(zone: string) { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; } }
function normalizeZone(raw?: string): string {
  if (!raw) return 'floating';
  const cleaned = raw.replace(/^"|"$/g, '').replace(/^\/[^/]+\/[^/]+\//, '').replace(/^\//, '');
  if (validZone(cleaned)) return cleaned;
  if (WINDOWS_TZ[cleaned]) return WINDOWS_TZ[cleaned];
  const match = Object.keys(WINDOWS_TZ).find((name) => cleaned.includes(name));
  return match ? WINDOWS_TZ[match] : 'floating';
}
function zoneOffsetMs(utcMs: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - utcMs;
}
/** Wall-clock time in a zone → real instant. */
export function wallToDate(wall: string, zone: string): Date {
  const [date, time = '00:00:00'] = wall.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  if (zone === 'floating') return new Date(y, m - 1, d, hh, mm, ss);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  if (zone === 'UTC') return new Date(guess);
  let utc = guess - zoneOffsetMs(guess, zone);
  utc = guess - zoneOffsetMs(utc, zone);
  return new Date(utc);
}

/* ---------------- wall-clock date arithmetic ---------------- */
const pad = (value: number) => String(value).padStart(2, '0');
const wallDate = (wall: string) => wall.slice(0, 10);
const wallTime = (wall: string) => wall.slice(10);
function addWallDays(day: string, days: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function weekday(day: string) { return new Date(`${day}T12:00:00Z`).getUTCDay(); }
function addWallMonths(day: string, months: number, dom: number) {
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (dom > last) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(dom)}`;
}

/* ---------------- ICS parsing ---------------- */
const unescapeText = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
function parseDateValue(value: string, params: Record<string, string>): { wall: string; tz: string; allDay: boolean } | null {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v); if (!m) return null;
    return { wall: `${m[1]}-${m[2]}-${m[3]}`, tz: 'floating', allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const wall = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`;
  return { wall, tz: m[7] ? 'UTC' : normalizeZone(params.TZID), allDay: false };
}
function parseDuration(value: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  return (Number(m[2] ?? 0) * 7 * 1440) + (Number(m[3] ?? 0) * 1440) + (Number(m[4] ?? 0) * 60) + Number(m[5] ?? 0) + Math.round(Number(m[6] ?? 0) / 60);
}
function parseRule(value: string, tz: string): ScheduleRule | undefined {
  const parts = Object.fromEntries(value.split(';').map((part) => part.split('=')).filter((pair) => pair.length === 2).map(([key, val]) => [key.toUpperCase(), val]));
  const freq = parts.FREQ as ScheduleRule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return undefined;
  let until: string | undefined;
  if (parts.UNTIL) {
    const parsed = parseDateValue(parts.UNTIL, {});
    if (parsed) until = parsed.allDay ? `${parsed.wall}T23:59:59` : parsed.tz === 'UTC' && tz !== 'UTC' ? toWallIn(wallToDate(parsed.wall, 'UTC'), tz) : parsed.wall;
  }
  return {
    freq, interval: Math.max(1, Number(parts.INTERVAL) || 1), count: parts.COUNT ? Number(parts.COUNT) : undefined, until,
    byday: parts.BYDAY ? parts.BYDAY.split(',').map((day) => day.trim().toUpperCase()) : undefined,
    bymonthday: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(Number).filter(Boolean) : undefined,
  };
}
function toWallIn(date: Date, zone: string) {
  if (zone === 'floating') return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${pad(Number(get('hour')) % 24)}:${get('minute')}:${get('second')}`;
}

export interface ParsedIcs { name?: string; events: ScheduleEvent[]; skipped: number }
export function parseIcs(text: string): ParsedIcs {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: ScheduleEvent[] = [];
  let name: string | undefined;
  let current: Record<string, Array<{ value: string; params: Record<string, string> }>> | null = null;
  let depth = 0; let skipped = 0;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { current = {}; depth = 0; continue; }
    if (current && /^BEGIN:/i.test(line)) { depth++; continue; }           // VALARM etc.
    if (current && /^END:/i.test(line) && !/^END:VEVENT/i.test(line)) { depth--; continue; }
    if (/^END:VEVENT/i.test(line) && current) {
      const event = buildEvent(current);
      if (event) events.push(event); else skipped++;
      current = null; continue;
    }
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const head = line.slice(0, colon); const value = line.slice(colon + 1);
    const [rawKey, ...rawParams] = head.split(';');
    const key = rawKey.toUpperCase();
    if (!current) { if (key === 'X-WR-CALNAME') name = unescapeText(value); continue; }
    if (depth > 0) continue;
    const params = Object.fromEntries(rawParams.map((param) => { const [k, ...rest] = param.split('='); return [k.toUpperCase(), rest.join('=')]; }));
    (current[key] ??= []).push({ value, params });
  }
  return { name, events, skipped };
}
function buildEvent(props: Record<string, Array<{ value: string; params: Record<string, string> }>>): ScheduleEvent | null {
  const first = (key: string) => props[key]?.[0];
  const startProp = first('DTSTART'); if (!startProp) return null;
  const start = parseDateValue(startProp.value, startProp.params); if (!start) return null;
  let minutes = start.allDay ? 1440 : 60;
  const endProp = first('DTEND');
  const durProp = first('DURATION');
  if (endProp) {
    const end = parseDateValue(endProp.value, endProp.params);
    if (end) minutes = Math.max(start.allDay ? 1440 : 1, Math.round((wallToDate(end.wall, end.tz).getTime() - wallToDate(start.wall, start.tz).getTime()) / 60000));
  } else if (durProp) minutes = parseDuration(durProp.value) ?? minutes;
  const exdates = (props.EXDATE ?? []).flatMap((ex) => ex.value.split(',').map((value) => parseDateValue(value, ex.params)).filter(Boolean).map((parsed) => parsed!.tz === start.tz || parsed!.allDay ? parsed!.wall : toWallIn(wallToDate(parsed!.wall, parsed!.tz), start.tz)));
  const recurrence = first('RECURRENCE-ID');
  const recurrenceParsed = recurrence ? parseDateValue(recurrence.value, recurrence.params) : null;
  const organizer = first('ORGANIZER');
  return {
    id: uid(),
    uid: first('UID')?.value.trim() || uid(),
    title: unescapeText(first('SUMMARY')?.value ?? '') || 'Untitled',
    start: start.wall, minutes, allDay: start.allDay, tz: start.tz,
    location: first('LOCATION') ? unescapeText(first('LOCATION')!.value) || undefined : undefined,
    description: first('DESCRIPTION') ? unescapeText(first('DESCRIPTION')!.value).slice(0, 600) || undefined : undefined,
    organizer: organizer ? (organizer.params.CN?.replace(/^"|"$/g, '') || organizer.value.replace(/^mailto:/i, '')) : undefined,
    rule: first('RRULE') ? parseRule(first('RRULE')!.value, start.tz) : undefined,
    exdates: exdates.length ? exdates : undefined,
    recurrenceId: recurrenceParsed ? (recurrenceParsed.tz === start.tz || recurrenceParsed.allDay ? recurrenceParsed.wall : toWallIn(wallToDate(recurrenceParsed.wall, recurrenceParsed.tz), start.tz)) : undefined,
    cancelled: /CANCELLED/i.test(first('STATUS')?.value ?? '') || undefined,
  };
}

/* ---------------- expansion ---------------- */
/** All occurrences overlapping [from, to). */
export function expand(calendars: ScheduleCalendar[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const calendar of calendars) {
    if (!calendar.visible) continue;
    const overrides = new Map<string, ScheduleEvent>();
    for (const event of calendar.events) if (event.recurrenceId) overrides.set(`${event.uid}|${event.recurrenceId}`, event);
    for (const event of calendar.events) {
      if (event.recurrenceId) {
        if (!event.cancelled) push(out, calendar, event, event.start, from, to, `${calendar.id}:${event.id}`);
        continue;
      }
      if (event.cancelled) continue;
      const skip = new Set(event.exdates ?? []);
      for (const wall of instances(event, from, to)) {
        if (skip.has(wall) || skip.has(wallDate(wall))) continue;
        if (overrides.has(`${event.uid}|${wall}`)) continue;
        push(out, calendar, event, wall, from, to, `${calendar.id}:${event.id}:${wall}`);
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.calendar.name.localeCompare(b.calendar.name));
}
function push(out: Occurrence[], calendar: ScheduleCalendar, event: ScheduleEvent, wall: string, from: Date, to: Date, key: string) {
  const start = event.allDay ? wallToDate(`${wallDate(wall)}T00:00:00`, 'floating') : wallToDate(wall, event.tz);
  const end = new Date(start.getTime() + event.minutes * 60000);
  if (end > from && start < to) out.push({ key, event, calendar, start, end });
}
function* instances(event: ScheduleEvent, from: Date, to: Date): Generator<string> {
  const rule = event.rule;
  if (!rule) { yield event.start; return; }
  const time = wallTime(event.start);
  const startDay = wallDate(event.start);
  // Look a little before `from` so long events that started earlier still show.
  const fromDay = toWallIn(new Date(from.getTime() - Math.max(event.minutes, 1440) * 60000 - 86400000), event.tz).slice(0, 10);
  const toDay = toWallIn(new Date(to.getTime() + 86400000), event.tz).slice(0, 10);
  const untilWall = rule.until;
  let emitted = 0; let guard = 0;
  const done = (wall: string) => (untilWall && wall > untilWall) || (rule.count !== undefined && emitted >= rule.count);
  if (rule.freq === 'WEEKLY') {
    const days = (rule.byday?.length ? rule.byday.map((code) => DAY_CODES.indexOf(code.slice(-2))).filter((day) => day >= 0) : [weekday(startDay)]).sort();
    const weekStart = addWallDays(startDay, -weekday(startDay));
    // Jump close to the window when there is no COUNT to honour.
    let week = 0;
    if (rule.count === undefined && fromDay > startDay) { const diff = Math.floor((Date.parse(`${fromDay}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / (7 * 86400000)); week = Math.max(0, Math.floor(diff / rule.interval) * rule.interval - rule.interval); }
    while (guard++ < 3000) {
      const base = addWallDays(weekStart, week * 7);
      if (base > toDay) return;
      for (const day of days) {
        const date = addWallDays(base, day);
        if (date < startDay) continue;
        const wall = `${date}${time}`;
        if (done(wall)) return;
        emitted++;
        if (date >= fromDay && date <= toDay) yield wall;
      }
      week += rule.interval;
    }
    return;
  }
  if (rule.freq === 'DAILY') {
    let step = 0;
    if (rule.count === undefined && fromDay > startDay) step = Math.max(0, Math.floor((Date.parse(`${fromDay}T12:00:00Z`) - Date.parse(`${startDay}T12:00:00Z`)) / 86400000 / rule.interval) - 1) * rule.interval;
    while (guard++ < 5000) {
      const date = addWallDays(startDay, step);
      if (date > toDay) return;
      const allowed = !rule.byday?.length || rule.byday.some((code) => DAY_CODES.indexOf(code.slice(-2)) === weekday(date));
      const wall = `${date}${time}`;
      if (allowed) { if (done(wall)) return; emitted++; if (date >= fromDay) yield wall; }
      step += rule.interval;
    }
    return;
  }
  if (rule.freq === 'MONTHLY') {
    const doms = rule.bymonthday?.length ? rule.bymonthday : [Number(startDay.slice(8, 10))];
    for (let month = 0; guard++ < 1200; month += rule.interval) {
      const probe = addWallMonths(startDay, month, 1);
      if (!probe || probe > toDay) return;
      for (const dom of doms) {
        const date = addWallMonths(startDay, month, dom);
        if (!date || date < startDay) continue;
        const wall = `${date}${time}`;
        if (done(wall)) return;
        emitted++;
        if (date >= fromDay && date <= toDay) yield wall;
      }
    }
    return;
  }
  for (let year = 0; guard++ < 200; year += rule.interval) {
    const date = `${Number(startDay.slice(0, 4)) + year}${startDay.slice(4)}`;
    if (date > toDay) return;
    const wall = `${date}${time}`;
    if (done(wall)) return;
    emitted++;
    if (date >= fromDay) yield wall;
  }
}

/* ---------------- helpers for UI ---------------- */
export function ruleText(rule?: ScheduleRule) {
  if (!rule) return '';
  const names: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
  const every = rule.interval > 1 ? `Every ${rule.interval} ${rule.freq === 'WEEKLY' ? 'weeks' : rule.freq === 'DAILY' ? 'days' : rule.freq === 'MONTHLY' ? 'months' : 'years'}` : rule.freq === 'WEEKLY' ? 'Weekly' : rule.freq === 'DAILY' ? 'Daily' : rule.freq === 'MONTHLY' ? 'Monthly' : 'Yearly';
  const days = rule.byday?.length ? ` on ${rule.byday.map((code) => names[code.slice(-2)] ?? code).join(', ')}` : '';
  const until = rule.until ? ` until ${rule.until.slice(0, 10)}` : rule.count ? `, ${rule.count} times` : '';
  return `${every}${days}${until}`;
}
export const localDayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
export const fmtTime = (date: Date, locale: string) => date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

/** A weekly class/shift typed by hand. */
export function manualEvent(input: { title: string; days: number[]; startTime: string; endTime: string; location?: string; from: string; until?: string; note?: string }): ScheduleEvent {
  const [sh, sm] = input.startTime.split(':').map(Number); const [eh, em] = input.endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm); if (minutes <= 0) minutes += 1440;
  return {
    id: uid(), uid: uid(), title: input.title.trim(), start: `${input.from}T${input.startTime}:00`, minutes, allDay: false, tz: 'floating',
    location: input.location?.trim() || undefined, description: input.note?.trim() || undefined,
    rule: { freq: 'WEEKLY', interval: 1, byday: input.days.map((day) => DAY_CODES[day]), until: input.until ? `${input.until}T23:59:59` : undefined },
  };
}

/* ---------------- courses & weeks ---------------- */
export const courseKey = (title: string) => title.replace(/\s*\((?:moved|cancelled|online)\)\s*$/i, '').replace(/\s+(lecture|lab|tutorial|seminar|practical|class)$/i, '').trim();
export function coursesOf(calendar: ScheduleCalendar) {
  const map = new Map<string, { title: string; events: ScheduleEvent[]; info: CourseInfo }>();
  for (const event of calendar.events) {
    if (event.allDay) continue;
    const key = courseKey(event.title);
    const row = map.get(key) ?? { title: key, events: [], info: calendar.courses?.[key] ?? {} };
    row.events.push(event); map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}
/** Monday of the week containing the earliest class, used when no term start is set. */
export function defaultTermStart(calendar: ScheduleCalendar) {
  const first = calendar.events.filter((event) => !event.recurrenceId).map((event) => event.start.slice(0, 10)).sort()[0];
  if (!first) return undefined;
  const day = weekday(first);
  return addWallDays(first, -((day + 6) % 7));
}
export function academicWeek(termStart: string | undefined, day: string) {
  if (!termStart) return null;
  const diff = Math.floor((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${termStart}T12:00:00Z`)) / 86400000);
  return diff < 0 ? null : Math.floor(diff / 7) + 1;
}
