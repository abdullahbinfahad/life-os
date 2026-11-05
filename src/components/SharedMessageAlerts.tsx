import { MessageCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { translate as tr } from '../lib/locales';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import {
  fetchMyUnreadSharedNotifications,
  markSharedNotificationRead,
  subscribeToSharedNotifications,
  type SharedNotification,
} from '../lib/sharedProjects';
import { playFeedback } from '../lib/sounds';
import './SharedMessageAlerts.css';

const messageKind = (kind: string) => kind.startsWith('comment.');
const previewFor = (notification: SharedNotification) => {
  const preview = notification.payload?.message_preview;
  return typeof preview === 'string' && preview.trim() ? preview : tr('New shared message');
};
type ActiveToast = { notification: SharedNotification; revision: number };

export default function SharedMessageAlerts() {
  const { user } = useAuth();
  const browserNotifications = useStore((state) => state.settings.browserNotifications);
  const navigate = useNavigate();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const [toastFading, setToastFading] = useState(false);
  const [toastPaused, setToastPaused] = useState(false);
  const knownUnreadIds = useRef(new Set<string>());
  const activeToast = useRef<ActiveToast | null>(null);
  const nextRevision = useRef(0);
  const toastId = toast?.notification.id;
  const toastRevision = toast?.revision;

  const showToast = useCallback((notification: SharedNotification) => {
    const sameMessage = activeToast.current?.notification.id === notification.id;
    const next = { notification, revision: ++nextRevision.current };
    activeToast.current = next;
    setToast(next);
    setToastFading(false);
    if (!sameMessage) setToastPaused(false);
  }, []);

  const dismissToast = useCallback((id?: string, revision?: number) => {
    const current = activeToast.current;
    if (!current || (id && current.notification.id !== id) || (revision !== undefined && current.revision !== revision)) return;
    activeToast.current = null;
    setToast(null);
    setToastFading(false);
    setToastPaused(false);
  }, []);

  const pauseToast = useCallback(() => {
    setToastPaused(true);
    setToastFading(false);
  }, []);
  const resumeToast = useCallback(() => setToastPaused(false), []);

  const openNotification = useCallback(async (notification: SharedNotification) => {
    try {
      if (!notification.read_at) await markSharedNotificationRead(notification.id);
      knownUnreadIds.current.delete(notification.id);
    } catch {
      // Open the discussion even if marking the alert read is temporarily unavailable.
    }
    dismissToast(notification.id);
    navigate(`/projects?sharedProject=${encodeURIComponent(notification.project_id)}&section=discussion`);
  }, [dismissToast, navigate]);

  const handleChange = useCallback((notification: SharedNotification) => {
    if (!messageKind(notification.kind)) return;
    if (notification.read_at) {
      knownUnreadIds.current.delete(notification.id);
      dismissToast(notification.id);
      return;
    }
    const isNew = !knownUnreadIds.current.has(notification.id);
    knownUnreadIds.current.add(notification.id);
    if (isNew) {
      showToast(notification);
      playFeedback('notification');
      if (browserNotifications && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const browserNotification = new Notification(tr('New shared message'), {
            body: previewFor(notification),
            tag: `lifeos-shared:${notification.id}`,
            icon: `${import.meta.env.BASE_URL}lifeos-mark.svg`,
          });
          browserNotification.onclick = () => {
            window.focus();
            void openNotification(notification);
          };
        } catch { /* The in-app toast remains available when system alerts are unavailable. */ }
      }
    } else if (activeToast.current?.notification.id === notification.id) {
      // A refreshed preview for the visible message gets a fresh display interval.
      showToast(notification);
    }
  }, [browserNotifications, dismissToast, openNotification, showToast]);

  useEffect(() => {
    if (!user?.id) {
      knownUnreadIds.current.clear();
      activeToast.current = null;
      setToast(null);
      setToastPaused(false);
      return;
    }
    let active = true;
    const hydrationStartedAt = Date.now();
    let hydratingUnread = true;
    const pendingEvents: SharedNotification[] = [];
    const dispatch = (notification: SharedNotification) => {
      if (!active) return;
      if (hydratingUnread) pendingEvents.push(notification);
      else handleChange(notification);
    };
    const drainPendingEvents = () => {
      hydratingUnread = false;
      pendingEvents.splice(0).forEach((notification) => {
        const createdAt = Date.parse(notification.created_at);
        const predatesHydration = Number.isFinite(createdAt) && createdAt <= hydrationStartedAt;
        if (!notification.read_at && predatesHydration && !knownUnreadIds.current.has(notification.id)) {
          knownUnreadIds.current.add(notification.id);
          return;
        }
        handleChange(notification);
      });
    };
    const unsubscribe = subscribeToSharedNotifications(user.id, dispatch);
    void fetchMyUnreadSharedNotifications(user.id, 50).then((result) => {
      if (!active) return;
      result.notifications
        .filter((item) => messageKind(item.kind) && !item.read_at)
        .forEach((item) => {
          const createdAt = Date.parse(item.created_at);
          if (Number.isFinite(createdAt) && createdAt <= hydrationStartedAt) knownUnreadIds.current.add(item.id);
        });
      drainPendingEvents();
    }).catch(() => {
      if (active) drainPendingEvents();
    });
    return () => { active = false; unsubscribe(); };
  }, [user?.id, handleChange]);

  useEffect(() => {
    if (!toastId || toastRevision === undefined || toastPaused) return;
    const fadeTimer = window.setTimeout(() => setToastFading(true), 5200);
    const dismissTimer = window.setTimeout(() => dismissToast(toastId, toastRevision), 5700);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [toastId, toastRevision, toastPaused, dismissToast]);

  if (!user?.id) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[70] w-[min(24rem,calc(100vw-1.5rem))]" aria-live="polite" aria-atomic="true">
      {toast && (
        <article
          key={toast.notification.id}
          className={`shared-message-toast pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl shadow-slate-900/15 backdrop-blur-xl dark:border-white/10 dark:bg-[#151821]/95${toastFading ? ' is-fading' : ''}`}
          onMouseEnter={pauseToast}
          onMouseLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement)) resumeToast();
          }}
          onFocusCapture={pauseToast}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (!event.currentTarget.contains(nextTarget) && !event.currentTarget.matches(':hover')) resumeToast();
          }}
        >
          <div className="flex items-start gap-3 p-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" aria-hidden="true">
              <MessageCircle size={18} />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={`${tr('Open discussion')}: ${previewFor(toast.notification)}`}
              onClick={() => void openNotification(toast.notification)}
            >
              <span className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">{tr('New shared message')}</span>
              <span className="mt-1 block break-words text-sm leading-5 text-slate-800 dark:text-slate-100">{previewFor(toast.notification)}</span>
              <span className="mt-2 block text-[11px] text-slate-500 dark:text-slate-400">{tr('Open discussion')}</span>
            </button>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={tr('Dismiss')}
              onClick={() => dismissToast(toast.notification.id, toast.revision)}
            >
              <X size={16} />
            </button>
          </div>
        </article>
      )}
    </div>
  );
}
