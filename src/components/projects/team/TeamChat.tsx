import { translate as tr } from '../../../lib/locales';
import { ArrowDown, AtSign, Check, CheckCheck, ClipboardList, Clock, Copy, EyeOff, Hash, MoreHorizontal, Pencil, SendHorizontal, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx, localeForLanguage } from '../../../lib/utils';
import type { SharedComment, SharedCommentReceipt, SharedMember, SharedTask } from '../../../lib/sharedProjects';
import { Avatar, AvatarStack, memberLabel, memberName, relativeDay } from './shared';

const QUICK = ['👍 Sounds good', 'On it!', 'Done ✅', 'Can someone help?', 'Thanks! 🙏'];
const GROUP_MS = 5 * 60 * 1000;

function renderBody(body: string, names: string[]): ReactNode {
  if (!names.length) return body;
  const escaped = names.filter(Boolean).sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  return body.split(pattern).map((part, index) => part.startsWith('@') && names.some((name) => part === `@${name}`) ? <mark key={index} className="tw-mention">{part}</mark> : <Fragment key={index}>{part}</Fragment>);
}

function MessageMenu({ own, onEdit, onCopy, onUnread }: { own: boolean; onEdit: () => void; onCopy: () => void; onUnread?: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const timer = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', close); };
  }, [open]);
  return <span className="tw-msg-menu">
    <button type="button" className="tw-msg-more" aria-label={tr('Message actions')} aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={15} /></button>
    {open && <span className={cx('tw-msg-pop', own ? 'is-own' : '')} role="menu" onPointerDown={(event) => event.stopPropagation()}>
      {own && <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}><Pencil size={13} />{tr('Edit')}</button>}
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onCopy(); }}><Copy size={13} />{tr('Copy text')}</button>
      {onUnread && <button type="button" role="menuitem" onClick={() => { setOpen(false); onUnread(); }}><EyeOff size={13} />{tr('Mark unread')}</button>}
    </span>}
  </span>;
}

