import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve('dist');
const shellPath = resolve(root, 'index.html');
const base = 'https://abdullahbinfahad.github.io/life-os';
const PAGE_SIZE = 1000;
const MAX_PUBLIC_ENTRIES = 50000;
const MAX_STATIC_ARTICLES = 1000;
const MAX_STATIC_CONTENT = 6000;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const shell = await readFile(shellPath, 'utf8');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (char) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' })[char]);
}
function upsertTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `    ${replacement}\n  </head>`);
}
function plainText(value) {
  return String(value ?? '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '').replace(/[\*_~`]/g, '').replace(/\s+/g, ' ').trim();
}
function staticArticleBody(content) {
  const text = String(content ?? '').slice(0, MAX_STATIC_CONTENT).replace(/\r\n?/g, '\n');
  return text.split(/\n{2,}/).map((block) => plainText(block)).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');
}
async function writeRoute(path, title, description, fallback, { canonical, robots = 'noindex,follow', type = 'website', image = `${base}/apple-touch-icon.png`, jsonLd = '' } = {}) {
  let html = shell;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${type}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${image}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${image}" />`);
  html = html.replace(/\s*<meta property="og:url"[^>]*\/>/, '').replace(/\s*<link rel="canonical"[^>]*\/>/, '');
  html = upsertTag(html, /<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${robots}" />`);
  if (canonical) {
    html = upsertTag(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
    html = upsertTag(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  }
  if (jsonLd) html = html.replace('</head>', `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`);
  html = html.replace('<div id="root"></div>', `${fallback}\n    <div id="root"></div>`);
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  console.log(`Prepared ${target}`);
  return target;
}

const indexFallback = `<main id="public-seo-fallback" class="seo-fallback"><section><p>Life Circle · Open Journal</p><h1>Public journals</h1><p>Read reflections and stories that authors have chosen to share publicly. Browse without an account.</p><a href="/life-os/public/">Open public journals</a></section></main>`;
const aboutFallback = `<main id="public-seo-fallback" class="seo-fallback"><article><p>Life Circle · Personal planning</p><h1>Your life, organized in one calm workspace</h1><p>Life Circle brings personal planning, goals, habits, projects, journaling and memory albums together. Use it for personal planning, work or study, at your own pace.</p><h2>Plan, build routines and collaborate</h2><p>Collect life ideas, plan goals and days, track habits, and organize private or shared projects. Shared project tools include memberships, roles, invitations, assigned tasks, dependencies, discussion, notes and activity.</p><h2>Journal and keep memories</h2><p>Write journal entries with tags, mood and location, search and filter entries, and link them to goals, plans or projects. Entries can remain private or be published. Memory albums support compressed private photo uploads.</p><p>The responsive interface supports eight languages, including right-to-left Arabic layout. Journal entries are public only when explicitly published; albums and photo uploads are private.</p><p><a href="/life-os/">Sign in or open Life Circle</a></p><p><a href="/life-os/public/">Browse public journals</a></p></article></main>`;
const aboutDescription = 'A personal Life OS for planning goals, habits and days, organizing private or shared projects, journaling, and keeping photo memories together.';
const productSchema = safeJsonLd([
  { '@context': 'https://schema.org', '@type': 'WebPage', name: 'About Life Circle', description: aboutDescription, url: `${base}/about/`, isPartOf: { '@type': 'WebSite', name: 'Life Circle', url: `${base}/` } },
  { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Life Circle', applicationCategory: 'ProductivityApplication', operatingSystem: 'Web', description: aboutDescription, url: `${base}/`, image: `${base}/apple-touch-icon.png`, featureList: ['Personal goals and planning', 'Habits and reminders', 'Private and shared projects', 'Journaling with private or public visibility', 'Memory albums with private photo uploads'] },
]);

await writeRoute('about/index.html', 'Life Circle | Personal Life OS for Goals, Habits & Projects', aboutDescription, aboutFallback, { canonical: `${base}/about/`, robots: 'index,follow', jsonLd: productSchema });
await writeRoute('public/index.html', 'Public Journals · Life Circle', 'Read journal reflections and stories that Life Circle authors have chosen to share publicly.', indexFallback, { canonical: `${base}/public/`, robots: 'index,follow' });
await writeRoute('public/journal/index.html', 'Public Journal · Life Circle', 'Open a public Life Circle journal entry by its shared link.', '<main id="public-seo-fallback" class="seo-fallback"><article><p>Life Circle · Public journal</p><h1>Public journal</h1><p>Open a public journal entry from its author’s shared link.</p><a href="/life-os/public/">Browse all public journals</a></article></main>', { robots: 'noindex,follow', type: 'article' });

async function requestRows(select, params = {}) {
  const projectUrl = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!projectUrl || !publicKey) return null;
  const endpoint = new URL(`${projectUrl.replace(/\/$/, '')}/rest/v1/public_journals`);
  endpoint.searchParams.set('select', select);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, { headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : null;
}

let entries = [];
try {
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    console.warn('Supabase public settings are unavailable; sitemap will contain only the public hubs.');
  } else {
    let offset = 0;
    while (offset < MAX_PUBLIC_ENTRIES) {
      const rows = await requestRows('slug,published_at', { order: 'published_at.desc', limit: String(Math.min(PAGE_SIZE, MAX_PUBLIC_ENTRIES - offset)), offset: String(offset) });
      if (!rows) break;
      offset += rows.length;
      entries.push(...rows.filter((row) => typeof row?.slug === 'string' && row.slug.trim()).map((row) => ({ slug: row.slug.trim(), published_at: typeof row.published_at === 'string' ? row.published_at : '' })));
      if (rows.length < PAGE_SIZE) break;
    }
  }
} catch (error) {
  console.warn(`Could not enumerate public journals for static SEO (${error.message}); retaining hub URLs.`);
  entries = [];
}
const uniqueEntries = [...new Map(entries.map((entry) => [entry.slug, entry])).values()].slice(0, MAX_PUBLIC_ENTRIES);
const staticEntries = uniqueEntries.filter((entry) => SAFE_SLUG.test(entry.slug)).slice(0, MAX_STATIC_ARTICLES);
const generatedSlugs = new Set();

for (let offset = 0; offset < staticEntries.length; offset += 100) {
  const chunk = staticEntries.slice(offset, offset + 100);
  try {
    const slugFilter = `in.(${chunk.map(({ slug }) => `"${slug}"`).join(',')})`;
    const rows = await requestRows('slug,title,excerpt,content,published_at', { slug: slugFilter });
    if (!rows) continue;
    const bySlug = new Map(rows.filter((row) => typeof row?.slug === 'string' && SAFE_SLUG.test(row.slug)).map((row) => [row.slug, row]));
    for (const listed of chunk) {
      const row = bySlug.get(listed.slug);
      if (!row || typeof row.title !== 'string') continue;
      const entry = { slug: listed.slug, title: row.title.slice(0, 200), excerpt: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 400) : '', content: typeof row.content === 'string' ? row.content : '', published_at: typeof row.published_at === 'string' ? row.published_at : listed.published_at };
      const canonical = `${base}/public/journal/${encodeURIComponent(entry.slug)}/`;
      const cleanExcerpt = plainText(entry.excerpt) || plainText(entry.content).slice(0, 220) || 'A public journal entry shared on Life Circle.';
      const description = cleanExcerpt.slice(0, 300);
      const published = Number.isFinite(Date.parse(entry.published_at)) ? new Date(entry.published_at).toISOString() : undefined;
      const articleSchema = safeJsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: entry.title, description, ...(published ? { datePublished: published } : {}), mainEntityOfPage: canonical, publisher: { '@type': 'Organization', name: 'Life Circle' } });
      const fallback = `<main id="public-seo-fallback" class="seo-fallback"><article><p>Life Circle · Public journal${published ? ` · <time datetime="${escapeHtml(published)}">${escapeHtml(published.slice(0, 10))}</time>` : ''}</p><h1>${escapeHtml(entry.title)}</h1><p>${escapeHtml(description)}</p>${staticArticleBody(entry.content)}<p><a href="/life-os/public/">Browse all public journals</a></p></article></main>`;
      const targetPath = `public/journal/${entry.slug}/index.html`;
      const target = resolve(root, targetPath);
      if (!target.startsWith(`${resolve(root)}/`)) continue;
      await writeRoute(targetPath, `${entry.title} · Public Journal · Life Circle`, description, fallback, { canonical, robots: 'index,follow', type: 'article', jsonLd: articleSchema });
      generatedSlugs.add(entry.slug);
    }
  } catch (error) {
    console.warn(`Could not fetch static journal content (${error.message}); query URLs remain available.`);
  }
}

const sitemapEntries = [
  { loc: `${base}/about/` },
  { loc: `${base}/public/` },
  ...uniqueEntries.map((entry) => ({
    loc: generatedSlugs.has(entry.slug) ? `${base}/public/journal/${encodeURIComponent(entry.slug)}/` : `${base}/public/journal/?slug=${encodeURIComponent(entry.slug)}`,
    ...(Number.isFinite(Date.parse(entry.published_at)) ? { lastmod: new Date(entry.published_at).toISOString().slice(0, 10) } : {}),
  })),
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.map(({ loc, lastmod }) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
await writeFile(resolve(root, 'sitemap.xml'), sitemapXml, 'utf8');
console.log(`Wrote public sitemap with ${sitemapEntries.length} URLs.`);
