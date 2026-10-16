import { CheckCircle2, Circle, Grid3x3, LayoutList, Library as LibIcon, Plus, Search, Sparkles, Star, Sunrise, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ItemEditor from '../components/ItemEditor';
import TemplatePicker from '../components/TemplatePicker';
import { CatBadge, Empty, HORIZON_META, PageHeader, PRIORITY_META, Progress, STATUS_META, TYPE_META } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { LifeItem } from '../lib/types';
import { cx, fmtDate, pct, today } from '../lib/utils';

const PAGE = 100;
type GroupBy = 'none' | 'category' | 'status' | 'priority' | 'horizon' | 'type';
type SortBy = 'created' | 'priority' | 'due' | 'title';

export default function Library() {
  const { items, categories, updateItems, deleteItems, toggleItemDone, updateItem } = useStore();
  const catMap = useCategoryMap();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('open');
  const [prio, setPrio] = useState('all');
  const [horizon, setHorizon] = useState('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [sortBy, setSortBy] = useState<SortBy>('priority');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LifeItem | null>(null);
  const [picker, setPicker] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [inline, setInline] = useState('');

  useEffect(() => setQ(params.get('q') ?? ''), [params]);
  useEffect(() => setLimit(PAGE), [q, cat, status, prio, horizon, starredOnly]);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    let r = items.filter((i) =>
      (!lq || i.title.toLowerCase().includes(lq) || i.notes.toLowerCase().includes(lq) || i.tags.some((t) => t.toLowerCase().includes(lq))) &&
      (cat === 'all' || i.categoryId === cat) &&
      (status === 'all' || (status === 'open' ? i.status !== 'done' && i.status !== 'dropped' : i.status === status)) &&
      (prio === 'all' || i.priority === Number(prio)) &&
      (horizon === 'all' || i.horizon === horizon) &&
      (!starredOnly || i.starred));
    r = [...r].sort((a, b) => {
      if (sortBy === 'priority') return a.priority - b.priority || Number(b.starred) - Number(a.starred);
      if (sortBy === 'due') return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return r;
  }, [items, q, cat, status, prio, horizon, starredOnly, sortBy]);

  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: `All items`, color: '#6366f1', items: visible }];
    const m = new Map<string, LifeItem[]>();
    visible.forEach((i) => { const k = String(i[groupBy as keyof LifeItem]); m.set(k, [...(m.get(k) ?? []), i]); });
    return [...m.entries()].map(([k, list]) => {
      if (groupBy === 'category') return { key: k, label: `${catMap[k]?.icon ?? ''} ${catMap[k]?.name ?? 'Uncategorized'}`, color: catMap[k]?.color ?? '#64748b', items: list };
      if (groupBy === 'status') return { key: k, label: STATUS_META[k].label, color: STATUS_META[k].color, items: list };
      if (groupBy === 'priority') return { key: k, label: PRIORITY_META[+k].label, color: PRIORITY_META[+k].color, items: list };
      if (groupBy === 'horizon') return { key: k, label: HORIZON_META[k], color: '#8b5cf6', items: list };
      return { key: k, label: TYPE_META[k], color: '#06b6d4', items: list };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [visible, groupBy, catMap]);

  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...sel];
  const done = items.filter((i) => i.status === 'done').length;

  const addInline = () => {
    const titles = inline.split('\n').map((t) => t.trim()).filter(Boolean);
    if (!titles.length) return;
    useStore.getState().addItems(titles.map((title) => ({ title, categoryId: cat !== 'all' ? cat : 'experiences' })));
    setInline('');
  };

  return (
    <div>
      <PageHeader title="Life Library" subtitle={`All goals, ideas, and experiences · ${items.length} items · ${done} done`}
        actions={<>
          <button className="btn-outline" onClick={() => setPicker(true)}><Sparkles size={16} /> Browse ideas</button>
          <button className="btn-primary" onClick={() => window.dispatchEvent(new Event('lifeos:quickadd'))}><Plus size={16} /> Add items</button>
        </>} />

      {items.length > 0 && (
        <div className="card mb-4 flex items-center gap-4 p-4">
          <div className="text-sm font-medium">Life completion</div>
          <Progress value={pct(done, items.length)} className="flex-1" />
          <div className="text-sm font-semibold">{pct(done, items.length)}%</div>
        </div>
      )}

      {/* category chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setCat('all')} className={cx('chip shrink-0 px-3 py-1.5 text-sm', cat === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200/60 dark:bg-white/[.06]')}>All · {items.length}</button>
        {categories.map((c) => {
          const n = items.filter((i) => i.categoryId === c.id).length;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} className="chip shrink-0 px-3 py-1.5 text-sm"
              style={cat === c.id ? { background: c.color, color: 'white' } : { background: c.color + '1a', color: c.color }}>
              {c.icon} {c.name} · {n}
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-2.5 muted" />
          <input className="input pl-9" placeholder="Search title, notes, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option><option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input !w-auto" value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="all">Any priority</option>
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input !w-auto" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
          <option value="all">Any horizon</option>
          {Object.entries(HORIZON_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input !w-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          <option value="none">No grouping</option><option value="category">Group: Category</option><option value="status">Group: Status</option>
          <option value="priority">Group: Priority</option><option value="horizon">Group: Horizon</option><option value="type">Group: Type</option>
        </select>
        <select className="input !w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
          <option value="priority">Sort: Priority</option><option value="due">Sort: Due date</option><option value="created">Sort: Newest</option><option value="title">Sort: A–Z</option>
        </select>
        <button className={cx('btn-outline', starredOnly && '!border-amber-400 text-amber-500')} onClick={() => setStarredOnly(!starredOnly)}><Star size={15} /></button>
        <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-white/10">
          <button className={cx('rounded-lg p-1.5', view === 'list' && 'bg-slate-200 dark:bg-white/10')} onClick={() => setView('list')}><LayoutList size={16} /></button>
          <button className={cx('rounded-lg p-1.5', view === 'grid' && 'bg-slate-200 dark:bg-white/10')} onClick={() => setView('grid')}><Grid3x3 size={16} /></button>
        </div>
      </div>

      {/* inline add */}
      <div className="mb-4 flex gap-2">
        <input className="input" placeholder={`Type and press Enter to add${cat !== 'all' ? ` to ${catMap[cat]?.name}` : ''}…`} value={inline}
          onChange={(e) => setInline(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addInline()}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); setInline(t); } }} />
        <button className="btn-primary" onClick={addInline}><Plus size={16} /></button>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-indigo-600 p-3 text-sm text-white shadow-xl shadow-indigo-600/30 lg:top-4">
          <span className="font-semibold">{sel.size} selected</span>
          <button className="rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25" onClick={() => setSel(new Set(filtered.map((i) => i.id)))}>Select all {filtered.length}</button>
          <span className="mx-1 h-5 w-px bg-white/30" />
          <button className="rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25" onClick={() => { updateItems(ids, { todayDate: today(), status: 'next' }); setSel(new Set()); }}><Sunrise size={14} className="inline" /> To Today</button>
          <button className="rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25" onClick={() => { updateItems(ids, { status: 'done' }); setSel(new Set()); }}>Mark done</button>
          <select className="rounded-lg bg-white/15 px-2 py-1 outline-none [&>option]:text-black" value="" onChange={(e) => { e.target.value && updateItems(ids, { status: e.target.value as any }); setSel(new Set()); }}>
            <option value="">Status…</option>{Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="rounded-lg bg-white/15 px-2 py-1 outline-none [&>option]:text-black" value="" onChange={(e) => { e.target.value && updateItems(ids, { categoryId: e.target.value }); setSel(new Set()); }}>
            <option value="">Move to…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="rounded-lg bg-white/15 px-2 py-1 outline-none [&>option]:text-black" value="" onChange={(e) => { e.target.value && updateItems(ids, { priority: Number(e.target.value) as any }); setSel(new Set()); }}>
            <option value="">Priority…</option>{Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="rounded-lg bg-white/15 px-2 py-1 outline-none [&>option]:text-black" value="" onChange={(e) => { e.target.value && updateItems(ids, { horizon: e.target.value as any }); setSel(new Set()); }}>
            <option value="">Horizon…</option>{Object.entries(HORIZON_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-lg bg-rose-500 px-2.5 py-1 hover:bg-rose-400" onClick={() => { if (confirm(`Delete ${sel.size} items?`)) { deleteItems(ids); setSel(new Set()); } }}><Trash2 size={14} className="inline" /> Delete</button>
          <button className="ml-auto rounded-lg p-1 hover:bg-white/20" onClick={() => setSel(new Set())}><X size={16} /></button>
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={<LibIcon size={28} />} title="Your Life Library is empty" text="Start by browsing 400+ ready-made ideas, or paste your own list — hundreds at a time."
          action={<div className="flex gap-2"><button className="btn-primary" onClick={() => setPicker(true)}><Sparkles size={16} /> Browse ideas</button>
            <button className="btn-outline" onClick={() => useStore.getState().loadDemo()}>Load demo data</button></div>} />
      ) : filtered.length === 0 ? (
        <Empty icon={<Search size={28} />} title="No matching items" text="Try clearing some filters." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                <h3 className="font-semibold">{g.label}</h3>
                <span className="text-xs muted">{g.items.length}</span>
                <button className="ml-auto text-xs text-indigo-500 hover:underline" onClick={() => setSel((s) => { const n = new Set(s); g.items.forEach((i) => n.add(i.id)); return n; })}>select group</button>
              </div>
              <div className={view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'card divide-y divide-slate-100 overflow-hidden dark:divide-white/[.05]'}>
                {g.items.map((i) => view === 'list' ? (
                  <div key={i.id} className={cx('group flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[.02]', sel.has(i.id) && 'bg-indigo-500/5')}>
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} className="h-4 w-4 accent-indigo-600" />
                    <button onClick={() => toggleItemDone(i.id)} className={i.status === 'done' ? 'text-emerald-500' : 'muted hover:text-emerald-500'}>
                      {i.status === 'done' ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                    </button>
                    <button onClick={() => setEditing(i)} className={cx('min-w-0 flex-1 truncate text-left text-sm', i.status === 'done' && 'line-through muted')}>{i.title}</button>
                    <div className="hidden items-center gap-1.5 md:flex">
                      {groupBy !== 'category' && <CatBadge cat={catMap[i.categoryId]} />}
                      {i.todayDate === today() && <span className="chip bg-amber-500/15 text-amber-500">Today</span>}
                      {i.dueDate && <span className="chip bg-slate-200/70 dark:bg-white/[.06]">{fmtDate(i.dueDate)}</span>}
                      {groupBy !== 'status' && <span className="chip" style={{ background: STATUS_META[i.status].color + '1f', color: STATUS_META[i.status].color }}>{STATUS_META[i.status].label}</span>}
                      <span className="chip w-8 justify-center" style={{ color: PRIORITY_META[i.priority].color, background: PRIORITY_META[i.priority].color + '1a' }}>P{i.priority}</span>
                    </div>
                    <button onClick={() => updateItem(i.id, { starred: !i.starred })} className={i.starred ? 'text-amber-400' : 'text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600'}><Star size={16} fill={i.starred ? 'currentColor' : 'none'} /></button>
                  </div>
                ) : (
                  <div key={i.id} className={cx('card group relative p-4 transition hover:-translate-y-0.5 hover:shadow-lg', sel.has(i.id) && 'ring-2 ring-indigo-500')}>
                    <div className="mb-2 flex items-center gap-2">
                      <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} className="h-4 w-4 accent-indigo-600" />
                      <CatBadge cat={catMap[i.categoryId]} />
                      <button onClick={() => updateItem(i.id, { starred: !i.starred })} className={cx('ml-auto', i.starred ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600')}><Star size={16} fill={i.starred ? 'currentColor' : 'none'} /></button>
                    </div>
                    <button onClick={() => setEditing(i)} className={cx('block text-left font-medium', i.status === 'done' && 'line-through muted')}>{i.title}</button>
                    {i.notes && <p className="mt-1 line-clamp-2 text-xs muted">{i.notes}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="chip" style={{ background: STATUS_META[i.status].color + '1f', color: STATUS_META[i.status].color }}>{STATUS_META[i.status].label}</span>
                      <span className="chip bg-slate-200/70 dark:bg-white/[.06]">{HORIZON_META[i.horizon]}</span>
                      <button onClick={() => toggleItemDone(i.id)} className="ml-auto text-emerald-500">{i.status === 'done' ? <CheckCircle2 size={18} /> : <Circle size={18} />}</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {filtered.length > limit && (
            <div className="text-center"><button className="btn-outline" onClick={() => setLimit(limit + PAGE * 2)}>Show more ({filtered.length - limit} remaining)</button></div>
          )}
        </div>
      )}
      <ItemEditor item={editing} onClose={() => setEditing(null)} />
      <TemplatePicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}
