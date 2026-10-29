import { translate as tr } from '../lib/locales';
import { BarChart3, Cloud, CloudOff, Crown, LogIn, LogOut, RefreshCw, BookOpen, CalendarDays, FolderKanban, LayoutDashboard, Library, Menu, Repeat, Search, Settings, Sunrise, Target, X, Images, Globe2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { cx, today, uid } from '../lib/utils';
import QuickAdd from './QuickAdd';
import PlanningAssistant, { type PlannerProposal } from './PlanningAssistant';
import CommandPalette from './CommandPalette';
import { APP_NAME, Logo } from './Brand';
import Toaster from './Toaster';
import { toast } from './Toaster';
import { auth, syncNow, useAuth } from '../lib/auth';
import { cloudEnabled, supabase } from '../lib/supabase';
import { getPrivateImageUrl } from '../lib/media';
import { useOwnerAdmin } from '../lib/admin';
import { playFeedback } from '../lib/sounds';
import { DEFAULT_NAVIGATION, NAVIGATION_ICONS, normalizeNavigationItems, type NavigationItem } from '../lib/navigation';

function AccountBox() {
  const { user, sync, syncError, guest, setGuest } = useAuth();
  const avatarPath = useStore((s) => s.settings.avatarPath);
  const savedAvatarUrl = useStore((s) => s.settings.avatarUrl);
  const [privateAvatar, setPrivateAvatar] = useState<string>();
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setAvatarFailed(false);
    if (!user || !avatarPath) { setPrivateAvatar(undefined); return () => { active = false; }; }
    getPrivateImageUrl(user.id, avatarPath).then((url) => { if (active) setPrivateAvatar(url); }).catch(() => { if (active) setPrivateAvatar(undefined); });
    return () => { active = false; };
  }, [user?.id, avatarPath, savedAvatarUrl]);
  if (!cloudEnabled) return null;
  if (!user)
    return (
      <button className="btn-outline mt-3 w-full" onClick={() => setGuest(false)}>
        <LogIn size={15} /> {guest ? 'Sign in to sync & protect' : 'Sign in'}
      </button>
    );
  const name = (user.user_metadata?.full_name as string) || user.email || user.phone || 'You';
  const avatar = privateAvatar || savedAvatarUrl || user.user_metadata?.avatar_url as string | undefined;
  const label = { off: '', loading: 'Loading…', saving: 'Saving…', saved: 'Synced', error: 'Sync error — retry', offline: 'Offline — will sync' }[sync];
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-2.5 dark:border-white/10">
      <div className="flex items-center gap-2">
        {avatar && !avatarFailed ? <img src={avatar} alt="" onError={() => setAvatarFailed(true)} className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
          : <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-500">{name[0]?.toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <button title={syncError || 'Click to sync now'} onClick={() => { playFeedback('refresh'); void syncNow(); }} className={cx('flex items-center gap-1 text-[11px]', sync === 'error' ? 'text-rose-500' : 'muted')}>
            {sync === 'saving' || sync === 'loading' ? <RefreshCw size={11} className="animate-spin" /> : sync === 'error' || sync === 'offline' ? <CloudOff size={11} /> : <Cloud size={11} />} {label}
          </button>
        </div>
        <button className="btn-ghost !p-1.5" title={tr("Sign out")} onClick={() => {
          if (confirm('Sign out? Your data stays safe in your account.'))
            void auth.signOut().catch((error) => alert(error?.message || 'Could not sign out safely. Please retry sync first.'));
        }}><LogOut size={15} /></button>
      </div>
    </div>
  );
}

export const NAV = DEFAULT_NAVIGATION;
const PRIMARY_ROUTES = ['/', '/projects', '/library', '/goals', '/habits'];

