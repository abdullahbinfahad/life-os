import { translate as tr } from '../lib/locales';
import { BookOpen, Globe2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
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

export default function Journal() {
  const { journal, goals, items, settings, saveEntry, deleteEntry } = useStore();
  const { user } = useAuth();
  const [sel, setSel] = useState<string | null>(journal[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Partial<JournalEntry> | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const entry = journal.find((j) => j.id === sel);
  const current = draft ?? entry;
  const list = journal.filter((j) => !q || (j.title + j.content + j.tags.join(' ')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const newEntry = (prompt?: string) => { setSel(null); setStatusMessage(''); setDraft({ id: uid(), date: today(), title: '', content: prompt ? prompt + '\n\n' : '', mood: 3, tags: [], visibility: 'private' }); };
  const publish = async (value: Partial<JournalEntry>, confirmPublic = true) => {
    if (!user || !supabase || value.visibility !== 'public' || !value.id) return false;
    if (confirmPublic && !confirm('Publish this journal entry publicly? Anyone with the link may read it.')) return false;
    const slug = `${user.id.slice(0, 8)}-${value.id}`;
    const content = value.content ?? '';
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
    } finally { setPublishing(false); }
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
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {list.map((j) => (
                <button key={j.id} onClick={() => { setDraft(null); setSel(j.id); }} className={cx('w-full rounded-xl px-3 py-2.5 text-left transition', sel === j.id && !draft ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/[.04]')}>
                  <div className="flex items-center justify-between text-xs opacity-70"><span>{fmtDate(j.date, settings.language)}</span><span>{MOODS[j.mood - 1]}</span></div>
                  <div className="truncate font-medium">{j.title || 'Untitled'}</div>
                  <div className="truncate text-xs opacity-60">{j.content}</div>
                </button>
              ))}
            </div>
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
              <label className="mt-3 block text-sm font-medium">{tr("Link this reflection to a goal or plan")}<select className="input mt-1" value={current.relatedGoalId ? `goal:${current.relatedGoalId}` : current.relatedItemId ? `item:${current.relatedItemId}` : ''} onChange={(e) => { const [kind, id] = e.target.value.split(':'); edit({ relatedGoalId: kind === 'goal' ? id : undefined, relatedItemId: kind === 'item' ? id : undefined }); }}><option value="">{tr("No linked goal or plan")}</option>{goals.map((goal) => <option key={goal.id} value={`goal:${goal.id}`}>{tr("Goal ·")}{goal.title}</option>)}{items.map((item) => <option key={item.id} value={`item:${item.id}`}>{tr("Plan ·")}{item.title}</option>)}</select></label>
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
