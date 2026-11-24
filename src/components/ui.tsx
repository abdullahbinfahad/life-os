import { translate as tr } from '../lib/locales';
import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cx } from '../lib/utils';
import type { Category } from '../lib/types';
import { playFeedback } from '../lib/sounds';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="page-title break-words text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => { if (open) playFeedback('popup'); }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-3 sm:items-center pt-[max(.75rem,env(safe-area-inset-top))] pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-4 md:p-10" role="presentation" onMouseDown={onClose}>
      <div
        className={cx('modal-panel card my-auto max-h-[90dvh] w-full overflow-y-auto !bg-white p-4 dark:!bg-[#12151c] sm:p-6 md:max-h-[calc(100dvh-5rem)]', wide ? 'max-w-4xl' : 'max-w-lg')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label={tr("Close")}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useMountedValue(value: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(frame); }, [value]);
  return shown;
}

/** Animates a number from its previous value; instant when reduced motion is preferred. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(value) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return; }
    const start = performance.now(); const origin = from.current; let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration); const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value, duration]);
  return <>{Number.isInteger(value) ? Math.round(shown).toLocaleString() : shown.toFixed(1)}</>;
}

export function Progress({ value, color = '#6366f1', className }: { value: number; color?: string; className?: string }) {
  const shown = useMountedValue(value);
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, shown)}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = '#6366f1', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useMountedValue(value);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-slate-200 dark:stroke-white/10" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, shown) / 100) * c} className="transition-all duration-700" />
      </svg>
      <div className="absolute text-sm font-semibold">{children ?? `${value}%`}</div>
    </div>
  );
}

export function CatBadge({ cat }: { cat?: Category }) {
  if (!cat) return null;
  return (
    <span className="chip max-w-full" style={{ background: cat.color + '1a' }}>
      <span className="shrink-0" style={{ color: cat.color }}>{cat.icon}</span>
      <span className="min-w-0 max-w-[140px] truncate text-slate-700 dark:text-slate-200">{cat.name}</span>
    </span>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="empty-state-icon rounded-2xl bg-indigo-500/10 p-4 text-indigo-500">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <p className="max-w-sm text-sm muted">{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon, color = '#6366f1' }: { label: string; value: ReactNode; sub?: string; icon: ReactNode; color?: string }) {
  return (
    <div className="stat-card card p-5" style={{ ['--stat-color' as string]: color }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm muted">{label}</span>
        <span className="stat-icon shrink-0 rounded-xl p-2" style={{ background: color + '1f', color }}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {sub && <div className="mt-1 text-xs muted">{sub}</div>}
    </div>
  );
}

export const STATUS_META: Record<string, { label: string; color: string }> = {
  someday: { label: 'Someday', color: '#64748b' },
  next: { label: 'Next', color: '#f59e0b' },
  active: { label: 'In progress', color: '#3b82f6' },
  done: { label: 'Done', color: '#22c55e' },
  dropped: { label: 'Dropped', color: '#ef4444' },
};
export const PRIORITY_META: Record<number, { label: string; color: string }> = {
  1: { label: 'P1 · Critical', color: '#ef4444' },
  2: { label: 'P2 · High', color: '#f97316' },
  3: { label: 'P3 · Normal', color: '#3b82f6' },
  4: { label: 'P4 · Low', color: '#64748b' },
};
export const HORIZON_META: Record<string, string> = {
  'this-year': 'This year', '1-3y': '1–3 years', '3-5y': '3–5 years', '5-10y': '5–10 years', lifetime: 'Lifetime',
};
export const TYPE_META: Record<string, string> = {
  goal: '🎯 Goal', idea: '💡 Idea', experience: '✨ Experience', skill: '🧠 Skill', place: '📍 Place', book: '📖 Book', habit: '🔁 Habit', other: '• Other',
};

/** Skeleton shown inside the app shell while a page's code downloads. */
export function RouteSkeleton() {
  return <div className="route-skeleton" role="status" aria-live="polite" aria-label={tr('Opening your page…')}>
    <div className="skeleton-block h-9 w-2/3 max-w-sm" />
    <div className="skeleton-block h-4 w-1/2 max-w-xs" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="skeleton-block h-36" /><div className="skeleton-block h-36" /><div className="skeleton-block hidden h-36 lg:block" /></div>
    <div className="skeleton-block h-64" />
  </div>;
}
