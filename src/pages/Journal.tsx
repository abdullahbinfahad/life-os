import { translate as tr } from '../lib/locales';
import { BookOpen, CalendarDays, Globe2, GripVertical, Hash, Lock, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { Empty, Modal, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { JournalEntry } from '../lib/types';
import { cx, fmtDate, today, uid } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { playFeedback } from '../lib/sounds';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const PROMPTS = ['What am I grateful for today?', 'What did I learn?', 'What would make tomorrow great?', 'What drained my energy?', 'A memory I want to keep…', 'Who made a difference today?'];

function SortableJournalCard({ entry, selected, language, onSelect, disabled }: { entry: JournalEntry; selected: boolean; language: string; onSelect: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id, disabled });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('flex min-w-0 items-stretch gap-1 rounded-xl', isDragging && 'opacity-70')}>
    <button ref={setActivatorNodeRef} type="button" aria-label="Drag to reorder journal entry" className="grid w-8 shrink-0 touch-none place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/[.05]" disabled={disabled} {...attributes} {...listeners}><GripVertical size={16} /></button>
    <button type="button" onClick={onSelect} className={cx('min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition', selected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/[.04]')}>
      <div className="flex items-center justify-between gap-2 text-xs opacity-70"><span>{fmtDate(entry.date, language)}</span><span>{MOODS[entry.mood - 1]}</span></div>
      <div className="truncate font-medium">{entry.title || 'Untitled'}</div><div className="truncate text-xs opacity-60">{entry.content}</div>
    </button>
  </div>;
}

export default function Journal() {
  const { journal, goals, items, projects, settings, saveEntry, deleteEntry } = useStore();
  const { user } = useAuth();
  const [sel, setSel] = useState<string | null>(journal[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'private' | 'public'>('all');
  const [moodFilter, setMoodFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'year'>('all');
  const [draft, setDraft] = useState<Partial<JournalEntry> | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success');
  const [publishing, setPublishing] = useState(false);
  const [publishReview, setPublishReview] = useState<JournalEntry | null>(null);
  const [publishError, setPublishError] = useState('');
  const [deleteReview, setDeleteReview] = useState<JournalEntry | null>(null);
  const [publicStatus, setPublicStatus] = useState({ unpublished: 0, failed: false });
  const entry = journal.find((j) => j.id === sel);
  const current = draft ?? entry;
  const cutoff = new Date();
  if (dateFilter === 'month') cutoff.setDate(1);
  if (dateFilter === 'year') { cutoff.setMonth(0, 1); }
  const list = journal.filter((j) => (visibilityFilter === 'all' || j.visibility === visibilityFilter) && (!moodFilter || j.mood === moodFilter) && (dateFilter === 'all' || j.date >= cutoff.toISOString().slice(0, 10)) && (!q || (j.title + j.content + j.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.sortOrder != null && b.sortOrder != null ? a.sortOrder - b.sortOrder : a.sortOrder == null && b.sortOrder != null ? -1 : a.sortOrder != null && b.sortOrder == null ? 1 : b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const hasFilters = Boolean(q || moodFilter || dateFilter !== 'all' || visibilityFilter !== 'all');
  const wordCount = (current?.content ?? '').trim().split(/\s+/).filter(Boolean).length;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    if (hasFilters || !event.over || event.active.id === event.over.id) return;
    const oldIndex = list.findIndex((item) => item.id === event.active.id); const newIndex = list.findIndex((item) => item.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ids = list.map((item) => item.id); const [moved] = ids.splice(oldIndex, 1); ids.splice(newIndex, 0, moved); useStore.getState().reorderJournal(ids);
  };

  useEffect(() => {
    if (!user || !supabase) return;
    const candidates = journal.filter((item) => item.visibility === 'public' && item.id);
    if (!candidates.length) { setPublicStatus({ unpublished: 0, failed: false }); return; }
    let active = true;
    void (async () => {
      try {
        const slugs = candidates.map((item) => `${user.id.slice(0, 8)}-${item.id}`);
        const { data: existing, error } = await supabase.from('public_journals').select('slug').in('slug', slugs);
        if (error) throw error;
        const published = new Set((existing ?? []).map((row) => row.slug));
        const unpublished = candidates.filter((item) => !published.has(`${user.id.slice(0, 8)}-${item.id}`)).length;
        if (active) setPublicStatus({ unpublished, failed: false });
      } catch {
        if (active) setPublicStatus({ unpublished: 0, failed: true });
      }
    })();
    return () => { active = false; };
  }, [journal, user?.id]);

  const newEntry = (prompt?: string) => { setSel(null); setStatusMessage(''); setStatusTone('success'); setDraft({ id: uid(), date: today(), title: '', content: prompt ? prompt + '\n\n' : '', mood: 3, tags: [], visibility: 'private' }); };
  const publish = async (value: JournalEntry) => {
    if (!user || !supabase || value.visibility !== 'public' || !value.id) return false;
    const slug = `${user.id.slice(0, 8)}-${value.id}`;
    const content = value.content ?? '';
    setPublishing(true);
    setPublishError('');
    try {
      const publishedAt = new Date().toISOString();
      const { error } = await supabase.from('public_journals').upsert({ slug, owner_id: user.id, title: value.title || 'Journal entry', excerpt: content.slice(0, 180), content, published_at: publishedAt, updated_at: publishedAt }, { onConflict: 'slug' });
      if (error) throw error;
      const appBase = window.location.pathname.replace(/\/+$/, '');
      const link = `${window.location.origin}${appBase}/public/journal/?slug=${encodeURIComponent(slug)}`;
      try { await navigator.clipboard?.writeText(link); } catch { /* Link remains available in the public index. */ }
      saveEntry({ ...value, visibility: 'public' });
      setSel(value.id);
      setDraft(null);
      setPublishReview(null);
      setStatusTone('success');
      setStatusMessage('Published to Public Journal. The share link was copied when clipboard access was available.');
      playFeedback('submit');
      return true;
    } catch {
      setPublishError(tr('Publishing failed. The entry was not changed locally. Check your connection and public journal setup, then retry.'));
      playFeedback('failed');
      return false;
    } finally { setPublishing(false); }
  };
  const save = async () => {
    if (!draft) return;
    const saved = { date: today(), mood: 3 as const, tags: [], visibility: 'private' as const, createdAt: new Date().toISOString(), ...draft, id: draft.id ?? uid() } as JournalEntry;
    if (saved.visibility === 'public') {
      if (!user || !supabase) {
        if (entry?.visibility === 'public') { setStatusTone('error'); setStatusMessage(tr('Cannot safely change this public entry while signed out or offline. Reconnect and retry.')); return; }
        const privateEntry = { ...saved, visibility: 'private' as const };
        saveEntry(privateEntry); setSel(privateEntry.id); setDraft(null);
        setStatusTone('success');
        setStatusMessage(tr('Saved privately. Sign in before publishing this entry.'));
        playFeedback('submit');
        return;
      }
      setPublishError('');
      setPublishReview(saved);
      return;
    }
    if (entry?.visibility === 'public') {
      if (!user || !supabase) { setStatusTone('error'); setStatusMessage(tr('Could not confirm removal of the public link. Reconnect and retry; the entry was not changed.')); return; }
      setPublishing(true);
      try {
        const { error } = await supabase.from('public_journals').delete().eq('slug', `${user.id.slice(0, 8)}-${entry.id}`);
        if (error) throw error;
      } catch {
        setStatusTone('error');
        setStatusMessage(tr('Could not remove the public link. Your entry was not changed; reconnect and retry.'));
        playFeedback('failed');
        return;
      } finally { setPublishing(false); }
    }
    saveEntry(saved); setSel(saved.id); setDraft(null); playFeedback('submit');
    setStatusTone('success');
    setStatusMessage(tr(saved.visibility === 'private' ? 'Journal entry saved to your Life OS workspace.' : 'Saved privately and removed from the public journal.'));
  };
  const savePrivately = async () => {
    if (!publishReview) return;
    const value = publishReview;
    const wasPublished = entry?.id === value.id && entry.visibility === 'public';
    if (wasPublished) {
      if (!user || !supabase) { setPublishError(tr('Could not confirm removal of the public link. Reconnect and retry.')); return; }
      setPublishing(true);
      try {
        const { error } = await supabase.from('public_journals').delete().eq('slug', `${user.id.slice(0, 8)}-${value.id}`);
        if (error) throw error;
      } catch { setPublishError(tr('Could not remove the public link. The entry was not changed; reconnect and retry.')); return; }
      finally { setPublishing(false); }
    }
    const privateEntry = { ...value, visibility: 'private' as const };
    saveEntry(privateEntry); setSel(privateEntry.id); setDraft(null); setPublishReview(null); setPublishError('');
    setStatusTone('success');
    setStatusMessage(tr('Saved privately. This entry is not available on the public journal.'));
    playFeedback('submit');
  };
  const removeEntry = async () => {
    if (!deleteReview) return;
    const removing = deleteReview;
    if (removing.visibility === 'public') {
      if (!user || !supabase) { setStatusTone('error'); setStatusMessage(tr('Could not confirm removal of the public link. Reconnect and retry; the entry was not deleted.')); return; }
      setPublishing(true);
      try {
        const { error } = await supabase.from('public_journals').delete().eq('slug', `${user.id.slice(0, 8)}-${removing.id}`);
        if (error) throw error;
      } catch {
        setStatusTone('error');
        setStatusMessage(tr('Could not remove the public link, so the entry was not deleted. Reconnect and retry.'));
        playFeedback('failed');
        return;
      } finally { setPublishing(false); }
    }
    deleteEntry(removing.id); setDeleteReview(null); setDraft(null); setSel(null);
    setStatusTone('success');
    setStatusMessage(tr('Journal entry deleted.'));
    playFeedback('submit');
  };
  const edit = (patch: Partial<JournalEntry>) => setDraft({ ...(current as JournalEntry), ...patch });

  return (
    <div>
      <PageHeader
        title={tr("Journal")}
        subtitle={tr("Reflections and memories")}
        actions={
          <>
            <Link to="/public" className="btn-outline"><Globe2 size={16} /> {tr("Browse public journals")}</Link>
            <button className="btn-primary" onClick={() => newEntry()}><Plus size={16} /> {tr("New entry")}</button>
          </>
        }
      />
      {statusMessage && <div className={cx('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm', statusTone === 'error' ? 'border-rose-500/20 bg-rose-500/[.07] text-rose-700 dark:text-rose-300' : 'border-emerald-500/20 bg-emerald-500/[.07] text-emerald-700 dark:text-emerald-300')} role={statusTone === 'error' ? 'alert' : 'status'}><span>{statusMessage}</span><Link to="/public" className="shrink-0 underline underline-offset-2">{tr("Open public journals")}</Link></div>}
      {publicStatus.failed && <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100" role="status">{tr('Could not verify which entries are on the public journal. Nothing will be published automatically; review an entry before using Update public link.')}</div>}
      {publicStatus.unpublished > 0 && <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100" role="status"><b>{publicStatus.unpublished}</b> {tr('entry or entries marked Public here are not published online. Review each entry and choose Update public link to publish it.')}</div>}
      {journal.length === 0 && !draft ? (
        <Empty icon={<BookOpen size={28} />} title={tr("Start journaling")} text="Pick a prompt to begin."
          action={<div className="flex max-w-lg flex-wrap justify-center gap-2">{PROMPTS.map((p) => <button key={p} className="chip border border-slate-200 px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10" onClick={() => newEntry(p)}>{p}</button>)}</div>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr] motion-safe:animate-[fadeIn_.25s_ease-out]">
          <div className="card min-w-0 p-3">
            <div className="mb-3 rounded-xl bg-gradient-to-br from-indigo-500/[.10] via-violet-500/[.06] to-transparent p-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-indigo-500" />{tr('Your journal')}</div>
              <div className="mt-2 flex gap-4 text-xs muted"><span><b className="text-slate-800 dark:text-slate-100">{journal.length}</b> {tr('entries')}</span><span><b className="text-slate-800 dark:text-slate-100">{journal.filter((j) => j.visibility === 'private').length}</b> {tr('private')}</span><span><b className="text-slate-800 dark:text-slate-100">{journal.filter((j) => j.visibility === 'public').length}</b> {tr('public')}</span></div>
            </div>
            <div className="relative mb-2"><Search size={15} className="absolute left-3 top-2.5 muted" /><input aria-label={tr('Search title, text, and tags')} className="input pl-9 pr-9" placeholder={tr("Search memories…")} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" aria-label={tr('Clear search')} onClick={() => setQ('')} className="absolute right-2 top-1.5 rounded p-1 muted hover:bg-slate-100 dark:hover:bg-white/10"><X size={15}/></button>}</div>
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1" role="group" aria-label={tr('Filter journal entries')}>{(['all', 'private', 'public'] as const).map((filter) => <button key={filter} type="button" onClick={() => setVisibilityFilter(filter)} className={cx('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium', visibilityFilter === filter ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-200')}>{filter === 'all' ? tr('All entries') : tr(filter === 'private' ? 'Private' : 'Public')}</button>)}</div>
            <div className="mb-2 flex items-center gap-2"><CalendarDays size={14} className="shrink-0 muted"/><select aria-label={tr('Filter by date')} className="input !py-1.5 text-xs" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}><option value="all">{tr('Any time')}</option><option value="month">{tr('This month')}</option><option value="year">{tr('This year')}</option></select><select aria-label={tr('Filter by mood')} className="input !py-1.5 text-xs" value={moodFilter ?? ''} onChange={(e) => setMoodFilter(e.target.value ? Number(e.target.value) : null)}><option value="">{tr('Any mood')}</option>{MOODS.map((m, i) => <option key={m} value={i + 1}>{m} {tr(['Very low', 'Low', 'Neutral', 'Good', 'Great'][i])}</option>)}</select></div>
            {hasFilters && <button type="button" className="mb-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => { setQ(''); setMoodFilter(null); setDateFilter('all'); setVisibilityFilter('all'); }}><X size={12}/>{tr('Clear filters')}</button>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={list.map((entry) => entry.id)} strategy={verticalListSortingStrategy}><div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {list.map((j) => <SortableJournalCard key={j.id} entry={j} language={settings.language ?? 'en'} selected={sel === j.id && !draft} disabled={hasFilters} onSelect={() => { setDraft(null); setSel(j.id); }} />)}
              {!list.length && <p className="p-4 text-center text-sm muted">{tr('No matching entries')}</p>}
            </div></SortableContext></DndContext>
          </div>
          {current ? (
            <div className="journal-editor card p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input type="date" className="input !w-auto" value={current.date} onChange={(e) => edit({ date: e.target.value })} />
                <div className="flex gap-1" role="group" aria-label={tr('Choose mood')}>{MOODS.map((m, i) => <button type="button" key={i} aria-label={tr(['Very low', 'Low', 'Neutral', 'Good', 'Great'][i])} aria-pressed={current.mood === i + 1} onClick={() => edit({ mood: (i + 1) as any })} className={cx('rounded-lg p-1.5 text-xl transition motion-reduce:transition-none', current.mood === i + 1 ? 'scale-110 bg-indigo-500/15' : 'opacity-50 hover:opacity-100')}>{m}</button>)}</div>
                <button className={cx('btn-outline ml-auto !py-1.5', current.visibility === 'public' && '!border-emerald-400 text-emerald-500')} onClick={() => edit({ visibility: current.visibility === 'public' ? 'private' : 'public' })} title={tr("Public journals can be published to your public journal page")}>
                  {current.visibility === 'public' ? <Globe2 size={15} /> : <Lock size={15} />} {current.visibility === 'public' ? 'Public' : 'Private'}
                </button>
                  {entry && !draft && <button className="btn-ghost ml-auto text-rose-500" title={tr('Delete entry?')} aria-label={tr('Delete entry?')} onClick={() => setDeleteReview(entry)}><Trash2 size={15} /></button>}
              </div>
              <input className="mb-3 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-slate-400" placeholder={tr("Title…")} value={current.title} onChange={(e) => edit({ title: e.target.value })} />
              <textarea aria-label={tr('Journal entry text')} className="min-h-[340px] w-full resize-y bg-transparent leading-relaxed outline-none placeholder:text-slate-400" placeholder={tr("Write freely…")} value={current.content} onChange={(e) => edit({ content: e.target.value })} />
              <div className="mt-1 flex items-center justify-end gap-1.5 text-xs muted"><Hash size={13}/>{wordCount} {tr('words')} <span aria-hidden="true">·</span>{(current.content ?? '').length} {tr('characters')}</div>
              <input className="input mt-3" placeholder={tr("Tags, comma separated")} value={(current.tags ?? []).join(', ')} onChange={(e) => edit({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
              <input className="input mt-3" placeholder={tr("Location or memory context (optional)")} value={current.location ?? ''} onChange={(e) => edit({ location: e.target.value || undefined })} />
              <label className="mt-3 block text-sm font-medium">{tr("Link this reflection to a goal, plan, or project")}<select className="input mt-1" value={current.relatedGoalId ? `goal:${current.relatedGoalId}` : current.relatedItemId ? `item:${current.relatedItemId}` : current.relatedProjectId ? `project:${current.relatedProjectId}` : ''} onChange={(e) => { const [kind, id] = e.target.value.split(':'); edit({ relatedGoalId: kind === 'goal' ? id : undefined, relatedItemId: kind === 'item' ? id : undefined, relatedProjectId: kind === 'project' ? id : undefined }); }}><option value="">{tr("No linked goal, plan, or project")}</option>{goals.map((goal) => <option key={goal.id} value={`goal:${goal.id}`}>{tr("Goal ·")}{goal.title}</option>)}{items.map((item) => <option key={item.id} value={`item:${item.id}`}>{tr("Plan ·")}{item.title}</option>)}{projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{tr("Project ·")}{project.title}</option>)}</select></label>
              {current.visibility === 'public' && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">{tr('This entry is marked for public publishing. It appears online only after you review and confirm the preview. Do not include sensitive information.')}</p>}
              {(draft || (current.visibility === 'public' && user)) && (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {draft && <button className="btn-ghost" onClick={() => setDraft(null)}>{tr("Discard")}</button>}
                  {current.visibility === 'public' && user && !draft && <button className="btn-outline" disabled={publishing} onClick={() => { if (entry) { setPublishError(''); setPublishReview(entry); } }}><Globe2 size={15} /> {publishing ? 'Publishing…' : entry ? 'Update public link' : 'Publish link'}</button>}
                  {draft && <button className="btn-primary" onClick={() => void save()}>{tr("Save entry")}</button>}
                </div>
              )}
            </div>
          ) : <div className="card grid place-items-center p-10 muted">{tr("Select an entry")}</div>}
        </div>
      )}
      <Modal open={!!publishReview} onClose={() => { if (!publishing) setPublishReview(null); }} title={tr('Review before public publishing')} wide>
        {publishReview && <div className="space-y-4">
          <p className="rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100">{tr('Anyone with the public link can read this journal entry. Review the exact content before publishing.')}</p>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide muted">{tr('Public title')}</p>
            <p className="mt-1 break-words font-semibold">{publishReview.title || tr('Journal entry')}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide muted">{tr('Public preview excerpt')}</p>
            <p className="mt-1 break-words text-sm">{(publishReview.content ?? '').slice(0, 180)}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide muted">{tr('Full public text')}</p>
            <pre className="mt-1 max-h-[32dvh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm">{publishReview.content || tr('No text content.')}</pre>
          </div>
          <p className="text-xs leading-5 muted">{tr('The title, first 180 characters as the preview, and full text will be public. Tags, location, and linked records are not included.')}</p>
          {publishError && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300" role="alert">{publishError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={publishing} onClick={() => setPublishReview(null)}>{tr('Back to editor')}</button>
            <button type="button" className="btn-outline" disabled={publishing} onClick={() => void savePrivately()}>{tr('Save privately')}</button>
            <button type="button" className="btn-primary" disabled={publishing} onClick={() => void publish(publishReview)}><Globe2 size={15} /> {publishing ? tr('Publishing…') : tr(entry?.id === publishReview.id && entry.visibility === 'public' ? 'Update public entry' : 'Publish publicly')}</button>
          </div>
        </div>}
      </Modal>
      <Modal open={!!deleteReview} onClose={() => { if (!publishing) setDeleteReview(null); }} title={tr('Delete journal entry?')}>
        {deleteReview && <div className="space-y-4">
          <p className="break-words font-medium">{deleteReview.title || tr('Untitled')}</p>
          <p className="text-sm muted">{deleteReview.visibility === 'public' ? tr('The public copy will be removed first. If it cannot be removed, this entry will not be deleted.') : tr('This entry will be moved to Trash and can be restored from Settings.')}</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={publishing} onClick={() => setDeleteReview(null)}>{tr('Cancel')}</button><button type="button" className="btn-primary !bg-rose-600" disabled={publishing} onClick={() => void removeEntry()}>{publishing ? tr('Deleting…') : tr('Delete entry')}</button></div>
        </div>}
      </Modal>
    </div>
  );
}
