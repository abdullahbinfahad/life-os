/**
 * Device notifications that work everywhere the platform allows:
 * - Android Chrome only allows notifications through a service worker (new Notification() throws there).
 * - iPhone/iPad allow them only for the app added to the Home Screen (iOS 16.4+), also via the service worker.
 * - Desktop browsers support both; the service worker path also works while the tab is in the background.
 */
import type { Settings } from './types';

export type NotifyPrefs = Required<NonNullable<Settings['notify']>>;
export const DEFAULT_NOTIFY: NotifyPrefs = {
  digest: true, digestTime: '08:00',
  habits: true, habitTime: '20:30',
  due: true, contacts: true, team: true, schedule: true, scheduleLead: 10,
  quietStart: '22:30', quietEnd: '07:00',
  badge: true, vibrate: true,
  weather: true, hotAt: 33, coldAt: 5,
};
export const notifyPrefs = (settings: Settings): NotifyPrefs => ({ ...DEFAULT_NOTIFY, ...(settings.notify ?? {}) });

const base = () => (import.meta.env.BASE_URL || './');
const icon = () => `${base()}icon-192.png`;
const badge = () => `${base()}notification-badge.png`;

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const permission = (): NotificationPermission | 'unsupported' => notificationsSupported() ? Notification.permission : 'unsupported';
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export interface AppNotification {
  title: string;
  body: string;
  tag: string;
  url: string;                 // in-app route, e.g. "/notifications"
  reminderId?: string;         // enables the "Mark done" action
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: boolean;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
  } catch { return null; }
}

/** Show a system notification. Returns true when the device accepted it. */
export async function showAppNotification(note: AppNotification): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean; actions?: Array<{ action: string; title: string }>; timestamp?: number } = {
    body: note.body,
    tag: note.tag,
    icon: icon(),
    badge: badge(),
    data: { url: note.url, reminderId: note.reminderId },
    requireInteraction: note.requireInteraction,
    silent: note.silent,
    renotify: true,
    timestamp: Date.now(),
    vibrate: note.vibrate === false ? undefined : [120, 60, 120],
    actions: note.actions ?? (note.reminderId ? [{ action: 'done', title: '✓ Mark done' }, { action: 'open', title: 'Open' }] : [{ action: 'open', title: 'Open' }]),
  };
  const reg = await registration();
  if (reg) {
    try { await reg.showNotification(note.title, options); return true; } catch { /* fall through to the page API */ }
  }
  try {
    const { actions: _actions, ...pageOptions } = options;
    void _actions;
    const shown = new Notification(note.title, pageOptions);
    shown.onclick = () => { window.focus(); window.location.hash = `#${note.url}`; shown.close(); };
    return true;
  } catch { return false; }
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

/** Number on the app icon (installed app on iOS 16.4+, Android, Windows, macOS). */
export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);
  } catch { /* unsupported */ }
}

/* ---------- time helpers ---------- */
export const nowHM = (date = new Date()) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export function inQuietHours(prefs: NotifyPrefs, hm = nowHM()) {
  const { quietStart: start, quietEnd: end } = prefs;
  if (!start || !end || start === end) return false;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}

/* ---------- once-per-day memory ---------- */
const logKey = (day: string) => `lifeos-notify-log:${day}`;
export function alreadySent(day: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(logKey(day)) ?? '[]')); } catch { return new Set(); }
}
export function markSent(day: string, keys: string[]) {
  try {
    const set = alreadySent(day); keys.forEach((key) => set.add(key));
    localStorage.setItem(logKey(day), JSON.stringify([...set].slice(-400)));
    // Keep only a week of history.
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('lifeos-notify-log:') && key < logKey(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))) localStorage.removeItem(key);
    }
  } catch { /* storage blocked */ }
}
