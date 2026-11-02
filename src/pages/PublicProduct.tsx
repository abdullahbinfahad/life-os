import { useEffect } from 'react';
import { ArrowRight, BookOpen, CalendarDays, FolderKanban, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME, Logo } from '../components/Brand';
import { translate as tr } from '../lib/locales';
import './PublicProduct.css';

const origin = 'https://abdullahbinfahad.github.io/life-os';
const title = 'Life OS | Goals, Habits, Projects & Personal Planning';
const description = 'Life OS is a calm personal workspace for planning goals, habits, days, projects, study, journaling and memories.';

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

function LifeOsHeroArt() {
  return (
    <div className="lifeos-hero-art" aria-hidden="true">
      <div className="lifeos-hero-glow" />
      <div className="lifeos-hero-orbit lifeos-hero-orbit-a"><i /><i /><i /></div>
      <div className="lifeos-hero-orbit lifeos-hero-orbit-b"><i /><i /></div>
      <div className="lifeos-hero-core">
        <Logo size={78} />
        <span>{APP_NAME}</span>
        <small>{tr('Your workspace')}</small>
      </div>
      <div className="lifeos-hero-chip lifeos-chip-goals"><Target size={16} /><span>{tr('Goals')}</span></div>
      <div className="lifeos-hero-chip lifeos-chip-projects"><FolderKanban size={16} /><span>{tr('Projects')}</span></div>
      <div className="lifeos-hero-chip lifeos-chip-study"><BookOpen size={16} /><span>{tr('Study Studio')}</span></div>
      <div className="lifeos-hero-chip lifeos-chip-calendar"><CalendarDays size={16} /><span>{tr('Today')}</span></div>
      <div className="lifeos-hero-spark lifeos-spark-a"><Sparkles size={17} /></div>
      <div className="lifeos-hero-spark lifeos-spark-b"><Sparkles size={12} /></div>
    </div>
  );
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
    setMeta('meta[property="og:site_name"]', 'content', APP_NAME);
    setMeta('meta[property="og:url"]', 'content', `${origin}/about/`);
    setMeta('meta[property="og:image"]', 'content', `${origin}/icon-512.png`);
    setMeta('meta[name="twitter:card"]', 'content', 'summary');
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', `${origin}/icon-512.png`);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${origin}/about/`;
    return () => { document.title = priorTitle; };
  }, []);

  return <main className="lifeos-product mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
    <section className="lifeos-brand-hero">
      <div className="lifeos-hero-copy">
        <div className="lifeos-wordmark"><Logo size={34} /><span>{APP_NAME}</span></div>
        <p className="lifeos-eyebrow">{tr('A personal system for everything that matters')}</p>
        <h1>{tr('Your life, organized in one calm workspace')}</h1>
        <p className="lifeos-hero-description">{tr('Life OS helps you bring plans, goals, routines, collaborative work, journals and memories together. Use it for personal planning, work or study, at your own pace.')}</p>
        <div className="lifeos-hero-actions">
          <Link className="lifeos-cta-primary" to="/">{tr('Sign in or open Life OS')}<ArrowRight size={17} /></Link>
          <Link className="lifeos-cta-secondary" to="/public/">{tr('Browse public journals')}</Link>
        </div>
      </div>
      <LifeOsHeroArt />
    </section>

    <section className="lifeos-features" aria-label={tr('Life OS features')}>
      {[
        ['Plan personal goals and days', 'Collect life ideas, shape goals and plans, and use Today, calendar and reminders to keep track of what is due.'],
        ['Support work and study', 'Use a private focus timer and a reward ledger for recorded focus or work, alongside your plans and tasks.'],
        ['Build habits and projects', 'Track habits and organize private projects. Shared projects support members, roles, invitations, assigned tasks, dependencies, discussion, notes and activity.'],
        ['Keep a journal', 'Write entries with tags, mood and location; search, filter, reorder and link entries with goals, plans or projects. Entries can remain private or be published.'],
        ['Save memories in albums', 'Organize memories with albums, search and compressed private photo uploads.'],
        ['Use it in your language', 'The responsive interface supports eight languages, with right-to-left layout for Arabic.']
      ].map(([heading, body], index) => <article key={heading} className="lifeos-feature-card"><span className="lifeos-feature-index">0{index + 1}</span><h2>{tr(heading)}</h2><p>{tr(body)}</p></article>)}
    </section>
    <section className="lifeos-privacy-note"><div><h2>{tr('A note about privacy')}</h2><p>{tr('Journal entries can be private or explicitly made public. Albums and photo uploads are private. Public journal pages show only entries published by their authors; this page contains no account-specific information.')}</p></div><div className="lifeos-privacy-links"><Link to="/">{tr('Sign in or open the app')}<ArrowRight size={15} /></Link><Link to="/public/">{tr('Visit the public-journal hub')}<ArrowRight size={15} /></Link></div></section>
    <footer className="lifeos-brand-footer"><Logo size={23} /><span>{APP_NAME}</span><span>·</span><span>{tr('A personal system for everything that matters')}</span></footer>
  </main>;
}
