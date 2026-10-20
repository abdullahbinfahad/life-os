import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { LoadingLogo } from './components/Brand';
import Layout from './components/Layout';
import Albums from './pages/Albums';
import { useAuth } from './lib/auth';
import { cloudEnabled } from './lib/supabase';
import AuthPage, { SetNewPassword } from './pages/Auth';
import Calendar from './pages/Calendar';
import Goals from './pages/Goals';
import Habits from './pages/Habits';
import Insights from './pages/Insights';
import Journal from './pages/Journal';
import Library from './pages/Library';
import Overview from './pages/Overview';
import Projects from './pages/Projects';
import Settings from './pages/Settings';
import Today from './pages/Today';
import PublicJournal from './pages/PublicJournal';
import PublicJournalIndex from './pages/PublicJournalIndex';

export default function App() {
  const { ready, session, guest, recovery, sync } = useAuth();
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const publicPath = hash.slice(1).split(/[?#]/)[0].replace(/\/+$/, '');
  const isPublicRoute = publicPath === '/public' || publicPath.startsWith('/public/journal/');

  // Public journal pages intentionally bypass auth and the signed-in app shell.
  if (isPublicRoute) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/public" element={<PublicJournalIndex />} />
          <Route path="/public/journal/:slug" element={<PublicJournal />} />
          <Route path="*" element={<PublicJournalIndex />} />
        </Routes>
      </HashRouter>
    );
  }

  if (cloudEnabled) {
    if (!ready || (session && sync === 'loading'))
      return (
        <div className="grid min-h-screen place-items-center">
          <div className="flex flex-col items-center gap-3" role="status" aria-live="polite"><LoadingLogo size={68} /><span className="text-sm muted">Getting your Life Circle ready…</span></div>
        </div>
      );
    if (recovery && session) return <SetNewPassword />;
    if (!session && !guest) return <AuthPage />;
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
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
          <Route path="*" element={<Overview />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
