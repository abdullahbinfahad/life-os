type PublicPageMetadata = {
  path: string;
  title: string;
  description: string;
  type?: 'website' | 'article';
  publishedAt?: string;
};

function setMeta(attr: 'name' | 'property', key: string, value: string, restore: Array<() => void>) {
  let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !node;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  const previous = node.getAttribute('content');
  node.setAttribute('content', value);
  restore.push(() => {
    if (created) node?.remove();
    else if (previous === null) node?.removeAttribute('content');
    else node?.setAttribute('content', previous);
  });
}

function setCanonical(url: string, restore: Array<() => void>) {
  let node = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !node;
  if (!node) {
    node = document.createElement('link');
    node.rel = 'canonical';
    document.head.appendChild(node);
  }
  const previous = node.href;
  node.href = url;
  restore.push(() => {
    if (created) node?.remove();
    else node?.setAttribute('href', previous);
  });
}

/** Build the canonical URL under the app's configured GitHub Pages base path. */
export function publicSiteUrl(path: string): string {
  const configuredBase = document.querySelector<HTMLBaseElement>('base[href]')?.getAttribute('href') || import.meta.env.BASE_URL;
  const base = new URL(configuredBase, 'https://abdullahbinfahad.github.io');
  const basePath = base.pathname.replace(/\/+$/, '');
  const relative = path.replace(/^\/+/, '');
  return new URL(`${basePath}/${relative}`.replace(/\/{2,}/g, '/'), base.origin).href;
}

/** Apply route-specific public metadata only after the public record is loaded. */
export function setPublicPageMetadata(metadata: PublicPageMetadata): () => void {
  const restore: Array<() => void> = [];
  const previousTitle = document.title;
  const title = `${metadata.title.trim() || 'Public journal'} · Life Circle`;
  const description = metadata.description.replace(/\s+/g, ' ').trim().slice(0, 300);
  const canonical = publicSiteUrl(metadata.path);
  const image = publicSiteUrl('apple-touch-icon.png');
  document.title = title;
  restore.push(() => { document.title = previousTitle; });
  setMeta('name', 'description', description, restore);
  setMeta('name', 'robots', 'index,follow,max-image-preview:large', restore);
  setMeta('property', 'og:type', metadata.type ?? 'website', restore);
  setMeta('property', 'og:site_name', 'Life Circle', restore);
  setMeta('property', 'og:title', title, restore);
  setMeta('property', 'og:description', description, restore);
  setMeta('property', 'og:url', canonical, restore);
  setMeta('property', 'og:image', image, restore);
  setMeta('name', 'twitter:card', 'summary', restore);
  setMeta('name', 'twitter:title', title, restore);
  setMeta('name', 'twitter:description', description, restore);
  setMeta('name', 'twitter:image', image, restore);
  setCanonical(canonical, restore);

  const scriptId = 'life-circle-public-page-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  const scriptCreated = !script;
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  const previousJson = script.textContent;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': metadata.type === 'article' ? 'Article' : 'CollectionPage',
    name: title,
    description,
    url: canonical,
    ...(metadata.publishedAt ? { datePublished: metadata.publishedAt } : {}),
    publisher: { '@type': 'Organization', name: 'Life Circle' },
  };
  script.textContent = JSON.stringify(structuredData).replace(/</g, '\\u003c');
  restore.push(() => {
    if (scriptCreated) script?.remove();
    else script?.replaceChildren(document.createTextNode(previousJson ?? ''));
  });

  return () => { for (const undo of restore.reverse()) undo(); };
}

/** Keep missing/unavailable slugs out of search results in the client-rendered SPA. */
export function setPublicNotFoundMetadata(): () => void {
  const restore: Array<() => void> = [];
  const previousTitle = document.title;
  document.title = 'Journal unavailable · Life Circle';
  restore.push(() => { document.title = previousTitle; });
  setMeta('name', 'robots', 'noindex,follow', restore);
  setMeta('name', 'description', 'This public journal entry is unavailable.', restore);
  return () => { for (const undo of restore.reverse()) undo(); };
}
