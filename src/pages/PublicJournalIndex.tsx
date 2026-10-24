import { translate as tr } from '../lib/locales';
import { ArrowRight, BookOpen, RefreshCw, Search, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { localeForLanguage } from '../lib/utils';

type PublicJournalListItem = {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'missing-table' | 'error' | 'unavailable';

const PAGE_SIZE = 50;
const PUBLIC_LIST_CACHE = 'life-circle-public-journals-v1';

function readPublicCache(): PublicJournalListItem[] | null {
  try {
    const raw = localStorage.getItem(PUBLIC_LIST_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((row) => row && typeof row.slug === 'string' && typeof row.title === 'string' && typeof row.excerpt === 'string' && typeof row.published_at === 'string').slice(0, PAGE_SIZE);
  } catch { return null; }
}

function formatDate(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Recently published'
    : date.toLocaleDateString(localeForLanguage(language), { year: 'numeric', month: 'long', day: 'numeric' });
}

function stateForError(error: unknown): Exclude<LoadState, 'loading' | 'ready' | 'empty'> {
  const result = error as { code?: unknown; message?: unknown } | null;
  const code = typeof result?.code === 'string' ? result.code : '';
  const message = typeof result?.message === 'string' ? result.message : String(error ?? '');

  if (!navigator.onLine || /failed to fetch|networkerror|network request failed/i.test(message)) return 'offline';
  if (code === '42P01' || code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(message)) return 'missing-table';
  return 'error';
}

export default function PublicJournalIndex() {
  const language = useStore((state) => state.settings.language ?? 'en');
  const [entries, setEntries] = useState<PublicJournalListItem[]>(() => readPublicCache() ?? []);
  const [state, setState] = useState<LoadState>(() => readPublicCache() === null ? 'loading' : (readPublicCache()?.length ? 'ready' : 'empty'));
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<'all' | '30' | '90'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const loadEntries = useCallback(async (quiet = false) => {
    if (!quiet && readPublicCache() === null) setState('loading');

    if (!navigator.onLine) {
      if (!readPublicCache()) setState('offline');
      return;
    }
    if (!supabase) {
      if (!readPublicCache()) setState('unavailable');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('public_journals')
        .select('slug,title,excerpt,published_at')
        .order('published_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        if (!readPublicCache()) setState(stateForError(error));
        return;
      }

      const journals = (data ?? []) as PublicJournalListItem[];
      setEntries(journals);
      try { localStorage.setItem(PUBLIC_LIST_CACHE, JSON.stringify(journals)); } catch { /* Public content cache is optional. */ }
      setState(journals.length ? 'ready' : 'empty');
    } catch (error) {
      if (!readPublicCache()) setState(stateForError(error));
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    const client = supabase;
    if (!client) return;
    const channel = client.channel('public-journal-index')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_journals' }, () => { void loadEntries(true); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [loadEntries]);

  const retry = <button className="btn-outline mt-5" onClick={() => void loadEntries()}><RefreshCw size={16} /> {tr("Try again")}</button>;
  const cutoff = dateRange === 'all' ? 0 : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredEntries = entries
    .filter((entry) => !normalizedSearch || `${entry.title} ${entry.excerpt}`.toLocaleLowerCase().includes(normalizedSearch))
    .filter((entry) => dateRange === 'all' || (Number.isFinite(Date.parse(entry.published_at)) && Date.parse(entry.published_at) >= cutoff))
    .sort((a, b) => (Date.parse(a.published_at) - Date.parse(b.published_at)) * (sortOrder === 'newest' ? -1 : 1));
  const clearFilters = () => { setSearch(''); setDateRange('all'); setSortOrder('newest'); };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#0b0d12] dark:text-slate-100">
      <div className="mx-auto max-w-3xl">
        <Link to="/public" className="mb-10 inline-flex items-center gap-2 text-sm muted" aria-label={tr("Public journals home")}>
          <Logo size={28} /> {tr("Life Circle")}</Link>
        <header className="mb-8 min-w-0 max-w-2xl">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{tr("Life Circle")}</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{tr("Public journals")}</h1>
          <p className="mt-3 text-lg muted">{tr("Reflections shared for anyone to read.")}</p>
        </header>

        {state === 'loading' && <div className="card p-8 text-center muted" role="status">{tr("Loading public journals…")}</div>}
        {state === 'empty' && (
          <div className="card p-8 text-center">
            <BookOpen className="mx-auto mb-3 text-indigo-500" size={30} />
            <h2 className="font-semibold">{tr("No public journals yet")}</h2>
            <p className="mt-1 text-sm muted">{tr("Check back soon for new reflections.")}</p>
          </div>
        )}
        {state === 'offline' && (
          <div className="card p-8 text-center" role="alert">
            <WifiOff className="mx-auto mb-3 text-amber-500" size={30} />
            <h2 className="font-semibold">{tr("You’re offline")}</h2>
            <p className="mt-1 text-sm muted">{tr("Reconnect to the internet, then try loading public journals again.")}</p>
            {retry}
          </div>
        )}
        {state === 'missing-table' && (
          <div className="card p-8 text-center" role="alert">
            <h2 className="font-semibold">{tr("Public journals are not available yet")}</h2>
            <p className="mt-1 text-sm muted">{tr("The public journal service has not been set up on this site.")}</p>
          </div>
        )}
        {state === 'unavailable' && (
          <div className="card p-8 text-center" role="alert">
            <h2 className="font-semibold">{tr("Public journals are temporarily unavailable")}</h2>
            <p className="mt-1 text-sm muted">{tr("This site is not connected to its public journal service.")}</p>
          </div>
        )}
        {state === 'error' && (
          <div className="card p-8 text-center" role="alert">
            <h2 className="font-semibold">{tr("We couldn’t load public journals")}</h2>
            <p className="mt-1 text-sm muted">{tr("Please try again in a moment.")}</p>
            {retry}
          </div>
        )}
        {state === 'ready' && (
          <div className="space-y-4">
            <form className="card grid gap-4 p-4 sm:grid-cols-3 sm:p-5" onSubmit={(event) => event.preventDefault()} role="search">
              <div className="sm:col-span-3">
                <label htmlFor="public-journal-search" className="mb-1 block text-sm font-medium">{tr("Search public journals")}</label>
                <div className="relative">
                  <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
                  <input id="public-journal-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Search titles and excerpts")} className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </div>
              <div>
                <label htmlFor="public-journal-date-range" className="mb-1 block text-sm font-medium">{tr("Date range")}</label>
                <select id="public-journal-date-range" value={dateRange} onChange={(event) => setDateRange(event.target.value as 'all' | '30' | '90')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="all">{tr("All time")}</option><option value="30">{tr("Past 30 days")}</option><option value="90">{tr("Past 90 days")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="public-journal-sort" className="mb-1 block text-sm font-medium">{tr("Sort by date")}</label>
                <select id="public-journal-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="newest">{tr("Newest first")}</option><option value="oldest">{tr("Oldest first")}</option>
                </select>
              </div>
            </form>
            {filteredEntries.length === 0 ? (
              <div className="card p-8 text-center" role="status">
                <h2 className="font-semibold">{tr("No matching public journals")}</h2>
                <p className="mt-1 text-sm muted">{tr("Try changing your search or filters.")}</p>
                <button type="button" className="btn-outline mt-4" onClick={clearFilters}>{tr("Clear search and filters")}</button>
              </div>
            ) : filteredEntries.map((entry) => (
              <Link
                key={entry.slug}
                to={`/public/journal/${encodeURIComponent(entry.slug)}`}
                className="card block min-w-0 p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-400/50 sm:p-6"
              >
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{formatDate(entry.published_at, language)}</p>
                <h2 className="mt-2 break-words text-xl font-semibold tracking-tight">{entry.title || 'Journal entry'}</h2>
                {entry.excerpt && <p className="mt-2 break-words leading-6 muted">{entry.excerpt}</p>}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">{tr("Read journal")}<ArrowRight size={16} /></span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
