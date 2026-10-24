import { translate as tr } from '../lib/locales';
import { Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, fmtDate, today } from '../lib/utils';
import { HORIZON_META, Modal } from './ui';
import { toast } from './Toaster';
import { playFeedback } from '../lib/sounds';
import type { Horizon, Priority, ItemType } from '../lib/types';
import { useLocation } from 'react-router-dom';

/**
 * Quick add with smart syntax:
 *   "Learn guitar #learning !1 @2026-12-01 +today ~3-5y"
 *   #category (name or id prefix)  !1-4 priority  @date due  +today pin  ~horizon  *star
 * Multiple lines => multiple items.
 */
export function parseQuick(line: string, cats: { id: string; name: string }[]) {
  let title = line;
  const out: any = { tags: [] as string[] };
  title = title.replace(/#([\w-]+)/g, (_, c: string) => {
    const lc = c.toLowerCase();
    const cat = cats.find((x) => x.id === lc || x.name.toLowerCase().startsWith(lc) || x.name.toLowerCase().includes(lc));
    if (cat) out.categoryId = cat.id; else out.tags.push(c);
    return '';
  });
  title = title.replace(/!([1-4])/, (_, p) => { out.priority = Number(p) as Priority; return ''; });
  title = title.replace(/@(\d{4}-\d{2}-\d{2}|today|tomorrow|nextweek|nextmonth|nextyear|\d+[dwmy])\b/i, (_, d: string) => {
    const t = today();
    const l = d.toLowerCase();
    const rel: Record<string, number> = { today: 0, tomorrow: 1, nextweek: 7, nextmonth: 30, nextyear: 365 };
    if (l in rel) out.dueDate = addDays(t, rel[l]);
    else if (/^\d+[dwmy]$/.test(l)) out.dueDate = addDays(t, parseInt(l) * { d: 1, w: 7, m: 30, y: 365 }[l.slice(-1) as 'd'|'w'|'m'|'y']);
    else if (!isNaN(new Date(d + 'T00:00:00').getTime())) out.dueDate = d;
    else out.invalidDate = d;
    return '';
  });
  title = title.replace(/\$(goal|idea|experience|skill|place|book|habit|other)\b/i, (_, t: string) => { out.type = t.toLowerCase(); return ''; });
  title = title.replace(/\+today/i, () => { out.todayDate = today(); out.status = 'next'; return ''; });
  title = title.replace(/~(this-year|1-3y|3-5y|5-10y|lifetime)/, (_, h) => { out.horizon = h as Horizon; return ''; });
  title = title.replace(/(^|\s)\*(\s|$)/, () => { out.starred = true; return ' '; });
  out.title = title.replace(/\s+/g, ' ').trim();
  return out;
}

