import { translate as tr } from '../lib/locales';
import { ArrowLeft, BookOpen, MessageCircle, RefreshCw, Send, Trash2, WifiOff } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { playFeedback } from '../lib/sounds';
import { useStore } from '../lib/store';
import { localeForLanguage } from '../lib/utils';
import { setPublicNotFoundMetadata, setPublicPageMetadata } from '../lib/publicSeo';

type PublicEntry = { title: string; excerpt: string; content: string; published_at: string };
type LoadState = 'loading' | 'ready' | 'not-found' | 'offline' | 'missing-table' | 'error' | 'unavailable';
type Comment = { id: string; author_name: string; content: string; created_at: string; can_delete: boolean };

function formatDate(value: string, language = 'en') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Recently published'
    : date.toLocaleDateString(localeForLanguage(language), { year: 'numeric', month: 'long', day: 'numeric' });
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
  const language = useStore((store) => store.settings.language ?? 'en');
  const { slug: pathSlug } = useParams();
  const location = useLocation();
  const slug = pathSlug || new URLSearchParams(location.search).get('slug') || undefined;
  const navigate = useNavigate();
  const { user, setGuest } = useAuth();
  const [entry, setEntry] = useState<PublicEntry | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentState, setCommentState] = useState<'loading' | 'ready' | 'missing' | 'offline' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentNotice, setCommentNotice] = useState('');

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

  useEffect(() => {
    if (state === 'ready' && entry && slug) {
      const description = entry.excerpt || entry.content.slice(0, 220) || tr('A public journal reflection shared on Life Circle.');
      return setPublicPageMetadata({
        path: `public/journal/?slug=${encodeURIComponent(slug)}`,
        title: entry.title || tr('Journal entry'),
        description,
        type: 'article',
        publishedAt: entry.published_at,
      });
    }
    if (state !== 'loading') return setPublicNotFoundMetadata();
  }, [state, entry, slug, language]);

  const loadComments = useCallback(async () => {
    if (!slug) return;
    if (!navigator.onLine) { setCommentState('offline'); return; }
    if (!supabase) { setCommentState('error'); return; }
    const { data, error } = await supabase.from('public_journal_comments')
      .select('id,author_name,content,created_at')
      .eq('journal_slug', slug).order('created_at', { ascending: true }).limit(100);
    if (error) {
      const message = `${error.code ?? ''} ${error.message ?? ''}`;
      setCommentState(/42P01|PGRST205|schema cache|does not exist/i.test(message) ? 'missing' : !navigator.onLine ? 'offline' : 'error');
      return;
    }
    let deletableIds = new Set<string>();
    if (user?.id) {
      const { data: deletable } = await supabase.rpc('lifeos_deletable_public_comment_ids', { p_journal_slug: slug });
      if (Array.isArray(deletable)) deletableIds = new Set(deletable.map((row: { comment_id: string }) => row.comment_id));
    }
    setComments((data ?? []).map((comment: Omit<Comment, 'can_delete'>) => ({ ...comment, can_delete: deletableIds.has(comment.id) })));
    setCommentState('ready');
  }, [slug, user?.id]);

  useEffect(() => {
    void loadComments();
    const client = supabase;
    if (!client || !slug) return;
    const channel = client.channel(`public-comments-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_journal_comments', filter: `journal_slug=eq.${slug}` }, () => { void loadComments(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [slug, loadComments]);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!slug || !supabase || !user?.id || !content || commentBusy) return;
    const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || 'Reader').trim().slice(0, 80) || 'Reader';
    setCommentBusy(true);
    setCommentNotice('');
    try {
      const { error } = await supabase.from('public_journal_comments').insert({
        journal_slug: slug, author_id: user.id, author_name: displayName, content,
      });
      if (error) throw error;
      setDraft('');
      setCommentNotice('Your comment was posted.');
      playFeedback('submit');
      await loadComments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setCommentNotice(/42P01|PGRST205|schema cache|does not exist/i.test(message) ? 'Comments need to be enabled for this site first.' : `Could not post your comment: ${message}`);
      playFeedback('failed');
    } finally { setCommentBusy(false); }
  };

  const removeComment = async (id: string) => {
    if (!supabase || !user?.id || !confirm(`${tr('Delete')}?`)) return;
    const { error } = await supabase.from('public_journal_comments').delete().eq('id', id);
    if (error) setCommentNotice('Could not remove that comment.'); else { setCommentNotice('Comment removed.'); await loadComments(); }
  };

  const retry = <button className="btn-outline mt-5" onClick={() => void loadEntry()}><RefreshCw size={16} /> {tr("Try again")}</button>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#0b0d12] dark:text-slate-100">
      <article className="mx-auto min-w-0 max-w-3xl break-words">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link to="/public" className="flex items-center gap-2 text-sm muted" aria-label={tr("Public journals home")}><Logo size={28} /> {tr("Life Circle")}</Link>
          <Link to="/public" className="btn-primary"><ArrowLeft size={16} /> {tr("All public journals")}</Link>
        </div>

        {state === 'loading' && <div className="card p-8 text-center muted" role="status">{tr("Loading journal…")}</div>}
        {state === 'not-found' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">{tr("This journal is unavailable")}</h1><p className="mt-1 text-sm muted">{tr("It may have been removed or the link may be incorrect.")}</p></div>}
        {state === 'offline' && <div className="card p-8 text-center" role="alert"><WifiOff className="mx-auto mb-3 text-amber-500" size={30} /><h1 className="font-semibold">{tr("You’re offline")}</h1><p className="mt-1 text-sm muted">{tr("Reconnect to the internet, then try again.")}</p>{retry}</div>}
        {state === 'missing-table' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">{tr("Public journals are not available yet")}</h1><p className="mt-1 text-sm muted">{tr("The public journal service has not been set up on this site.")}</p></div>}
        {state === 'unavailable' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">{tr("Public journals are temporarily unavailable")}</h1><p className="mt-1 text-sm muted">{tr("This site is not connected to its public journal service.")}</p></div>}
        {state === 'error' && <div className="card p-8 text-center" role="alert"><h1 className="font-semibold">{tr("We couldn’t load this journal")}</h1><p className="mt-1 text-sm muted">{tr("Please try again in a moment.")}</p>{retry}</div>}
        {state === 'ready' && entry && (
          <>
            <header className="relative isolate overflow-hidden rounded-t-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 dark:border-indigo-300/10 dark:from-indigo-500/[.10] dark:via-slate-900 dark:to-violet-500/[.08] sm:p-9">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl" />
              <div className="relative">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-300/15 dark:bg-white/[.04] dark:text-indigo-200"><BookOpen size={14} />{tr("Published")} {formatDate(entry.published_at, language)}</p>
                <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{entry.title || 'Journal entry'}</h1>
              </div>
            </header>
            <div className="rounded-b-3xl border-x border-b border-slate-200 bg-white px-5 py-7 dark:border-white/10 dark:bg-slate-900/60 sm:px-9 sm:py-10">
              <div className="mx-auto max-w-2xl whitespace-pre-wrap break-words text-base leading-8 sm:text-lg sm:leading-9">{entry.content}</div>
            </div>
            <section className="mt-10 border-t border-slate-200 pt-7 dark:border-white/10" aria-labelledby="comments-title">
              <div className="flex items-center gap-2"><MessageCircle size={19} className="text-emerald-500" /><h2 id="comments-title" className="text-xl font-semibold">{tr("Comments")}<span className="text-sm font-normal muted">{commentState === 'ready' ? `· ${comments.length}` : ''}</span></h2></div>
              {commentState === 'loading' && <p className="mt-4 text-sm muted" role="status">{tr("Loading comments…")}</p>}
              {commentState === 'offline' && <p className="mt-4 text-sm muted">{tr("Comments need an internet connection.")}</p>}
              {commentState === 'missing' && <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-4 text-sm muted">{tr("The comments feature is ready in this release and is waiting for the database migration to be enabled.")}</p>}
              {commentState === 'error' && <div className="mt-4 flex items-center gap-3 text-sm muted"><span>{tr("Comments could not be loaded.")}</span><button className="btn-ghost !p-2" onClick={() => void loadComments()} aria-label={tr("Retry loading comments")}><RefreshCw size={15} /></button></div>}
              {commentState === 'ready' && <div className="mt-4 space-y-3">
                {comments.length === 0 && <p className="rounded-xl border border-slate-200 p-4 text-sm muted dark:border-white/10">{tr("No comments yet. Start a thoughtful conversation.")}</p>}
                {comments.map((comment) => <article key={comment.id} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[.03]">
                  <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{comment.author_name || 'Reader'}</p><time className="text-xs muted" dateTime={comment.created_at}>{formatDate(comment.created_at, language)}</time></div>{user && comment.can_delete && <button className="btn-ghost !min-h-9 !p-2 text-rose-500" onClick={() => void removeComment(comment.id)} aria-label={tr('Delete')}><Trash2 size={14} /></button>}</div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{comment.content}</p>
                </article>)}
              </div>}
              {commentNotice && <p className="mt-3 text-sm muted" role="status">{commentNotice}</p>}
              {commentState === 'ready' && (user ? <form className="mt-5 space-y-3" onSubmit={submitComment}>
                <label htmlFor="public-comment" className="label">{tr("Add a comment as")}{String(user.user_metadata?.full_name || user.user_metadata?.name || 'Reader').slice(0, 80)}</label>
                <textarea id="public-comment" className="input min-h-28 resize-y" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={tr("Write a kind, useful response…")} required />
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs muted">{draft.length}{tr("/2000 · Your email is never shown publicly.")}</span><button className="btn-primary" disabled={commentBusy || !draft.trim()}><Send size={15} /> {commentBusy ? 'Posting…' : 'Post comment'}</button></div>
              </form> : <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[.06] p-4"><p className="text-sm">{tr("Sign in to leave a comment. Readers can browse without an account.")}</p><button className="btn-primary mt-3" onClick={() => { setGuest(false); navigate('/'); }}>{tr("Sign in to comment")}</button></div>)}
            </section>
          </>
        )}
      </article>
    </main>
  );
}
