import { translate as tr } from './lib/locales';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingLogo } from './components/Brand';
import Layout from './components/Layout';
import { useAuth } from './lib/auth';
import { cloudEnabled } from './lib/supabase';
import { useStore } from './lib/store';
import { preloadAppLanguage, type AppLanguage } from './lib/locales';

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
const Productivity = lazy(() => import('./pages/Productivity'));
const Notifications = lazy(() => import('./pages/Notifications'));
const PublicJournal = lazy(() => import('./pages/PublicJournal'));
const PublicJournalIndex = lazy(() => import('./pages/PublicJournalIndex'));
const Settings = lazy(() => import('./pages/Settings'));
const Today = lazy(() => import('./pages/Today'));

function LoadingStage({ message, fullscreen = false }: { message: string; fullscreen?: boolean }) {
  return <div className={`loading-stage ${fullscreen ? 'loading-stage-full' : 'loading-stage-route'}`} role="status" aria-live="polite">
    <div className="loading-card"><LoadingLogo size={fullscreen ? 68 : 54} />
      <div className="loading-copy"><span className="loading-brand">{tr("LIFE CIRCLE")}</span><p>{message}</p></div>
      <span className="loading-progress" aria-hidden="true"><i /></span>
    </div>
  </div>;
}

function RouteFallback() {
  return <LoadingStage message="Opening your page…" />;
}

function PrivateRoutes() {
  const { ready, session, guest, recovery } = useAuth();
  if (cloudEnabled) {
    if (!ready) return <LoadingStage message="Restoring your secure session…" fullscreen />;
    if (recovery && session) return <Suspense fallback={<RouteFallback />}><SetNewPassword /></Suspense>;
    if (!session && !guest) return <Suspense fallback={<RouteFallback />}><AuthPage /></Suspense>;
  }
  return <Suspense fallback={<RouteFallback />}><Layout><Routes>
    <Route path="/" element={<Overview />} />
    <Route path="/today" element={<Today />} />
    <Route path="/library" element={<Library />} />
    <Route path="/goals" element={<Goals />} />
    <Route path="/projects" element={<Projects />} />
    <Route path="/productivity" element={<Productivity />} />
    <Route path="/notifications" element={<Notifications />} />
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
  const { pathname, search } = useLocation();
  const { session } = useAuth();
  useEffect(() => {
    const invite = new URLSearchParams(search).get('invite');
    if (invite) { try { sessionStorage.setItem('lifeos:pending-shared-invite', invite); } catch { /* continue in URL */ } }
  }, [search]);
  let pendingInvite = false;
  try { pendingInvite = Boolean(sessionStorage.getItem('lifeos:pending-shared-invite')); } catch { /* session storage unavailable */ }
  if (session && pendingInvite && pathname !== '/projects') return <Navigate to="/projects" replace />;
  const publicRoute = pathname === '/public' || pathname.startsWith('/public/');
  return <Suspense fallback={<RouteFallback />}>{publicRoute ? <Routes>
    <Route path="/public" element={<PublicJournalIndex />} />
    <Route path="/public/journal/:slug" element={<PublicJournal />} />
    <Route path="*" element={<PublicJournalIndex />} />
  </Routes> : <PrivateRoutes />}</Suspense>;
}

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const language = useStore((s) => s.settings.language ?? 'en');
  const [readyLanguage, setReadyLanguage] = useState<AppLanguage>('en');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'forest');
    document.documentElement.classList.toggle('theme-forest', theme === 'forest');
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  useEffect(() => {
    let active = true;
    void preloadAppLanguage(language).then(() => { if (active) setReadyLanguage(language); }).catch(() => { if (active) setReadyLanguage('en'); });
    return () => { active = false; };
  }, [language]);

  if (language !== readyLanguage) return <LoadingStage message="Preparing your language…" fullscreen />;

  // HashRouter is used for the app as a whole. For a direct path-based public
  // link, GitHub Pages serves 404.html as the app shell and BrowserRouter
  // handles the original path (including the /life-os repository base).
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const direct = rawPath.match(/^(.*?)(\/public(?:\/.*)?)$/);
  if (direct) {
    const routes = <RouteContent key={language} />;
    return <BrowserRouter basename={direct[1] || undefined}>{routes}</BrowserRouter>;
  }
  return <HashRouter><RouteContent key={language} /></HashRouter>;
}
