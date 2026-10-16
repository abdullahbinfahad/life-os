import { Archive, Flame, Plus, Repeat, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import { addDays, bestStreak, cx, pct, streak, today } from '../lib/utils';

export default function Habits() {
  const { habits, categories, addHabit, toggleHabit, updateHabit, deleteHabit } = useStore();
  const catMap = useCategoryMap();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', categoryId: 'health', frequency: 'daily' as 'daily' | 'weekly', targetPerWeek: 7 });
  const [showArchived, setShowArchived] = useState(false);
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const heat = Array.from({ length: 84 }, (_, i) => addDays(t, i - 83));
  const list = habits.filter((h) => h.archived === showArchived);
  const SUGGEST = ['Drink 2L water', 'Read 20 pages', 'Morning workout', 'Meditate 10 min', 'Journal', 'No social media before noon', 'Walk 10k steps', 'Learn a language 15 min', 'Pray on time', 'Sleep before 11pm'];

  return (
    <div>
      <PageHeader title="Habits" subtitle="Recurring actions and consistency" actions={<>
        <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)}><Archive size={16} /> {showArchived ? 'Active' : 'Archived'}</button>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New habit</button></>} />

      {list.length === 0 ? (
        <Empty icon={<Repeat size={28} />} title={showArchived ? 'No archived habits' : 'Build your first habit'} text="Small daily actions compound into a different life."
          action={!showArchived && <div className="flex max-w-lg flex-wrap justify-center gap-2">{SUGGEST.map((s) => <button key={s} className="chip border border-slate-200 px-3 py-1.5 text-sm hover:border-indigo-400 dark:border-white/10" onClick={() => addHabit({ title: s })}><Plus size={12} />{s}</button>)}</div>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[.06]">
                <th className="p-4 text-left font-medium muted">Habit</th>
                {week.map((d) => <th key={d} className={cx('w-12 p-2 text-center text-xs font-medium', d === t ? 'text-indigo-500' : 'muted')}>{new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}<div>{d.slice(8)}</div></th>)}
                <th className="p-2 text-center text-xs font-medium muted">Streak</th>
                <th className="p-2 text-center text-xs font-medium muted">Best</th>
                <th className="p-2 text-center text-xs font-medium muted">30d</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => {
                const last30 = Array.from({ length: 30 }, (_, i) => addDays(t, -i)).filter((d) => h.log.includes(d)).length;
                const target30 = h.frequency === 'daily' ? 30 : Math.round((h.targetPerWeek * 30) / 7);
                return (
                  <tr key={h.id} className="group border-b border-slate-100 last:border-0 dark:border-white/[.04]">
                    <td className="p-4"><div className="font-medium">{h.title}</div><div className="mt-1"><CatBadge cat={catMap[h.categoryId]} /></div></td>
                    {week.map((d) => {
                      const on = h.log.includes(d);
                      return (
                        <td key={d} className="p-2 text-center">
                          <button onClick={() => toggleHabit(h.id, d)} className={cx('h-8 w-8 rounded-lg transition', on ? 'scale-100 shadow-md' : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/[.05] dark:hover:bg-white/10')}
                            style={on ? { background: catMap[h.categoryId]?.color ?? '#22c55e' } : {}}>{on && <span className="text-white">✓</span>}</button>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center"><span className="inline-flex items-center gap-1 font-semibold text-orange-500"><Flame size={14} />{streak(h.log)}</span></td>
                    <td className="p-2 text-center"><span className="inline-flex items-center gap-1 muted"><Trophy size={13} />{bestStreak(h.log)}</span></td>
                    <td className="p-2 text-center text-xs font-semibold">{pct(last30, target30)}%</td>
                    <td className="p-2">
                      <div className="flex opacity-0 group-hover:opacity-100">
                        <button className="btn-ghost !p-1.5" title="Archive" onClick={() => updateHabit(h.id, { archived: !h.archived })}><Archive size={14} /></button>
                        <button className="btn-ghost !p-1.5 text-rose-500" onClick={() => confirm('Delete habit?') && deleteHabit(h.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {list.map((h) => (
            <div key={h.id} className="card p-4">
              <div className="mb-3 text-sm font-medium">{h.title} · last 12 weeks</div>
              <div className="grid grid-flow-col grid-rows-7 gap-1">
                {heat.map((d) => <div key={d} title={d} className="aspect-square rounded-sm" style={{ background: h.log.includes(d) ? catMap[h.categoryId]?.color ?? '#22c55e' : 'rgb(148 163 184 / .15)' }} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New habit">
        <div className="space-y-3">
          <div><label className="label">Habit</label><input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Read 20 pages" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category</label><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
            <div><label className="label">Frequency</label><select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as any, targetPerWeek: e.target.value === 'daily' ? 7 : 3 })}><option value="daily">Daily</option><option value="weekly">X times / week</option></select></div>
            {form.frequency === 'weekly' && <div><label className="label">Times per week</label><input type="number" min={1} max={7} className="input" value={form.targetPerWeek} onChange={(e) => setForm({ ...form, targetPerWeek: Number(e.target.value) })} /></div>}
          </div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => { if (form.title.trim()) { addHabit(form); setCreating(false); setForm({ ...form, title: '' }); } }}>Create</button></div>
        </div>
      </Modal>
    </div>
  );
}
