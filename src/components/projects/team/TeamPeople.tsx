import { translate as tr } from '../../../lib/locales';
import { Copy, Crown, Link2, LogOut, Share2, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { cx, fmtDate } from '../../../lib/utils';
import { revokeSharedInvitation, type SharedInvitation, type SharedMember, type SharedRole, type SharedTask } from '../../../lib/sharedProjects';
import { Avatar, ROLE_LABEL, isOpen, memberLabel, memberName, type RunAction } from './shared';

type InviteRole = Exclude<SharedRole, 'lead' | 'admin'>;
const ROLE_HELP: Record<InviteRole, string> = { member: 'Can add and complete tasks, chat and write notes', guest: 'Can work on tasks and chat', viewer: 'Read-only access' };

export default function TeamPeople({ members, tasks, invitations, currentUserId, myRole, canManage, canInvite, hasManagers, inviteUrl, busy, runAction, onRole, onRemove, onInvite, onNotice }: {
  members: SharedMember[]; tasks: SharedTask[]; invitations: SharedInvitation[]; currentUserId: string; myRole?: SharedRole; canManage: boolean; canInvite: boolean; hasManagers: boolean;
  inviteUrl: string; busy: boolean; runAction: RunAction; onRole: (userId: string, role: SharedRole) => void; onRemove: (userId: string) => void;
  onInvite: (role: InviteRole, days: number) => void; onNotice: (message: string) => void;
}) {
  const [role, setRole] = useState<InviteRole>('member');
  const [days, setDays] = useState(7);
  const order: SharedRole[] = ['lead', 'admin', 'member', 'guest', 'viewer'];
  const sorted = [...members].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const pending = invitations.filter((invite) => !invite.accepted_at && !invite.revoked_at && Date.parse(invite.expires_at) > Date.now());
  const copy = () => void navigator.clipboard?.writeText(inviteUrl).then(() => onNotice(tr('Invitation link copied.'))).catch(() => onNotice(tr('Select and copy the invitation link.')));
  const share = () => { if (navigator.share) void navigator.share({ title: tr('Join my Life OS project'), url: inviteUrl }).catch(() => undefined); else copy(); };

  return <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <div className="tw-panel">
      <header><h3>{tr('Team')} <span className="tw-count">{members.length}</span></h3></header>
      <ul className="tw-people">{sorted.map((member) => {
        const label = memberLabel(member.user_id, members, currentUserId);
        const open = tasks.filter((task) => task.assignee_id === member.user_id && isOpen(task)).length;
        const done = tasks.filter((task) => task.assignee_id === member.user_id && task.status === 'done').length;
        const self = member.user_id === currentUserId;
        const choices: SharedRole[] = myRole === 'lead' ? ['lead', 'admin', 'member', 'guest', 'viewer'] : ['admin', 'member', 'guest', 'viewer'];
        return <li key={member.user_id} className="tw-person">
          <Avatar id={member.user_id} name={memberName(member.user_id, members)} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate">{label}</span>{member.role === 'lead' && <Crown size={13} className="shrink-0 text-amber-400" />}{member.role === 'admin' && <ShieldCheck size={13} className="shrink-0 text-sky-400" />}</p>
            <p className="text-xs muted">{tr(ROLE_LABEL[member.role])} · {open} {tr('open')} · {done} {tr('done')}</p>
          </div>
          {canManage && !(member.role === 'lead' && myRole !== 'lead') ? <select aria-label={`${tr('Role for')} ${label}`} className="tw-role-select" value={member.role} onChange={(event) => onRole(member.user_id, event.target.value as SharedRole)}>{(choices.includes(member.role) ? choices : [member.role, ...choices]).map((option) => <option key={option} value={option}>{tr(ROLE_LABEL[option])}</option>)}</select> : <span className="tw-role-tag">{tr(ROLE_LABEL[member.role])}</span>}
          {(canManage || self) && <button type="button" className="tap-action text-rose-500" title={self ? tr('Leave project') : tr('Remove member')} aria-label={self ? tr('Leave project') : `${tr('Remove member')}: ${label}`} onClick={() => onRemove(member.user_id)}>{self ? <LogOut size={15} /> : <Trash2 size={15} />}</button>}
        </li>;
      })}</ul>
      <p className="mt-3 text-xs muted">{tr('Multiple leads are allowed. A team can also work as equal members with no lead.')}</p>
    </div>

    <div className="tw-panel tw-invite">
      <header><h3><UserPlus size={16} />{tr('Invite people')}</h3></header>
      {canInvite ? <>
        <div className="tw-role-cards" role="radiogroup" aria-label={tr('Invite role')}>
          {(['member', 'guest', 'viewer'] as InviteRole[]).map((option) => <button key={option} type="button" role="radio" aria-checked={role === option} className={cx('tw-role-card', role === option && 'is-on')} onClick={() => setRole(option)}><b>{tr(ROLE_LABEL[option])}</b><span>{tr(ROLE_HELP[option])}</span></button>)}
        </div>
        <div className="mt-2.5 flex min-w-0 items-center gap-2">
          <span className="text-xs muted">{tr('Link expires in')}</span>
          <div className="tw-seg !p-0.5">{[7, 30, 90].map((value) => <button key={value} type="button" className={cx(days === value && 'is-on')} onClick={() => setDays(value)}>{value}d</button>)}</div>
        </div>
        <button type="button" className="btn-primary mt-3 w-full justify-center" disabled={busy} onClick={() => onInvite(role, days)}><Link2 size={15} />{tr('Create invite link')}</button>
        {inviteUrl && <div className="tw-invite-link">
          <p className="text-xs font-semibold">{tr('Share this one-use link privately. It will not be shown again.')}</p>
          <input readOnly className="input mt-2 min-w-0 text-xs" value={inviteUrl} onFocus={(event) => event.currentTarget.select()} aria-label={tr('Private invitation link')} />
          <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className="btn-outline justify-center" onClick={copy}><Copy size={14} />{tr('Copy')}</button><button type="button" className="btn-outline justify-center" onClick={share}><Share2 size={14} />{tr('Share')}</button></div>
        </div>}
      </> : <p className="text-sm muted">{hasManagers ? tr('A project lead or admin can invite people.') : tr('Viewers cannot invite people.')}</p>}
      {pending.length > 0 && <div className="mt-4"><p className="mb-1.5 text-xs font-semibold muted">{tr('Pending invites')}</p><ul className="space-y-1.5">{pending.map((invite) => <li key={invite.id} className="tw-invite-row"><Link2 size={13} /><span className="min-w-0 flex-1 truncate">{tr(ROLE_LABEL[invite.role])} · {tr('expires')} {fmtDate(invite.expires_at.slice(0, 10))}</span>{canInvite && <button type="button" className="tap-action !h-8 !w-8 text-rose-500" aria-label={tr('Revoke invite')} onClick={() => void runAction(() => revokeSharedInvitation(invite.id))}><X size={14} /></button>}</li>)}</ul></div>}
    </div>
  </section>;
}
