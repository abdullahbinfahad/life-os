import { translate as tr } from '../lib/locales';
import { ArrowRight, BookOpen, RefreshCw, Search, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { localeForLanguage } from '../lib/utils';
import { setPublicPageMetadata } from '../lib/publicSeo';
import './PublicJournal.css';

type PublicJournalListItem = {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'missing-table' | 'error' | 'unavailable';

const PAGE_SIZE = 50;
const PUBLIC_LIST_CACHE = 'life-circle-public-journals-v1';

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

  const latest = entries.reduce((max, entry) => (entry.published_at > max ? entry.published_at : max), '');
  return (
    <main className="pj-page min-h-screen text-slate-900 dark:text-slate-100">
      <header className="pj-hero">
        <div className="pj-hero-art" aria-hidden="true"><span /><span /><span /><i /><i /><i /></div>
        <div className="mx-auto w-full max-w-6xl px-4">
          <Link to="/public" className="pj-brand" aria-label={tr("Public journals home")}><Logo size={30} /> {tr("Life OS")}</Link>
          <div className="pj-hero-copy">
            <p className="pj-eyebrow"><span />{tr('Open notebook')}</p>
            <h1 className="pj-title">{tr("Public journals")}</h1>
            <p className="pj-sub">{tr("Reflections shared for anyone to read.")}</p>
            {state === 'ready' && <label className="pj-search"><Search aria-hidden="true" size={20} /><span className="sr-only">{tr("Search public journals")}</span><input id="public-journal-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Search titles and excerpts")} /></label>}
            <dl className="pj-stats">
              <div><dt>{tr('Stories')}</dt><dd>{entries.length}</dd></div>
              <div><dt>{tr('Latest')}</dt><dd>{latest ? formatDate(latest, language) : '—'}</dd></div>
              <div><dt>{tr('Access')}</dt><dd>{tr('Free to read')}</dd></div>
            </dl>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
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
            <div className="pj-filters" role="group" aria-label={tr('Filter public journals')}>
              {([['all', tr('All time')], ['30', tr('Past 30 days')], ['90', tr('Past 90 days')]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={dateRange === value} onClick={() => setDateRange(value)}>{label}</button>)}
              <span className="pj-filter-sep" aria-hidden="true" />
              {([['newest', tr('Newest first')], ['oldest', tr('Oldest first')]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sortOrder === value} onClick={() => setSortOrder(value)}>{label}</button>)}
              <span className="ml-auto text-sm muted">{filteredEntries.length} {tr('results')}</span>
            </div>
            {filteredEntries.length === 0 ? (
              <div className="card p-8 text-center" role="status">
                <h2 className="font-semibold">{tr("No matching public journals")}</h2>
                <p className="mt-1 text-sm muted">{tr("Try changing your search or filters.")}</p>
                <button type="button" className="btn-outline mt-4" onClick={clearFilters}>{tr("Clear search and filters")}</button>
              </div>
            ) : <div className="pj-grid">{filteredEntries.map((entry, index) => (
              <Link key={entry.slug} to={`/public/journal/?slug=${encodeURIComponent(entry.slug)}`} className={`pj-card ${index === 0 && page === 1 && !normalizedSearch ? 'is-featured' : ''}`} style={{ ['--hue' as string]: (entry.slug.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)) }}>
                <div className="pj-cover" aria-hidden="true"><span className="pj-cover-letter">{(entry.title || 'J').trim()[0]?.toUpperCase()}</span><span className="pj-cover-lines"><i /><i /><i /></span></div>
                <div className="pj-card-body">
                  <p className="pj-card-meta"><span>{formatDate(entry.published_at, language)}</span><span>· {Math.max(1, Math.round((entry.excerpt || '').split(/\s+/).length / 40))} {tr('min read')}</span></p>
                  <h2 className="pj-card-title">{entry.title || 'Journal entry'}</h2>
                  {entry.excerpt && <p className="pj-card-excerpt">{entry.excerpt}</p>}
                  <span className="pj-card-cta">{tr("Read journal")}<ArrowRight size={16} /></span>
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
