import { translate as tr } from '../../../lib/locales';
import { cx, today } from '../../../lib/utils';
import type { SharedMember, SharedRole, SharedStatus, SharedTask, SharedTaskStatus } from '../../../lib/sharedProjects';

export const STATUS: { id: SharedStatus; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#94a3b8' },
  { id: 'active', label: 'Active', color: '#22c55e' },
  { id: 'on-hold', label: 'On hold', color: '#f59e0b' },
  { id: 'done', label: 'Done', color: '#8b5cf6' },
];
export const TASK_STATUS: { id: SharedTaskStatus; label: string; color: string }[] = [
  { id: 'in-progress', label: 'In progress', color: '#6366f1' },
  { id: 'todo', label: 'To do', color: '#94a3b8' },
  { id: 'blocked', label: 'Blocked', color: '#f43f5e' },
  { id: 'done', label: 'Done', color: '#22c55e' },
  { id: 'cancelled', label: 'Cancelled', color: '#64748b' },
];
export const statusMeta = (id: SharedStatus) => STATUS.find((item) => item.id === id) ?? STATUS[0];
export const taskStatusMeta = (id: SharedTaskStatus) => TASK_STATUS.find((item) => item.id === id) ?? TASK_STATUS[1];
export const ROLE_LABEL: Record<SharedRole, string> = { lead: 'Lead', admin: 'Admin', member: 'Member', guest: 'Guest', viewer: 'Viewer' };
export const roleCanWork = (role?: SharedRole) => Boolean(role && ['lead', 'admin', 'member', 'guest'].includes(role));
export const mayChangeProjectStatus = (role?: SharedRole, hasAdmin = false) => Boolean(role && (['lead', 'admin'].includes(role) || (role === 'member' && !hasAdmin)));
export const memberLabel = (id: string | null | undefined, members: SharedMember[], currentUserId: string) => id === currentUserId ? tr('You') : members.find((member) => member.user_id === id)?.display_name?.trim() || tr(id ? 'Member' : 'Former member');
export const memberName = (id: string | null | undefined, members: SharedMember[]) => members.find((member) => member.user_id === id)?.display_name?.trim() || tr(id ? 'Member' : 'Former member');
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'M';
export const isOverdue = (task: Pick<SharedTask, 'due_date' | 'status'>) => Boolean(task.due_date && task.due_date < today() && task.status !== 'done' && task.status !== 'cancelled');
export const isOpen = (task: Pick<SharedTask, 'status'>) => task.status !== 'done' && task.status !== 'cancelled';

const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#f43f5e', '#84cc16', '#0ea5e9', '#d946ef'];
export function colorFor(id?: string | null) {
  if (!id) return '#64748b';
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ id, name, size = 32, ring = false, className }: { id?: string | null; name: string; size?: number; ring?: boolean; className?: string }) {
  const color = colorFor(id);
  return <span aria-hidden="true" title={name} className={cx('tw-avatar', ring && 'tw-avatar-ring', className)} style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)), background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>{initials(name)}</span>;
}

export function AvatarStack({ ids, members, currentUserId, max = 4, size = 28 }: { ids: string[]; members: SharedMember[]; currentUserId: string; max?: number; size?: number }) {
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return <span className="tw-avatar-stack" aria-label={`${ids.length} ${tr('People')}`}>
    {shown.map((id) => <Avatar key={id} id={id} name={memberName(id, members)} size={size} ring />)}
    {rest > 0 && <span className="tw-avatar tw-avatar-ring tw-avatar-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>+{rest}</span>}
  </span>;
}

export function ProgressRing({ value, size = 44, stroke = 4, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  return <span className="tw-ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${pct}%`}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="tw-ring-track" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round" className="tw-ring-value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <b style={{ fontSize: Math.round(size * 0.26) }}>{pct}<small>%</small></b>
  </span>;
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }} />;
}

export function relativeDay(iso: string, language: string) {
  const diff = Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000);
  if (diff === 0) return tr('Today');
  if (diff === 1) return tr('Tomorrow');
  if (diff === -1) return tr('Yesterday');
  if (diff > 1 && diff < 7) return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(language, { weekday: 'long' });
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(language, { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string, language: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return tr('just now');
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  if (seconds < 86400 * 7) return rtf.format(-Math.round(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString(language, { month: 'short', day: 'numeric' });
}

export type RunAction = (action: () => Promise<unknown>) => Promise<boolean>;
