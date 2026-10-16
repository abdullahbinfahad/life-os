import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { cx } from '../lib/utils';
import type { Category } from '../lib/types';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm md:p-10" onMouseDown={onClose}>
      <div
        className={cx('card w-full !bg-white p-6 dark:!bg-[#12151c]', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, color = '#6366f1', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = '#6366f1', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-slate-200 dark:stroke-white/10" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c} className="transition-all duration-700" />
      </svg>
      <div className="absolute text-sm font-semibold">{children ?? `${value}%`}</div>
    </div>
  );
}

export function CatBadge({ cat }: { cat?: Category }) {
  if (!cat) return null;
  return (
    <span className="chip" style={{ background: cat.color + '22', color: cat.color }}>
      <span>{cat.icon}</span>{cat.name}
    </span>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-2xl bg-indigo-500/10 p-4 text-indigo-500">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <p className="max-w-sm text-sm muted">{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon, color = '#6366f1' }: { label: string; value: ReactNode; sub?: string; icon: ReactNode; color?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm muted">{label}</span>
        <span className="rounded-xl p-2" style={{ background: color + '1f', color }}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
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
