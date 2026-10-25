import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve('dist');
const shellPath = resolve(root, 'index.html');
const shell = await readFile(shellPath, 'utf8');

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function setTag(html, pattern, replacement) {
  return html.replace(pattern, replacement);
}

function upsertTag(html, pattern, replacement) {
  return pattern.test(html) ? setTag(html, pattern, replacement) : html.replace('</head>', `    ${replacement}\n  </head>`);
}

async function writeRoute(path, title, description, fallback, { canonical, robots = 'noindex,follow', type = 'website' } = {}) {
  let html = shell;
  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = setTag(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  html = setTag(html, /<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${type}" />`);
  html = setTag(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = setTag(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  html = setTag(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = setTag(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  html = html.replace(/\s*<meta property="og:url"[^>]*\/>/, '').replace(/\s*<link rel="canonical"[^>]*\/>/, '');
  html = upsertTag(html, /<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${robots}" />`);
  if (canonical) {
    html = upsertTag(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`);
    html = upsertTag(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);
  }
  html = html.replace('<div id="root"></div>', `${fallback}\n    <div id="root"></div>`);
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  console.log(`Prepared ${target}`);
}

const indexFallback = `<main id="public-seo-fallback" class="seo-fallback"><section><p>Life Circle · Open Journal</p><h1>Public journals</h1><p>Read reflections and stories that authors have chosen to share publicly. Browse without an account.</p><a href="/life-os/public/">Open public journals</a></section></main>`;
const detailFallback = `<main id="public-seo-fallback" class="seo-fallback"><article><p>Life Circle · Public journal</p><h1>Public journal entry</h1><p>Open this public page to read the entry and its conversation. Public entries are available without signing in.</p><a href="/life-os/public/">Browse all public journals</a></article></main>`;

await writeRoute('public/index.html', 'Public Journals · Life Circle', 'Read journal reflections and stories that Life Circle authors have chosen to share publicly.', indexFallback, {
  canonical: 'https://abdullahbinfahad.github.io/life-os/public/', robots: 'index,follow',
});
await writeRoute('public/journal/index.html', 'Public Journal Entry · Life Circle', 'Read a public Life Circle journal entry and its conversation.', detailFallback, {
  robots: 'noindex,follow', type: 'article',
});