export default function Layout({ children }: { children: ReactNode }) {
  const ownerAdmin = useOwnerAdmin();
  const forestTheme = useStore((s) => s.settings.theme === 'forest');
  const addItems = useStore((s) => s.addItems);
  const categories = useStore((s) => s.categories);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [navItems, setNavItems] = useState<NavigationItem[]>(() => DEFAULT_NAVIGATION.map(({ to, label, icon, visible }) => ({ to, label, icon, visible })));
  const loc = useLocation();
  const nav = useNavigate();
  const isPublicPage = loc.pathname.startsWith('/public') || loc.pathname.startsWith('/about');
  const canShowPlanner = !isPublicPage && !['/trash', '/settings', '/admin', '/insights', '/notifications', '/productivity'].includes(loc.pathname);
  const addPlannedItems = (proposals: PlannerProposal[]) => {
    const state = useStore.getState();
    const chosen = proposals.filter((proposal) => proposal.title.trim());
    const goalIds = new Map<string, string>();
    chosen.filter((proposal) => proposal.entityType === 'goal').forEach((proposal) => {
      const id = state.addGoal({
        title: proposal.title.trim().slice(0, 200),
        description: (proposal.description ?? proposal.notes).slice(0, 1000),
        categoryId: proposal.categoryId ?? state.categories[0]?.id ?? 'career',
        targetDate: proposal.dueDate,
      });
      if (proposal.proposalKey) goalIds.set(proposal.proposalKey, id);
    });
    const todayDate = today();
    chosen.forEach((p) => {
      if (p.entityType === 'goal') return;
      const title = p.title.trim().slice(0, 200);
      if (p.entityType === 'task') state.addItems([{ title, notes: p.notes.slice(0, 1000), categoryId: p.categoryId ?? state.categories[0]?.id ?? 'career', type: 'other', status: 'next', priority: p.priority, horizon: 'this-year', tags: [], starred: false, ...(p.dueDate ? { dueDate: p.dueDate } : {}), ...(p.dueDate === todayDate ? { todayDate } : {}), ...(p.scheduledTime ? { scheduledTime: p.scheduledTime } : {}) }]);
      else if (p.entityType === 'habit') state.addHabit({ title, why: p.rationale?.slice(0, 500), frequency: p.frequency!, targetPerWeek: p.frequency === 'daily' ? 7 : p.targetPerWeek!, categoryId: p.categoryId ?? state.categories.find((category) => category.id === 'health')?.id ?? state.categories[0]?.id ?? 'health' });
      else if (p.entityType === 'milestone') {
        const parentId = p.parentGoalId?.startsWith('planned:') ? goalIds.get(p.parentGoalId.slice('planned:'.length)) : p.parentGoalId;
        const goal = parentId ? useStore.getState().goals.find((candidate) => candidate.id === parentId) : undefined;
        if (goal) state.updateGoal(goal.id, { milestones: [...goal.milestones, { id: uid(), title, done: false, dueDate: p.dueDate }] });
      } else state.addItems([{ title, notes: p.notes.slice(0, 1000), categoryId: p.categoryId ?? state.categories[0]?.id ?? 'career', type: p.libraryType ?? 'idea', status: 'someday', priority: p.priority, horizon: '1-3y', tags: [], starred: false }]);
    });
    toast(tr('Added selected suggestions to your chosen destinations.'));
  };
  useEffect(() => { setMobile(false); }, [loc.pathname]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const refreshMenu = async () => {
      try {
        const { data, error } = await client.from('lifeos_menu_config').select('value').eq('key', 'navigation').maybeSingle();
        if (error || !data?.value) return;
        const normalized = normalizeNavigationItems(data.value);
        if (normalized) {
          const alwaysAvailable = DEFAULT_NAVIGATION.filter((item) => ['/productivity', '/notifications'].includes(item.to) && !normalized.some((entry) => entry.to === item.to));
          setNavItems([...normalized, ...alwaysAvailable]);
        }
      } catch { /* Optional owner-managed navigation; keep the built-in menu. */ }
    };
    void refreshMenu();
    const channel = client.channel('lifeos-global-navigation')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_menu_config', filter: 'key=eq.navigation' }, () => { void refreshMenu(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobile(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { root.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [mobile]);
  useEffect(() => {
    if (!forestTheme || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    let frame = 0;
    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dx = ((event.clientX / Math.max(window.innerWidth, 1)) - 0.5) * 42;
        const dy = ((event.clientY / Math.max(window.innerHeight, 1)) - 0.5) * 34;
        root.style.setProperty('--pointer-dx', `${dx.toFixed(1)}px`);
        root.style.setProperty('--pointer-dy', `${dy.toFixed(1)}px`);
      });
    };
    window.addEventListener('pointermove', trackPointer, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', trackPointer); root.style.removeProperty('--pointer-dx'); root.style.removeProperty('--pointer-dy'); };
  }, [forestTheme]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'g') (window as any).__g = Date.now();
      else if ((window as any).__g && Date.now() - (window as any).__g < 800) {
        const map: Record<string, string> = { o: '/', t: '/today', l: '/library', g: '/goals', p: '/projects', c: '/calendar', h: '/habits', i: '/insights', j: '/journal', m: '/albums', s: '/settings' };
        if (map[e.key]) nav(map[e.key]);
        (window as any).__g = 0;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav]);

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-w-0 items-center gap-3 px-2 pb-4 pt-1">
        <Logo size={34} />
        <div className="min-w-0">
          <div className="truncate font-bold leading-tight">{APP_NAME}</div>
          <div className="text-[11px] leading-tight muted">{tr("A personal system for everything that matters")}</div>
        </div>
      </div>
      <button onClick={() => setPalette(true)} className="mb-3 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/90 bg-white/65 px-3 py-2 text-sm muted shadow-sm transition duration-200 hover:border-indigo-400/60 hover:bg-white dark:border-white/10 dark:bg-white/[.025] dark:hover:bg-white/[.06]">
        <Search size={15} /> {tr("Search…")}<kbd className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] dark:bg-white/10">⌘K</kbd>
      </button>
      <nav aria-label={tr("Main menu")} className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain py-1 pr-1">
        <div className="mb-2 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[.16em] muted">{tr("Main menu")}</div>
        {navItems.filter((item) => item.visible).map(({ to, label, icon }) => {
          const Icon = NAVIGATION_ICONS[icon];
          return (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => cx(
              'sidebar-link group flex min-h-10 items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] font-medium leading-tight transition duration-200',
              isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-600 hover:translate-x-0.5 hover:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-white/[.055]',
            )}>
            <span className="sidebar-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg transition duration-200"><Icon size={17} className="transition-transform duration-200 group-hover:scale-110" /></span><span className="min-w-0">{label === DEFAULT_NAVIGATION.find((item) => item.to === to)?.label ? tr(label) : label}</span>
          </NavLink>
          );
        })}
        {ownerAdmin && <NavLink to="/admin" className={({ isActive }) => cx('sidebar-link group mt-2 flex min-h-10 items-center gap-2.5 rounded-xl border border-amber-300/50 bg-gradient-to-r from-amber-100/70 to-emerald-100/70 px-2 py-1.5 text-[13px] font-medium text-slate-800 shadow-sm transition duration-200 hover:-translate-y-0.5 dark:border-amber-300/20 dark:from-amber-400/10 dark:to-emerald-400/10 dark:text-slate-100', isActive && 'ring-2 ring-amber-400/50')}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400/10"><Crown size={17} className="text-amber-600 dark:text-amber-300" /></span><span>{tr("Owner system console")}</span></NavLink>}
      </nav>
      <AccountBox />
    </div>
  );

  return (
    <div className={cx('min-h-screen', ownerAdmin && 'owner-premium')}>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="ambient-orb absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="ambient-orb absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>
      <aside className="app-sidebar fixed inset-y-0 left-0 hidden h-[100dvh] w-64 overflow-hidden border-r border-slate-200/80 bg-white/75 p-4 backdrop-blur-2xl dark:border-white/[.07] dark:bg-[#0b0d12]/75 lg:block">
        {sidebar}
      </aside>
      <div id="mobile-navigation-drawer" className={cx('mobile-drawer fixed inset-0 z-[60] lg:hidden', mobile ? 'is-open' : 'is-closed')} aria-hidden={!mobile} onClick={() => setMobile(false)}>
        <div className="mobile-drawer-backdrop absolute inset-0 bg-black/50" />
        <aside className="mobile-drawer-panel absolute inset-y-0 left-0 w-72 max-w-[min(85vw,22rem)] overflow-hidden bg-white p-4 pt-[max(1rem,env(safe-area-inset-top))] dark:bg-[#0f1218]" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
      </div>
      <div className="lg:pl-64">
        <header className="mobile-app-header fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-3 py-2.5 pt-[max(.625rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-white/[.06] dark:bg-[#0b0d12]/90 lg:hidden">
          <button type="button" className="btn-ghost mobile-menu-trigger !h-12 !w-12 !shrink-0 !rounded-xl !p-0" aria-label={mobile ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobile} aria-controls="mobile-navigation-drawer" onClick={() => setMobile((open) => !open)}><span className="grid h-full w-full place-items-center rounded-xl border border-slate-300/80 bg-white/80 text-slate-800 shadow-sm dark:border-white/15 dark:bg-white/[.06] dark:text-slate-100">{mobile ? <X size={23} strokeWidth={2.4} /> : <Menu size={23} strokeWidth={2.4} />}</span></button>
          <Logo size={24} /><span className="font-bold">{APP_NAME}</span>{ownerAdmin && <span className="premium-pill"><Crown size={12} /> {tr("Owner")}</span>}
          <button type="button" className="btn-ghost ml-auto !p-2" aria-label={tr('Search')} title={tr('Search')} onClick={() => setPalette(true)}><Search size={18} /></button>
        </header>
        <div className="mobile-header-spacer lg:hidden" aria-hidden="true" />
        <div className="app-main mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </div>
      <nav className="mobile-bottom-nav lg:hidden" aria-label={tr("Primary navigation")}>
        {navItems.filter((item) => item.visible && PRIMARY_ROUTES.includes(item.to)).map(({ to, label, icon }) => { const Icon = NAVIGATION_ICONS[icon]; const defaultLabel = DEFAULT_NAVIGATION.find((item) => item.to === to)?.label; const display = label === defaultLabel ? tr(label) : label; return <NavLink key={to} to={to} end={to === '/'} aria-label={display} className={({ isActive }) => cx('group flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[9px] font-medium', isActive ? 'text-indigo-700 dark:text-indigo-300' : 'muted')}><Icon className="nav-icon" size={18} /><span className="max-w-full truncate">{to === '/' ? tr('Home') : display}</span></NavLink>; })}
      </nav>
      {canShowPlanner && <PlanningAssistant onAddItems={addPlannedItems} />}
      <QuickAdd />
      <CommandPalette open={palette} onClose={() => setPalette(false)} navigation={navItems} />
      <Toaster />
    </div>
  );
}
