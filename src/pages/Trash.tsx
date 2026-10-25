import { useMemo, useState } from 'react';
import { translate as tr } from '../lib/locales';
import { ChevronLeft, ChevronRight, RotateCcw, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { deletePrivateImage } from '../lib/media';
import type { Album, AlbumMemory, TrashRecord } from '../lib/types';
import { localeForLanguage } from '../lib/utils';

const pageSize = 50;

function privateImagePaths(record: TrashRecord): string[] {
  if (record.entityType === 'album') return [...new Set(((record.data as Album).memories ?? []).map((memory) => memory.imagePath).filter((path): path is string => Boolean(path)))];
  if (record.entityType === 'memory') { const path = (record.data as AlbumMemory).imagePath; return path ? [path] : []; }
  return [];
}

async function deletePrivateImagePaths(userId: string, paths: string[]) {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(3, paths.length) }, async () => {
    while (next < paths.length) {
      const path = paths[next++];
      try { await deletePrivateImage(userId, path); } catch { failed = true; }
    }
  });
  await Promise.all(workers);
  if (failed) throw new Error('One or more private image files could not be removed.');
}

export default function Trash() {
  const store = useStore();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const orderedRows = useMemo(() => [...store.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)), [store.trash]);
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? orderedRows.filter((record) => record.title.toLowerCase().includes(term)) : orderedRows;
  }, [orderedRows, query]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const purge = async (record: TrashRecord) => {
    if (busy || !confirm(`${tr('Permanently delete')} “${record.title}”? ${tr('This cannot be undone.')}`)) return;
    const paths = privateImagePaths(record);
    if (paths.length && !user?.id) { setMessage(tr('Sign in to permanently remove private photo files.')); return; }
    setBusy(true); setMessage('');
    try {
      if (user?.id) await deletePrivateImagePaths(user.id, paths);
      store.permanentlyDeleteFromTrash(record.id);
      setMessage(tr('Permanently deleted.'));
    } catch { setMessage(tr('Could not permanently delete this record. It remains in Trash.')); }
    finally { setBusy(false); }
  };

  const emptyTrash = async () => {
    const snapshot = [...store.trash];
    if (busy || !snapshot.length || !confirm(`${tr('Permanently delete every item currently in Trash?')} ${tr('This cannot be undone.')}`)) return;
    setBusy(true); setMessage('');
    let next = 0;
    let failed = 0;
    const removedIds: string[] = [];
    const workers = Array.from({ length: Math.min(3, snapshot.length) }, async () => {
      while (next < snapshot.length) {
        const record = snapshot[next++];
        try {
          const paths = privateImagePaths(record);
          if (paths.length && !user?.id) throw new Error('Sign-in required to remove private photos.');
          if (user?.id) await deletePrivateImagePaths(user.id, paths);
          removedIds.push(record.id);
        } catch { failed += 1; }
      }
    });
    await Promise.all(workers);
    store.permanentlyDeleteManyFromTrash(removedIds);
    setMessage(failed ? `${failed} ${tr('items could not be deleted and remain in Trash.')}` : tr('Trash emptied permanently.'));
    setBusy(false);
  };

  return <div className="mx-auto min-w-0 max-w-5xl">
    <PageHeader title={tr('Trash')} subtitle={`${store.trash.length} ${tr('items')}`} />
    {message && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm muted" role="status">{message}</p>}
    {!store.trash.length ? <section className="card p-8 text-center"><Trash2 className="mx-auto text-slate-400" size={26} /><h2 className="mt-3 font-medium">{tr('Your Trash is empty')}</h2><p className="mx-auto mt-1 max-w-md text-sm muted">{tr('Deleted items will appear here. You can restore them before permanently deleting them.')}</p></section> : <>
      <section className="card mb-4 flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tr('Search Trash by title')}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="w-full min-h-11 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-slate-900" placeholder={tr('Search Trash by title')} />
        </label>
        <p className="shrink-0 text-xs muted" aria-live="polite">{rows.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, rows.length)} / ${rows.length}` : '0 / 0'}</p>
      </section>
      {!rows.length ? <section className="card p-8 text-center"><Trash2 className="mx-auto text-slate-400" size={26} /><p className="mt-3 text-sm muted">{tr('No Trash items match your search.')}</p><button className="btn-outline mt-4" onClick={() => { setQuery(''); setPage(0); }}>{tr('Clear search')}</button></section> : <section className="card min-w-0 space-y-2 p-3 sm:p-5" aria-label={tr('Deleted items')}>
        {visibleRows.map((record) => <article key={record.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold">{record.title}</h2><p className="mt-1 text-xs muted">{tr(record.entityType)} · {new Date(record.deletedAt).toLocaleString(localeForLanguage(store.settings.language))}</p></div>
          <div className="flex shrink-0 gap-2"><button className="btn-outline" disabled={busy} onClick={() => { const ok = store.restoreFromTrash(record.id); setMessage(tr(ok ? 'Restored.' : 'Restore the parent project or album first, then retry.')); }}><RotateCcw size={14} />{tr('Restore')}</button><button className="btn-ghost text-rose-600" disabled={busy} onClick={() => void purge(record)}><Trash2 size={14} />{tr('Delete forever')}</button></div>
        </article>)}
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <button className="btn-danger self-start" disabled={busy || !store.trash.length} onClick={() => void emptyTrash()}><Trash2 size={14} />{tr('Empty trash')}</button>
          {pageCount > 1 && <nav className="flex items-center justify-end gap-2" aria-label={tr('Trash')}>
            <button className="btn-outline min-h-10 !px-3" aria-label={tr('Previous')} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /><span className="hidden sm:inline">{tr('Previous')}</span></button>
            <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">{safePage + 1} / {pageCount}</span>
            <button className="btn-outline min-h-10 !px-3" aria-label={tr('Next')} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}><span className="hidden sm:inline">{tr('Next')}</span><ChevronRight size={16} /></button>
          </nav>}
        </div>
      </section>}
    </>}
  </div>;
}
