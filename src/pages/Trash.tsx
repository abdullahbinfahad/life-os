import { translate as tr } from '../lib/locales';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { deletePrivateImage } from '../lib/media';
import type { Album, AlbumMemory, TrashRecord } from '../lib/types';
import { localeForLanguage } from '../lib/utils';

function privateImagePaths(record: TrashRecord): string[] {
  if (record.entityType === 'album') return ((record.data as Album).memories ?? []).map((memory) => memory.imagePath).filter((path): path is string => Boolean(path));
  if (record.entityType === 'memory') { const path = (record.data as AlbumMemory).imagePath; return path ? [path] : []; }
  return [];
}

export default function Trash() {
  const store = useStore();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const rows = [...store.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  const purge = async (record: TrashRecord) => {
    if (busy || !confirm(`${tr('Permanently delete')} “${record.title}”? ${tr('This cannot be undone.')}`)) return;
    const paths = privateImagePaths(record);
    if (paths.length && !user?.id) { setMessage(tr('Sign in to permanently remove private photo files.')); return; }
    setBusy(true); setMessage('');
    try {
      if (user?.id) await Promise.all(paths.map((path) => deletePrivateImage(user.id, path)));
      store.permanentlyDeleteFromTrash(record.id);
      setMessage(tr('Permanently deleted.'));
    } catch { setMessage(tr('Could not permanently delete this record. It remains in Trash.')); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto min-w-0 max-w-5xl">
    <PageHeader title={tr('Trash')} subtitle={`${rows.length} ${tr('items')}`} />
    {message && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm muted" role="status">{message}</p>}
    {!rows.length ? <section className="card p-8 text-center"><Trash2 className="mx-auto text-slate-400" size={26} /><h2 className="mt-3 font-medium">{tr('Your Trash is empty')}</h2><p className="mx-auto mt-1 max-w-md text-sm muted">{tr('Deleted items will appear here. You can restore them before permanently deleting them.')}</p></section> : <section className="card min-w-0 space-y-2 p-3 sm:p-5" aria-label={tr('Deleted items')}>
      {rows.map((record) => <article key={record.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold">{record.title}</h2><p className="mt-1 text-xs muted">{tr(record.entityType)} · {new Date(record.deletedAt).toLocaleString(localeForLanguage(store.settings.language))}</p></div>
        <div className="flex shrink-0 gap-2"><button className="btn-outline" disabled={busy} onClick={() => { const ok = store.restoreFromTrash(record.id); setMessage(tr(ok ? 'Restored.' : 'Restore the parent project or album first, then retry.')); }}><RotateCcw size={14} />{tr('Restore')}</button><button className="btn-ghost text-rose-600" disabled={busy} onClick={() => void purge(record)}><Trash2 size={14} />{tr('Delete forever')}</button></div>
      </article>)}
      <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-white/10"><button className="btn-danger" disabled={busy || rows.length === 0} onClick={() => { if (confirm(`${tr('Permanently delete every item currently in Trash?')} ${tr('This cannot be undone.')}`)) void (async () => { setBusy(true); let failed = 0; for (const record of rows) { try { const paths = privateImagePaths(record); if (paths.length && !user?.id) throw new Error(); if (user?.id) await Promise.all(paths.map((path) => deletePrivateImage(user.id, path))); store.permanentlyDeleteFromTrash(record.id); } catch { failed++; } } setMessage(failed ? `${failed} ${tr('items could not be deleted and remain in Trash.')}` : tr('Trash emptied permanently.')); setBusy(false); })(); }}><Trash2 size={14} />{tr('Empty trash')}</button></div>
    </section>}
  </div>;
}
