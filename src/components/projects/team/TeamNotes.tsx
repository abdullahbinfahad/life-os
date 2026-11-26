import { translate as tr } from '../../../lib/locales';
import { Check, Flag, Gavel, Milestone, Pencil, Pin, PinOff, Plus, StickyNote, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx, fmtDate } from '../../../lib/utils';
import { addSharedNote, updateSharedNote, type SharedNote, type SharedNoteType } from '../../../lib/sharedProjects';
import type { RunAction } from './shared';

const TYPES: { id: SharedNoteType; label: string; icon: typeof Flag }[] = [
  { id: 'decision', label: 'Decision', icon: Gavel },
  { id: 'meeting', label: 'Meeting notes', icon: Users },
  { id: 'milestone', label: 'Milestone', icon: Milestone },
  { id: 'sticky', label: 'Sticky note', icon: StickyNote },
];
const COLORS: SharedNote['color'][] = ['paper', 'lavender', 'mint', 'sky'];
type Draft = { note_type: SharedNoteType; title: string; body: string; occurred_on: string; color: SharedNote['color']; is_pinned: boolean };
const blank: Draft = { note_type: 'decision', title: '', body: '', occurred_on: '', color: 'lavender', is_pinned: false };

function NoteForm({ initial, onSubmit, onCancel, submitLabel }: { initial: Draft; onSubmit: (draft: Draft) => Promise<boolean>; onCancel: () => void; submitLabel: string }) {
  const [draft, setDraft] = useState(initial);
  return <form className="grid min-w-0 gap-2.5" onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim()) return; void onSubmit({ ...draft, title: draft.title.trim(), body: draft.body.trim() }); }}>
    <div className="tw-chip-row !pb-0">{TYPES.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={cx('tw-chip', draft.note_type === id && 'is-on')} onClick={() => setDraft({ ...draft, note_type: id })}><Icon size={13} />{tr(label)}</button>)}</div>
    <input autoFocus className="input min-w-0 font-semibold" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={500} placeholder={tr('Title')} aria-label={tr('Title')} required />
    <textarea className="input min-h-24 min-w-0 resize-y" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} maxLength={50000} placeholder={tr('What was decided, discussed or reached?')} aria-label={tr('Details')} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input type="date" className="input !w-auto !py-1.5 text-sm" value={draft.occurred_on} onChange={(event) => setDraft({ ...draft, occurred_on: event.target.value })} aria-label={tr('Date')} />
      <span className="flex gap-1.5" role="radiogroup" aria-label={tr('Note color')}>{COLORS.map((color) => <button key={color} type="button" role="radio" aria-checked={draft.color === color} aria-label={tr(color)} className={cx('tw-swatch', `tone-${color}`, draft.color === color && 'is-on')} onClick={() => setDraft({ ...draft, color })} />)}</span>
      <button type="button" className={cx('tw-chip', draft.is_pinned && 'is-on')} onClick={() => setDraft({ ...draft, is_pinned: !draft.is_pinned })}><Pin size={12} />{tr('Pin')}</button>
      <span className="flex-1" />
      <button type="button" className="btn-ghost !min-h-9" onClick={onCancel}>{tr('Cancel')}</button>
      <button type="submit" className="btn-primary !min-h-9"><Check size={15} />{tr(submitLabel)}</button>
    </div>
  </form>;
}

function NoteCard({ note, canWork, language, runAction }: { note: SharedNote; canWork: boolean; language: string; runAction: RunAction }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [note.id, note.updated_at]);
  const type = TYPES.find((item) => item.id === note.note_type) ?? TYPES[0];
  const Icon = type.icon;
  return <article className={cx('tw-note', `tone-${note.color}`)}>
    {editing ? <NoteForm initial={{ note_type: note.note_type, title: note.title, body: note.body, occurred_on: note.occurred_on ?? '', color: note.color, is_pinned: note.is_pinned }} submitLabel="Save" onCancel={() => setEditing(false)} onSubmit={(draft) => runAction(() => updateSharedNote(note.id, { ...draft, occurred_on: draft.occurred_on || null }))} />
      : <>
        <div className="flex min-w-0 items-center gap-2"><span className="tw-note-type"><Icon size={12} />{tr(type.label)}</span>{note.occurred_on && <span className="text-xs muted">{fmtDate(note.occurred_on, language)}</span>}<span className="flex-1" />
          {canWork && <button type="button" className="tap-action" aria-label={tr(note.is_pinned ? 'Unpin' : 'Pin')} onClick={() => void runAction(() => updateSharedNote(note.id, { is_pinned: !note.is_pinned }))}>{note.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>}
          {canWork && <button type="button" className="tap-action" aria-label={tr('Edit note')} onClick={() => setEditing(true)}><Pencil size={14} /></button>}
        </div>
        <h3 className="mt-2 flex items-start gap-1.5 break-words font-semibold">{note.is_pinned && <Pin size={13} className="mt-1 shrink-0 text-[color:var(--accent)]" />}{note.title}</h3>
        {note.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 muted">{note.body}</p>}
      </>}
  </article>;
}

export default function TeamNotes({ notes, projectId, currentUserId, canWork, language, runAction }: { notes: SharedNote[]; projectId: string; currentUserId: string; canWork: boolean; language: string; runAction: RunAction }) {
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<SharedNoteType | 'all'>('all');
  const shown = notes.filter((note) => type === 'all' || note.note_type === type);
  return <section className="min-w-0 space-y-3">
    {composing ? <div className="tw-panel"><NoteForm initial={blank} submitLabel="Add note" onCancel={() => setComposing(false)} onSubmit={async (draft) => { const ok = await runAction(() => addSharedNote(projectId, currentUserId, draft.note_type, draft.title, draft.body, draft.occurred_on || undefined, draft.color, draft.is_pinned)); if (ok) setComposing(false); return ok; }} /></div>
      : canWork && <button type="button" className="tw-new-note" onClick={() => setComposing(true)}><Plus size={17} />{tr('New note or decision')}</button>}
    <div className="tw-chip-row">
      <button type="button" className={cx('tw-chip', type === 'all' && 'is-on')} onClick={() => setType('all')}>{tr('All')}<b>{notes.length}</b></button>
      {TYPES.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={cx('tw-chip', type === id && 'is-on')} onClick={() => setType(id)}><Icon size={12} />{tr(label)}<b>{notes.filter((note) => note.note_type === id).length}</b></button>)}
    </div>
    {shown.length ? <div className="tw-notes-grid">{shown.map((note) => <NoteCard key={note.id} note={note} canWork={canWork} language={language} runAction={runAction} />)}</div>
      : <div className="tw-empty"><span>📝</span><p className="font-semibold">{tr('No notes yet')}</p><p className="text-sm muted">{tr('Capture decisions, meeting notes, and milestones so collaborators share the same context.')}</p></div>}
  </section>;
}
