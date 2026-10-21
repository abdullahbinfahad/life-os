import { Check, Download, ImagePlus, Lock, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { syncNow, useAuth } from '../lib/auth';
import { compressImage, deletePrivateImage, formatBytes, getPrivateImageUrl, uploadPrivateImage } from '../lib/media';
import type { Album, AlbumMemory, Settings as SettingsData, TrashRecord } from '../lib/types';
import { cloudEnabled } from '../lib/supabase';
import { csvEscape, download, parseCSV, today } from '../lib/utils';

export default function Settings() {
  const s = useStore();
  const { user, sync, syncError, lastSynced } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState({ name: '', icon: '⭐', color: '#6366f1' });
  const [msg, setMsg] = useState('');
  const [trashBusy, setTrashBusy] = useState(false);

  const exportJSON = () => {
    const { categories, items, goals, projects, habits, journal, albums, settings, trash } = useStore.getState();
    download(`life-circle-backup-${today()}.json`, JSON.stringify({ version: 4, categories, items, goals, projects, habits, journal, albums, settings, trash }, null, 2));
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

  const purgeRecord = async (record: TrashRecord, ask = true) => {
    if (ask && !confirm(`Permanently delete “${record.title}”? This cannot be undone.`)) return;
    if (trashBusy) return;
    const paths = trashImagePaths(record);
    if (paths.length && !user?.id) {
      setMsg('Sign in to permanently remove this record’s private photo files. The record remains in Trash.');
      return;
    }
    setTrashBusy(true);
    try {
      if (user?.id) await Promise.all(paths.map((path) => deletePrivateImage(user.id, path)));
      s.permanentlyDeleteFromTrash(record.id);
      setMsg(`“${record.title}” was permanently deleted.`);
    } catch (error) {
      setMsg(error instanceof Error ? `Could not permanently delete: ${error.message}` : 'Could not permanently delete this record.');
    } finally {
      setTrashBusy(false);
    }
  };

  const emptyTrash = async () => {
    if (!s.trash.length || trashBusy || !confirm('Permanently delete every item currently in Trash? This cannot be undone.')) return;
    setTrashBusy(true);
    let deleted = 0;
    let failed = 0;
    for (const record of [...s.trash]) {
      const paths = trashImagePaths(record);
      if (paths.length && !user?.id) { failed += 1; continue; }
      try {
        if (user?.id) await Promise.all(paths.map((path) => deletePrivateImage(user.id, path)));
        s.permanentlyDeleteFromTrash(record.id);
        deleted += 1;
      } catch { failed += 1; }
    }
    setTrashBusy(false);
    setMsg(failed ? `Permanently deleted ${deleted}; ${failed} record(s) remain in Trash because private media could not be removed.` : 'Trash emptied permanently.');
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Templates, imports, exports, privacy" />
      {msg && <div className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</div>}

      <section className="card mb-6 p-6">
        <h3 className="mb-4 font-semibold">Profile & preferences</h3>
        <div className="mb-5"><ProfilePhotoControl settings={s.settings} userId={user?.id} updateSettings={s.updateSettings} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Your name</label><input className="input" value={s.settings.name} onChange={(e) => s.updateSettings({ name: e.target.value })} /></div>
          <div><label className="label">Profile photo URL</label><input className="input" type="url" placeholder="https://…" value={s.settings.avatarUrl ?? ''} onChange={(e) => s.updateSettings({ avatarUrl: e.target.value || undefined })} /><p className="mt-1 text-xs muted">Optional external-image fallback. Private uploads are shown first.</p></div>
          <div><label className="label">Birthday</label><input className="input" type="date" value={s.settings.birthday ?? ''} onChange={(e) => s.updateSettings({ birthday: e.target.value || undefined })} /></div>
          <div><label className="label">Location</label><input className="input" placeholder="City, country" value={s.settings.location ?? ''} onChange={(e) => s.updateSettings({ location: e.target.value || undefined })} /></div>
          <div><label className="label">Week starts</label><select className="input" value={s.settings.weekStartsMonday ? 'mon' : 'sun'} onChange={(e) => s.updateSettings({ weekStartsMonday: e.target.value === 'mon' })}><option value="mon">Monday</option><option value="sun">Sunday</option></select></div>
          <div className="sm:col-span-3">
            <div className="mb-2"><span className="label">Appearance</span><p className="text-xs muted">Choose your look here. The sidebar stays focused on navigation.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                { value: 'dark', title: 'Night glass', detail: 'Your original dark theme', preview: 'linear-gradient(135deg,#182131,#0b0d12 62%,#253344)' },
                { value: 'forest', title: 'Emerald night', detail: 'Green-glass surfaces and soft ambient motion', preview: 'radial-gradient(ellipse at 78% 4%,rgba(52,211,153,.42),transparent 55%),linear-gradient(140deg,#13291f,#07100c 76%)' },
                { value: 'light', title: 'Clean light', detail: 'Your original bright theme', preview: 'linear-gradient(135deg,#dbeafe,#ffffff 52%,#d1fae5)' },
              ] as const).map((choice) => {
                const selected = s.settings.theme === choice.value;
                return <button key={choice.value} type="button" aria-pressed={selected} onClick={() => s.updateSettings({ theme: choice.value as SettingsData['theme'] })}
                  className={`theme-choice min-w-0 rounded-2xl border p-3 text-left transition duration-200 ${selected ? 'is-selected border-emerald-500 ring-2 ring-emerald-500/25' : 'border-slate-200 hover:border-emerald-400/70 dark:border-white/10'}`}>
                  <span className="theme-preview relative mb-3 flex h-14 items-end gap-1.5 overflow-hidden rounded-xl border border-black/5 p-2 dark:border-white/10" style={{ background: choice.preview }} aria-hidden="true">
                    <span className="h-2/3 w-[17%] rounded-t bg-white/15 backdrop-blur-sm" />
                    <span className="h-full w-[17%] rounded-t bg-emerald-400/65" />
                    <span className="h-1/2 w-[17%] rounded-t bg-white/20" />
                    <span className="mb-1 h-1 w-[28%] rounded-full bg-white/55" />
                    {choice.value === 'forest' && <span className="theme-preview-glow absolute -right-4 -top-5 h-16 w-16 rounded-full bg-emerald-300/35 blur-xl" />}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{choice.title}</span>{selected && <Check size={16} className="shrink-0 text-emerald-500" aria-label="Selected" />}</span>
                  <span className="mt-1 block text-xs leading-5 muted">{choice.detail}</span>
                </button>;
              })}
            </div>
          </div>
          <div className="sm:col-span-3"><label className="label">Short bio</label><textarea className="input min-h-20" placeholder="What matters to you?" value={s.settings.bio ?? ''} onChange={(e) => s.updateSettings({ bio: e.target.value || undefined })} /></div>
        </div>
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-1 font-semibold">Categories</h3>
        <p className="mb-4 text-sm muted">Organize your life areas. Deleting a category moves its items to another.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.categories.map((c) => (
            <div key={c.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-white/[.06]">
              <input className="w-10 rounded-lg bg-transparent text-center text-lg outline-none" value={c.icon} onChange={(e) => s.updateCategory(c.id, { icon: e.target.value })} />
              <input type="color" className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent" value={c.color} onChange={(e) => s.updateCategory(c.id, { color: e.target.value })} />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={c.name} onChange={(e) => s.updateCategory(c.id, { name: e.target.value })} />
              <span className="text-xs muted">{s.items.filter((i) => i.categoryId === c.id).length}</span>
              <button className="btn-ghost !p-1.5 text-rose-500" onClick={() => confirm(`Delete category "${c.name}"?`) && s.deleteCategory(c.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="input !w-16 shrink-0 text-center" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} aria-label="New category icon" />
          <input type="color" className="h-10 w-10 shrink-0 cursor-pointer rounded-xl" value={newCat.color} onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} aria-label="New category color" />
          <input className="input min-w-[120px] flex-1 basis-32" placeholder="New category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <button className="btn-primary shrink-0" aria-label="Add category" onClick={() => { if (newCat.name.trim()) { s.addCategory(newCat); setNewCat({ name: '', icon: '⭐', color: '#6366f1' }); } }}><Plus size={16} /></button>
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

      <section className="card mb-6 p-6" aria-labelledby="trash-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h3 id="trash-heading" className="font-semibold">Trash</h3><p className="mt-1 text-sm muted">Deleted items stay here until you restore them or permanently remove them.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium dark:bg-white/[.08]">{s.trash.length} item{s.trash.length === 1 ? '' : 's'}</span><button className="btn-danger !px-3 !py-1.5" disabled={!s.trash.length || trashBusy} onClick={() => void emptyTrash()}><Trash2 size={14} /> Empty trash</button></div>
        </div>
        {s.trash.length === 0 ? <p className="rounded-xl bg-slate-100/70 p-4 text-sm muted dark:bg-white/[.04]">Nothing in Trash. Deleted items will appear here.</p> : (
          <div className="space-y-2">
            {[...s.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map((record) => (
              <div key={record.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/[.08]">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{record.title}</div><div className="mt-0.5 text-xs muted">{record.entityType[0].toUpperCase() + record.entityType.slice(1)} · deleted {new Date(record.deletedAt).toLocaleString()}</div></div>
                <button className="btn-outline !px-2.5 !py-1.5" disabled={trashBusy} onClick={() => { if (s.restoreFromTrash(record.id)) setMsg(`“${record.title}” restored.`); else setMsg('Restore the parent project or album first, then restore this record.'); }}><RotateCcw size={14} /> Restore</button>
                <button className="btn-ghost !px-2.5 !py-1.5 text-rose-500" disabled={trashBusy} onClick={() => void purgeRecord(record)}><Trash2 size={14} /> Delete forever</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mb-6 p-6">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Lock size={16} /> Privacy</h3>
        <p className="text-sm muted">{user && cloudEnabled
          ? 'Your signed-in account is backed by private cloud sync. Database row-level security restricts your Life OS data to your account. Uploaded photos are stored in a private bucket and shown with signed URLs. A copy also stays in this browser for offline use.'
          : cloudEnabled
            ? 'Your data is saved on this device until you sign in. Sign in to protect it in your private cloud account and sync across devices. Direct photo uploads require sign-in so they are never embedded in local JSON.'
            : 'Your data is stored only in this browser. Configure cloud authentication to protect it in an account and sync across devices. Direct photo uploads require a private signed-in cloud account; external image URLs still work. Export a backup regularly.'}</p>
        {cloudEnabled && user && <div className={`mt-3 text-xs ${sync === 'error' ? 'text-rose-500' : 'muted'}`} role="status">
          {sync === 'error' ? `Cloud sync failed: ${syncError || 'Please retry.'}` : sync === 'saved' ? `Synced${lastSynced ? ` · ${new Date(lastSynced).toLocaleString()}` : ''}` : sync === 'offline' ? 'Offline · changes remain on this device and will sync when connected.' : sync === 'saving' ? 'Saving to your private cloud account…' : sync === 'loading' ? 'Loading your private cloud data…' : 'Cloud sync is ready.'}
        </div>}
        <div className="mt-3 text-xs muted">{s.items.length} items · {s.goals.length} goals · {s.projects.length} projects · {s.habits.length} habits · {s.journal.length} journal entries · {s.albums.length} albums</div>
        <button className="btn-danger mt-4" onClick={() => { if (confirm('Erase ALL data permanently? Export a backup first!') && confirm('Are you absolutely sure?')) { s.resetAll(); setMsg('All data erased.'); } }}><Trash2 size={16} /> Erase all data</button>
      </section>

      <section className="card p-6">
        <h3 className="mb-3 font-semibold">Keyboard shortcuts</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[['N', 'Quick add'], ['⌘/Ctrl + K', 'Search & command palette'], ['G then O/T/L/G/P/C/H/I/J/S', 'Go to page'], ['⌘/Ctrl + Enter', 'Submit quick add']].map(([k, v]) => (
            <div key={k} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/[.04]"><span className="min-w-0 break-words">{v}</span><kbd className="break-words text-right text-xs font-mono muted">{k}</kbd></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function trashImagePaths(record: TrashRecord): string[] {
  if (record.entityType === 'album') {
    const memories = (record.data as Album).memories ?? [];
    return memories.map((memory) => memory.imagePath).filter((path): path is string => Boolean(path));
  }
  if (record.entityType === 'memory') {
    const path = (record.data as AlbumMemory).imagePath;
    return path ? [path] : [];
  }
  return [];
}

function ProfilePhotoControl({ settings, userId, updateSettings }: { settings: SettingsData; userId?: string; updateSettings: (patch: Partial<SettingsData>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(settings.avatarUrl);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusIsError, setStatusIsError] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImageFailed(false);
    if (!settings.avatarPath || !userId) {
      setPreview(settings.avatarUrl);
      return () => { active = false; };
    }
    setPreview(undefined);
    getPrivateImageUrl(userId, settings.avatarPath).then((url) => {
      if (active) setPreview(url);
    }).catch((error) => {
      if (!active) return;
      setPreview(settings.avatarUrl);
      setStatus(error instanceof Error ? error.message : 'Could not load your private profile photo.');
    });
    return () => { active = false; };
  }, [settings.avatarPath, settings.avatarUrl, userId]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (!userId) {
      setStatusIsError(true);
      setStatus('Sign in to upload a private profile photo.');
      return;
    }
    setBusy(true);
    setStatusIsError(false);
    setImageFailed(false);
    let localPreview: string | undefined;
    try {
      setStatus('Preparing and compressing photo on this device…');
      const compressed = await compressImage(file);
      localPreview = URL.createObjectURL(compressed.file);
      setPreview(localPreview);
      setStatus(`Compressed ${formatBytes(compressed.originalBytes)} to ${formatBytes(compressed.file.size)}. Uploading privately…`);
      const nextPath = await uploadPrivateImage(userId, compressed.file, 'avatars');
      const nextUrl = await getPrivateImageUrl(userId, nextPath);
      const oldPath = settings.avatarPath;
      updateSettings({ avatarPath: nextPath });
      setPreview(nextUrl);
      const synced = await syncNow();
      if (!synced) {
        setStatusIsError(true);
        setStatus('Photo uploaded privately, but account sync did not finish. Retry sync before closing this page; the previous photo was kept safe.');
        return;
      }
      if (oldPath) {
        try {
          await deletePrivateImage(userId, oldPath);
        } catch {
          setStatusIsError(true);
          setStatus('Profile photo updated, but the previous private file could not be removed.');
          return;
        }
      }
      setStatusIsError(false);
      setStatus('Private profile photo updated.');
    } catch (error) {
      setStatusIsError(true);
      setPreview(settings.avatarUrl);
      if (settings.avatarPath) getPrivateImageUrl(userId, settings.avatarPath).then(setPreview).catch(() => setImageFailed(true));
      setStatus(error instanceof Error ? error.message : 'Could not update your profile photo.');
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    if (!settings.avatarPath && !settings.avatarUrl) return;
    if (!confirm('Remove your profile photo?')) return;
    if (settings.avatarPath) {
      if (!userId) {
        setStatus('Sign in to remove your private profile photo.');
        return;
      }
      setBusy(true);
      updateSettings({ avatarPath: undefined, avatarUrl: undefined });
      const synced = await syncNow();
      if (!synced) {
        setStatusIsError(true);
        setStatus('Photo was removed on this device, but account sync did not finish. Retry sync before closing this page; the private file was kept safe.');
        setBusy(false);
        return;
      }
      try {
        await deletePrivateImage(userId, settings.avatarPath);
      } catch (error) {
          setStatusIsError(true);
          setStatus(error instanceof Error ? error.message : 'Could not remove your private profile photo.');
        setBusy(false);
        return;
      }
    }
    updateSettings({ avatarPath: undefined, avatarUrl: undefined });
    setPreview(undefined);
    setStatusIsError(false);
    setStatus('Profile photo removed.');
    setBusy(false);
  };

  return <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-white/[.08]">
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-indigo-500/15 text-indigo-500">{preview && !imageFailed ? <img src={preview} alt="Profile preview" onError={() => { setImageFailed(true); setStatusIsError(true); setStatus('Photo could not be displayed. Check your connection, reload the page, or upload again.'); }} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <ImagePlus size={24} />}</div>
    <div className="min-w-0 flex-1"><div className="font-medium">Profile photo</div><p className="mt-1 text-sm muted">Choose a photo from your phone. JPEG, PNG, WebP, and browser-supported HEIC/HEIF are compressed on this device, then stored privately in your account.</p>{status && <p className={`mt-2 break-words text-xs ${statusIsError ? 'text-rose-600 dark:text-rose-400' : 'muted'}`} role={statusIsError ? 'alert' : 'status'}>{status}</p>}</div>
    <input ref={input} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => upload(e.target.files?.[0])} />
    <button type="button" className="btn-outline" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} /> {busy ? 'Saving…' : 'Save profile photo'}</button>
    {(settings.avatarPath || settings.avatarUrl) && <button type="button" className="btn-ghost text-rose-600 dark:text-rose-400" disabled={busy} onClick={remove} title="Remove profile photo"><Trash2 size={16} /> <span>Remove</span></button>}
  </div>;
}
