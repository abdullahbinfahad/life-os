import { Download, Lock, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { csvEscape, download, parseCSV, today } from '../lib/utils';

export default function Settings() {
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState({ name: '', icon: '⭐', color: '#6366f1' });
  const [msg, setMsg] = useState('');

  const exportJSON = () => {
    const { categories, items, goals, projects, habits, journal, albums, settings } = useStore.getState();
    download(`life-circle-backup-${today()}.json`, JSON.stringify({ version: 3, categories, items, goals, projects, habits, journal, albums, settings }, null, 2));
  };
  const exportCSV = () => {
    const head = ['title', 'category', 'status', 'priority', 'horizon', 'type', 'dueDate', 'tags', 'notes'];
    const rows = s.items.map((i) => [i.title, s.categories.find((c) => c.id === i.categoryId)?.name, i.status, i.priority, i.horizon, i.type, i.dueDate, i.tags.join(';'), i.notes].map(csvEscape).join(','));
    download(`life-os-library-${today()}.csv`, [head.join(','), ...rows].join('\n'), 'text/csv');
  };
  const importJSON = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('This will REPLACE all current data. Continue?')) return;
      s.importAll(data);
      setMsg('Backup restored.');
    } catch { setMsg('Invalid backup file.'); }
  };
  const importCSV = async (f: File) => {
    const rows = parseCSV(await f.text());
    if (!rows.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.includes('title');
    const idx = (k: string) => head.indexOf(k);
    const body = hasHeader ? rows.slice(1) : rows;
    const items = body.map((r) => {
      const g = (k: string) => (hasHeader && idx(k) >= 0 ? r[idx(k)]?.trim() : undefined);
      const catName = g('category')?.toLowerCase();
      const cat = s.categories.find((c) => c.name.toLowerCase() === catName || c.id === catName);
      return {
        title: hasHeader ? g('title') ?? '' : r[0],
        categoryId: cat?.id,
        status: (g('status') as any) || undefined,
        priority: g('priority') ? (Number(g('priority')) as any) : undefined,
        horizon: (g('horizon') as any) || undefined,
        dueDate: g('duedate') || undefined,
        tags: g('tags') ? g('tags')!.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [],
        notes: g('notes') ?? '',
      };
    }).filter((i) => i.title).map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as any);
    s.addItems(items);
    setMsg(`Imported ${items.length} items.`);
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Templates, imports, exports, privacy" />
      {msg && <div className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</div>}

      <section className="card mb-6 p-6">
        <h3 className="mb-4 font-semibold">Profile & preferences</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Your name</label><input className="input" value={s.settings.name} onChange={(e) => s.updateSettings({ name: e.target.value })} /></div>
          <div><label className="label">Profile photo URL</label><input className="input" type="url" placeholder="https://…" value={s.settings.avatarUrl ?? ''} onChange={(e) => s.updateSettings({ avatarUrl: e.target.value || undefined })} /></div>
          <div><label className="label">Birthday</label><input className="input" type="date" value={s.settings.birthday ?? ''} onChange={(e) => s.updateSettings({ birthday: e.target.value || undefined })} /></div>
          <div><label className="label">Location</label><input className="input" placeholder="City, country" value={s.settings.location ?? ''} onChange={(e) => s.updateSettings({ location: e.target.value || undefined })} /></div>
          <div><label className="label">Theme</label><select className="input" value={s.settings.theme} onChange={(e) => s.updateSettings({ theme: e.target.value as any })}><option value="dark">Dark</option><option value="light">Light</option></select></div>
          <div><label className="label">Week starts</label><select className="input" value={s.settings.weekStartsMonday ? 'mon' : 'sun'} onChange={(e) => s.updateSettings({ weekStartsMonday: e.target.value === 'mon' })}><option value="mon">Monday</option><option value="sun">Sunday</option></select></div>
          <div className="sm:col-span-3"><label className="label">Short bio</label><textarea className="input min-h-20" placeholder="What matters to you?" value={s.settings.bio ?? ''} onChange={(e) => s.updateSettings({ bio: e.target.value || undefined })} /></div>
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-1 font-semibold">Categories</h3>
        <p className="mb-4 text-sm muted">Organize your life areas. Deleting a category moves its items to another.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-white/[.06]">
              <input className="w-10 rounded-lg bg-transparent text-center text-lg outline-none" value={c.icon} onChange={(e) => s.updateCategory(c.id, { icon: e.target.value })} />
              <input type="color" className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" value={c.color} onChange={(e) => s.updateCategory(c.id, { color: e.target.value })} />
              <input className="flex-1 bg-transparent text-sm outline-none" value={c.name} onChange={(e) => s.updateCategory(c.id, { name: e.target.value })} />
              <span className="text-xs muted">{s.items.filter((i) => i.categoryId === c.id).length}</span>
              <button className="btn-ghost !p-1.5 text-rose-500" onClick={() => confirm(`Delete category "${c.name}"?`) && s.deleteCategory(c.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="input !w-16 text-center" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} />
          <input type="color" className="h-10 w-10 cursor-pointer rounded-xl" value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} />
          <input className="input" placeholder="New category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <button className="btn-primary" onClick={() => { if (newCat.name.trim()) { s.addCategory(newCat); setNewCat({ name: '', icon: '⭐', color: '#6366f1' }); } }}><Plus size={16} /></button>
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-1 font-semibold">Import & export</h3>
        <p className="mb-4 text-sm muted">CSV import accepts a header row with: <code>title, category, status, priority, horizon, dueDate, tags, notes</code> — or just one title per line.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={exportJSON}><Download size={16} /> Full backup (JSON)</button>
          <button className="btn-outline" onClick={exportCSV}><Download size={16} /> Library (CSV)</button>
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore backup</button>
          <button className="btn-outline" onClick={() => csvRef.current?.click()}><Upload size={16} /> Import CSV</button>
          <button className="btn-outline" onClick={() => { s.loadDemo(); setMsg('Demo data added.'); }}>Load demo data</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
          <input ref={csvRef} type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} />
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Lock size={16} /> Privacy</h3>
        <p className="text-sm muted">Life OS is local-first. All your data is stored only in this browser (localStorage). Nothing is sent to any server. Export a backup regularly to keep it safe or move it to another device.</p>
        <div className="mt-3 text-xs muted">{s.items.length} items · {s.goals.length} goals · {s.projects.length} projects · {s.habits.length} habits · {s.journal.length} journal entries · {s.albums.length} albums</div>
        <button className="btn-danger mt-4" onClick={() => { if (confirm('Erase ALL data permanently? Export a backup first!') && confirm('Are you absolutely sure?')) { s.resetAll(); setMsg('All data erased.'); } }}><Trash2 size={16} /> Erase all data</button>
      </section>

      <section className="card p-6">
        <h3 className="mb-3 font-semibold">Keyboard shortcuts</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[['N', 'Quick add'], ['⌘/Ctrl + K', 'Search & command palette'], ['G then O/T/L/G/P/C/H/I/J/S', 'Go to page'], ['⌘/Ctrl + Enter', 'Submit quick add']].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/[.04]"><span>{v}</span><kbd className="text-xs font-mono muted">{k}</kbd></div>
          ))}
        </div>
      </section>
    </div>
  );
}
