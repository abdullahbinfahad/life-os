import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { LIBRARY_COUNT, TEMPLATE_LIBRARY } from '../lib/templates';
import { cx } from '../lib/utils';
import { Modal } from './ui';

/** Pick from 400+ ready-made life ideas, by category, with one-click multi-select */
export default function TemplatePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories, items, addItems } = useStore();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const existing = useMemo(() => new Set(items.map((i) => i.title.toLowerCase())), [items]);

  const list = useMemo(() => {
    const out: { key: string; title: string; categoryId: string }[] = [];
    for (const [cid, titles] of Object.entries(TEMPLATE_LIBRARY)) {
      if (cat !== 'all' && cat !== cid) continue;
      titles.forEach((t) => { if (!q || t.toLowerCase().includes(q.toLowerCase())) out.push({ key: cid + '|' + t, title: t, categoryId: cid }); });
    }
    return out;
  }, [cat, q]);

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selectAllVisible = () => setSel((s) => { const n = new Set(s); list.forEach((x) => !existing.has(x.title.toLowerCase()) && n.add(x.key)); return n; });
  const add = () => {
    addItems([...sel].map((k) => { const [categoryId, title] = k.split('|'); return { title, categoryId, type: categoryId === 'experiences' || categoryId === 'travel' ? 'experience' : 'goal' }; }));
    setSel(new Set());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Browse ${LIBRARY_COUNT}+ life ideas`} wide>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
          <button onClick={() => setCat('all')} className={cx('btn shrink-0 justify-start', cat === 'all' ? 'bg-indigo-600 text-white' : 'btn-ghost')}>All ideas</button>
          {categories.filter((c) => TEMPLATE_LIBRARY[c.id]).map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cx('btn shrink-0 justify-start', cat === c.id ? 'bg-indigo-600 text-white' : 'btn-ghost')}>
              {c.icon} <span className="truncate">{c.name}</span><span className="ml-auto text-xs opacity-60">{TEMPLATE_LIBRARY[c.id].length}</span>
            </button>
          ))}
        </div>
        <div className="flex-1">
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 muted" /><input className="input pl-9" placeholder="Filter ideas…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className="btn-outline" onClick={selectAllVisible}>Select all</button>
            {sel.size > 0 && <button className="btn-ghost" onClick={() => setSel(new Set())}>Clear</button>}
          </div>
          <div className="grid max-h-[55vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {list.map((x) => {
              const has = existing.has(x.title.toLowerCase());
              const on = sel.has(x.key);
              const c = categories.find((cc) => cc.id === x.categoryId);
              return (
                <button key={x.key} disabled={has} onClick={() => toggle(x.key)}
                  className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition',
                    on ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 dark:border-white/[.07]',
                    has && 'opacity-40')}>
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 dark:border-white/20')}>{(on || has) && <Check size={13} />}</span>
                  <span className="flex-1">{x.title}</span>
                  {cat === 'all' && <span title={c?.name}>{c?.icon}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
        <span className="text-sm muted">{sel.size} selected</span>
        <button className="btn-primary" disabled={!sel.size} onClick={add}>Add {sel.size} to my library</button>
      </div>
    </Modal>
  );
}
