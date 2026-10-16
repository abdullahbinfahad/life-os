import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
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
