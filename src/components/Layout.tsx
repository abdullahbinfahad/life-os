import { BarChart3, Cloud, CloudOff, Crown, Leaf, LogIn, LogOut, RefreshCw, BookOpen, CalendarDays, FolderKanban, LayoutDashboard, Library, Menu, Moon, Repeat, Search, Settings, Sun, Sunrise, Target, X, Images, Globe2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { cx } from '../lib/utils';
import QuickAdd from './QuickAdd';
import CommandPalette from './CommandPalette';
import { APP_NAME, Logo } from './Brand';
import Toaster from './Toaster';
import { auth, syncNow, useAuth } from '../lib/auth';
import { cloudEnabled } from '../lib/supabase';
import { getPrivateImageUrl } from '../lib/media';
import { useOwnerAdmin } from '../lib/admin';

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
          <button title={syncError || 'Click to sync now'} onClick={() => void syncNow()} className={cx('flex items-center gap-1 text-[11px]', sync === 'error' ? 'text-rose-500' : 'muted')}>
            {sync === 'saving' || sync === 'loading' ? <RefreshCw size={11} className="animate-spin" /> : sync === 'error' || sync === 'offline' ? <CloudOff size={11} /> : <Cloud size={11} />} {label}
          </button>
        </div>
        <button className="btn-ghost !p-1.5" title="Sign out" onClick={() => {
          if (confirm('Sign out? Your data stays safe in your account.'))
            void auth.signOut().catch((error) => alert(error?.message || 'Could not sign out safely. Please retry sync first.'));
        }}><LogOut size={15} /></button>
      </div>
    </div>
  );
}

export const NAV = [
  { to: '/', label: 'Overview', desc: 'Your current life at a glance', icon: LayoutDashboard },
  { to: '/today', label: 'Today', desc: 'Immediate priorities and actions', icon: Sunrise },
  { to: '/library', label: 'Life Library', desc: 'All goals, ideas, and experiences', icon: Library },
  { to: '/goals', label: 'Goals', desc: 'Outcomes, milestones, and progress', icon: Target },
  { to: '/projects', label: 'Projects', desc: 'Plans, tasks, and dependencies', icon: FolderKanban },
  { to: '/calendar', label: 'Calendar & Timeline', desc: 'Deadlines and life horizons', icon: CalendarDays },
  { to: '/habits', label: 'Habits', desc: 'Recurring actions and consistency', icon: Repeat },
  { to: '/insights', label: 'Insights', desc: 'Progress and patterns over time', icon: BarChart3 },
  { to: '/journal', label: 'Journal', desc: 'Reflections and memories', icon: BookOpen },
  { to: '/albums', label: 'Albums', desc: 'Memory tree and life moments', icon: Images },
  { to: '/public', label: 'Public Journal', desc: 'Read published reflections', icon: Globe2 },
  { to: '/settings', label: 'Settings', desc: 'Templates, imports, exports, privacy', icon: Settings },
];
const PRIMARY_NAV = NAV.filter((item) => ['/', '/goals', '/today', '/habits', '/library'].includes(item.to));

export default function Layout({ children }: { children: ReactNode }) {
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);
  const ownerAdmin = useOwnerAdmin();
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => setMobile(false), [loc.pathname]);
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
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-3 pb-6 pt-2">
        <Logo size={34} />
        <div>
          <div className="font-bold leading-tight">{APP_NAME}</div>
          <div className="text-[11px] leading-tight muted">A personal system for everything that matters</div>
        </div>
      </div>
      <button onClick={() => setPalette(true)} className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm muted transition hover:border-indigo-400 dark:border-white/10">
        <Search size={15} /> Search… <kbd className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] dark:bg-white/10">⌘K</kbd>
      </button>
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.16em] muted">Main menu</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => cx(
              'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[.05]',
            )}>
            <Icon size={17} /> {label}
          </NavLink>
        ))}
        {ownerAdmin && <NavLink to="/admin" className={({ isActive }) => cx('group mt-2 flex items-center gap-3 rounded-xl border border-amber-300/50 bg-gradient-to-r from-amber-100/70 to-emerald-100/70 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-0.5 dark:border-amber-300/20 dark:from-amber-400/10 dark:to-emerald-400/10 dark:text-slate-100', isActive && 'ring-2 ring-amber-400/50')}><Crown size={17} className="text-amber-600 dark:text-amber-300" /> Owner system console</NavLink>}
      </nav>
      <button className="btn-ghost mt-4 justify-start" onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </button>
      <button className="btn-ghost justify-start" onClick={() => updateSettings({ theme: theme === 'forest' ? 'dark' : 'forest' })}>
        {theme === 'forest' ? <Moon size={16} /> : <Leaf size={16} />} {theme === 'forest' ? 'Night glass theme' : 'Emerald night theme'}
      </button>
      <AccountBox />
    </div>
  );

  return (
    <div className={cx('min-h-screen', ownerAdmin && 'owner-premium')}>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="ambient-orb absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="ambient-orb absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white/70 p-4 backdrop-blur-xl dark:border-white/[.06] dark:bg-black/20 lg:block">
        {sidebar}
      </aside>
      <div className={cx('mobile-drawer fixed inset-0 z-40 lg:hidden', mobile ? 'is-open' : 'is-closed')} aria-hidden={!mobile} onClick={() => setMobile(false)}>
        <div className="mobile-drawer-backdrop absolute inset-0 bg-black/50" />
        <aside className="mobile-drawer-panel absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white p-4 dark:bg-[#0f1218]" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
      </div>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-white/[.06] dark:bg-[#0b0d12]/80 lg:hidden">
          <button className="btn-ghost !p-2" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile((open) => !open)}>{mobile ? <X size={18} /> : <Menu size={18} />}</button>
          <Logo size={24} /><span className="font-bold">{APP_NAME}</span>{ownerAdmin && <span className="premium-pill"><Crown size={12} /> Owner</span>}
          <button className="btn-ghost ml-auto !p-2" onClick={() => setPalette(true)}><Search size={18} /></button>
        </header>
        <main className="app-main mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
      <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
        {PRIMARY_NAV.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} aria-label={label} className={({ isActive }) => cx('group flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[9px] font-medium', isActive ? 'text-indigo-700 dark:text-indigo-300' : 'muted')}><Icon className="nav-icon" size={18} /><span className="max-w-full truncate">{label === 'Overview' ? 'Home' : label}</span></NavLink>)}
      </nav>
      <QuickAdd />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
  );
}
