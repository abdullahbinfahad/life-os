import { Bell, MessageCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { translate as tr } from '../lib/locales';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import {
  fetchMyUnreadSharedNotifications,
  markSharedNotificationRead,
  sharedServiceError,
  subscribeToSharedNotifications,
  type SharedNotification,
} from '../lib/sharedProjects';
import { playFeedback } from '../lib/sounds';
import { cx } from '../lib/utils';

const messageKind = (kind: string) => kind.startsWith('comment.');
const previewFor = (notification: SharedNotification) => {
  const preview = notification.payload?.message_preview;
  return typeof preview === 'string' && preview.trim() ? preview : tr('New shared message');
};

export default function SharedMessageAlerts() {
  const { user } = useAuth();
  const browserNotifications = useStore((state) => state.settings.browserNotifications);
  const navigate = useNavigate();
  const [unread, setUnread] = useState<SharedNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const knownUnreadIds = useRef(new Set<string>());

  const openNotification = useCallback(async (notification: SharedNotification) => {
    try {
      if (!notification.read_at) await markSharedNotificationRead(notification.id);
      if (knownUnreadIds.current.delete(notification.id)) setTotal((count) => Math.max(0, count - 1));
      setUnread((current) => current.filter((item) => item.id !== notification.id));
      setOpen(false);
      navigate(`/projects?sharedProject=${encodeURIComponent(notification.project_id)}&section=discussion`);
    } catch (problem) {
      setError(sharedServiceError(problem));
    }
  }, [navigate]);

  const handleChange = useCallback((notification: SharedNotification) => {
    if (!messageKind(notification.kind)) return;
    if (notification.read_at) {
      if (knownUnreadIds.current.delete(notification.id)) setTotal((count) => Math.max(0, count - 1));
      setUnread((current) => current.filter((item) => item.id !== notification.id));
      return;
    }
    const isNew = !knownUnreadIds.current.has(notification.id);
    knownUnreadIds.current.add(notification.id);
    if (isNew) {
      setTotal((count) => count + 1);
      setOpen(true);
      setError('');
      playFeedback('notification');
    }
    setUnread((current) => current.some((item) => item.id === notification.id)
      ? current.map((item) => item.id === notification.id ? notification : item)
      : [notification, ...current].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50));
    if (isNew && browserNotifications && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(tr('New shared message'), {
          body: previewFor(notification),
          tag: `lifeos-shared:${notification.id}`,
          icon: `${import.meta.env.BASE_URL}lifeos-mark.svg`,
        });
        browserNotification.onclick = () => {
          window.focus();
          navigate(`/projects?sharedProject=${encodeURIComponent(notification.project_id)}&section=discussion`);
        };
      } catch { /* The in-app unread center remains available when system alerts are unavailable. */ }
    }
  }, [browserNotifications, navigate]);

  useEffect(() => {
    if (!user?.id) {
      knownUnreadIds.current.clear();
      setUnread([]);
      setTotal(0);
      setOpen(false);
      return;
    }
    let active = true;
    const unsubscribe = subscribeToSharedNotifications(user.id, (notification) => {
      if (active) handleChange(notification);
    });
    void fetchMyUnreadSharedNotifications(user.id, 50).then((result) => {
      if (!active) return;
      setUnread((current) => {
        const byId = new Map(result.notifications.filter((item) => messageKind(item.kind)).map((item) => [item.id, item]));
        current.forEach((item) => byId.set(item.id, item));
        const rows = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
        knownUnreadIds.current = new Set(rows.map((item) => item.id));
        return rows;
      });
      setTotal((current) => Math.max(current, result.total));
    }).catch((problem) => {
      if (active) setError(sharedServiceError(problem));
    });
    return () => { active = false; unsubscribe(); };
  }, [user?.id, handleChange]);

  if (!user?.id) return null;
  return <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[70] w-[min(23rem,calc(100vw-1.5rem))]">
    {open && <section className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl dark:border-white/10 dark:bg-[#151821]/95" aria-label={tr('Shared messages')}>
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-3 dark:border-white/10">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><MessageCircle size={17} /></span>
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{tr('Shared messages')}</h2><p className="text-xs muted">{total} {tr('unread')}</p></div>
        <button type="button" className="btn-ghost !min-h-9 !w-9 !p-0" aria-label={tr('Dismiss')} onClick={() => setOpen(false)}><X size={17} /></button>
      </header>
      {error && <p role="alert" className="mx-3 mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
      <div className="max-h-[min(55dvh,28rem)] space-y-2 overflow-y-auto p-2">
        {unread.filter((notification) => messageKind(notification.kind)).map((notification) => <article key={notification.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[.025]">
          <div className="flex min-w-0 items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{tr('New shared message')}</p><p className="mt-1 line-clamp-3 break-words text-sm leading-5">{previewFor(notification)}</p><time className="mt-1 block text-[11px] muted" dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time></div></div>
          <button type="button" className="btn-outline mt-2 min-h-9 w-full justify-center text-xs" onClick={() => void openNotification(notification)}>{tr('Open discussion')}</button>
        </article>)}
        {unread.filter((notification) => messageKind(notification.kind)).length === 0 && <p className="p-4 text-center text-sm muted">{tr('No unread messages')}</p>}
        {total > unread.length && <p className="px-2 py-2 text-center text-xs muted">{tr('Latest unread messages are shown first.')}</p>}
      </div>
    </section>}
    {total > 0 && <button type="button" className={cx('ml-auto flex min-h-11 items-center gap-2 rounded-full border border-indigo-200 bg-white/95 px-3.5 text-sm font-semibold text-indigo-800 shadow-lg shadow-slate-900/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-indigo-400 dark:border-indigo-400/30 dark:bg-[#151821]/95 dark:text-indigo-200', open && 'hidden')} aria-label={`${tr('Shared messages')}: ${total} ${tr('unread')}`} onClick={() => setOpen(true)}><Bell size={16} /><span>{tr('Shared messages')}</span><span className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">{total > 99 ? '99+' : total}</span></button>}
  </div>;
}
