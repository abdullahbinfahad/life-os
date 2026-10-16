import { Loader2 } from 'lucide-react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Logo } from './components/Brand';
import Layout from './components/Layout';
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

export default function App() {
  const { ready, session, guest, recovery, sync } = useAuth();

  if (cloudEnabled) {
    if (!ready || (session && sync === 'loading'))
      return (
        <div className="grid min-h-screen place-items-center">
          <div className="flex flex-col items-center gap-3"><Logo size={56} /><Loader2 className="animate-spin muted" /></div>
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
