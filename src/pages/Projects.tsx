import { translate as tr } from '../lib/locales';
import { CheckCircle2, Circle, FolderKanban, Link2, Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CatBadge, Empty, Modal, PageHeader, Progress } from '../components/ui';
import { useCategoryMap, useStore } from '../lib/store';
import type { Project } from '../lib/types';
import { cx, fmtDate, pct, today } from '../lib/utils';

const COLS: { id: Project['status']; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#64748b' },
  { id: 'active', label: 'Active', color: '#3b82f6' },
  { id: 'on-hold', label: 'On hold', color: '#f59e0b' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];

export default function Projects() {
  const { projects, goals, categories, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask } = useStore();
  const catMap = useCategoryMap();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
  const [taskText, setTaskText] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId) ?? null;

  const create = () => {
    if (!form.title.trim()) return;
    const id = addProject({ ...form, goalId: form.goalId || undefined, dueDate: form.dueDate || undefined });
    setCreating(false);
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '', goalId: '', dueDate: '' });
    setOpenId(id);
  };
  const blocked = (p: Project, depIds: string[]) => depIds.some((d) => !p.tasks.find((t) => t.id === d)?.done);

  return (
    <div>
      <PageHeader title={tr("Projects")} subtitle={tr("Plans, tasks, and dependencies — drag cards between columns")} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {tr("New project")}</button>} />
      {projects.length === 0 ? (
        <Empty icon={<FolderKanban size={28} />} title={tr("No projects yet")} text="Projects turn goals into action. Add tasks, set due dates and dependencies." action={<button className="btn-primary" onClick={() => setCreating(true)}>{tr("Create project")}</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((col) => (
            <div key={col.id} className="rounded-2xl bg-slate-100/70 p-3 dark:bg-white/[.02]"
              onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) updateProject(dragId, { status: col.id }); setDragId(null); }}>
              <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />{col.label}
                <span className="muted text-xs">{projects.filter((p) => p.status === col.id).length}</span>
              </div>
              <div className="min-h-[80px] space-y-3">
                {projects.filter((p) => p.status === col.id).map((p) => {
                  const d = p.tasks.filter((t) => t.done).length;
                  return (
                    <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onClick={() => setOpenId(p.id)}
                      className="card cursor-pointer !bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg dark:!bg-[#141821]">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5"><CatBadge cat={catMap[p.categoryId]} />
                        {p.dueDate && <span className={cx('chip', p.dueDate < today() && p.status !== 'done' ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-200/70 dark:bg-white/[.06]')}>{fmtDate(p.dueDate)}</span>}</div>
                      <div className="mt-3 flex items-center gap-2 text-xs muted"><Progress value={pct(d, p.tasks.length)} color={col.color} /><span>{d}/{p.tasks.length}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr("New project")}>
        <div className="space-y-3">
          <div><label className="label">{tr("Project name")}</label><input autoFocus className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">{tr("Description")}</label><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{tr("Category")}</label><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
            <div><label className="label">{tr("Due date")}</label><input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">{tr("Supports goal")}</label><select className="input" value={form.goalId} onChange={(e) => setForm({ ...form, goalId: e.target.value })}><option value="">{tr("— None —")}</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={() => setCreating(false)}>{tr("Cancel")}</button><button className="btn-primary" onClick={create}>{tr("Create")}</button></div>
        </div>
      </Modal>

      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.title ?? ''} wide>
        {open && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <CatBadge cat={catMap[open.categoryId]} />
              <select className="input !w-auto !py-1" value={open.status} onChange={(e) => updateProject(open.id, { status: e.target.value as any })}>{COLS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              <input type="date" className="input !w-auto !py-1" value={open.dueDate ?? ''} onChange={(e) => updateProject(open.id, { dueDate: e.target.value || undefined })} />
              <select className="input !w-auto !py-1" value={open.goalId ?? ''} onChange={(e) => updateProject(open.id, { goalId: e.target.value || undefined })}><option value="">{tr("No goal")}</option>{goals.map((g) => <option key={g.id} value={g.id}>🎯 {g.title}</option>)}</select>
            </div>
            <textarea className="input mb-4" placeholder={tr("Description / plan…")} value={open.description} onChange={(e) => updateProject(open.id, { description: e.target.value })} />
            <div className="mb-2 flex items-center gap-3"><div className="label !mb-0">{tr("Tasks")}</div><Progress value={pct(open.tasks.filter((t) => t.done).length, open.tasks.length)} /><span className="text-xs muted">{pct(open.tasks.filter((t) => t.done).length, open.tasks.length)}%</span></div>
            <div className="space-y-1">
              {open.tasks.map((t) => {
                const isBlocked = !t.done && blocked(open, t.dependsOn);
                return (
                  <div key={t.id} className="group flex flex-wrap items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/[.03]">
                    <button disabled={isBlocked} onClick={() => updateTask(open.id, t.id, { done: !t.done })} className={t.done ? 'text-emerald-500' : 'muted'}>
                      {isBlocked ? <Lock size={18} className="text-amber-500" /> : t.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <span className={cx('flex-1 text-sm', t.done && 'line-through muted')}>{t.title}</span>
                    {t.dependsOn.length > 0 && <span className="chip bg-amber-500/10 text-amber-600"><Link2 size={11} /> {tr("after")}{t.dependsOn.map((d) => open.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(', ')}</span>}
                    <input type="date" className="rounded-lg bg-transparent text-xs muted outline-none" value={t.dueDate ?? ''} onChange={(e) => updateTask(open.id, t.id, { dueDate: e.target.value || undefined })} />
                    <select className="max-w-[120px] rounded-lg bg-transparent text-xs muted outline-none" value="" title={tr("Add dependency")}
                      onChange={(e) => e.target.value && updateTask(open.id, t.id, { dependsOn: t.dependsOn.includes(e.target.value) ? t.dependsOn.filter((x) => x !== e.target.value) : [...t.dependsOn, e.target.value] })}>
                      <option value="">{tr("+ depends on…")}</option>
                      {open.tasks.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>{t.dependsOn.includes(x.id) ? '✓ ' : ''}{x.title}</option>)}
                    </select>
                    <button className="opacity-0 group-hover:opacity-100 muted" onClick={() => deleteTask(open.id, t.id)}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input className="input" placeholder={tr("Add a task…")} value={taskText} onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && taskText.trim()) { addTask(open.id, taskText.trim(), taskDue || undefined); setTaskText(''); } }} />
              <input type="date" className="input !w-auto" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
              <button className="btn-primary" onClick={() => { if (taskText.trim()) { addTask(open.id, taskText.trim(), taskDue || undefined); setTaskText(''); } }}><Plus size={16} /></button>
            </div>
            <div className="mt-6 flex justify-end"><button className="btn-ghost text-rose-500" onClick={() => { if (confirm('Delete project?')) { deleteProject(open.id); setOpenId(null); } }}><Trash2 size={15} /> {tr("Delete project")}</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
