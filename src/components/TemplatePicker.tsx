import { Check, Dices, Search, Sunrise } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { LIBRARY_COUNT, TEMPLATE_LIBRARY } from '../lib/library';
import type { Horizon, Priority, Status } from '../lib/types';
import { cx, today } from '../lib/utils';
import { toast } from './Toaster';
import { HORIZON_META, Modal, PRIORITY_META, STATUS_META } from './ui';

const TYPE_FOR: Record<string, string> = { experiences: 'experience', travel: 'place', nature: 'experience', reading: 'book', learning: 'skill', sports: 'skill' };
const STEP = 150;

/** Browse 1,000+ ready-made life ideas, with multi-select and bulk options */
export default function TemplatePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories, items, addItems } = useStore();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [hideHave, setHideHave] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(STEP);
  const [opts, setOpts] = useState<{ status: Status; priority: Priority; horizon: Horizon; today: boolean }>({ status: 'someday', priority: 3, horizon: '1-3y', today: false });
  const existing = useMemo(() => new Set(items.map((i) => i.title.toLowerCase())), [items]);
  useEffect(() => setLimit(STEP), [cat, q, hideHave]);

  const list = useMemo(() => {
    const out: { key: string; title: string; categoryId: string }[] = [];
    const lq = q.toLowerCase();
    for (const [cid, titles] of Object.entries(TEMPLATE_LIBRARY)) {
      if (cat !== 'all' && cat !== cid) continue;
      titles.forEach((t) => {
        if (lq && !t.toLowerCase().includes(lq)) return;
        if (hideHave && existing.has(t.toLowerCase())) return;
        out.push({ key: cid + '|' + t, title: t, categoryId: cid });
      });
    }
    return out;
  }, [cat, q, hideHave, existing]);

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selectAllVisible = () => setSel((s) => { const n = new Set(s); list.forEach((x) => !existing.has(x.title.toLowerCase()) && n.add(x.key)); return n; });
  const surprise = () => {
    const pool = list.filter((x) => !existing.has(x.title.toLowerCase()) && !sel.has(x.key));
    const n = new Set(sel);
    for (let i = 0; i < 5 && pool.length; i++) n.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].key);
    setSel(n);
  };
  const add = () => {
    const count = sel.size;
    addItems([...sel].map((k) => {
      const [categoryId, ...rest] = k.split('|');
      return {
        title: rest.join('|'), categoryId, type: (TYPE_FOR[categoryId] ?? 'goal') as any,
        status: opts.today && opts.status === 'someday' ? 'next' : opts.status, priority: opts.priority, horizon: opts.horizon,
        todayDate: opts.today ? today() : undefined,
      };
    }));
    toast(`Added ${count} idea${count === 1 ? '' : 's'} to your library`);
    setSel(new Set());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Browse ${LIBRARY_COUNT.toLocaleString()}+ life ideas`} wide>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex gap-1 overflow-x-auto md:max-h-[60vh] md:w-56 md:flex-col md:overflow-y-auto">
          <button onClick={() => setCat('all')} className={cx('btn shrink-0 justify-start', cat === 'all' ? 'bg-indigo-600 text-white' : 'btn-ghost')}>
            All ideas <span className="ml-auto text-xs opacity-60">{LIBRARY_COUNT}</span>
          </button>
          {categories.filter((c) => TEMPLATE_LIBRARY[c.id]).map((c) => {
            const have = TEMPLATE_LIBRARY[c.id].filter((t) => existing.has(t.toLowerCase())).length;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} className={cx('btn shrink-0 justify-start', cat === c.id ? 'bg-indigo-600 text-white' : 'btn-ghost')}>
                {c.icon} <span className="truncate">{c.name}</span>
                <span className="ml-auto text-xs opacity-60">{have > 0 ? `${have}/` : ''}{TEMPLATE_LIBRARY[c.id].length}</span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-2.5 muted" /><input className="input pl-9" placeholder={`Search ${list.length} ideas…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className="btn-outline" onClick={surprise} title="Pick 5 random ideas"><Dices size={15} /> Surprise me</button>
            <button className="btn-outline" onClick={selectAllVisible}>Select all</button>
            {sel.size > 0 && <button className="btn-ghost" onClick={() => setSel(new Set())}>Clear</button>}
          </div>
          <label className="mb-2 flex items-center gap-2 text-xs muted">
            <input type="checkbox" className="accent-indigo-600" checked={hideHave} onChange={(e) => setHideHave(e.target.checked)} /> Hide ideas already in my library
          </label>
          <div className="grid max-h-[50vh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {list.slice(0, limit).map((x) => {
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
            {list.length > limit && (
              <button className="btn-outline sm:col-span-2" onClick={() => setLimit(limit + STEP * 2)}>Show more ({list.length - limit} more)</button>
            )}
            {list.length === 0 && <div className="py-10 text-center text-sm muted sm:col-span-2">No ideas match. Try another search.</div>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
        <span className="mr-2 text-sm font-medium">{sel.size} selected</span>
        <span className="text-xs muted">Add as:</span>
        <select className="input !w-auto !py-1.5 text-xs" value={opts.status} onChange={(e) => setOpts({ ...opts, status: e.target.value as Status })}>
          {Object.entries(STATUS_META).filter(([k]) => k !== 'dropped').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-xs" value={opts.priority} onChange={(e) => setOpts({ ...opts, priority: Number(e.target.value) as Priority })}>
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-xs" value={opts.horizon} onChange={(e) => setOpts({ ...opts, horizon: e.target.value as Horizon })}>
          {Object.entries(HORIZON_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className={cx('btn-outline !py-1.5 text-xs', opts.today && '!border-amber-400 text-amber-500')} onClick={() => setOpts({ ...opts, today: !opts.today })}><Sunrise size={13} /> Today</button>
        <button className="btn-primary ml-auto" disabled={!sel.size} onClick={add}>Add {sel.size} to my library</button>
      </div>
    </Modal>
  );
}
