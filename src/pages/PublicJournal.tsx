import { ArrowLeft, RefreshCw, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { supabase } from '../lib/supabase';

type PublicEntry = { title: string; excerpt: string; content: string; published_at: string };
type LoadState = 'loading' | 'ready' | 'not-found' | 'offline' | 'missing-table' | 'error' | 'unavailable';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Recently published'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function stateForError(error: unknown): Extract<LoadState, 'offline' | 'missing-table' | 'error'> {
  const result = error as { code?: unknown; message?: unknown } | null;
  const code = typeof result?.code === 'string' ? result.code : '';
  const message = typeof result?.message === 'string' ? result.message : String(error ?? '');

  if (!navigator.onLine || /failed to fetch|networkerror|network request failed/i.test(message)) return 'offline';
  if (code === '42P01' || code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(message)) return 'missing-table';
  return 'error';
}

export default function PublicJournal() {
  const { slug } = useParams();
  const [entry, setEntry] = useState<PublicEntry | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  const loadEntry = useCallback(async () => {
    setState('loading');

    if (!slug) {
      setState('not-found');
      return;
    }
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    if (!supabase) {
      setState('unavailable');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('public_journals')
        .select('title,excerpt,content,published_at')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (error) {
        setState(stateForError(error));
        return;
      }
      if (!data) {
        setState('not-found');
        return;
      }

      setEntry(data as PublicEntry);
      setState('ready');
    } catch (error) {
      setState(stateForError(error));
    }
  }, [slug]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const retry = <button className="btn-outline mt-5" onClick={() => void loadEntry()}><RefreshCw size={16} /> Try again</button>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#0b0d12] dark:text-slate-100">
      <article className="mx-auto min-w-0 max-w-2xl break-words">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link to="/public" className="flex items-center gap-2 text-sm muted" aria-label="Public journals home"><Logo size={28} /> Life Circle</Link>
          <Link to="/public" className="btn-primary"><ArrowLeft size={16} /> All public journals</Link>
        </div>

        {state === 'loading' && <div className="card p-8 text-center muted" role="status">Loading journal…</div>}
        {state === 'not-found' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">This journal is unavailable</h1><p className="mt-1 text-sm muted">It may have been removed or the link may be incorrect.</p></div>}
        {state === 'offline' && <div className="card p-8 text-center" role="alert"><WifiOff className="mx-auto mb-3 text-amber-500" size={30} /><h1 className="font-semibold">You’re offline</h1><p className="mt-1 text-sm muted">Reconnect to the internet, then try again.</p>{retry}</div>}
        {state === 'missing-table' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">Public journals are not available yet</h1><p className="mt-1 text-sm muted">The public journal service has not been set up on this site.</p></div>}
        {state === 'unavailable' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">Public journals are temporarily unavailable</h1><p className="mt-1 text-sm muted">This site is not connected to its public journal service.</p></div>}
        {state === 'error' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">We couldn’t load this journal</h1><p className="mt-1 text-sm muted">Please try again in a moment.</p>{retry}</div>}
        {state === 'ready' && entry && (
          <>
            <p className="mb-3 text-sm font-medium text-indigo-500">Published {formatDate(entry.published_at)}</p>
            <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{entry.title || 'Journal entry'}</h1>
            <div className="mt-8 whitespace-pre-wrap break-words leading-8">{entry.content}</div>
          </>
        )}
      </article>
    </main>
  );
}
