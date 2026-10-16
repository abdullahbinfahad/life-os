import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import type { LifeItem } from '../lib/types';
import { HORIZON_META, Modal, PRIORITY_META, STATUS_META, TYPE_META } from './ui';

export default function ItemEditor({ item, onClose }: { item: LifeItem | null; onClose: () => void }) {
  const { categories, goals, updateItem, deleteItems } = useStore();
  const [d, setD] = useState<LifeItem | null>(item);
  useEffect(() => setD(item), [item]);
  if (!d) return null;
  const f = (patch: Partial<LifeItem>) => setD({ ...d, ...patch });
  const save = () => {
    const patch: Partial<LifeItem> = { ...d };
    if (d.status === 'done' && item?.status !== 'done') patch.completedAt = new Date().toISOString();
    if (d.status !== 'done') patch.completedAt = undefined;
    updateItem(d.id, patch);
    onClose();
  };
  return (
    <Modal open={!!item} onClose={onClose} title="Edit item">
      <div className="space-y-4">
        <div><label className="label">Title</label><input className="input" value={d.title} onChange={(e) => f({ title: e.target.value })} /></div>
        <div><label className="label">Notes</label><textarea className="input min-h-[80px]" value={d.notes} onChange={(e) => f({ notes: e.target.value })} placeholder="Why does this matter? How will you do it?" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Category</label>
            <select className="input" value={d.categoryId} onChange={(e) => f({ categoryId: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select></div>
          <div><label className="label">Type</label>
            <select className="input" value={d.type} onChange={(e) => f({ type: e.target.value as any })}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label">Status</label>
            <select className="input" value={d.status} onChange={(e) => f({ status: e.target.value as any })}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div><label className="label">Priority</label>
            <select className="input" value={d.priority} onChange={(e) => f({ priority: Number(e.target.value) as any })}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div><label className="label">Horizon</label>
            <select className="input" value={d.horizon} onChange={(e) => f({ horizon: e.target.value as any })}>
              {Object.entries(HORIZON_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label">Due date</label><input type="date" className="input" value={d.dueDate ?? ''} onChange={(e) => f({ dueDate: e.target.value || undefined })} /></div>
          <div className="col-span-2"><label className="label">Linked goal</label>
            <select className="input" value={d.goalId ?? ''} onChange={(e) => f({ goalId: e.target.value || undefined })}>
              <option value="">— None —</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select></div>
          <div className="col-span-2"><label className="label">Tags (comma separated)</label>
            <input className="input" value={d.tags.join(', ')} onChange={(e) => f({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>
        </div>
        <div className="flex justify-between pt-2">
          <button className="btn-danger" onClick={() => { if (confirm('Delete this item?')) { deleteItems([d.id]); onClose(); } }}>Delete</button>
          <div className="flex gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></div>
        </div>
      </div>
    </Modal>
  );
}
