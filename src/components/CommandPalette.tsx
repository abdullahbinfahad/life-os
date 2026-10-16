import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { cx } from '../lib/utils';
import { NAV } from './Layout';

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const nav = useNavigate();
  const { items, goals, projects, journal } = useStore();

  useEffect(() => { if (open) { setQ(''); setIdx(0); } }, [open]);

  const results = useMemo(() => {
    const lq = q.toLowerCase();
    const r: { label: string; sub: string; go: () => void }[] = [];
    r.push({ label: 'Quick add item…', sub: 'Action', go: () => window.dispatchEvent(new Event('lifeos:quickadd')) });
    NAV.forEach((n) => r.push({ label: n.label, sub: n.desc, go: () => nav(n.to) }));
    if (lq) {
      items.filter((i) => i.title.toLowerCase().includes(lq)).slice(0, 8).forEach((i) => r.push({ label: i.title, sub: 'Library item', go: () => nav(`/library?q=${encodeURIComponent(i.title)}`) }));
      goals.filter((g) => g.title.toLowerCase().includes(lq)).slice(0, 5).forEach((g) => r.push({ label: g.title, sub: 'Goal', go: () => nav('/goals') }));
      projects.filter((p) => p.title.toLowerCase().includes(lq)).slice(0, 5).forEach((p) => r.push({ label: p.title, sub: 'Project', go: () => nav('/projects') }));
      journal.filter((j) => (j.title + j.content).toLowerCase().includes(lq)).slice(0, 5).forEach((j) => r.push({ label: j.title || j.date, sub: 'Journal', go: () => nav('/journal') }));
    }
    return r.filter((x) => !lq || x.label.toLowerCase().includes(lq) || x.sub !== 'Action' && x.sub.toLowerCase().includes(lq) || ['Library item', 'Goal', 'Project', 'Journal'].includes(x.sub));
  }, [q, items, goals, projects, journal, nav]);

  if (!open) return null;
  const run = (i: number) => { results[i]?.go(); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card w-full max-w-xl overflow-hidden !bg-white dark:!bg-[#12151c]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          <Search size={18} className="muted" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter') run(idx);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search everything or jump to…" className="w-full bg-transparent py-4 text-sm outline-none" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r, i) => (
            <button key={i} onMouseEnter={() => setIdx(i)} onClick={() => run(i)}
              className={cx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', i === idx && 'bg-indigo-600 text-white')}>
              <span className="truncate">{r.label}</span>
              <span className={cx('ml-3 shrink-0 text-xs', i === idx ? 'text-white/70' : 'muted')}>{r.sub}</span>
            </button>
          ))}
          {!results.length && <div className="p-6 text-center text-sm muted">No results</div>}
        </div>
      </div>
    </div>
  );
}
