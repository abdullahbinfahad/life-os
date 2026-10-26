import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { translate as tr } from '../lib/locales';

const origin = 'https://abdullahbinfahad.github.io/life-os';
const title = 'Life Circle | Personal Life OS for Goals, Habits & Projects';
const description = 'A personal Life OS for planning goals, habits and days, organizing private or shared projects, journaling, and keeping photo memories together.';

function setMeta(selector: string, attribute: string, value: string) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    if (selector.startsWith('meta[name=')) element.name = selector.match(/"([^"]+)"/)?.[1] ?? '';
    else element.setAttribute('property', selector.match(/"([^"]+)"/)?.[1] ?? '');
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

export default function PublicProduct() {
  useEffect(() => {
    const priorTitle = document.title;
    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', 'index,follow');
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', 'website');
    setMeta('meta[property="og:url"]', 'content', `${origin}/about/`);
    setMeta('meta[property="og:image"]', 'content', `${origin}/apple-touch-icon.png`);
    setMeta('meta[name="twitter:card"]', 'content', 'summary');
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', `${origin}/apple-touch-icon.png`);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${origin}/about/`;
    return () => { document.title = priorTitle; };
  }, []);

  return <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8">
    <header className="mb-12 max-w-3xl">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[.16em] text-indigo-500">{tr('Life Circle')}</p>
      <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl">{tr('Your life, organized in one calm workspace')}</h1>
      <p className="text-lg leading-8 text-muted-foreground">{tr('Life Circle helps you bring plans, goals, routines, collaborative work, journals and memories together. Use it for personal planning, work or study, at your own pace.')}</p>
      <div className="mt-7 flex flex-wrap gap-4"><Link className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground" to="/">{tr('Sign in or open Life Circle')}</Link><Link className="rounded-xl border px-5 py-3 font-semibold" to="/public/">{tr('Browse public journals')}</Link></div>
    </header>
    <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={tr('Life Circle features')}>
      {[
        ['Plan personal goals and days', 'Collect life ideas, shape goals and plans, and use Today, calendar and reminders to keep track of what is due.'],
        ['Support work and study', 'Use a private focus timer and a reward ledger for recorded focus or work, alongside your plans and tasks.'],
        ['Build habits and projects', 'Track habits and organize private projects. Shared projects support members, roles, invitations, assigned tasks, dependencies, discussion, notes and activity.'],
        ['Keep a journal', 'Write entries with tags, mood and location; search, filter, reorder and link entries with goals, plans or projects. Entries can remain private or be published.'],
        ['Save memories in albums', 'Organize memories with albums, search and compressed private photo uploads.'],
        ['Use it in your language', 'The responsive interface supports eight languages, with right-to-left layout for Arabic.']
      ].map(([heading, body]) => <article key={heading} className="rounded-2xl border bg-card p-6"><h2 className="mb-3 text-xl font-semibold">{tr(heading)}</h2><p className="leading-7 text-muted-foreground">{tr(body)}</p></article>)}
    </section>
    <section className="mt-12 rounded-2xl border p-6 sm:p-8"><h2 className="mb-3 text-2xl font-semibold">{tr('A note about privacy')}</h2><p className="leading-7 text-muted-foreground">{tr('Journal entries can be private or explicitly made public. Albums and photo uploads are private. Public journal pages show only entries published by their authors; this page contains no account-specific information.')}</p><div className="mt-5 flex flex-wrap gap-5"><Link className="font-semibold underline underline-offset-4" to="/">{tr('Sign in or open the app')}</Link><Link className="font-semibold underline underline-offset-4" to="/public/">{tr('Visit the public-journal hub')}</Link></div></section>
  </main>;
}
