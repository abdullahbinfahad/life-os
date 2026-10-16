import { CheckCircle2, Circle, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader, Progress, Ring } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Goal } from '../lib/types';
import { cx, daysBetween, fmtDate, pct, today, uid } from '../lib/utils';

export default function Goals() {
  const { goals, items, projects, categories, addGoal, updateGoal, deleteGoal } = useStore();
  const catMap = useCategoryMap();
  const [filter, setFilter] = useState<'active' | 'paused' | 'done' | 'all'>('active');
  const [edit, setEdit] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', targetDate: '' });
  const [ms, setMs] = useState<Record<string, string>>({});

  const list = goals.filter((g) => filter === 'all' || g.status === filter);
  const progress = (g: Goal) => {
    const linked = items.filter((i) => i.goalId === g.id);
    const tot = g.milestones.length + linked.length;
    const done = g.milestones.filter((m) => m.done).length + linked.filter((i) => i.status === 'done').length;
    return pct(done, tot);
  };

  const create = () => {
    if (!form.title.trim()) return;
    addGoal({ ...form, targetDate: form.targetDate || undefined });
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '', targetDate: '' });
    setCreating(false);
  };
  const addMilestone = (g: Goal) => {
    const v = ms[g.id]?.trim();
    if (!v) return;
    updateGoal(g.id, { milestones: [...g.milestones, { id: uid(), title: v, done: false }] });
    setMs({ ...ms, [g.id]: '' });
  };

  return (
    <div>
      <PageHeader title="Goals" subtitle="Outcomes, milestones, and progress" actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New goal</button>} />
      <div className="mb-5 flex gap-1">
        {(['active', 'paused', 'done', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('btn capitalize', filter === f ? 'bg-indigo-600 text-white' : 'btn-ghost')}>{f} <span className="text-xs opacity-60">{goals.filter((g) => f === 'all' || g.status === f).length}</span></button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon={<Target size={28} />} title="No goals here" text="Goals are meaningful outcomes. Break them into milestones and link library items and projects to track progress." action={<button className="btn-primary" onClick={() => setCreating(true)}>Create a goal</button>} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {list.map((g) => {
            const p = progress(g);
            const c = catMap[g.categoryId];
            const left = g.targetDate ? daysBetween(today(), g.targetDate) : null;
            const linkedProjects = projects.filter((x) => x.goalId === g.id);
            const linkedItems = items.filter((i) => i.goalId === g.id);
            return (
              <div key={g.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <Ring value={p} size={72} color={c?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold leading-snug">{g.title}</h3>
                      <select className="rounded-lg bg-transparent text-xs muted outline-none" value={g.status} onChange={(e) => updateGoal(g.id, { status: e.target.value as any })}>
                        <option value="active">Active</option><option value="paused">Paused</option><option value="done">Achieved</option>
                      </select>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CatBadge cat={c} />
                      {g.targetDate && <span className={cx('chip', left! < 0 ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-200/70 dark:bg-white/[.06]')}>{fmtDate(g.targetDate)} · {left! < 0 ? `${-left!}d over` : `${left}d left`}</span>}
                    </div>
                    {g.description && <p className="mt-2 text-sm muted">{g.description}</p>}
                  </div>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="label">Milestones</div>
                  {g.milestones.map((m) => (
                    <div key={m.id} className="group flex items-center gap-2 text-sm">
                      <button className={m.done ? 'text-emerald-500' : 'muted'} onClick={() => updateGoal(g.id, { milestones: g.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })}>
                        {m.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                      <span className={cx('flex-1', m.done && 'line-through muted')}>{m.title}</span>
                      <button className="opacity-0 group-hover:opacity-100 muted" onClick={() => updateGoal(g.id, { milestones: g.milestones.filter((x) => x.id !== m.id) })}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <input className="input mt-2 !py-1.5" placeholder="+ Add milestone, press Enter" value={ms[g.id] ?? ''} onChange={(e) => setMs({ ...ms, [g.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addMilestone(g)} />
                </div>
                {(linkedItems.length > 0 || linkedProjects.length > 0) && (
                  <div className="mt-4 border-t border-slate-200 pt-3 text-xs muted dark:border-white/[.06]">
                    {linkedItems.length} linked items · {linkedProjects.length} projects
                    {linkedProjects.map((lp) => <Progress key={lp.id} className="mt-2" value={pct(lp.tasks.filter((x) => x.done).length, lp.tasks.length)} color={c?.color} />)}
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-1">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEdit(g)}>Edit</button>
                  <button className="btn-ghost !px-2 !py-1 text-xs text-rose-500" onClick={() => confirm('Delete goal?') && deleteGoal(g.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New goal">
        <div className="space-y-3">
          <div><label className="label">Goal</label><input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Become fluent in Mandarin" /></div>
          <div><label className="label">Why it matters</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category</label><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
            <div><label className="label">Target date</label><input type="date" className="input" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></div>
        </div>
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit goal">
        {edit && (
          <div className="space-y-3">
            <div><label className="label">Goal</label><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div><label className="label">Why it matters</label><textarea className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Category</label><select className="input" value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
              <div><label className="label">Target date</label><input type="date" className="input" value={edit.targetDate ?? ''} onChange={(e) => setEdit({ ...edit, targetDate: e.target.value || undefined })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={() => { const { status, ...rest } = edit; updateGoal(edit.id, rest); setEdit(null); }}>Save</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
