import { Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, fmtDate, today } from '../lib/utils';
import { Modal } from './ui';
import { toast } from './Toaster';
import type { Horizon, Priority } from '../lib/types';

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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const cats = useStore((s) => s.categories);
  const addItems = useStore((s) => s.addItems);
  const items = useStore((s) => s.items);
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
    if (!parsed.length) return;
    addItems(parsed.map(({ dupe, tooLong, invalidDate, ...p }) => p));
    toast(`Added ${parsed.length} item${parsed.length === 1 ? '' : 's'}`);
    setText('');
    setOpen(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="Quick add (N)"
        className="fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-xl shadow-indigo-500/30 transition hover:scale-105 active:scale-95">
        <Plus size={26} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Quick add to your Life Library">
        <textarea autoFocus className="input min-h-[140px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={'One item per line. Paste 100s at once!\n\nLearn guitar #learning !2 ~1-3y\nCall mom #family +today\nVisit Iceland #travel @2027-06-01 *'} />
        <div className="mt-3 rounded-xl bg-slate-100 p-3 text-xs muted dark:bg-white/[.04]">
          <div className="mb-1 flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200"><Sparkles size={13} /> Smart syntax</div>
          <code>#category</code> or <code>#tag</code> · <code>!1</code>–<code>!4</code> priority · <code>@2027-01-31</code> <code>@tomorrow</code> <code>@nextweek</code> <code>@3d</code> <code>@2w</code> <code>@6m</code> <code>@1y</code> due · <code>+today</code> pin · <code>~this-year|1-3y|3-5y|5-10y|lifetime</code> · <code>$skill</code> <code>$book</code> <code>$place</code> type · <code>*</code> star
        </div>
        {dupes > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-500">
            <input type="checkbox" className="accent-indigo-600" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
            Skip {dupes} duplicate{dupes === 1 ? '' : 's'} already in your library
          </label>
        )}
        {marked.length > 0 && (
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {marked.slice(0, 80).map((p, i) => (
              <div key={i} className={'flex items-center gap-2 ' + ((p.dupe && skipDupes) || p.tooLong ? 'opacity-40 line-through' : '')}>
                <span className="truncate">{p.title}</span>
                {p.dupe && <span className="chip bg-amber-500/10 text-amber-500">duplicate</span>}
                {p.tooLong && <span className="chip bg-rose-500/10 text-rose-500">too long</span>}
                {p.invalidDate && <span className="chip bg-rose-500/10 text-rose-500">bad date @{p.invalidDate}</span>}
                {p.dueDate && <span className="chip bg-slate-500/10">{fmtDate(p.dueDate)}</span>}
                {p.type && <span className="chip bg-cyan-500/10 text-cyan-500">{p.type}</span>}
                {p.tags.length > 0 && <span className="chip bg-indigo-500/10 text-indigo-400">#{p.tags.join(' #')}</span>}
                {p.starred && <span className="text-amber-400">★</span>}
                {p.categoryId && <span className="chip bg-indigo-500/10 text-indigo-500">{cats.find((c) => c.id === p.categoryId)?.icon} {cats.find((c) => c.id === p.categoryId)?.name}</span>}
                {p.priority && <span className="chip bg-orange-500/10 text-orange-500">P{p.priority}</span>}
                {p.todayDate && <span className="chip bg-amber-500/10 text-amber-500">Today</span>}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={!parsed.length} onClick={submit}>Add {parsed.length || ''} item{parsed.length === 1 ? '' : 's'} <kbd className="text-[10px] opacity-70">⌘↵</kbd></button>
        </div>
      </Modal>
    </>
  );
}
