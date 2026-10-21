import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingLogo } from './components/Brand';
import Layout from './components/Layout';
import { useAuth } from './lib/auth';
import { cloudEnabled } from './lib/supabase';
import { useStore } from './lib/store';

const AuthPage = lazy(() => import('./pages/Auth'));
const SetNewPassword = lazy(() => import('./pages/Auth').then((module) => ({ default: module.SetNewPassword })));
const Albums = lazy(() => import('./pages/Albums'));
const AdminConsole = lazy(() => import('./pages/AdminConsole'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Goals = lazy(() => import('./pages/Goals'));
const Habits = lazy(() => import('./pages/Habits'));
const Insights = lazy(() => import('./pages/Insights'));
const Journal = lazy(() => import('./pages/Journal'));
const Library = lazy(() => import('./pages/Library'));
const Overview = lazy(() => import('./pages/Overview'));
const Projects = lazy(() => import('./pages/Projects'));
const PublicJournal = lazy(() => import('./pages/PublicJournal'));
const PublicJournalIndex = lazy(() => import('./pages/PublicJournalIndex'));
const Settings = lazy(() => import('./pages/Settings'));
const Today = lazy(() => import('./pages/Today'));

function RouteFallback() {
  return <div className="grid min-h-[45vh] place-items-center"><div className="flex flex-col items-center gap-3" role="status" aria-live="polite"><LoadingLogo size={52} /><span className="text-sm muted">Opening your page…</span></div></div>;
}

function PrivateRoutes() {
  const { ready, session, guest, recovery } = useAuth();
  if (cloudEnabled) {
    if (!ready) return <div className="grid min-h-screen place-items-center"><div className="flex flex-col items-center gap-3" role="status" aria-live="polite"><LoadingLogo size={68} /><span className="text-sm muted">Getting your Life Circle ready…</span></div></div>;
    if (recovery && session) return <Suspense fallback={<RouteFallback />}><SetNewPassword /></Suspense>;
    if (!session && !guest) return <Suspense fallback={<RouteFallback />}><AuthPage /></Suspense>;
  }
  return <Suspense fallback={<RouteFallback />}><Layout><Routes>
    <Route path="/" element={<Overview />} />
    <Route path="/today" element={<Today />} />
    <Route path="/library" element={<Library />} />
    <Route path="/goals" element={<Goals />} />
    <Route path="/projects" element={<Projects />} />
    <Route path="/calendar" element={<Calendar />} />
    <Route path="/habits" element={<Habits />} />
    <Route path="/insights" element={<Insights />} />
    <Route path="/journal" element={<Journal />} />
    <Route path="/albums" element={<Albums />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/admin" element={<AdminConsole />} />
    <Route path="*" element={<Overview />} />
  </Routes></Layout></Suspense>;
}

function RouteContent() {
  const { pathname } = useLocation();
  const publicRoute = pathname === '/public' || pathname.startsWith('/public/');
  return <Suspense fallback={<RouteFallback />}>{publicRoute ? <Routes>
    <Route path="/public" element={<PublicJournalIndex />} />
    <Route path="/public/journal/:slug" element={<PublicJournal />} />
    <Route path="*" element={<PublicJournalIndex />} />
  </Routes> : <PrivateRoutes />}</Suspense>;
}

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'forest');
    document.documentElement.classList.toggle('theme-forest', theme === 'forest');
  }, [theme]);

  // HashRouter is used for the app as a whole. For a direct path-based public
  // link, GitHub Pages serves 404.html as the app shell and BrowserRouter
  // handles the original path (including the /life-os repository base).
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const direct = rawPath.match(/^(.*?)(\/public(?:\/.*)?)$/);
  if (direct) {
    const routes = <RouteContent />;
    return <BrowserRouter basename={direct[1] || undefined}>{routes}</BrowserRouter>;
  }
  return <HashRouter><RouteContent /></HashRouter>;
}
