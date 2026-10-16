import { CheckSquare, Copy, ExternalLink, Plus, Square, Star, Sunrise, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { LifeItem } from '../lib/types';
import { addDays, cx, fmtDate, today, uid } from '../lib/utils';
import { toast } from './Toaster';
import { HORIZON_META, Modal, PRIORITY_META, Progress, STATUS_META, TYPE_META } from './ui';

export function TagInput({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [v, setV] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    const next = [...tags];
    parts.forEach((p) => { if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p); });
    onChange(next);
    setV('');
  };
  const sugg = suggestions.filter((s) => !tags.includes(s) && (!v || s.toLowerCase().includes(v.toLowerCase()))).slice(0, 6);
  return (
    <div>
      <div className="input flex min-h-[42px] flex-wrap items-center gap-1.5 !py-1.5">
        {tags.map((t) => (
          <span key={t} className="chip bg-indigo-500/10 text-indigo-500">#{t}<button onClick={() => onChange(tags.filter((x) => x !== t))}><X size={11} /></button></span>
        ))}
        <input className="min-w-[80px] flex-1 bg-transparent outline-none" value={v} placeholder={tags.length ? '' : 'Add tag and press Enter'}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && v.trim()) { e.preventDefault(); add(v); }
            if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={() => v.trim() && add(v)} />
      </div>
      {sugg.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">{sugg.map((s) => <button key={s} className="chip bg-slate-200/70 text-xs dark:bg-white/[.06]" onClick={() => add(s)}>+ {s}</button>)}</div>
      )}
    </div>
  );
}

