import { translate as tr } from '../lib/locales';
import { BookOpen, Globe2, GripVertical, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui';
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
  const [draft, setDraft] = useState<Partial<JournalEntry> | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const publishingIds = useRef(new Set<string>());
  const entry = journal.find((j) => j.id === sel);
  const current = draft ?? entry;
  const list = journal.filter((j) => (visibilityFilter === 'all' || j.visibility === visibilityFilter) && (!q || (j.title + j.content + j.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.sortOrder != null && b.sortOrder != null ? a.sortOrder - b.sortOrder : a.sortOrder == null && b.sortOrder != null ? -1 : a.sortOrder != null && b.sortOrder == null ? 1 : b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    if (q || visibilityFilter !== 'all' || !event.over || event.active.id === event.over.id) return;
    const oldIndex = list.findIndex((item) => item.id === event.active.id); const newIndex = list.findIndex((item) => item.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ids = list.map((item) => item.id); const [moved] = ids.splice(oldIndex, 1); ids.splice(newIndex, 0, moved); useStore.getState().reorderJournal(ids);
  };

  useEffect(() => {
    if (!user || !supabase) return;
    const candidates = journal.filter((item) => item.visibility === 'public' && item.id && !publishingIds.current.has(item.id));
    if (!candidates.length) return;
    let active = true;
    void (async () => {
      try {
        const slugs = candidates.map((item) => `${user.id.slice(0, 8)}-${item.id}`);
        const { data: existing, error: lookupError } = await supabase.from('public_journals').select('slug').in('slug', slugs);
        if (lookupError) throw lookupError;
        const existingSlugs = new Set((existing ?? []).map((row) => row.slug));
        const missing = candidates.filter((item) => !existingSlugs.has(`${user.id.slice(0, 8)}-${item.id}`));
        if (!missing.length) return;
        const publishedAt = new Date().toISOString();
        const { error } = await supabase.from('public_journals').upsert(missing.map((item) => ({
          slug: `${user.id.slice(0, 8)}-${item.id}`,
          owner_id: user.id,
          title: item.title || 'Journal entry',
          excerpt: (item.content ?? '').slice(0, 180),
          content: item.content ?? '',
          published_at: publishedAt,
          updated_at: publishedAt,
        })), { onConflict: 'slug' });
        if (error) throw error;
        if (active) setStatusMessage(`${missing.length} existing public journal ${missing.length === 1 ? 'entry was' : 'entries were'} added to the public page.`);
      } catch {
        if (active) setStatusMessage('Some entries marked Public could not be added to the public page. Open one and choose Update public link to retry.');
      }
    })();
    return () => { active = false; };
  }, [journal, user?.id]);

  const newEntry = (prompt?: string) => { setSel(null); setStatusMessage(''); setDraft({ id: uid(), date: today(), title: '', content: prompt ? prompt + '\n\n' : '', mood: 3, tags: [], visibility: 'private' }); };
  const publish = async (value: Partial<JournalEntry>, confirmPublic = true) => {
    if (!user || !supabase || value.visibility !== 'public' || !value.id) return false;
    if (confirmPublic && !confirm('Publish this journal entry publicly? Anyone with the link may read it.')) return false;
    const slug = `${user.id.slice(0, 8)}-${value.id}`;
    const content = value.content ?? '';
    publishingIds.current.add(value.id);
    setPublishing(true);
    try {
      const { error } = await supabase.from('public_journals').upsert({ slug, owner_id: user.id, title: value.title || 'Journal entry', excerpt: content.slice(0, 180), content, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'slug' });
      if (error) throw error;
      const link = `${window.location.origin}${window.location.pathname}#/public/journal/${encodeURIComponent(slug)}`;
      try { await navigator.clipboard?.writeText(link); } catch { /* Link remains available in the public index. */ }
      setStatusMessage('Published to Public Journal. The share link was copied when clipboard access was available.');
      playFeedback('confirm');
      return true;
    } catch {
      setStatusMessage('Saved privately on this device, but publishing failed. Check your connection and public-journal database setup, then try again.');
      return false;
    } finally { publishingIds.current.delete(value.id); setPublishing(false); }
  };
  const save = async () => {
    if (!draft) return;
    const saved = { date: today(), mood: 3 as const, tags: [], visibility: 'private' as const, createdAt: new Date().toISOString(), ...draft, id: draft.id ?? uid() } as JournalEntry;
    saveEntry(saved);
    setSel(saved.id);
    setDraft(null);
    playFeedback('add');
    if (saved.visibility === 'public' && user) await publish(saved);
    else if (entry?.visibility === 'public' && user && supabase) {
      const { error } = await supabase.from('public_journals').delete().eq('slug', `${user.id.slice(0, 8)}-${entry.id}`);
      setStatusMessage(error ? 'Saved as private, but the old public link could not be removed. Please retry while online.' : 'Saved privately and removed from the public journal.');
    } else setStatusMessage('Journal entry saved to your Life OS workspace.');
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
      {statusMessage && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[.07] px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300" role="status"><span>{statusMessage}</span><Link to="/public" className="shrink-0 underline underline-offset-2">{tr("Open public journals")}</Link></div>}
      {journal.length === 0 && !draft ? (
        <Empty icon={<BookOpen size={28} />} title={tr("Start journaling")} text="Pick a prompt to begin."
          action={<div className="flex max-w-lg flex-wrap justify-center gap-2">{PROMPTS.map((p) => <button key={p} className="chip border border-slate-200 px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10" onClick={() => newEntry(p)}>{p}</button>)}</div>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="card p-3">
            <div className="relative mb-2"><Search size={15} className="absolute left-3 top-2.5 muted" /><input className="input pl-9" placeholder={tr("Search memories…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1" role="group" aria-label={tr('Filter journal entries')}>{(['all', 'private', 'public'] as const).map((filter) => <button key={filter} type="button" onClick={() => setVisibilityFilter(filter)} className={cx('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium', visibilityFilter === filter ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-white/[.06] dark:text-slate-200')}>{filter === 'all' ? tr('All entries') : tr(filter === 'private' ? 'Private' : 'Public')}</button>)}</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={list.map((entry) => entry.id)} strategy={verticalListSortingStrategy}><div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {list.map((j) => <SortableJournalCard key={j.id} entry={j} language={settings.language ?? 'en'} selected={sel === j.id && !draft} disabled={Boolean(q) || visibilityFilter !== 'all'} onSelect={() => { setDraft(null); setSel(j.id); }} />)}
              {!list.length && <p className="p-4 text-center text-sm muted">{tr('No matching entries')}</p>}
            </div></SortableContext></DndContext>
          </div>
          {current ? (
            <div className="journal-editor card p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input type="date" className="input !w-auto" value={current.date} onChange={(e) => edit({ date: e.target.value })} />
                <div className="flex gap-1">{MOODS.map((m, i) => <button key={i} onClick={() => edit({ mood: (i + 1) as any })} className={cx('rounded-lg p-1.5 text-xl transition', current.mood === i + 1 ? 'scale-110 bg-indigo-500/15' : 'opacity-50 hover:opacity-100')}>{m}</button>)}</div>
                <button className={cx('btn-outline ml-auto !py-1.5', current.visibility === 'public' && '!border-emerald-400 text-emerald-500')} onClick={() => edit({ visibility: current.visibility === 'public' ? 'private' : 'public' })} title={tr("Public journals can be published to your public journal page")}>
                  {current.visibility === 'public' ? <Globe2 size={15} /> : <Lock size={15} />} {current.visibility === 'public' ? 'Public' : 'Private'}
                </button>
                  {entry && !draft && <button className="btn-ghost ml-auto text-rose-500" onClick={async () => { if (confirm('Delete entry?')) { deleteEntry(entry.id); setSel(null); if (entry.visibility === 'public' && user && supabase) await supabase.from('public_journals').delete().eq('slug', `${user.id.slice(0, 8)}-${entry.id}`); } }}><Trash2 size={15} /></button>}
              </div>
              <input className="mb-3 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-slate-400" placeholder={tr("Title…")} value={current.title} onChange={(e) => edit({ title: e.target.value })} />
              <textarea className="min-h-[340px] w-full resize-y bg-transparent leading-relaxed outline-none placeholder:text-slate-400" placeholder={tr("Write freely…")} value={current.content} onChange={(e) => edit({ content: e.target.value })} />
              <input className="input mt-3" placeholder={tr("Tags, comma separated")} value={(current.tags ?? []).join(', ')} onChange={(e) => edit({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
              <input className="input mt-3" placeholder={tr("Location or memory context (optional)")} value={current.location ?? ''} onChange={(e) => edit({ location: e.target.value || undefined })} />
              <label className="mt-3 block text-sm font-medium">{tr("Link this reflection to a goal, plan, or project")}<select className="input mt-1" value={current.relatedGoalId ? `goal:${current.relatedGoalId}` : current.relatedItemId ? `item:${current.relatedItemId}` : current.relatedProjectId ? `project:${current.relatedProjectId}` : ''} onChange={(e) => { const [kind, id] = e.target.value.split(':'); edit({ relatedGoalId: kind === 'goal' ? id : undefined, relatedItemId: kind === 'item' ? id : undefined, relatedProjectId: kind === 'project' ? id : undefined }); }}><option value="">{tr("No linked goal, plan, or project")}</option>{goals.map((goal) => <option key={goal.id} value={`goal:${goal.id}`}>{tr("Goal ·")}{goal.title}</option>)}{items.map((item) => <option key={item.id} value={`item:${item.id}`}>{tr("Plan ·")}{item.title}</option>)}{projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{tr("Project ·")}{project.title}</option>)}</select></label>
              {current.visibility === 'public' && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">{tr("Public preview enabled. When cloud publishing is configured, this entry can appear on your public journal page. Do not include sensitive information.")}</p>}
              {(draft || (current.visibility === 'public' && user)) && (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {draft && <button className="btn-ghost" onClick={() => setDraft(null)}>{tr("Discard")}</button>}
                  {current.visibility === 'public' && user && !draft && <button className="btn-outline" disabled={publishing} onClick={() => void publish(current)}><Globe2 size={15} /> {publishing ? 'Publishing…' : entry ? 'Update public link' : 'Publish link'}</button>}
                  {draft && <button className="btn-primary" onClick={() => void save()}>{tr("Save entry")}</button>}
                </div>
              )}
            </div>
          ) : <div className="card grid place-items-center p-10 muted">{tr("Select an entry")}</div>}
        </div>
      )}
    </div>
  );
}