export default function QuickAdd() {
  const location = useLocation();
  const page = location.pathname;
  const quickKind = page === '/goals' ? 'goal' : page === '/projects' ? 'project' : page === '/habits' ? 'habit' : page === '/journal' ? 'journal' : page === '/albums' ? 'album' : page === '/today' ? 'today' : 'library';
  const actionLabel = ({ goal: 'Add a goal', project: 'Create project', habit: 'Add habit', journal: 'New journal entry', album: 'Create album', today: 'Add to today', library: 'Add to your Life Library' } as const)[quickKind];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('1-3y');
  const [type, setType] = useState<ItemType>('other');
  const [advanced, setAdvanced] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const cats = useStore((s) => s.categories);
  const addItems = useStore((s) => s.addItems);
  const items = useStore((s) => s.items);
  const createGoal = useStore((s) => s.addGoal);
  const createProject = useStore((s) => s.addProject);
  const createHabit = useStore((s) => s.addHabit);
  const createJournal = useStore((s) => s.saveEntry);
  const createAlbum = useStore((s) => s.addAlbum);
  const [skipDupes, setSkipDupes] = useState(true);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOpen(true); }
    };
    const o = () => setOpen(true);
    window.addEventListener('keydown', h);
    window.addEventListener('lifeos:quickadd', o);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('lifeos:quickadd', o); };
  }, []);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const existing = new Set(items.map((i) => i.title.toLowerCase()));
  const all = lines.map((l) => parseQuick(l, cats)).filter((p) => p.title);
  const seen = new Set<string>();
  const marked = all.map((p) => {
    const k = p.title.toLowerCase();
    const dupe = existing.has(k) || seen.has(k);
    seen.add(k);
    return { ...p, dupe, tooLong: p.title.length > 200 };
  });
  const dupes = marked.filter((p) => p.dupe).length;
  const parsed = marked.filter((p) => !p.tooLong && !(skipDupes && p.dupe));

  const submit = () => {
    if (!advanced) {
      const cleanTitle = title.trim();
      if (!cleanTitle) { titleRef.current?.focus(); return; }
      if (quickKind === 'goal') createGoal({ title: cleanTitle, description: notes.trim(), categoryId: categoryId || 'career', status: 'active' });
      else if (quickKind === 'project') createProject({ title: cleanTitle, description: notes.trim(), categoryId: categoryId || 'career', status: 'planning', dueDate: dueDate || undefined });
      else if (quickKind === 'habit') createHabit({ title: cleanTitle, categoryId: categoryId || 'health' });
      else if (quickKind === 'journal') createJournal({ title: cleanTitle, content: notes.trim(), visibility: 'private' });
      else if (quickKind === 'album') createAlbum({ title: cleanTitle, description: notes.trim() });
      else addItems([{ title: cleanTitle, notes: notes.trim(), categoryId, type: quickKind === 'today' ? 'other' : type, status: 'next', priority: 2, horizon, tags: [], starred: false, ...(dueDate ? { dueDate } : {}), ...(quickKind === 'today' ? { todayDate: today() } : {}) }]);
      playFeedback('submit');
      toast(quickKind === 'library' ? 'Added to your library' : `${tr(actionLabel)} · ${cleanTitle}`);
      setTitle(''); setNotes(''); setCategoryId(''); setDueDate(''); setType('other'); setHorizon('1-3y'); setOpen(false);
      return;
    }
    if (!parsed.length) return;
    addItems(parsed.map(({ dupe, tooLong, invalidDate, ...p }) => p));
    playFeedback('submit');
    toast(`Added ${parsed.length} item${parsed.length === 1 ? '' : 's'}`);
    setText(''); setOpen(false);
  };
  return (
    <>
      <button onClick={() => setOpen(true)} title={tr(actionLabel)} aria-label={tr(actionLabel)} aria-haspopup="dialog"
        className="fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] right-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-indigo-500/30 bg-white/55 text-indigo-700 shadow-lg shadow-indigo-900/10 backdrop-blur-xl transition hover:scale-105 active:scale-95 dark:bg-slate-900/45 dark:text-indigo-200 lg:bottom-6 lg:right-6 lg:h-14 lg:w-14">
        <Plus size={26} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={tr(actionLabel)}>
        {!advanced ? <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="block text-sm font-medium">{tr("Title")}<span className="text-rose-500">*</span>
            <input ref={titleRef} autoFocus aria-label={tr("Entry title, required")} required maxLength={200} className="input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("What would you like to add?")} />
          </label>
          {quickKind === 'library' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">{tr("Type")}<select aria-label={tr("Entry type")} className="input mt-1 w-full" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
                {(['other','goal','idea','experience','skill','place','book','habit'] as ItemType[]).map((v) => <option key={v} value={v}>{v === 'other' ? 'Item' : v[0].toUpperCase() + v.slice(1)}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">{tr("Category")}<span className="font-normal muted">{tr("(optional)")}</span>
              <select aria-label={tr("Category")} className="input mt-1 w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{tr("No category")}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">{tr("Plan horizon")}<select aria-label={tr("Plan horizon")} className="input mt-1 w-full" value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
                {Object.entries(HORIZON_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>}
          {(quickKind === 'project' || quickKind === 'library') && <label className="block text-sm font-medium">{tr("Due date")}<span className="font-normal muted">{tr("(optional)")}</span><input aria-label={tr("Due date")} type="date" className="input mt-1 w-full sm:max-w-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>}
          <label className="block text-sm font-medium">{tr("Notes")}<span className="font-normal muted">{tr("(optional)")}</span>
            <textarea aria-label={tr("Notes")} className="input mt-1 min-h-20 w-full resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Add a little detail…")} />
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="btn-ghost self-start" onClick={() => setAdvanced(true)}>{tr("Add many / advanced")}</button>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{tr("Cancel")}</button><button type="submit" className="btn-primary" disabled={!title.trim()}>{tr("Add item")}</button></div>
          </div>
        </form> : <div>
          <button type="button" className="btn-ghost mb-3" onClick={() => setAdvanced(false)}>{tr("← Simple add")}</button>
          <textarea aria-label={tr("Items to add, one per line")} className="input min-h-[120px] w-full font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} placeholder={tr("One item per line")} />
          <details className="mt-3 rounded-xl bg-slate-100 p-3 text-xs muted dark:bg-white/[.04]"><summary className="flex cursor-pointer list-none items-center gap-1 font-medium"><Sparkles size={13} /> {tr("Legacy smart syntax help")}</summary><p className="mt-2"><code>#category</code> · <code>!1</code>–<code>!4</code> {tr("priority ·")}<code>@date</code> {tr("due ·")}<code>+today</code> {tr("pin ·")}<code>~horizon</code> · <code>$type</code> · <code>*</code> {tr("star")}</p></details>
          {dupes > 0 && <label className="mt-3 flex items-center gap-2 text-sm text-amber-500"><input type="checkbox" className="accent-indigo-600" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />{tr("Skip")}{dupes} {tr("duplicate")}{dupes === 1 ? '' : 's'}</label>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{tr("Cancel")}</button><button type="button" className="btn-primary" disabled={!parsed.length} onClick={submit}>{tr("Add")}{parsed.length} {tr("item")}{parsed.length === 1 ? '' : 's'}</button></div>
        </div>}
      </Modal>
    </>
  );
}