export default function ItemEditor({ item, onClose }: { item: LifeItem | null; onClose: () => void }) {
  const { categories, goals, items, updateItem, deleteItems, restoreItems, duplicateItems } = useStore();
  const [d, setD] = useState<LifeItem | null>(item);
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setD(item); setErr(''); setStep(''); }, [item]);
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))].sort(), [items]);
  if (!d) return null;

  const f = (patch: Partial<LifeItem>) => setD({ ...d, ...patch });
  const checklist = d.checklist ?? [];
  const doneSteps = checklist.filter((c) => c.done).length;
  const dirty = JSON.stringify(d) !== JSON.stringify(item);
  const dupTitle = items.some((i) => i.id !== d.id && i.title.trim().toLowerCase() === d.title.trim().toLowerCase());

  const close = () => { if (dirty && !confirm('Discard unsaved changes?')) return; onClose(); };
  const save = () => {
    const title = d.title.trim();
    if (!title) return setErr('Title cannot be empty.');
    if (title.length > 200) return setErr('Title is too long (max 200 characters).');
    if (d.url && !/^https?:\/\/\S+\.\S+/.test(d.url)) return setErr('Link must start with http:// or https://');
    const patch: Partial<LifeItem> = { ...d, title };
    if (d.status === 'done' && item?.status !== 'done') patch.completedAt = new Date().toISOString();
    if (d.status !== 'done') patch.completedAt = undefined;
    updateItem(d.id, patch);
    onClose();
  };
  const remove = () => {
    const removed = deleteItems([d.id]);
    onClose();
    toast('Item deleted', { label: 'Undo', run: () => restoreItems(removed) });
  };
  const addStep = () => {
    const lines = step.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    f({ checklist: [...checklist, ...lines.map((title) => ({ id: uid(), title, done: false }))] });
    setStep('');
  };

  return (
    <Modal open={!!item} onClose={close} title="Edit item" wide>
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <input className="input !text-base font-semibold" value={d.title} maxLength={200} autoFocus
                onChange={(e) => { f({ title: e.target.value }); setErr(''); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()} />
              <button className={cx('btn-ghost !p-2', d.starred && 'text-amber-400')} onClick={() => f({ starred: !d.starred })} title="Star"><Star size={18} fill={d.starred ? 'currentColor' : 'none'} /></button>
            </div>
            {dupTitle && <p className="mt-1 text-xs text-amber-500">You already have an item with this title.</p>}
          </div>
          <div><label className="label">Notes</label><textarea className="input min-h-[90px]" value={d.notes} onChange={(e) => f({ notes: e.target.value })} placeholder="Why does this matter? How will you do it?" /></div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Steps / checklist {checklist.length > 0 && <span className="normal-case">· {doneSteps}/{checklist.length}</span>}</label>
              {checklist.length > 0 && <button className="text-xs text-indigo-500 hover:underline" onClick={() => f({ checklist: checklist.map((c) => ({ ...c, done: doneSteps !== checklist.length })) })}>{doneSteps === checklist.length ? 'Uncheck all' : 'Check all'}</button>}
            </div>
            {checklist.length > 0 && <Progress value={(doneSteps / checklist.length) * 100} className="mb-2" color="#22c55e" />}
            <div className="space-y-1">
              {checklist.map((c, idx) => (
                <div key={c.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-white/[.03]">
                  <button className={c.done ? 'text-emerald-500' : 'muted'} onClick={() => f({ checklist: checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}>{c.done ? <CheckSquare size={17} /> : <Square size={17} />}</button>
                  <input className={cx('flex-1 bg-transparent text-sm outline-none', c.done && 'line-through muted')} value={c.title} onChange={(e) => f({ checklist: checklist.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) })} />
                  <div className="flex opacity-0 group-hover:opacity-100">
                    <button disabled={idx === 0} className="px-1 text-xs muted disabled:opacity-30" onClick={() => { const n = [...checklist]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; f({ checklist: n }); }}>↑</button>
                    <button disabled={idx === checklist.length - 1} className="px-1 text-xs muted disabled:opacity-30" onClick={() => { const n = [...checklist]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; f({ checklist: n }); }}>↓</button>
                    <button className="px-1 text-rose-500" onClick={() => f({ checklist: checklist.filter((x) => x.id !== c.id) })}><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <input className="input !py-1.5" placeholder="Add a step (paste many lines at once)" value={step} onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
                onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); setStep(t); setTimeout(() => {}, 0); } }} />
              <button className="btn-outline !py-1.5" onClick={addStep}><Plus size={15} /></button>
            </div>
          </div>

          <div><label className="label">Tags</label><TagInput tags={d.tags} onChange={(tags) => f({ tags })} suggestions={allTags} /></div>
          <div>
            <label className="label">Link (optional)</label>
            <div className="flex gap-2">
              <input className="input" type="url" placeholder="https://…" value={d.url ?? ''} onChange={(e) => f({ url: e.target.value || undefined })} />
              {d.url && /^https?:\/\//.test(d.url) && <a className="btn-outline" href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /></a>}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div><label className="label">Status</label>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(STATUS_META).map(([k, v]) => (
                <button key={k} onClick={() => f({ status: k as any })} className={cx('rounded-lg border px-2 py-1.5 text-xs font-medium transition', d.status === k ? 'border-transparent text-white' : 'border-slate-200 dark:border-white/10')}
                  style={d.status === k ? { background: v.color } : { color: v.color }}>{v.label}</button>
              ))}
            </div></div>
          <div><label className="label">Priority</label>
            <div className="grid grid-cols-4 gap-1">
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <button key={k} title={v.label} onClick={() => f({ priority: Number(k) as any })} className={cx('rounded-lg border py-1.5 text-xs font-semibold', d.priority === Number(k) ? 'border-transparent text-white' : 'border-slate-200 dark:border-white/10')}
                  style={d.priority === Number(k) ? { background: v.color } : { color: v.color }}>P{k}</button>
              ))}
            </div></div>
          <div><label className="label">Category</label>
            <select className="input" value={d.categoryId} onChange={(e) => f({ categoryId: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Type</label>
              <select className="input" value={d.type} onChange={(e) => f({ type: e.target.value as any })}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="label">Horizon</label>
              <select className="input" value={d.horizon} onChange={(e) => f({ horizon: e.target.value as any })}>
                {Object.entries(HORIZON_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <div><label className="label">Due date</label>
            <input type="date" className="input" value={d.dueDate ?? ''} onChange={(e) => f({ dueDate: e.target.value || undefined })} />
            <div className="mt-1 flex flex-wrap gap-1">
              {[['Today', 0], ['Tomorrow', 1], ['+1 week', 7], ['+1 month', 30], ['+1 year', 365]].map(([l, n]) => (
                <button key={l} className="chip bg-slate-200/70 dark:bg-white/[.06]" onClick={() => f({ dueDate: addDays(today(), n as number) })}>{l}</button>
              ))}
              {d.dueDate && <button className="chip text-rose-500" onClick={() => f({ dueDate: undefined })}>Clear</button>}
            </div></div>
          <div><label className="label">Progress · {d.progress ?? 0}%</label>
            <input type="range" min={0} max={100} step={5} className="w-full accent-indigo-600" value={d.progress ?? 0} onChange={(e) => f({ progress: Number(e.target.value) })} /></div>
          <div><label className="label">Linked goal</label>
            <select className="input" value={d.goalId ?? ''} onChange={(e) => f({ goalId: e.target.value || undefined })}>
              <option value="">— None —</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select></div>
          <button className={cx('btn-outline w-full', d.todayDate === today() && '!border-amber-400 text-amber-500')}
            onClick={() => f(d.todayDate === today() ? { todayDate: undefined } : { todayDate: today(), status: d.status === 'someday' ? 'next' : d.status })}>
            <Sunrise size={15} /> {d.todayDate === today() ? 'On Today ✓' : 'Add to Today'}
          </button>
          <p className="text-[11px] muted">Created {fmtDate(d.createdAt)}{d.updatedAt ? ` · edited ${fmtDate(d.updatedAt)}` : ''}{d.completedAt ? ` · done ${fmtDate(d.completedAt)}` : ''}</p>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{err}</div>}
      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
        <div className="flex gap-2">
          <button className="btn-ghost text-rose-500" onClick={remove}><Trash2 size={15} /> Delete</button>
          <button className="btn-ghost" onClick={() => { duplicateItems([d.id]); onClose(); toast('Item duplicated'); }}><Copy size={15} /> Duplicate</button>
        </div>
        <div className="flex gap-2"><button className="btn-ghost" onClick={close}>Cancel</button><button className="btn-primary" onClick={save}>Save <kbd className="text-[10px] opacity-70">⌘↵</kbd></button></div>
      </div>
    </Modal>
  );
}
