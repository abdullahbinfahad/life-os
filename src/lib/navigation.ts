import {
  BarChart3,
  BookOpen,
  CalendarDays,
  FolderKanban,
  Globe2,
  Images,
  LayoutDashboard,
  Library,
  Repeat,
  Settings,
  Sunrise,
  Target,
  type LucideIcon,
} from 'lucide-react';

export type NavigationIconName =
  | 'layout-dashboard'
  | 'sunrise'
  | 'library'
  | 'target'
  | 'folder-kanban'
  | 'calendar-days'
  | 'repeat'
  | 'bar-chart-3'
  | 'book-open'
  | 'images'
  | 'globe-2'
  | 'settings';

export interface NavigationItem {
  to: string;
  label: string;
  icon: NavigationIconName;
  visible: boolean;
}

export interface DefaultNavigationItem extends NavigationItem {
  desc: string;
}

/** Safe, client-side presentation registry. The database independently validates these names. */
export const NAVIGATION_ICONS: Record<NavigationIconName, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  sunrise: Sunrise,
  library: Library,
  target: Target,
  'folder-kanban': FolderKanban,
  'calendar-days': CalendarDays,
  repeat: Repeat,
  'bar-chart-3': BarChart3,
  'book-open': BookOpen,
  images: Images,
  'globe-2': Globe2,
  settings: Settings,
};

export const NAVIGATION_ICON_NAMES = Object.keys(NAVIGATION_ICONS) as NavigationIconName[];

/** The only routes which may be published through the global navigation configuration. */
export const DEFAULT_NAVIGATION: DefaultNavigationItem[] = [
  { to: '/', label: 'Overview', desc: 'Your current life at a glance', icon: 'layout-dashboard', visible: true },
  { to: '/today', label: 'Today', desc: 'Immediate priorities and actions', icon: 'sunrise', visible: true },
  { to: '/library', label: 'Life Library', desc: 'All goals, ideas, and experiences', icon: 'library', visible: true },
  { to: '/goals', label: 'Goals', desc: 'Outcomes, milestones, and progress', icon: 'target', visible: true },
  { to: '/projects', label: 'Projects', desc: 'Plans, tasks, and dependencies', icon: 'folder-kanban', visible: true },
  { to: '/calendar', label: 'Calendar & Timeline', desc: 'Deadlines and life horizons', icon: 'calendar-days', visible: true },
  { to: '/habits', label: 'Habits', desc: 'Recurring actions and consistency', icon: 'repeat', visible: true },
  { to: '/insights', label: 'Insights', desc: 'Progress and patterns over time', icon: 'bar-chart-3', visible: true },
  { to: '/journal', label: 'Journal', desc: 'Reflections and memories', icon: 'book-open', visible: true },
  { to: '/albums', label: 'Albums', desc: 'Memory tree and life moments', icon: 'images', visible: true },
  { to: '/public', label: 'Public Journal', desc: 'Read published reflections', icon: 'globe-2', visible: true },
  { to: '/settings', label: 'Settings', desc: 'Templates, imports, exports, privacy', icon: 'settings', visible: true },
];

export const SAFE_NAVIGATION_ROUTES = DEFAULT_NAVIGATION.map((item) => item.to);

export function isNavigationIconName(value: unknown): value is NavigationIconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NAVIGATION_ICONS, value);
}

export function isSafeNavigationRoute(value: unknown): value is string {
  return typeof value === 'string' && SAFE_NAVIGATION_ROUTES.includes(value);
}

/**
 * Treat public configuration as untrusted presentation data even though the server validates it.
 * Invalid or empty configurations are ignored so the app remains navigable.
 */
export function normalizeNavigationItems(value: unknown): NavigationItem[] | null {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!candidate?.length) return null;

  const items: NavigationItem[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== 'object') return null;
    const next = item as Record<string, unknown>;
    if (!isSafeNavigationRoute(next.to) || !isNavigationIconName(next.icon) || typeof next.visible !== 'boolean' || typeof next.label !== 'string') return null;
    const label = next.label.trim();
    if (!label || label.length > 80) return null;
    items.push({ to: next.to, label, icon: next.icon, visible: next.visible });
  }
  return items;
}

export function defaultNavigationItems(): NavigationItem[] {
  return DEFAULT_NAVIGATION.map(({ to, label, icon, visible }) => ({ to, label, icon, visible }));
}

export function navigationDescription(route: string): string {
  return DEFAULT_NAVIGATION.find((item) => item.to === route)?.desc ?? 'Life OS page';
}

export function defaultNavigationItemFor(route: string): NavigationItem | null {
  const item = DEFAULT_NAVIGATION.find((candidate) => candidate.to === route);
  return item ? { to: item.to, label: item.label, icon: item.icon, visible: item.visible } : null;
}
