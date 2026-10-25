import { translate as tr } from '../lib/locales';
import { ArrowRight, BookOpen, RefreshCw, Search, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { localeForLanguage } from '../lib/utils';
import { setPublicPageMetadata } from '../lib/publicSeo';

type PublicJournalListItem = {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'missing-table' | 'error' | 'unavailable';

const PAGE_SIZE = 50;
const PUBLIC_LIST_CACHE = 'life-circle-public-journals-v1';
const COVER_TONES = [
  'from-indigo-500/20 via-violet-400/10 to-sky-300/15',
  'from-emerald-500/15 via-teal-400/10 to-amber-300/15',
  'from-rose-500/15 via-orange-400/10 to-fuchsia-300/15',
  'from-sky-500/15 via-cyan-400/10 to-indigo-300/15',
];

function readPublicCache(page = 1): PublicJournalListItem[] | null {
  try {
    const raw = localStorage.getItem(`${PUBLIC_LIST_CACHE}:page:${page}`) ?? (page === 1 ? localStorage.getItem(PUBLIC_LIST_CACHE) : null);
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
  const location = useLocation();
  const requestedPage = Number(new URLSearchParams(location.search).get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const [initialCache] = useState(() => readPublicCache(page));
  const [entries, setEntries] = useState<PublicJournalListItem[]>(() => initialCache ?? []);
  const [state, setState] = useState<LoadState>(() => initialCache === null ? 'loading' : (initialCache.length ? 'ready' : 'empty'));
  const [hasNextPage, setHasNextPage] = useState(() => (initialCache?.length ?? 0) >= PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshIssue, setRefreshIssue] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<'all' | '30' | '90'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    const cached = readPublicCache(page);
    setEntries(cached ?? []);
    setHasNextPage((cached?.length ?? 0) >= PAGE_SIZE);
    setState(cached === null ? 'loading' : cached.length ? 'ready' : 'empty');
  }, [page]);

  useEffect(() => setPublicPageMetadata({
    path: page === 1 ? 'public/' : `public/?page=${page}`,
    title: tr('Public journals'),
    description: tr('Reflections shared for anyone to read.'),
    type: 'website',
  }), [language, page]);

  const loadEntries = useCallback(async (quiet = false) => {
    const hasCache = readPublicCache(page) !== null;
    if (!quiet && !hasCache) setState('loading');
    if (hasCache) { setRefreshing(true); setRefreshIssue(false); }

    if (!navigator.onLine) {
      if (!hasCache) setState('offline');
      else setRefreshIssue(true);
      setRefreshing(false);
      return;
    }
    if (!supabase) {
      if (!hasCache) setState('unavailable');
      else setRefreshIssue(true);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('public_journals')
        .select('slug,title,excerpt,published_at')
        .order('published_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);

      if (error) {
        if (!hasCache) setState(stateForError(error));
        else setRefreshIssue(true);
        return;
      }

      const rows = (data ?? []) as PublicJournalListItem[];
      setHasNextPage(rows.length > PAGE_SIZE);
      const journals = rows.slice(0, PAGE_SIZE);
      setEntries(journals);
      try { localStorage.setItem(`${PUBLIC_LIST_CACHE}:page:${page}`, JSON.stringify(journals)); if (page === 1) localStorage.setItem(PUBLIC_LIST_CACHE, JSON.stringify(journals)); } catch { /* Public content cache is optional. */ }
      setState(journals.length ? 'ready' : 'empty');
      setRefreshIssue(false);
    } catch (error) {
      if (!hasCache) setState(stateForError(error));
      else setRefreshIssue(true);
    } finally { setRefreshing(false); }
  }, [page]);

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
        <header className="relative isolate mb-8 min-w-0 overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm dark:border-indigo-300/10 dark:from-indigo-500/[.10] dark:via-slate-900 dark:to-violet-500/[.08]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute right-12 top-9 hidden h-36 w-28 rotate-6 rounded-2xl border border-white/80 bg-white/50 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-white/[.04] sm:block"><div className="m-4 h-1.5 w-12 rounded-full bg-indigo-400/40" /><div className="mx-4 mt-3 h-1 w-16 rounded-full bg-slate-400/20" /><div className="mx-4 mt-2 h-1 w-12 rounded-full bg-slate-400/20" /><div className="mx-4 mt-2 h-1 w-14 rounded-full bg-slate-400/20" /></div>
          <div className="relative max-w-2xl p-6 sm:p-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-indigo-700 dark:border-indigo-300/15 dark:bg-white/[.04] dark:text-indigo-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{tr("Life Circle")}</p>
            <h1 className="mt-4 break-words text-3xl font-bold tracking-tight sm:text-4xl">{tr("Public journals")}</h1>
            <p className="mt-3 max-w-xl text-base leading-7 muted sm:text-lg">{tr("Reflections shared for anyone to read.")}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-white/[.04]" aria-label={`${entries.length} ${tr('Public journals')}`}><BookOpen size={16} className="text-indigo-600 dark:text-indigo-300" /><span className="font-semibold tabular-nums">{entries.length}</span><span className="muted">{tr("Public journals")}</span></div>
          </div>
        </header>

        {refreshing && <p className="mb-4 text-xs muted" role="status" aria-live="polite">{tr('Refreshing public journals…')}</p>}
        {refreshIssue && <p className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-100" role="status">{tr('Showing the saved public journal list; it may be out of date.')}</p>}
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
            ) : <div className="grid gap-4 sm:grid-cols-2">{filteredEntries.map((entry, index) => (
              <Link
                key={entry.slug}
                to={`/public/journal/?slug=${encodeURIComponent(entry.slug)}`}
                className="card group block min-w-0 overflow-hidden p-0 transition duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg dark:hover:border-indigo-400/50"
              >
                <div className={`relative overflow-hidden bg-gradient-to-br ${COVER_TONES[index % COVER_TONES.length]}`}>
                  <div aria-hidden="true" className="absolute -right-8 -top-12 h-40 w-40 rounded-full border border-white/40 bg-white/20 blur-[1px] transition-transform duration-500 group-hover:scale-110" />
                  <div className="relative flex h-28 items-end justify-between p-4">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/35 dark:text-slate-100"><BookOpen size={14} />{tr("Public journals")}</span>
                    <span aria-hidden="true" className="font-serif text-5xl font-semibold tracking-tight text-indigo-950/10 dark:text-white/15">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                </div>
                <div className="min-w-0 p-4 sm:p-5">
                  <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{formatDate(entry.published_at, language)}</p>
                  <h2 className="mt-2 break-words text-xl font-semibold tracking-tight transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{entry.title || 'Journal entry'}</h2>
                  {entry.excerpt && <p className="mt-2 line-clamp-3 break-words text-sm leading-6 muted">{entry.excerpt}</p>}
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">{tr("Read journal")}<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            ))}</div>}
            {(page > 1 || hasNextPage) && <nav aria-label={tr('Public journal pages')} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[.03]">
              {page > 1 ? <Link className="btn-ghost" to={page === 2 ? '/public/' : `/public/?page=${page - 1}`} rel="prev">← {tr('Previous page')}</Link> : <span />}
              <span className="text-sm muted">{page}</span>
              {hasNextPage ? <Link className="btn-outline" to={`/public/?page=${page + 1}`} rel="next">{tr('Next page')} →</Link> : <span />}
            </nav>}
          </div>
        )}
      </div>
    </main>
  );
}
