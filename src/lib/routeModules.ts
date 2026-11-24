// One place for route importers so pages can be lazy-loaded *and* warmed up
// before the user taps them (hover, touch, or idle time after first paint).
export const routeImporters = {
  '/': () => import('../pages/Overview'),
  '/today': () => import('../pages/Today'),
  '/library': () => import('../pages/Library'),
  '/goals': () => import('../pages/Goals'),
  '/projects': () => import('../pages/Projects'),
  '/productivity': () => import('../pages/Productivity'),
  '/notifications': () => import('../pages/Notifications'),
  '/calendar': () => import('../pages/Calendar'),
  '/habits': () => import('../pages/Habits'),
  '/insights': () => import('../pages/Insights'),
  '/journal': () => import('../pages/Journal'),
  '/albums': () => import('../pages/Albums'),
  '/settings': () => import('../pages/Settings'),
  '/trash': () => import('../pages/Trash'),
  '/admin': () => import('../pages/AdminConsole'),
  '/study': () => import('../pages/StudyStudio'),
  '/public': () => import('../pages/PublicJournalIndex'),
} as const;

type RoutePath = keyof typeof routeImporters;
const warmed = new Set<string>();

function routeKey(path: string): RoutePath | undefined {
  const clean = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  if (clean in routeImporters) return clean as RoutePath;
  const first = `/${clean.split('/').filter(Boolean)[0] ?? ''}`;
  return first in routeImporters ? (first as RoutePath) : undefined;
}

/** Start downloading a page's code without rendering it. Safe to call repeatedly. */
export function prefetchRoute(path: string) {
  const key = routeKey(path);
  if (!key || warmed.has(key)) return;
  warmed.add(key);
  void routeImporters[key]().catch(() => warmed.delete(key));
}

/** Warm the most-used pages once the browser is idle, skipping slow/data-saver connections. */
export function prefetchLikelyRoutes(paths: string[]) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return () => undefined;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
  let index = 0;
  let handle = 0;
  const next = () => {
    if (index >= paths.length) return;
    prefetchRoute(paths[index++]);
    handle = idle ? idle(next, { timeout: 2500 }) : window.setTimeout(next, 350);
  };
  const start = window.setTimeout(() => { handle = idle ? idle(next, { timeout: 2500 }) : window.setTimeout(next, 350); }, 1200);
  return () => { window.clearTimeout(start); if (cancelIdle) cancelIdle(handle); window.clearTimeout(handle); };
}