export default function TeamChat({ messages, members, currentUserId, tasks, language, receipts, canWork, hasMore, loading, onLoadOlder, onSend, onEdit, onMarkUnread }: {
  messages: SharedComment[]; members: SharedMember[]; currentUserId: string; tasks: SharedTask[]; language: string; receipts: SharedCommentReceipt[];
  canWork: boolean; hasMore: boolean; loading: boolean; onLoadOlder: () => void;
  onSend: (body: string, taskId: string | null, mentions: string[]) => Promise<boolean>; onEdit: (id: string, body: string) => Promise<boolean>; onMarkUnread: (id: string) => void;
}) {
  const locale = localeForLanguage(language);
  const ordered = useMemo(() => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)), [messages]);
  const others = members.filter((member) => member.user_id !== currentUserId);
  const names = useMemo(() => members.map((member) => memberName(member.user_id, members)).filter((name) => name && name !== tr('Member')), [members]);
  const [text, setText] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pickTask, setPickTask] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [firstUnread, setFirstUnread] = useState<string | null | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const prevHeight = useRef<number | null>(null);
  const lastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (firstUnread !== undefined || !ordered.length) return;
    const unread = ordered.find((message) => message.author_id !== currentUserId && !message.id.startsWith('optimistic-') && !receipts.some((receipt) => receipt.comment_id === message.id && receipt.user_id === currentUserId));
    setFirstUnread(unread?.id ?? null);
  }, [ordered, receipts, currentUserId, firstUnread]);

  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const newest = ordered[ordered.length - 1];
    if (prevHeight.current !== null) { el.scrollTop = el.scrollHeight - prevHeight.current; prevHeight.current = null; }
    else if (newest?.id !== lastId.current && (atBottom || newest?.author_id === currentUserId || lastId.current === undefined)) el.scrollTo({ top: el.scrollHeight, behavior: lastId.current === undefined ? 'auto' : 'smooth' });
    lastId.current = newest?.id;
  }, [ordered, atBottom, currentUserId]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 40 && hasMore && !loading) { prevHeight.current = el.scrollHeight; onLoadOlder(); }
  };
  // Fit the chat exactly between the sticky tab bar and the bottom navigation on any screen.
  const [fitHeight, setFitHeight] = useState<number>();
  useLayoutEffect(() => {
    const calc = () => {
      const tabs = document.querySelector<HTMLElement>('.tw-tabs');
      const nav = document.querySelector<HTMLElement>('.mobile-bottom-nav');
      const top = tabs ? (parseFloat(getComputedStyle(tabs).top) || 0) + tabs.offsetHeight + 12 : 96;
      const navVisible = nav && getComputedStyle(nav).display !== 'none';
      const bottom = navVisible ? nav.getBoundingClientRect().height + 10 : 20;
      setFitHeight(Math.round(Math.max(340, Math.min(window.innerHeight - top - bottom, 860))));
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    return () => { window.removeEventListener('resize', calc); window.removeEventListener('orientationchange', calc); };
  }, []);
  const grow = () => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; };
  useEffect(grow, [text]);

  const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1];
  const suggestions = mentionQuery === undefined ? [] : others.filter((member) => memberName(member.user_id, members).toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5);
  const pickMention = (member: SharedMember) => {
    const name = memberName(member.user_id, members);
    setText((current) => current.replace(/@([^\s@]*)$/, `@${name} `));
    setMentions((current) => current.includes(member.user_id) ? current : [...current, member.user_id]);
    input.current?.focus();
  };

  const send = async (raw = text) => {
    const body = raw.trim();
    if (!body || !canWork) return;
    const ids = mentions.filter((id) => body.includes(`@${memberName(id, members)}`));
    const attached = taskId;
    setText(''); setTaskId(null); setMentions([]); setPickTask(false);
    const ok = await onSend(body, attached, ids);
    if (!ok) { setText(body); setTaskId(attached); }
    input.current?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); pickMention(suggestions[0]); return; }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  };

  const lastOwn = [...ordered].reverse().find((message) => message.author_id === currentUserId && !message.id.startsWith('optimistic-'));
  const seenLastOwn = lastOwn ? [...new Set(receipts.filter((receipt) => receipt.comment_id === lastOwn.id && receipt.user_id !== currentUserId).map((receipt) => receipt.user_id))] : [];
  const attachedTask = tasks.find((task) => task.id === taskId);

  return <section className="tw-chat card" style={fitHeight ? { height: fitHeight } : undefined} aria-label={tr('Project discussion')}>
    <header className="tw-chat-head">
      <AvatarStack ids={members.map((member) => member.user_id)} members={members} currentUserId={currentUserId} max={4} size={26} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{tr('Team chat')}</p><p className="truncate text-xs muted">{members.map((member) => memberLabel(member.user_id, members, currentUserId)).join(', ')}</p></div>
    </header>
    <div ref={scroller} className="tw-chat-scroll" onScroll={onScroll} aria-live="polite">
      {hasMore && <div className="flex justify-center py-2"><button type="button" className="tw-chip" disabled={loading} onClick={() => { if (scroller.current) prevHeight.current = scroller.current.scrollHeight; onLoadOlder(); }}>{loading ? tr('Loading…') : tr('Load older messages')}</button></div>}
      {loading && !ordered.length && <div className="tw-chat-skeleton">{[0, 1, 2].map((index) => <span key={index} className={cx(index === 1 && 'is-own')} />)}</div>}
      {!loading && !ordered.length && <div className="tw-chat-empty"><span>💬</span><p className="font-semibold">{tr('Start the conversation')}</p><p className="text-sm muted">{tr('Share an update, ask a question or @mention a teammate.')}</p></div>}
      {ordered.map((message, index) => {
        const prev = ordered[index - 1];
        const next = ordered[index + 1];
        const own = message.author_id === currentUserId;
        const pending = message.id.startsWith('optimistic-');
        const newDay = !prev || prev.created_at.slice(0, 10) !== message.created_at.slice(0, 10);
        const joinsPrev = !newDay && prev && prev.author_id === message.author_id && Date.parse(message.created_at) - Date.parse(prev.created_at) < GROUP_MS && message.id !== firstUnread;
        const joinsNext = next && next.author_id === message.author_id && next.created_at.slice(0, 10) === message.created_at.slice(0, 10) && Date.parse(next.created_at) - Date.parse(message.created_at) < GROUP_MS && next.id !== firstUnread;
        const task = tasks.find((item) => item.id === message.task_id);
        const sender = memberLabel(message.author_id, members, currentUserId);
        const isEditing = editing?.id === message.id;
        const edited = message.updated_at && Date.parse(message.updated_at) - Date.parse(message.created_at) > 2000;
        return <Fragment key={message.id}>
          {newDay && <div className="tw-day"><span>{relativeDay(message.created_at, locale)}</span></div>}
          {message.id === firstUnread && <div className="tw-unread-line"><span>{tr('New messages')}</span></div>}
          <div className={cx('tw-msg', own && 'is-own', joinsPrev && 'joins-prev', joinsNext && 'joins-next', pending && 'is-pending')}>
            {!own && <span className="tw-msg-avatar">{!joinsNext && <Avatar id={message.author_id} name={memberName(message.author_id, members)} size={30} />}</span>}
            <div className="tw-msg-col">
              {!own && !joinsPrev && <span className="tw-msg-name" style={{ color: 'inherit' }}>{sender}</span>}
              <div className="tw-msg-line">
                <div className="tw-bubble">
                  {task && <span className="tw-bubble-task"><ClipboardList size={11} />{task.title}</span>}
                  {isEditing ? <form onSubmit={(event) => { event.preventDefault(); const body = editing.body.trim(); if (body) void onEdit(message.id, body).then((ok) => { if (ok) setEditing(null); }); }}>
                    <textarea autoFocus className="tw-edit" value={editing.body} maxLength={10000} onChange={(event) => setEditing({ id: message.id, body: event.target.value })} aria-label={tr('Edit message')} />
                    <span className="mt-1.5 flex justify-end gap-1.5"><button type="button" className="tw-edit-btn" onClick={() => setEditing(null)} aria-label={tr('Cancel')}><X size={14} /></button><button type="submit" className="tw-edit-btn is-save" aria-label={tr('Save')}><Check size={14} /></button></span>
                  </form> : <p className="tw-bubble-text">{renderBody(message.body, names)}</p>}
                  {!isEditing && <span className="tw-bubble-time">{edited && <em>{tr('edited')}</em>}{new Date(message.created_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}{own && (pending ? <Clock size={11} /> : message.id === lastOwn?.id && seenLastOwn.length ? <CheckCheck size={12} className="text-sky-300" /> : <Check size={12} />)}</span>}
                </div>
                {!pending && !isEditing && <MessageMenu own={own} onEdit={() => setEditing({ id: message.id, body: message.body })} onCopy={() => void navigator.clipboard?.writeText(message.body)} onUnread={own ? undefined : () => onMarkUnread(message.id)} />}
              </div>
              {message.id === lastOwn?.id && seenLastOwn.length > 0 && <span className="tw-seen">{tr('Seen by')} {seenLastOwn.map((id) => memberLabel(id, members, currentUserId)).slice(0, 3).join(', ')}{seenLastOwn.length > 3 ? ` +${seenLastOwn.length - 3}` : ''}</span>}
            </div>
          </div>
        </Fragment>;
      })}
    </div>
    {!atBottom && ordered.length > 0 && <button type="button" className="tw-jump" onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })} aria-label={tr('Jump to latest')}><ArrowDown size={16} /></button>}

    {canWork ? <div className="tw-composer">
      {!text && !attachedTask && <div className="tw-quick-row">{QUICK.map((reply) => <button key={reply} type="button" className="tw-chip" onClick={() => void send(tr(reply))}>{tr(reply)}</button>)}</div>}
      {attachedTask && <div className="tw-attached"><ClipboardList size={13} /><span className="min-w-0 flex-1 truncate">{tr('About')}: {attachedTask.title}</span><button type="button" onClick={() => setTaskId(null)} aria-label={tr('Remove task')}><X size={13} /></button></div>}
      {pickTask && <div className="tw-picker" role="listbox" aria-label={tr('Attach to task')}>{tasks.length ? tasks.slice(0, 30).map((task) => <button key={task.id} type="button" role="option" aria-selected={taskId === task.id} onClick={() => { setTaskId(task.id); setPickTask(false); input.current?.focus(); }}><ClipboardList size={13} /><span className="truncate">{task.title}</span></button>) : <p className="p-2 text-xs muted">{tr('No tasks yet')}</p>}</div>}
      {suggestions.length > 0 && <div className="tw-picker" role="listbox" aria-label={tr('Mention a member')}>{suggestions.map((member) => <button key={member.user_id} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => pickMention(member)}><Avatar id={member.user_id} name={memberName(member.user_id, members)} size={22} /><span className="truncate">{memberName(member.user_id, members)}</span></button>)}</div>}
      <div className="tw-compose-row">
        <button type="button" className={cx('tw-icon-btn', pickTask && 'is-on')} onClick={() => setPickTask((value) => !value)} aria-label={tr('Attach to task')} title={tr('Attach to task')}><Hash size={18} /></button>
        <button type="button" className="tw-icon-btn" onClick={() => { setText((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@`); input.current?.focus(); }} aria-label={tr('Mention a member')} title={tr('Mention a member')}><AtSign size={18} /></button>
        <textarea ref={input} rows={1} className="tw-compose-input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} maxLength={10000} placeholder={tr('Message the team…')} aria-label={tr('Write a message')} />
        <button type="button" className="tw-send" disabled={!text.trim()} onClick={() => void send()} aria-label={tr('Send message')}><SendHorizontal size={18} /></button>
      </div>
    </div> : <p className="tw-readonly m-3">{tr('Viewer access is read-only.')}</p>}
  </section>;
}
