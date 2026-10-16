import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { supabase } from '../lib/supabase';

type PublicEntry = { title: string; excerpt: string; content: string; published_at: string };

export default function PublicJournal() {
  const { slug } = useParams();
  const [entry, setEntry] = useState<PublicEntry | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!supabase || !slug) return; supabase.from('public_journals').select('title, excerpt, content, published_at').eq('slug', slug).maybeSingle().then(({ data, error: e }) => { if (e || !data) setError('This journal page is unavailable.'); else setEntry(data); }); }, [slug]);
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-[#0b0d12] dark:text-slate-100"><article className="mx-auto max-w-2xl"><Link to="/" className="mb-10 flex items-center gap-2 text-sm muted"><Logo size={28} /> Life Circle</Link>{error ? <div className="card p-8 text-center">{error}</div> : entry ? <><p className="mb-3 text-sm text-indigo-500">Published {new Date(entry.published_at).toLocaleDateString()}</p><h1 className="text-4xl font-bold tracking-tight">{entry.title || 'Journal entry'}</h1>{entry.excerpt && <p className="mt-4 text-lg muted">{entry.excerpt}</p>}<div className="mt-8 whitespace-pre-wrap leading-8">{entry.content}</div></> : <div className="card p-8 text-center muted">Loading journal…</div>}</article></main>;
}
