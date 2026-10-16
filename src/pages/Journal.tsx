import { BookOpen, Globe2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Empty, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { JournalEntry } from '../lib/types';
import { cx, fmtDate, today } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const PROMPTS = ['What am I grateful for today?', 'What did I learn?', 'What would make tomorrow great?', 'What drained my energy?', 'A memory I want to keep…', 'Who made a difference today?'];

export default function Journal() {
  const { journal, saveEntry, deleteEntry } = useStore();
  const { user } = useAuth();
  const [sel, setSel] = useState<string | null>(journal[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Partial<JournalEntry> | null>(null);
  const entry = journal.find((j) => j.id === sel);
  const current = draft ?? entry;
  const list = journal.filter((j) => !q || (j.title + j.content + j.tags.join(' ')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const newEntry = (prompt?: string) => { setSel(null); setDraft({ date: today(), title: '', content: prompt ? prompt + '\n\n' : '', mood: 3, tags: [], visibility: 'private' }); };
  const save = () => { if (!draft) return; saveEntry(draft); setDraft(null); setTimeout(() => setSel(useStore.getState().journal.find((j) => j.id === draft.id)?.id ?? useStore.getState().journal[0]?.id), 0); };
  const publish = async () => {
    if (!current || !user || !supabase || current.visibility !== 'public') return;
    if (!confirm('Publish this journal entry publicly? Anyone with the link may read it.')) return;
    const slug = `${user.id.slice(0, 8)}-${current.id ?? crypto.randomUUID().slice(0, 8)}`;
    const content = current.content ?? '';
    const { error } = await supabase.from('public_journals').upsert({ slug, owner_id: user.id, title: current.title || 'Journal entry', excerpt: content.slice(0, 180), content, updated_at: new Date().toISOString() });
    if (!error) { await navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#/public/journal/${slug}`); alert('Published. The public link was copied.'); }
    else alert('Could not publish yet. Run the latest Supabase schema and check your connection.');
  };
  const edit = (patch: Partial<JournalEntry>) => setDraft({ ...(current as JournalEntry), ...patch });

  return (
    <div>
      <PageHeader title="Journal" subtitle="Reflections and memories" actions={<button className="btn-primary" onClick={() => newEntry()}><Plus size={16} /> New entry</button>} />
      {journal.length === 0 && !draft ? (
        <Empty icon={<BookOpen size={28} />} title="Start journaling" text="Pick a prompt to begin."
          action={<div className="flex max-w-lg flex-wrap justify-center gap-2">{PROMPTS.map((p) => <button key={p} className="chip border border-slate-200 px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10" onClick={() => newEntry(p)}>{p}</button>)}</div>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="card p-3">
            <div className="relative mb-2"><Search size={15} className="absolute left-3 top-2.5 muted" /><input className="input pl-9" placeholder="Search memories…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {list.map((j) => (
                <button key={j.id} onClick={() => { setDraft(null); setSel(j.id); }} className={cx('w-full rounded-xl px-3 py-2.5 text-left transition', sel === j.id && !draft ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-white/[.04]')}>
                  <div className="flex items-center justify-between text-xs opacity-70"><span>{fmtDate(j.date)}</span><span>{MOODS[j.mood - 1]}</span></div>
                  <div className="truncate font-medium">{j.title || 'Untitled'}</div>
                  <div className="truncate text-xs opacity-60">{j.content}</div>
                </button>
              ))}
            </div>
          </div>
          {current ? (
            <div className="card p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input type="date" className="input !w-auto" value={current.date} onChange={(e) => edit({ date: e.target.value })} />
                <div className="flex gap-1">{MOODS.map((m, i) => <button key={i} onClick={() => edit({ mood: (i + 1) as any })} className={cx('rounded-lg p-1.5 text-xl transition', current.mood === i + 1 ? 'scale-110 bg-indigo-500/15' : 'opacity-50 hover:opacity-100')}>{m}</button>)}</div>
                <button className={cx('btn-outline ml-auto !py-1.5', current.visibility === 'public' && '!border-emerald-400 text-emerald-500')} onClick={() => edit({ visibility: current.visibility === 'public' ? 'private' : 'public' })} title="Public journals can be published to your public journal page">
                  {current.visibility === 'public' ? <Globe2 size={15} /> : <Lock size={15} />} {current.visibility === 'public' ? 'Public' : 'Private'}
                </button>
                {entry && !draft && <button className="btn-ghost ml-auto text-rose-500" onClick={() => { if (confirm('Delete entry?')) { deleteEntry(entry.id); setSel(null); } }}><Trash2 size={15} /></button>}
              </div>
              <input className="mb-3 w-full bg-transparent text-2xl font-bold outline-none placeholder:text-slate-400" placeholder="Title…" value={current.title} onChange={(e) => edit({ title: e.target.value })} />
              <textarea className="min-h-[340px] w-full resize-y bg-transparent leading-relaxed outline-none placeholder:text-slate-400" placeholder="Write freely…" value={current.content} onChange={(e) => edit({ content: e.target.value })} />
              <input className="input mt-3" placeholder="Tags, comma separated" value={(current.tags ?? []).join(', ')} onChange={(e) => edit({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
              <input className="input mt-3" placeholder="Location or memory context (optional)" value={current.location ?? ''} onChange={(e) => edit({ location: e.target.value || undefined })} />
              {current.visibility === 'public' && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">Public preview enabled. When cloud publishing is configured, this entry can appear on your public journal page. Do not include sensitive information.</p>}
              {draft && <div className="mt-4 flex flex-wrap justify-end gap-2"><button className="btn-ghost" onClick={() => setDraft(null)}>Discard</button>{current.visibility === 'public' && user && <button className="btn-outline" onClick={publish}><Globe2 size={15} /> Publish link</button>}<button className="btn-primary" onClick={save}>Save entry</button></div>}
            </div>
          ) : <div className="card grid place-items-center p-10 muted">Select an entry</div>}
        </div>
      )}
    </div>
  );
}
