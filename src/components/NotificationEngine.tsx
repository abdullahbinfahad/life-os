import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { collectReminders, reminderTiming } from '../lib/reminders';
import { completeReminderById } from '../lib/reminderActions';
import { alreadySent, inQuietHours, markSent, notifyPrefs, nowHM, setBadge, showAppNotification } from '../lib/notify';
import { expand, fmtTime } from '../lib/schedule';
import { cachedWeather, emojiFor, getWeather, unitSymbol, weatherAlerts, weatherPlace, type WeatherData } from '../lib/weather';
import { localeForLanguage, today } from '../lib/utils';
import { translate as tr } from '../lib/locales';
import { playFeedback } from '../lib/sounds';

/**
 * Runs everywhere in the app (not just on the Reminders page):
 * morning digest, due-today alerts, evening habit nudge, contact birthdays/follow-ups,
 * class/shift alerts, planner alerts, the app-icon badge, and "Mark done" actions.
 */
export default function NotificationEngine() {
  const navigate = useNavigate();
  const running = useRef(false);

  // Handle taps on notifications and their action buttons (sent by the service worker).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string; url?: string; reminderId?: string } | undefined;
      if (data?.type !== 'lifeos-notification') return;
      if (data.action === 'done' && data.reminderId) { if (completeReminderById(data.reminderId)) playFeedback('confirm'); return; }
      if (data.url) navigate(data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    // A notification may have opened the app with ?lifeos-done=<id>.
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const done = params.get('lifeos-done');
    if (done) { completeReminderById(done); params.delete('lifeos-done'); const [path] = window.location.hash.slice(1).split('?'); navigate(`${path || '/'}${params.toString() ? `?${params}` : ''}`, { replace: true }); }
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    const tick = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const state = useStore.getState();
        const prefs = notifyPrefs(state.settings);
        const day = today();
        const hm = nowHM();
        const locale = localeForLanguage(state.settings.language ?? 'en');
        const reminders = collectReminders({ items: state.items, goals: state.goals, projects: state.projects, habits: state.habits, contacts: state.contacts });
        const urgent = reminders.filter((reminder) => ['overdue', 'today'].includes(reminderTiming(reminder, day)) && (prefs.contacts || !reminder.contactId));
        const openPlanner = state.planner.filter((item) => !item.done && item.date <= day);
        if (prefs.badge) setBadge(urgent.length + openPlanner.length);
        if (!state.settings.browserNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const quiet = inQuietHours(prefs, hm);
        const sent = alreadySent(day);
        const fire = async (key: string, note: Parameters<typeof showAppNotification>[0]) => {
          if (sent.has(key)) return;
          sent.add(key); markSent(day, [key]);
          await showAppNotification({ vibrate: prefs.vibrate, ...note });
        };

        // 1) Classes, shifts and planner items: exact-time alerts (these ignore the daily digest but respect quiet hours).
        const now = new Date();
        if (!quiet) {
          if (prefs.schedule) {
            const soon = expand(state.schedules.filter((calendar) => calendar.notify), now, new Date(now.getTime() + 3 * 3600000)).filter((occ) => !occ.event.allDay);
            for (const occ of soon) {
              const lead = occ.calendar.leadMinutes ?? prefs.scheduleLead;
              const alertAt = occ.start.getTime() - lead * 60000;
              if (now.getTime() >= alertAt && now.getTime() < occ.start.getTime() + 5 * 60000) {
                const mins = Math.max(0, Math.round((occ.start.getTime() - now.getTime()) / 60000));
                await fire(`class:${occ.key}`, {
                  title: mins > 0 ? `${occ.event.title} ${tr('in')} ${mins} ${tr('min')}` : `${occ.event.title} ${tr('is starting')}`,
                  body: [`${fmtTime(occ.start, locale)}–${fmtTime(occ.end, locale)}`, occ.event.location].filter(Boolean).join(' · '),
                  tag: `lifeos-class:${occ.key}`, url: '/schedule', requireInteraction: false,
                });
              }
            }
          }
          for (const item of state.planner) {
            if (item.done || !item.notify || !item.time || item.date !== day) continue;
            const [h, m] = item.time.split(':').map(Number);
            const at = new Date(); at.setHours(h, m, 0, 0);
            const alertAt = at.getTime() - item.alertBefore * 60000;
            if (now.getTime() >= alertAt && now.getTime() < at.getTime() + 30 * 60000) {
              const emoji = item.type === 'meeting' ? '👥' : item.type === 'task' ? '✅' : '⏰';
              await fire(`planner:${item.id}:${item.date}:${item.time}`, {
                title: `${emoji} ${item.title}`, body: [item.alertBefore ? `${tr('At')} ${item.time} (${item.alertBefore} ${tr('min')})` : `${tr('Now')} · ${item.time}`, item.course, item.details].filter(Boolean).join(' · '),
                tag: `lifeos-planner:${item.id}`, url: '/schedule', reminderId: `planner:${item.id}`, requireInteraction: item.type !== 'task',
              });
            }
          }
        }
        // Weather: look a few hours ahead and warn with advice (rain, storm, snow, heat, cold, wind, fog).
        const place = weatherPlace(state.settings);
        let weather: WeatherData | null = null;
        if (place) {
          weather = cachedWeather(place.lat, place.lon, place.units);
          if (!weather || Date.now() - weather.fetchedAt > 30 * 60000) weather = await getWeather(place.lat, place.lon, place.units).catch(() => weather);
        }
        if (!quiet && prefs.weather && weather) {
          const upcoming = expand(state.schedules, now, new Date(now.getTime() + 6 * 3600000)).filter((occ) => !occ.event.allDay);
          for (const alert of weatherAlerts(weather, 4, prefs.hotAt, prefs.coldAt)) {
            const when = new Date(Math.max(alert.at, now.getTime()));
            const clash = upcoming.find((occ) => Math.abs(occ.start.getTime() - alert.at) <= 2 * 3600000);
            const emoji = alert.kind === 'hot' ? '🥵' : alert.kind === 'cold' ? '🥶' : alert.kind === 'wind' ? '💨' : emojiFor(alert.slot.code, alert.slot.icon);
            await fire(`weather:${alert.kind}:${Math.floor(alert.at / (6 * 3600000))}`, {
              title: `${emoji} ${tr(alert.title)}${alert.at > now.getTime() + 30 * 60000 ? ` · ${tr('around')} ${fmtTime(when, locale)}` : ''}`,
              body: [clash ? `${tr('Before your')} ${fmtTime(clash.start, locale)} ${clash.event.title}${clash.event.location ? ` (${clash.event.location})` : ''}:` : '', tr(alert.advice)].filter(Boolean).join(' '),
              tag: `lifeos-weather:${alert.kind}`, url: clash ? '/schedule' : '/',
            });
          }
        }
        if (quiet) return;

        // 2) Morning digest: one calm summary instead of many pings.
        if (prefs.digest && hm >= prefs.digestTime && !sent.has('digest')) {
          const classes = expand(state.schedules, new Date(`${day}T00:00:00`), new Date(`${day}T23:59:59`)).filter((occ) => !occ.event.allDay);
          const plannerToday = state.planner.filter((item) => !item.done && item.date === day);
          const lines: string[] = [];
          const overdueCount = urgent.filter((reminder) => reminder.overdue).length;
          const dueToday = urgent.length - overdueCount;
          if (dueToday) lines.push(`${dueToday} ${tr('due today')}`);
          if (overdueCount) lines.push(`${overdueCount} ${tr('overdue')}`);
          if (classes.length) lines.push(`${classes.length} ${tr(classes.length === 1 ? 'class/shift' : 'classes/shifts')} · ${tr('first at')} ${fmtTime(classes[0].start, locale)}`);
          if (plannerToday.length) lines.push(`${plannerToday.length} ${tr('planner items')}`);
          const birthdays = urgent.filter((reminder) => reminder.kind === 'contact-birthday');
          if (birthdays.length) lines.push(`🎂 ${birthdays.map((reminder) => reminder.title).join(', ')}`);
          if (weather) lines.unshift(`${emojiFor(weather.now.code, weather.now.icon)} ${Math.round(weather.now.temp)}${unitSymbol(weather.units)} · ${tr('high')} ${Math.round(weather.now.max)}°`);
          const top = urgent.filter((reminder) => reminder.kind !== 'contact-birthday').slice(0, 3).map((reminder) => `• ${reminder.title}`);
          sent.add('digest'); markSent(day, ['digest', ...urgent.map((reminder) => reminder.id)]);
          if (lines.length) await showAppNotification({ title: `☀️ ${tr('Your day in Life OS')}`, body: [lines.join(' · '), ...top].join('\n'), tag: 'lifeos-digest', url: classes.length ? '/schedule' : '/notifications', vibrate: prefs.vibrate });
        }

        // 3) Things that became due after the digest (or when the digest is off).
        if (prefs.due && (!prefs.digest || sent.has('digest'))) {
          const fresh = urgent.filter((reminder) => !sent.has(reminder.id) && reminder.kind !== 'habit-checkin');
          if (fresh.length === 1) {
            const reminder = fresh[0];
            await fire(reminder.id, { title: reminder.overdue ? `⏰ ${tr('Overdue')}: ${reminder.title}` : `📌 ${reminder.title}`, body: reminder.detail ? tr(reminder.detail) : tr(reminder.overdue ? 'This is past its due date.' : 'Due today'), tag: `lifeos:${reminder.id}`, url: reminder.route, reminderId: reminder.id });
          } else if (fresh.length > 1) {
            markSent(day, fresh.map((reminder) => reminder.id)); fresh.forEach((reminder) => sent.add(reminder.id));
            await showAppNotification({ title: `📌 ${fresh.length} ${tr('items need attention')}`, body: fresh.slice(0, 4).map((reminder) => `• ${reminder.title}`).join('\n'), tag: 'lifeos-due', url: '/notifications', vibrate: prefs.vibrate });
          }
        }

        // 4) Evening habit nudge.
        if (prefs.habits && hm >= prefs.habitTime) {
          const left = state.habits.filter((habit) => !habit.archived && habit.frequency === 'daily' && !habit.log.includes(day));
          if (left.length) await fire('habits', { title: `🔥 ${left.length} ${tr(left.length === 1 ? 'habit left today' : 'habits left today')}`, body: left.slice(0, 4).map((habit) => habit.title).join(' · '), tag: 'lifeos-habits', url: '/habits', reminderId: left.length === 1 ? `habit:${left[0].id}:${day}` : undefined });
        }
      } finally {
        running.current = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 30000);
    const onWake = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    const unsubscribe = useStore.subscribe((state, previous) => { if (state.items !== previous.items || state.projects !== previous.projects || state.habits !== previous.habits || state.planner !== previous.planner || state.contacts !== previous.contacts) void tick(); });
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); unsubscribe(); };
  }, []);
  return null;
}
